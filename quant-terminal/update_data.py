"""Fetch weekly price history + fundamentals for the terminal universe and
write market_data.json (served statically alongside index.html).

Browsers can no longer reach Yahoo Finance directly (CORS + 429 rate limits
on non-browser TLS fingerprints, and the free CORS proxies are dead), so this
file is the terminal's primary data source. It runs on a GitHub Actions cron.

Safety rules:
  * A ticker that fails this run keeps its previous entry (flagged stale),
    so one bad Yahoo response never wipes good data.
  * If fewer than MIN_OK_RATIO of tickers fetch fresh, the script exits
    non-zero WITHOUT writing, so the workflow fails loudly instead of
    silently committing an empty file.
"""
import argparse
import json
import math
import os
import re
import sys
import time
from datetime import datetime, timezone

import pandas as pd
import yfinance as yf

HERE = os.path.dirname(os.path.abspath(__file__))
# The web app (index.html + market_data.json) lives in the site's public/ folder.
DEFAULT_WEB_DIR = os.path.normpath(os.path.join(HERE, "..", "public", "quant-terminal"))
PERIOD = "10y"
INTERVAL = "1wk"
MIN_OK_RATIO = 0.6
RETRIES = 3
# Share of unchanged week-over-week closes (last 2y) above which a series is
# flagged illiquid — e.g. SSNLF (Samsung OTC) repeated its price 95/103 weeks.
FLAT_WARN = 0.3

# Benchmarks the frontend needs even though SOXX has no card.
EXTRA = ["SPY", "SOXX"]


def load_tickers(web_dir):
    """Read the ticker universe straight from index.html so the two never drift."""
    with open(os.path.join(web_dir, "index.html"), encoding="utf-8") as f:
        html = f.read()
    block = re.search(r"const COS = \[(.*?)\];", html, re.S).group(1)
    found = re.findall(r't:"([^"]+)"[^}]*pub:true', block)
    return list(dict.fromkeys(EXTRA + found))


def clean(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) or math.isinf(f) else f


def fetch_history(tickers):
    """Bulk download, then retry any ticker that came back empty one by one."""
    out = {}
    df = yf.download(tickers, period=PERIOD, interval=INTERVAL, auto_adjust=True,
                     group_by="ticker", threads=True, progress=False)
    for t in tickers:
        try:
            s = df[t]["Close"] if len(tickers) > 1 else df["Close"]
            s = s.dropna()
            if len(s) >= 10:
                out[t] = s
        except KeyError:
            pass

    for t in [t for t in tickers if t not in out]:
        for attempt in range(RETRIES):
            try:
                h = yf.Ticker(t).history(period=PERIOD, interval=INTERVAL, auto_adjust=True)
                s = h["Close"].dropna() if not h.empty else pd.Series(dtype=float)
                if len(s) >= 10:
                    out[t] = s
                    break
            except Exception as e:  # noqa: BLE001 — yfinance raises many types
                print(f"  retry {attempt + 1} {t}: {e}")
            time.sleep(2 * (attempt + 1))
    return out


def fetch_fund(t):
    for attempt in range(RETRIES):
        try:
            info = yf.Ticker(t).info or {}
            earn = info.get("earningsTimestamp") or info.get("earningsTimestampStart")
            return {
                "name": info.get("shortName") or info.get("longName"),
                "currency": info.get("currency"),
                "pe": clean(info.get("trailingPE")),
                "fpe": clean(info.get("forwardPE")),
                "mcap": clean(info.get("marketCap")),
                "eps": clean(info.get("epsTrailingTwelveMonths") or info.get("trailingEps")),
                "divYield": clean(info.get("dividendYield")),
                "high52": clean(info.get("fiftyTwoWeekHigh")),
                "low52": clean(info.get("fiftyTwoWeekLow")),
                "earnDate": datetime.fromtimestamp(earn, timezone.utc).strftime("%Y-%m-%d") if earn else None,
            }
        except Exception as e:  # noqa: BLE001
            print(f"  fund retry {attempt + 1} {t}: {e}")
            time.sleep(2 * (attempt + 1))
    return None


def expand(payload):
    """Return {ticker: entry} with explicit per-ticker dates (handles compact files)."""
    if not isinstance(payload, dict):
        return {}
    grid = payload.get("dates") or []
    out = {}
    for t, e in (payload.get("tickers") or {}).items():
        e = dict(e)
        if not e.get("dates") and "offset" in e:
            e["dates"] = grid[e["offset"]:e["offset"] + len(e.get("closes", []))]
        e.pop("offset", None)
        out[t] = e
    return out


