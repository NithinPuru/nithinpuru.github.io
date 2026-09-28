#!/usr/bin/env python3
"""Research Radar data bot.

Fetches every source server-side (no browser CORS limits, no public proxies)
and writes one snapshot per domain to public/research-radar/data/<domain>.json,
which the page loads instantly. Run on a schedule by
.github/workflows/research-radar-data.yml.

Sources per domain (lists in research-radar/sources.json):
  arxiv    newest submissions in the domain's arXiv categories
  hf       Hugging Face Daily Papers (trending AI papers), AI domain only
  journal  newest articles in key IEEE / finance journals, via Crossref
  s2       recent papers by tracked researchers, via Semantic Scholar
  blog     lab / company / industry news RSS feeds

A source that fails keeps its items from the previous snapshot, so one bad
run never blanks the feed.
"""
from __future__ import annotations

import concurrent.futures as cf
import datetime as dt
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

import feedparser

ROOT = Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / "research-radar" / "sources.json").read_text())
OUT = ROOT / "public" / "research-radar" / "data"
UA = "research-radar-bot/1.0 (+https://nithinpuru.github.io/research-radar/; mailto:nithinpurushothama@gmail.com)"
NOW = dt.datetime.now(dt.timezone.utc)
ABSTRACT_MAX = 1800


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def get(url: str, timeout: int = 25, retries: int = 2) -> bytes:
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                time.sleep(4 * (attempt + 1))
                continue
            raise
        except Exception as e:  # timeouts, DNS, resets
            last = e
            if attempt < retries:
                time.sleep(2 * (attempt + 1))
                continue
            raise
    raise last  # pragma: no cover


def clean(text: str | None, limit: int = ABSTRACT_MAX) -> str:
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()[:limit]


def iso(d: dt.datetime | None) -> str:
    return (d or NOW).astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def paper(**kw) -> dict:
    base = {
        "id": "", "source": "", "domain": "", "title": "", "authors": [],
        "abstract": "", "venue": "", "published": iso(None), "year": None,
        "url": "", "pdfUrl": None, "isOpenAccess": False,
        "citationCount": None, "influentialCitations": None, "categories": [],
    }
    base.update(kw)
    try:
        base["year"] = int(base["published"][:4])
    except (TypeError, ValueError):
        pass
    return base


# ── arXiv ────────────────────────────────────────────────────────────────
ATOM = {"a": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}


def fetch_arxiv(domain: str) -> list[dict]:
    cats = CFG["arxiv"].get(domain, [])
    if not cats:
        return []
    q = "+OR+".join(f"cat:{c}" for c in cats)
    url = (f"https://export.arxiv.org/api/query?search_query={q}"
           "&sortBy=submittedDate&sortOrder=descending&max_results=100")
    root = ET.fromstring(get(url, timeout=40))
    out = []
    for e in root.findall("a:entry", ATOM):
        t = lambda tag: (e.findtext(tag, default="", namespaces=ATOM) or "").strip()
        links = {l.get("title") or l.get("rel"): l.get("href") for l in e.findall("a:link", ATOM)}
        out.append(paper(
            id=t("a:id"), source="arxiv", domain=domain,
            title=clean(t("a:title"), 400),
            authors=[a.findtext("a:name", default="", namespaces=ATOM) for a in e.findall("a:author", ATOM)],
            abstract=clean(t("a:summary")), venue="arXiv preprint", published=t("a:published"),
            url=links.get("alternate") or t("a:id"), pdfUrl=links.get("pdf"), isOpenAccess=True,
            categories=[c.get("term") for c in e.findall("a:category", ATOM)],
        ))
    return out


