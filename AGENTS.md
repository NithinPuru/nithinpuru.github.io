# AGENTS.md

Guidance for AI agents working in this repository.

## Project

The public tools site at **https://nithinpuru.github.io** (GitHub Pages): the
browser tools below, their data bots, and a small Astro shell around them.
The portfolio moved to the private `NithinPuru/portfolio` repo (Cloudflare
Pages, https://nithinpuru.com) - don't add portfolio content back here.

- `/` and `/tools/` are redirect stubs (`src/components/Redirect.astro`)
  that forward to nithinpuru.com (`/tools/` to the portfolio's tools list,
  `https://nithinpuru.com/#tools`), keeping `?query` and `#hash`.
- `/rongm/` is served here too (`src/pages/rongm.md` + `NotebookLayout.astro`), an
  identical copy of the portfolio's page so it is reachable everywhere: edit both.
  Its math is backslash-escaped (punctuation inside `$...$`) so markdown hands the
  TeX to KaTeX unchanged - write new math the same way.
- Each tool's "home" link points straight at `https://nithinpuru.com/#tools`.
- `/go/` (`src/pages/go.astro`) is the owner's unlisted links page: every page
  of both sites (tools come from `tools.json`). Not linked anywhere, noindex,
  out of the sitemap, untracked - and public if guessed, so never put keys on it.
- Never set a custom domain for this Pages site (it would move every tool to
  nithinpuru.com), and never rename it or make it private: the tool URLs,
  the career-semi-quant redirect and Research Radar's `--seed-only` all
  depend on `https://nithinpuru.github.io/`.

## Commands

```sh
npm run dev       # local dev server
npm run build     # static build -> dist/
npm run preview   # serve dist/ (use: node node_modules/astro/astro.js preview --port 4321)
```

## Structure

```
src/
  pages/index.astro          # redirect stub -> https://nithinpuru.com/
  pages/rongm.md             # the Ron/gm notebook page (copy of the portfolio's)
  pages/tools.astro          # redirect stub -> https://nithinpuru.com/#tools
  pages/404.astro            # generated 404 page
  pages/llms.txt.ts          # plain-text index of the tools
  pages/robots.txt.ts        # dynamic robots.txt -> sitemap-index.xml
  layouts/Layout.astro       # head, theme pre-paint, analytics beacon (404 page)
  components/Redirect.astro  # browser + meta-refresh redirect page
  components/ThemeToggle.astro
  data/tools.json            # tool list for llms.txt and the sitemap (relative URLs)
  styles/tools.css           # tokens + styling for the 404 page
  scripts/theme.js           # theme toggle handler (localStorage "theme")
public/
  <tool>/                    # the tools (see below)
  fonts/                     # self-hosted KaTeX Computer Modern woff2 (used by the tools)
  favicon.svg, favicon.ico, apple-touch-icon.png, android-chrome-*.png, og-image.png
  _headers                   # security headers (Netlify/Cloudflare; inert on GH Pages)
quant-terminal/ fx-quant/ research-radar/ tracker/   # data-bot back ends
gmid/                        # gm/ID characterisation (ngspice) + page generator
scripts/smoke.mjs            # smoke test (CI "checks" job)
scripts/gen-brand.mjs        # regenerates the favicons and og-image
```

To add a tool: put it in `public/<tool>/`, add an entry to `src/data/tools.json`
(llms.txt and the sitemap pick it up), add its path to `PAGES` in
`scripts/smoke.mjs`, and list it in the portfolio repo's `src/data/tools.json`.

## Migrated tools (public/)

Standalone single-file tools copied verbatim from their chennakeshavadasa
repos and served as-is (Astro copies `public/` untouched). Listed on the
portfolio (`https://nithinpuru.com/#tools`); each tool's "home" link points there.

| Path | Source repo (commit copied) | Notes |
|---|---|---|
| `/gmid/`, `/gmid/ihp-sg13g2/`, `/gmid/sky130a/`, `/gmid/gf180mcu-d/` | built here (2026-11-26; replaced the gmid-hub / gmid_SKY130A / gmid_GF180MCUD / gmid_IHP130_Tool copies) | one app for the three PDKs, data from `gmid/characterise.py` - see "gm/ID Explorer" below |
| `/fx-quant/` | rebuilt from FOREX_QUANT@0f404ba | Quant-Terminal-styled rewrite (`css/fx.css`, `js/fx.js`; models unchanged). Data: `fx_data.json` from `fx-quant/update_fx.py` via `fx-quant-data.yml` (weekdays after the ECB fixing) - the page calls no external API |
| `/research-radar/` | Research-Radar@ee84a10 | loads snapshots from `research-radar/fetch.py`: `data/<domain>.json` (abstracts trimmed to 280-char excerpts), `data/<domain>-abstracts.json` (full text, fetched lazily for the detail panel, search and explainer) and `data/<domain>-explainers.json` (precomputed expert explainers, opt-in: repo variable `RADAR_EXPLAINERS=1` plus the `ANTHROPIC_API_KEY` secret; 10 newest papers per domain, at most 40 new calls per run). **The data is never committed** (`.gitignore`): `deploy.yml` refetches it on its 3-hourly schedule (or `workflow_dispatch` with `refresh_radar`), seeding from the live site so a failed source keeps its items; other deploys copy the live files back (`fetch.py --seed-only`; locally `npm run radar-data`). Sources in `research-radar/sources.json`; the explainer's system prompt is read from the page, so edit it only there. Live SerpApi Scholar and the in-browser Claude explainer (`claude-sonnet-5`) stay; keys in localStorage `rr_*`. Re-skinned to the shared palette (light/dark, KaTeX fonts) with a stacked layout under 820px |
| `/quant-terminal/` | career-semi-quant | synced by `quant-terminal-sync.yml`; data by `quant-terminal-data.yml` - do not hand-edit. `/quant-terminal/app/` (web edition) is generated by `deploy.yml`, see below |
| `/deadline/` | Conf_Deadline_Tracker | driven by the `tracker-*` workflows (series in `tracker/series.yml`, categories `t1 ssc casf cas eda pwr`). No API key needed: `tracker/track.py` reads dates off the official pages with fixed rules (`extract_rules`: verbatim quote, table-layout detection, last year's call ignored); risky changes still go to `data/review.json` and a review issue. Setting the `ANTHROPIC_API_KEY` secret switches it to Claude extraction instead (optional). `assets/style.css` re-skinned to the shared palette (light/dark, KaTeX fonts) - bump its `?v=` (and `app.js?v=`) in both HTML pages when they change |

The source repos stay as the tools' source code (the "Source code" links; the
gm/ID Explorer's source is now `gmid/` here), but their own GitHub Pages copies
are retired: gmid-hub, gmid_SKY130A, gmid_GF180MCUD, gmid_IHP130_Tool,
FOREX_QUANT and Research-Radar forward to
the tools here with a hostname-gated `location.replace` at the top of their
`index.html` (plus a canonical link), career-semi-quant shows a "moved" page,
and Conf_Deadline_Tracker forwards and no longer runs its own tracker. Don't
deploy a second copy of a tool anywhere else.

## gm/ID Explorer (`/gmid/`)

Built here, not copied: one app serves all three PDKs so they look and behave
the same (owner, 2026-11-26: uniform UI, TT/SS/FF corners, VDD +/-10 %,
temperatures; light enough for phones and free static hosting).

- **Pages**: `gmid/page.html` is the single template; `python3 gmid/build_pages.py`
  writes `public/gmid/index.html` and `public/gmid/<pdk>/index.html` (only the
  title, description, canonical URL and the PDK they open on differ). Never edit
  the generated pages; run the script after changing the template or
  `public/gmid/{app.js,chart.js,app.css}` - it stamps `?v=` content hashes on the
  assets and the manifest. `build_pages.py --check` (CI `checks` job) fails when a
  page is stale. Switching PDK in the app changes the path with `pushState`; the
  view state lives in the `#hash` (shareable links).
- **Code**: `app.js` (data, views: Curves, Sizing, Compare devices, Reference &
  method), `chart.js` (a small SVG line-chart component: log axes, hover readout,
  click / arrow-key cursor, box zoom, SVG/PNG export with embedded fonts),
  where the cursor carries its own readout (owner, 2026-11-26: no scrolling to the
  table to read values): a card beside the cursor with every curve's value, top
  curve first, and the PVT band's min-max (computed from its 27 curves), plus the
  x value as a tag on the x axis. It follows the mouse; once pinned (click, tap,
  arrow keys) it parks where it hides the fewest curve points. The table under
  the figure stays as the accessible (`aria-live`) copy;
  `app.css` (DESIGN.md: paper, ink, one accent, hairlines, square corners). No
  Plotly or other library; the whole app is about 100 KB before gzip.
- **Data**: `gmid/characterise.py` simulates every device with one testbench
  (W = 5 um single finger, V_SB = 0, V_DS = VDD/2, V_GS 0 to VDD in VDD_nom/150
  steps) at TT/SS/FF x 0.9/1.0/1.1 VDD x -40/27/125 C = 27 conditions, 21
  devices (IHP 4, SKY130 7, GF180 10), 567 sweeps in about 40 s on 4 cores.
  Cgg/Cgd/Cgs come from 1 MHz AC solves at every bias point (the models'
  operating-point capacitances leave out overlap). Output in
  `public/gmid/data/`: `manifest.json` (devices, lengths, quantisation,
  `data_v` content hash), `<pdk>/sheet.json` (datasheet figures for the
  Reference tables), `<pdk>/<device>/<corner>-<supply>-<temp>.bin` (uint16
  tables + float32 V_th per length, format in the script's docstring, 15-31 KB
  each, fetched only when shown). Re-run only to change the method or the PDK
  pins; then run `build_pages.py`.
- **Setup**: `gmid/setup_pdks.sh` fetches the pinned model files (IHP-Open-PDK,
  FOSSi sky130_fd_pr continuous models, FOSSi gf180mcu_fd_pr) and compiles
  IHP's PSP 103 with OpenVAF 23.5.0 (checksum-verified); ngspice 42 from apt.
  Keep the commits in the script and `PDKS[...]["commit"]` in step.
- **Facts on the pages**: the Reference prose is in `gmid/page.html`; numbers
  inside it come from `sheet.json` through `data-v="<device>/<lmin|l1>/<key>"`
  spans, so they always match the data. Don't type simulated numbers into prose.
- **Look** (2026-11-26 refresh, owner: "make it less dull"): page/panel two-tone
  (`--page` behind white `--paper` plates), a masthead with the stats and a
  figure thumbnail, PDK tabs with node numerals, a device header (MOSFET
  symbol + key-figure strip from `sheet.json`) and figure plates with titles.
  Still DESIGN.md: square, flat, hairlines, no shadows or gradients (the
  masthead's graph-paper texture is an SVG data URI).
- **Colours** (validated with the dataviz skill's checker, both themes): each
  PDK has a signature hue from the site's domain hues on `body[data-pdk]` ->
  `--pdk` / `--pdk-fill` (IHP blue, SKY130 teal, GF180 amber; fills use deeper
  steps so white text stays >= 4.5:1). Lengths use one ordinal ramp of
  neighbouring hues, azure to violet (`lenColor`, monotone lightness; the
  length chips are its scale legend). PVT comparisons: red = slow side (SS,
  -10 %, 125 C) / ink = typical / blue = fast side, with dash patterns.
  Cross-PDK series use the four domain hues.
- Still deliberately untracked (no `/np.js`).

## Quant Terminal web edition (`/quant-terminal/app/`)

The dashboard of career-semi-quant's local edition (`local/`, package `semiquant`),
published as static files and installable as a phone app (manifest + service worker).
`deploy.yml` builds it on every deploy: it pip-installs `semiquant` from
career-semi-quant `master` and runs `semiquant publish --out .qt-out`, then copies
`.qt-out/` to `dist/quant-terminal/app/`. Nothing is committed (like the radar
snapshots): `~/.semiquant/cache` and `.qt-out/` persist between runs through
`actions/cache` (hourly keys, restore prefix `qt-2`; pip downloads in a weekly
`qt-pip-` cache).

- Schedules: every 15 min on weekdays 07:00-24:00 UTC, every 30 min 00:00-07:00 UTC,
  plus the 3-hourly radar run. Those two quant schedules skip the radar refetch and
  the `checks` job (condition on `github.event.schedule`), so they never email.
- Refresh tiers inside the publisher: quotes, heatmaps, screeners, overviews and 1-/5-day
  charts every run; scores, longer charts, breadth hourly; risk, volatility, options,
  factors, analysts every 3 h; fundamentals, ownership, filings daily. Undue payloads
  are reused from the restored output.
- The step is `continue-on-error`: a failed publish keeps the restored output, and the
  smoke test fails if `quant-terminal/app/data/meta.json` is over a day old.
- The browser polls `data/meta.json` every minute and refreshes prices when a new build
  lands. Fix bugs in career-semi-quant (`local/`), never here.
- Locally: `pip install -e career-semi-quant/local && semiquant publish --out /tmp/qt`
  then `python -m http.server -d /tmp 8000` and open `/qt/`.

## Analytics

`public/np.js` is the first-party tracker, served by both sites (the portfolio
repo has an identical copy - keep them in sync). It sends `view` (referrer,
#fragment, language, timezone, screen / window size, pixel ratio, touch points,
headless hints), `end` (time visible, scroll depth, sections read and the time
each held mid-screen, interaction, taps, copies, load time, and up to 30 steps:
buttons, tabs, #links, menu picks, switches, sliders - never typed text) and
`click` (outbound / mailto, with the link text) events to the
`nithin-analytics` Cloudflare Worker at
`https://nithin-analytics.nithinpurushothama.workers.dev` (account
nithinpurushothama@gmail.com; D1 database `nithin-analytics`). `end` goes out
at the first interaction, every 15 s while something changes (at least once a
minute, for 30 min) and when the page is hidden. The Worker source is only on
the owner's machine: `~/nithin-analytics-worker` (a local git repo, no remote;
`src/index.js`, `migrations/` - apply a new migration to the remote D1 before
deploying code that uses it, and export a backup to `backups/` first). The
Worker adds the request's side: User-Agent, Accept-Language, Sec-CH-UA client
hints, HTTP protocol, and Cloudflare's IP timezone and postcode. No cookies;
it stores salted hashes (IP + User-Agent = visitor, IP alone = network), never
the IP. Skipped for localhost, `/analytics/`, framed pages, `?notrack` browsers
and the portfolio's owner-pass cookie.

Tool pages load it with `<script src="/np.js" defer></script>` before
`</body>` - except the gm/ID pages (`/gmid/` and its PDK sub-pages), which are
deliberately untracked: it's a public tool, not what the dashboard is for, so
don't add the tracker back there. The Quant Terminal is synced from
career-semi-quant, which loads it through a hostname-gated snippet (its e2e
test fails on a 404).

The dashboard lives in the portfolio repo (`public/analytics/index.html`, at
`https://nithinpuru.com/analytics/`); its AGENTS.md covers sign-in and how it
scores visits. Two small files stay here:

- `public/analytics/index.html` forwards old links there, keeping the query and
  #fragment (`?key=` becomes `?owner=`, which the geo rule lets through). On the
  way, `?optout=1` / `?optout=0` stops or resumes counting this browser on the
  tools (`np_notrack`): the dashboard's sign-in and opt-out switch hop through it.
  Either hop also sets `np_owner` in localStorage (the portfolio's region gate
  still reads it).
- `public/analytics/relay.html`: the Worker answers `/stats` and `/owner` only to
  this origin (CORS), so the dashboard loads this page in a hidden frame and
  sends those calls through it with `postMessage`. It accepts messages only from
  `https://nithinpuru.com` and relays nothing else. The calls still come from the
  owner's browser, so the Worker keeps recognising the owner's devices.

Bots: the Worker drops events from cloud / hosting / VPN networks (`BOT_ASNS`
and `CLOUD` in its `src/index.js`), matching the "Block cloud bots" WAF rule on
nithinpuru.com. Cloudflare, Akamai, Fastly (iCloud Private Relay), Microsoft,
Google and Zscaler are deliberately not on that list - they carry real people.

## No region gate (open to everyone)

The tools on nithinpuru.github.io are open to everyone, from every country,
with no geo restriction of any kind (owner, 2026-11-10). Only nithinpuru.com is
geo-blocked for South Asia (its `scripts/region-gate.mjs` and
`functions/_middleware.js`, in the portfolio repo), with `/puf/` there as the
one page open worldwide. Never add a region gate, a time-zone check or an IP
check here; `npm run smoke` fails if a page carries one or goes blank on an
Indian or Pakistani clock. The `/`, `/tools/` and `/puf/` stubs only forward to
nithinpuru.com, so they follow that site's rules.

## Secure sensor + PUF explorer (`/secure_sensor_with_puf/`)

Reviewed by conference reviewers worldwide: it must open from every country and
device (no tool here is geo-blocked; the smoke test checks that).

Not a copied repo: built here. `model.js` holds the whole behavioural model (S-DSM link, SRAM PUF +
BCH fuzzy extractor, Grain-128a with its MAC, the attacks, calibration, PUF reliability, sweeps) with no
DOM access; `worker.js` runs it off the main thread (one worker per request kind) and `index.html` is
the UI, falling back to the main thread without workers. Bump `MODEL_V` in `index.html` and the
`model.js?v=` script tag together when `model.js` or `worker.js` change. `npm run test:sensor`
(`scripts/test-secure-sensor.mjs`, run by the CI `checks` job) checks Grain-128a against the paper's
test vectors, the Fig. 4(b)/(c) reproductions and the full verdict table against
`scripts/secure-sensor-verdicts.json`; after an intended model change, review the diff and rerun with
`-- --update`.

## Brand assets

`public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png`,
`android-chrome-{192,512}x192.png`, and `og-image.png` are generated from SVG
masters by `scripts/gen-brand.mjs` (`node scripts/gen-brand.mjs`). Palette and
mark geometry live in that script — never hand-edit the PNG/ICO outputs. The
"NP" monogram mirrors the design system (paper, ink, one accent dot, no
rounded corners). The tool pages use `favicon.svg`, `/fonts/` and
`og-image.png` (as their `og:image`), so keep them here.

## Design system (404 page)

- **Palette** (`:root` in `src/styles/tools.css`, shared with the tool pages):
  paper `#ffffff`, ink `#131c28`, ink-2 `#3d4756`, ink-3 `#5b6676`, accent
  `#1f4fd1` (the only accent), rules `rgba(19,28,40,.12/.28)`; dark theme
  paper `#0f1620`, ink `#f2f5fa`, accent `#7aa7ff`. Theme on `html[data-theme]`,
  saved in localStorage `theme` (the tools read the same key).
- **Fonts**: KaTeX_Main (Computer Modern serif) + KaTeX_Typewriter from
  `public/fonts/`. Typewriter is for metadata (tags, links, numbers) only, on
  the `typography.scale` in DESIGN.md (the detector flags sizes off the ramp).
- **Structure**: hairline rules (1px), a 2px ink heading rule ending in an
  open terminal, the 46rem column.
- **Browser surfaces**: `::selection`, `:focus-visible`, scrollbar and caret
  are themed from the palette.
- **Bans**: no cards, `border-radius`, `box-shadow`, gradients, glass/blur, no
  second accent, no unicode/emoji icons (draw 1.5px-stroke SVGs), no
  kickers/eyebrows above headings.

## Verification

CI does most of this on every deploy: the `checks` job in `deploy.yml` runs the
design detector over `src/` and `npm run smoke` (`scripts/smoke.mjs`) against
the published build - the 404 page and every tool in both themes at phone and
laptop widths: no script errors, no
broken same-origin requests, no horizontal overflow (on a UTC clock, so it
also runs from India); the redirect stubs still forward to nithinpuru.com;
no page carries a region gate and every tool opens on an Indian and a
Pakistani clock; and the data bots fresh (FX <= 6 days, Quant
Terminal <= 4 days, Research Radar <= 12 h, deadline tracker <= 3 days). It
runs beside the deploy and never blocks it.

Locally: `npm run radar-data` (Research Radar snapshots from the live site),
`npm run build`, `npm run smoke`, and
`node .agents/skills/impeccable/scripts/detect.mjs --json src/pages src/components src/styles src/layouts`.