def compact(result):
    """Store the shared weekly calendar once; each series keeps an offset into it.

    Series whose dates aren't a contiguous slice of the grid keep explicit dates.
    """
    grid = sorted({d for e in result.values() for d in e["dates"]})
    pos = {d: i for i, d in enumerate(grid)}
    for e in result.values():
        ds = e["dates"]
        i = pos[ds[0]]
        if grid[i:i + len(ds)] == ds:
            e["offset"] = i
            del e["dates"]
    return grid, result


def fetch_fx(currencies):
    """Units of each currency per 1 USD (e.g. KRW -> ~1400), for USD market caps."""
    fx = {"USD": 1.0}
    for c in sorted(set(currencies) - {"USD", None}):
        for attempt in range(RETRIES):
            try:
                h = yf.Ticker(f"{c}=X").history(period="5d", interval="1d")
                v = clean(h["Close"].dropna().iloc[-1]) if not h.empty else None
                if v:
                    fx[c] = v
                    break
            except Exception as e:  # noqa: BLE001
                print(f"  fx retry {attempt + 1} {c}: {e}")
            time.sleep(1 + attempt)
    return fx


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--web-dir", default=DEFAULT_WEB_DIR, help="folder containing index.html; market_data.json is written here")
    args = ap.parse_args()
    out_path = os.path.join(args.web_dir, "market_data.json")

    tickers = load_tickers(args.web_dir)
    print(f"yfinance {yf.__version__} · {len(tickers)} tickers")

    try:
        with open(out_path, encoding="utf-8") as f:
            prev = json.load(f)
    except (OSError, ValueError):
        prev = {}
    prev_t = expand(prev)

    hist = fetch_history(tickers)
    now = datetime.now(timezone.utc)
    result, fresh, stale, failed = {}, [], [], []

    for t in tickers:
        if t in hist:
            s = hist[t]
            tail = s.tail(104).values
            flat = float((tail[1:] == tail[:-1]).mean()) if len(tail) > 1 else 0.0
            # Forward-fill internal gaps (illiquid OTC weeks) so every series
            # sits on the same weekly grid and benchmark alignment stays exact.
            s = s[~s.index.duplicated(keep="last")].asfreq("W-MON").ffill() if len(s) > 1 else s
            fund = fetch_fund(t) or (prev_t.get(t) or {}).get("fund") or {}
            result[t] = {
                "dates": [d.strftime("%Y-%m-%d") for d in s.index],
                "closes": [round(float(v), 4) for v in s.values],
                "currency": fund.get("currency") or "USD",
                "fund": fund,
                "updated": now.isoformat(timespec="seconds"),
                "flatRatio": round(flat, 3),
            }
            fresh.append(t)
            warn = f"  WARN illiquid: {flat:.0%} flat weeks" if flat > FLAT_WARN else ""
            print(f"  ok    {t:9s} {len(s)} wks{warn}")
        elif t in prev_t and prev_t[t].get("closes"):
            result[t] = {**prev_t[t], "stale": True}
            stale.append(t)
            print(f"  STALE {t} (kept previous)")
        else:
            failed.append(t)
            print(f"  FAIL  {t}")
        time.sleep(0.2)

    ratio = len(fresh) / len(tickers)
    print(f"fresh {len(fresh)}/{len(tickers)} · stale {len(stale)} · failed {len(failed)}")
    if ratio < MIN_OK_RATIO:
        print(f"ERROR: only {ratio:.0%} fresh (< {MIN_OK_RATIO:.0%}); refusing to overwrite {out_path}")
        sys.exit(1)

    fx = fetch_fx(e.get("currency") for e in result.values())
    fx = {**(prev.get("meta", {}).get("fx") or {}), **fx} if isinstance(prev, dict) else fx
    for e in result.values():
        f = e.get("fund") or {}
        rate = fx.get(e.get("currency") or "USD")
        f["mcapUSD"] = round(f["mcap"] / rate) if f.get("mcap") and rate else None
    print("fx per USD:", {k: round(v, 3) for k, v in fx.items()})

    grid, result = compact(result)
    payload = {
        "meta": {
            "version": 3,
            "generated_at": now.isoformat(timespec="seconds"),
            "source": f"Yahoo Finance via yfinance {yf.__version__}",
            "interval": INTERVAL,
            "fresh": fresh, "stale": stale, "failed": failed,
            "fx": fx,
        },
        "dates": grid,
        "tickers": result,
    }
    # Write atomically so a crash mid-write can never leave a truncated file.
    tmp = out_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))
    os.replace(tmp, out_path)
    print(f"Saved {out_path} ({os.path.getsize(out_path) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