# ── Hugging Face Daily Papers ───────────────────────────────────────────
def fetch_hf(domain: str) -> list[dict]:
    if domain not in CFG.get("hf_daily", []):
        return []
    data = json.loads(get("https://huggingface.co/api/daily_papers?limit=60"))
    out = []
    for item in data:
        p = item.get("paper") or {}
        pid = p.get("id")
        if not pid or not p.get("title"):
            continue
        out.append(paper(
            id=f"hf-{pid}", source="hf", domain=domain,
            title=clean(p.get("title"), 400),
            authors=[a.get("name", "") for a in p.get("authors", []) if a.get("name")],
            abstract=clean(p.get("summary")),
            venue=f"HF Daily Papers · {p.get('upvotes', 0)} upvotes",
            published=item.get("publishedAt") or p.get("publishedAt") or iso(None),
            url=f"https://huggingface.co/papers/{pid}", pdfUrl=f"https://arxiv.org/pdf/{pid}",
            isOpenAccess=True, categories=["trending"],
        ))
    return out


# ── Crossref: newest journal articles ───────────────────────────────────
def crossref_date(w: dict) -> str:
    for k in ("published-online", "published-print", "created", "issued"):
        parts = (w.get(k) or {}).get("date-parts") or []
        if parts and parts[0] and parts[0][0]:
            y, m, d = (parts[0] + [1, 1])[:3]
            return f"{y:04d}-{m:02d}-{d:02d}T12:00:00Z"
    return iso(None)


def fetch_journals(domain: str) -> list[dict]:
    out = []
    for j in CFG["journals"].get(domain, []):
        url = (f"https://api.crossref.org/journals/{j['issn']}/works?sort=created&order=desc&rows=20"
               f"&filter=type:journal-article&mailto=nithinpurushothama@gmail.com")
        try:
            items = json.loads(get(url))["message"]["items"]
        except Exception as e:
            log(f"  journal {j['name']}: {e}")
            continue
        for w in items:
            title = clean((w.get("title") or [""])[0], 400)
            doi = w.get("DOI")
            if not title or not doi:
                continue
            authors = [" ".join(x for x in (a.get("given"), a.get("family")) if x) for a in w.get("author", [])]
            out.append(paper(
                id=f"doi:{doi.lower()}", source="journal", domain=domain, title=title,
                authors=[a for a in authors if a], abstract=clean(w.get("abstract")),
                venue=j["name"], published=crossref_date(w), url=f"https://doi.org/{doi}",
                citationCount=w.get("is-referenced-by-count"),
            ))
        time.sleep(1)  # Crossref polite pool
    return out


# ── Semantic Scholar: tracked researchers ───────────────────────────────
S2_FIELDS = "paperId,title,year,venue,publicationDate,citationCount,influentialCitationCount,abstract,openAccessPdf,authors"


def fetch_s2(domain: str) -> list[dict]:
    out, ok = [], 0
    cutoff = NOW.year - 6
    for a in CFG["s2_authors"].get(domain, []):
        url = (f"https://api.semanticscholar.org/graph/v1/author/{a['id']}/papers"
               f"?fields={S2_FIELDS}&limit=50&sort=publicationDate:desc")
        try:
            data = json.loads(get(url, retries=3)).get("data", [])
            ok += 1
        except Exception as e:
            log(f"  s2 {a['name']}: {e}")
            time.sleep(3)
            continue
        for p in data:
            if not p.get("title") or not p.get("abstract") or (p.get("year") or 0) < cutoff:
                continue
            out.append(paper(
                id=p["paperId"], source="s2", domain=domain, title=clean(p["title"], 400),
                authors=[x.get("name", "") for x in p.get("authors") or []],
                abstract=clean(p["abstract"]), venue=p.get("venue") or "Unknown venue",
                published=(p.get("publicationDate") or f"{p.get('year') or NOW.year}-01-01") + "T12:00:00Z",
                url=f"https://www.semanticscholar.org/paper/{p['paperId']}",
                pdfUrl=(p.get("openAccessPdf") or {}).get("url"), isOpenAccess=bool(p.get("openAccessPdf")),
                citationCount=p.get("citationCount") or 0, influentialCitations=p.get("influentialCitationCount") or 0,
            ))
        time.sleep(1.2)  # unauthenticated S2: stay well under the shared rate limit
    if not ok and CFG["s2_authors"].get(domain):
        raise RuntimeError("all Semantic Scholar requests failed")
    return out


