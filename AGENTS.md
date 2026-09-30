# AGENTS.md

Guidance for AI agents working in this repository.

## Project

The public tools site at **https://nithinpuru.github.io** (GitHub Pages): the
browser tools below, their data bots, and a small Astro shell around them.
The portfolio moved to the private `NithinPuru/portfolio` repo (Cloudflare
Pages, https://nithinpuru.com) - don't add portfolio content back here.

- `/`, `/rongm/` and `/tools/` are redirect stubs (`src/components/Redirect.astro`)
  that forward to nithinpuru.com (`/tools/` to the portfolio's tools list,
  `https://nithinpuru.com/#tools`), keeping `?query` and `#hash`.
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
  pages/rongm.astro          # redirect stub -> https://nithinpuru.com/rongm/
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
| `/gmid/` | gmid-hub@4dd4cae | PDK iframe URLs point at the local sub-pages below (with `?v=` cache tags); themed, `injectTheme: false` |
| `/gmid/sky130a/` | gmid_SKY130A@9fe3a6f | no longer a verbatim copy: theme block, lazy per-device data, plotly-basic (see below) |
| `/gmid/gf180mcu-d/` | gmid_GF180MCUD@636ee89 | no longer a verbatim copy: theme block, lazy per-device data, plotly-basic (see below) |
| `/gmid/ihp-sg13g2/` | gmid_IHP130_Tool@35abc75 | no longer a verbatim copy: theme block, lazy per-device data, plotly-basic (see below) |
| `/fx-quant/` | rebuilt from FOREX_QUANT@0f404ba | Quant-Terminal-styled rewrite (`css/fx.css`, `js/fx.js`; models unchanged). Data: `fx_data.json` from `fx-quant/update_fx.py` via `fx-quant-data.yml` (weekdays after the ECB fixing) - the page calls no external API |
| `/research-radar/` | Research-Radar@ee84a10 | loads snapshots from `research-radar/fetch.py`: `data/<domain>.json` (abstracts trimmed to 280-char excerpts), `data/<domain>-abstracts.json` (full text, fetched lazily for the detail panel, search and explainer) and `data/<domain>-explainers.json` (precomputed expert explainers, opt-in: repo variable `RADAR_EXPLAINERS=1` plus the `ANTHROPIC_API_KEY` secret; 10 newest papers per domain, at most 40 new calls per run). **The data is never committed** (`.gitignore`): `deploy.yml` refetches it on its 3-hourly schedule (or `workflow_dispatch` with `refresh_radar`), seeding from the live site so a failed source keeps its items; other deploys copy the live files back (`fetch.py --seed-only`; locally `npm run radar-data`). Sources in `research-radar/sources.json`; the explainer's system prompt is read from the page, so edit it only there. Live SerpApi Scholar and the in-browser Claude explainer (`claude-sonnet-5`) stay; keys in localStorage `rr_*`. Re-skinned to the shared palette (light/dark, KaTeX fonts) with a stacked layout under 820px |
| `/quant-terminal/` | career-semi-quant | synced by `quant-terminal-sync.yml`; data by `quant-terminal-data.yml` - do not hand-edit |
| `/deadline/` | Conf_Deadline_Tracker | driven by the `tracker-*` workflows; `assets/style.css` re-skinned to the shared palette (light/dark, KaTeX fonts) - bump its `?v=` in both HTML pages when it changes |

The gm/ID pages are re-skinned, not rewritten: `public/gmid/theme/gmid-theme.css`
(Quant Terminal tokens prefixed `--qt-`, Computer Modern fonts) and
`gmid-theme.js` (pre-paint theme, `Plotly.react` wrapper that themes every
chart, floating Theme button, cross-iframe sync via the `theme` key). Each page
maps its own colour variables onto `--qt-*` in a block at the end of its
`<style>`; Google Fonts were removed and the hub's old dark-theme injection is
disabled (`injectTheme: false`).

gm/ID data is lazy-loaded: each PDK page embeds only a small device index
(`const DATA = {device: {labels, type}}`) and fetches `data/<device>.json`
(the curve arrays, values identical to the original embedded dataset) the
first time a device is shown - `replot()` / `runHelper()` wrap the tools'
original `_replotSync()` / `_runHelperSync()`. Bump `DATA_V` in the page when
the data files change. Pages load Plotly's `plotly-basic` build (scatter only).

The gm/ID pages have diverged from their repos (theme, lazy data), so don't
re-copy them wholesale: port upstream fixes into the local files by hand.
When a PDK page changes, bump the `?v=` tag on its iframe URL in
`public/gmid/index.html` - GitHub Pages lets browsers cache pages for 10
minutes and iframes otherwise keep showing the old copy. The original repos and their Pages sites are untouched.

## Analytics

`public/np.js` is the first-party tracker, served by both sites (the portfolio
repo has an identical copy - keep them in sync). It sends `view`, `end` (time
visible, scroll depth, sections read) and `click` (outbound / mailto) events
to the `nithin-analytics` Cloudflare Worker at
`https://nithin-analytics.nithinpurushothama.workers.dev` (account
nithinpurushothama@gmail.com; D1 database `nithin-analytics`). The Worker
source is not in a repo - it lives in `~/nithin-analytics-worker` on the
owner's machine (`src/index.js`, `migrations/`). No cookies; the Worker stores
a salted hash, never the IP. Skipped for localhost, `/analytics/`, framed
pages, `?notrack` browsers and the portfolio's owner-pass cookie.

Tool pages load it with `<script src="/np.js" defer></script>` before
`</body>`; the Quant Terminal is synced from career-semi-quant, which loads it
through a hostname-gated snippet (its e2e test fails on a 404). The dashboard
is `public/analytics/`; `/stats` returns aggregates to anyone and the visit
log, networks and cities only with the `X-Stats-Key` header (the owner key,
stored in the browser by opening `/analytics/?key=<key>` once). Never commit
the key.

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
broken same-origin requests, no horizontal overflow; the redirect stubs still
forward to nithinpuru.com; and the data bots fresh (FX <= 6 days, Quant
Terminal <= 4 days, Research Radar <= 12 h, deadline tracker <= 3 days). It
runs beside the deploy and never blocks it.

Locally: `npm run radar-data` (Research Radar snapshots from the live site),
`npm run build`, `npm run smoke`, and
`node .agents/skills/impeccable/scripts/detect.mjs --json src/pages src/components src/styles src/layouts`.
