#!/usr/bin/env python3
"""FX Quant Terminal data bot.

Fetches ~3 years of ECB euro foreign-exchange reference rates for seven INR
pairs from the Frankfurter API (server-side: no browser CORS limits, no
proxies) and writes public/fx-quant/fx_data.json, the page's only data source.
Run on a schedule by .github/workflows/fx-quant-data.yml.

If any pair fails or looks wrong, the previous file is left untouched and the
script exits non-zero, so an outage shows up as a failed run rather than an
emptied data file.
"""
from __future__ import annotations

import datetime as dt
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "fx-quant" / "fx_data.json"
API = "https://api.frankfurter.dev/v1"
UA = "fx-quant-bot/1.0 (+https://nithinpuru.github.io/fx-quant/)"
PAIRS = [("EUR", "Euro"), ("USD", "US dollar"), ("GBP", "British pound"), ("JPY", "Japanese yen"),
         ("CNY", "Chinese yuan"), ("SGD", "Singapore dollar"), ("HKD", "Hong Kong dollar")]
YEARS = 3


def get_json(url: str, retries: int = 3) -> dict:
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as e:
            if attempt == retries:
                raise
            print(f"  retry {attempt + 1} after {e}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("unreachable")


def main() -> int:
    today = dt.date.today()
    start = today.replace(year=today.year - YEARS)
    pairs = {}
    for base, name in PAIRS:
        data = get_json(f"{API}/{start.isoformat()}..?from={base}&to=INR")
        rates = sorted((d, v["INR"]) for d, v in data.get("rates", {}).items() if "INR" in v)
        if len(rates) < 250:
            print(f"{base}/INR: only {len(rates)} observations - aborting", file=sys.stderr)
            return 1
        pairs[f"{base}INR"] = {"base": base, "name": name, "dates": [d for d, _ in rates], "rates": [round(v, 6) for _, v in rates]}
        print(f"{base}/INR: {len(rates)} days, last {rates[-1][0]} = {rates[-1][1]}", file=sys.stderr)
        time.sleep(0.5)

    last = max(p["dates"][-1] for p in pairs.values())
    payload = {
        "meta": {
            "source": "European Central Bank euro reference rates via Frankfurter (frankfurter.dev)",
            "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "last_observation": last,
            "note": "ECB publishes one reference rate per TARGET business day around 16:00 CET; INR crosses are derived by the ECB/Frankfurter.",
        },
        "pairs": pairs,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB), last observation {last}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