# ── RSS / Atom feeds ────────────────────────────────────────────────────
def _one_feed(feed: dict, domain: str) -> list[dict]:
    parsed = feedparser.parse(get(feed["url"], timeout=20, retries=1))
    items = []
    for e in parsed.entries[:10]:
        link = e.get("link") or e.get("id")
        if not e.get("title") or not link:
            continue
        when = e.get("published_parsed") or e.get("updated_parsed")
        published = iso(dt.datetime(*when[:6], tzinfo=dt.timezone.utc)) if when else iso(None)
        body = e.get("summary") or (e.get("content") or [{}])[0].get("value", "")
        items.append(paper(
            id=link, source="blog", domain=domain, title=clean(e.title, 300),
            authors=[e.get("author") or feed["name"]], abstract=clean(body, 1200),
            venue=feed["name"], published=published, url=link, isOpenAccess=True,
        ))
    return items


def fetch_blogs(domain: str) -> list[dict]:
    feeds = CFG["blogs"].get(domain, [])
    out, ok = [], 0
    with cf.ThreadPoolExecutor(8) as ex:
        futs = {ex.submit(_one_feed, f, domain): f for f in feeds}
        for fut in cf.as_completed(futs):
            try:
                out += fut.result()
                ok += 1
            except Exception as e:
                log(f"  feed {futs[fut]['name']}: {e}")
    if feeds and not ok:
        raise RuntimeError("all feeds failed")
    return out


FETCHERS = {"arxiv": fetch_arxiv, "hf": fetch_hf, "journal": fetch_journals, "s2": fetch_s2, "blog": fetch_blogs}


def run_domain(domain: str) -> dict:
    path = OUT / f"{domain}.json"
    prev = json.loads(path.read_text()) if path.exists() else {"papers": [], "sources": {}}
    papers, sources = [], {}
    for name, fn in FETCHERS.items():
        t0 = time.time()
        try:
            got = fn(domain)
            sources[name] = {"status": "ok" if got else "empty", "count": len(got), "fetched_at": iso(None)}
        except Exception as e:
            # keep the previous snapshot's items for this source
            got = [p for p in prev["papers"] if p.get("source") == name]
            old = prev.get("sources", {}).get(name, {})
            sources[name] = {"status": "stale" if got else "failed", "count": len(got),
                             "fetched_at": old.get("fetched_at"), "error": str(e)[:160]}
            log(f"  {domain}/{name} FAILED ({e}); kept {len(got)} previous items")
        log(f"  {domain}/{name}: {sources[name]['status']} {len(got)} ({time.time() - t0:.1f}s)")
        papers += got
        if name == "arxiv":
            time.sleep(3)  # arXiv API etiquette: one request every 3 s

    # de-duplicate (same id, or same normalised title), newest first
    seen_id, seen_title, uniq = set(), set(), []
    for p in sorted(papers, key=lambda p: p.get("published") or "", reverse=True):
        key = re.sub(r"[^a-z0-9]", "", p["title"].lower())[:90]
        if p["id"] in seen_id or (key and key in seen_title):
            continue
        seen_id.add(p["id"]); seen_title.add(key); uniq.append(p)
    return {"domain": domain, "generated_at": iso(None), "sources": sources, "papers": uniq}


def main(argv: list[str]) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    domains = argv or CFG["domains"]
    summary = {}
    for d in domains:
        log(f"== {d}")
        snap = run_domain(d)
        (OUT / f"{d}.json").write_text(json.dumps(snap, ensure_ascii=False, separators=(",", ":")))
        summary[d] = {k: v["status"] for k, v in snap["sources"].items()} | {"papers": len(snap["papers"])}
    (OUT / "index.json").write_text(json.dumps({"generated_at": iso(None), "domains": summary}, indent=1))
    log(json.dumps(summary, indent=1))
    # fail the run only if every source of every domain failed (network outage)
    all_failed = all(all(s == "failed" for k, s in v.items() if k != "papers") for v in summary.values())
    return 1 if all_failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
