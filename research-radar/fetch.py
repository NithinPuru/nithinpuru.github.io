#!/usr/bin/env python3
"""Research Radar data bot.

Fetches every source server-side (no browser CORS limits, no public proxies)
and writes one snapshot per domain to public/research-radar/data/:
  <domain>.json             feed (abstracts trimmed to excerpts)
  <domain>-abstracts.json   full abstracts, loaded lazily by the page
  <domain>-explainers.json  precomputed Claude explainers for the newest papers
                            (opt-in: RADAR_EXPLAINERS=1 plus ANTHROPIC_API_KEY)
The files are not committed: deploy.yml runs this on a schedule during the
build, first seeding the data folder from the live site (--seed) so a failed
source keeps its previous items. Ordinary deploys run `--seed-only`
(also `npm run radar-data` for local development).

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


ROOT = Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / "research-radar" / "sources.json").read_text())
OUT = ROOT / "public" / "research-radar" / "data"
UA = "research-radar-bot/1.0 (+https://nithinpuru.github.io/research-radar/; mailto:nithinpurushothama@gmail.com)"
NOW = dt.datetime.now(dt.timezone.utc)
ABSTRACT_MAX = 1800
EXCERPT_MAX = 280  # feed-file excerpt; full text in <domain>-abstracts.json
LIVE = "https://nithinpuru.github.io/research-radar/data/"
EXPLAIN_PER_DOMAIN = 10   # newest papers per domain that get a precomputed explainer
EXPLAIN_MAX_NEW = 40      # cap on new Claude calls per run (bounds cost)
EXPLAIN_MODEL = "claude-sonnet-5"  # same model as the page's in-browser explainer


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
    import feedparser  # only the fetch path needs it; --seed-only runs without deps
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
    # the feed file holds excerpts; restore full abstracts for kept (stale) items
    apath = OUT / f"{domain}-abstracts.json"
    full = json.loads(apath.read_text()) if apath.exists() else {}
    for p in prev["papers"]:
        if p["id"] in full:
            p["abstract"] = full[p["id"]]
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


def seed() -> bool:
    """Copy the currently deployed snapshots into OUT (best effort)."""
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        idx = json.loads(get(LIVE + "index.json", retries=1))
    except Exception as e:
        log(f"seed: no live index ({e})")
        return False
    (OUT / "index.json").write_text(json.dumps(idx, indent=1))
    n = 0
    for d in idx.get("domains", {}):
        for suffix in ("", "-abstracts", "-explainers"):
            try:
                body = get(f"{LIVE}{d}{suffix}.json", retries=1)
                json.loads(body)  # never seed a truncated / non-JSON file
                (OUT / f"{d}{suffix}.json").write_bytes(body)
                n += 1
            except Exception as e:
                if suffix == "-explainers":  # optional; keep the page's fetch from 404ing
                    (OUT / f"{d}{suffix}.json").write_text("{}")
                else:
                    log(f"seed: {d}{suffix}.json: {e}")
    log(f"seed: {n} files from {LIVE}")
    return all((OUT / f"{d}.json").exists() for d in idx.get("domains", {}))


def page_system_prompt() -> str | None:
    """The explainer system prompt, read from the page so the two never drift."""
    page = (ROOT / "public" / "research-radar" / "index.html").read_text()
    m = re.search(r"const EXPLAINER_SYSTEM_PROMPT = `(.*?)`;", page, re.S)
    return m.group(1) if m else None


class Explainer:
    """Precomputes expert-mode explainers with the same prompt as the page."""

    def __init__(self) -> None:
        import os
        self.client = None
        self.budget = EXPLAIN_MAX_NEW
        self.system = page_system_prompt()
        if os.environ.get("RADAR_EXPLAINERS") != "1" or not os.environ.get("ANTHROPIC_API_KEY"):
            log("explainers: off (needs RADAR_EXPLAINERS=1 and ANTHROPIC_API_KEY)")
            return
        if not self.system:
            log("explainers: system prompt not found in page - skipped")
            return
        import anthropic
        self.client = anthropic.Anthropic(max_retries=3)

    def one(self, p: dict) -> dict | None:
        auth = ", ".join(p["authors"][:3]) + (" et al." if len(p["authors"]) > 3 else "")
        msg = (f"Title: {p['title']}\nAuthors: {auth}\nVenue: {p.get('venue') or 'Unknown'}\n"
               f"Year: {p.get('year') or ''}\nDomain: {p['domain']}\n\nAbstract:\n{p['abstract']}")
        keys = ("what_doing", "problem_solved", "key_contribution")
        r = self.client.messages.create(
            model=EXPLAIN_MODEL, max_tokens=1000, thinking={"type": "disabled"},
            system=self.system, messages=[{"role": "user", "content": msg}],
            output_config={"format": {"type": "json_schema", "schema": {
                "type": "object", "properties": {k: {"type": "string"} for k in keys},
                "required": list(keys), "additionalProperties": False}}})
        if r.stop_reason != "end_turn":  # refusal / max_tokens: skip, the page can still ask live
            return None
        e = json.loads(next(b.text for b in r.content if b.type == "text"))
        if not all(e.get(k) for k in keys):
            return None
        return {k: e[k] for k in keys}

    def domain(self, d: str, papers: list[dict]) -> dict:
        """Previous explainers still in the feed, plus new ones for the newest papers."""
        path = OUT / f"{d}-explainers.json"
        prev = json.loads(path.read_text()) if path.exists() else {}
        eligible = [p for p in papers if p["source"] != "blog" and len(p.get("abstract") or "") >= 200]
        newest = eligible[:EXPLAIN_PER_DOMAIN]
        # keep earlier explainers while their papers are still near the top of the feed
        keep = {p["id"] for p in eligible[:EXPLAIN_PER_DOMAIN * 2]}
        out = {k: v for k, v in prev.items() if k in keep}
        if not self.client:
            return out
        made = 0
        for p in newest:
            if p["id"] in out:
                continue
            if self.budget <= 0:
                break
            self.budget -= 1
            try:
                e = self.one(p)
            except Exception as ex:
                log(f"  explainer {p['id']}: {ex}")
                continue
            if e:
                out[p["id"]] = e
                made += 1
        log(f"  {d}/explainers: {made} new, {len(out)} total")
        return out


def main(argv: list[str]) -> int:
    if "--seed-only" in argv:
        return 0 if seed() else 1
    if "--seed" in argv:
        seed()
    argv = [a for a in argv if not a.startswith("--")]
    OUT.mkdir(parents=True, exist_ok=True)
    domains = argv or CFG["domains"]
    summary = {}
    explainer = Explainer()
    for d in domains:
        log(f"== {d}")
        snap = run_domain(d)
        exps = explainer.domain(d, snap["papers"])
        (OUT / f"{d}-explainers.json").write_text(json.dumps(exps, ensure_ascii=False, separators=(",", ":")))
        # Split: the feed carries an excerpt (list, search); full abstracts go to
        # a side file the page loads lazily for the detail panel and explainer.
        full = {}
        for p in snap["papers"]:
            a = p.get("abstract") or ""
            if len(a) > EXCERPT_MAX:
                full[p["id"]] = a
                p["abstract"] = a[:EXCERPT_MAX].rsplit(" ", 1)[0] + "\u2026"
                p["abstract_trimmed"] = True
        (OUT / f"{d}.json").write_text(json.dumps(snap, ensure_ascii=False, separators=(",", ":")))
        (OUT / f"{d}-abstracts.json").write_text(json.dumps(full, ensure_ascii=False, separators=(",", ":")))
        summary[d] = {k: v["status"] for k, v in snap["sources"].items()} | {"papers": len(snap["papers"])}
    (OUT / "index.json").write_text(json.dumps({"generated_at": iso(None), "domains": summary}, indent=1))
    log(json.dumps(summary, indent=1))
    # fail the run only if every source of every domain failed (network outage)
    all_failed = all(all(s == "failed" for k, s in v.items() if k != "papers") for v in summary.values())
    return 1 if all_failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
