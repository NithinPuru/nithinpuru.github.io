# nithinyahu

A single-page portfolio for **Nithin P** ([chennakeshavadasa](https://github.com/chennakeshavadasa)),
an Analog/Mixed-Signal IC designer — typeset like a freshly-compiled LaTeX
document: Computer Modern serif, typewriter metadata, ink on paper, numbered
sections, and hairline rules.

- Abstract, research interests, and selected work from real, open repositories
- Publications & tape-outs, including the IIT Gandhinagar LPC group's
  sub-5 ppm/°C voltage-reference tape-out (TinyTapeout 10)
- A quantitative-finance corner (Career Semi Quant Terminal and more)
- CV embedded from Google Drive, fixed running-head SPA navigation, and
  elegant reveal animations with full reduced-motion support

## Stack

- [Astro](https://astro.build) (static site generation) — zero client
  framework, tiny bundle, fast LCP, CLS 0
- Self-hosted [KaTeX](https://katex.org) Computer Modern fonts (no CDN)
- Plain CSS custom properties — no UI framework
- `@astrojs/sitemap` — sitemap + dynamic `robots.txt`

## Getting started

```sh
npm install
npm run dev        # http://localhost:4321
```

Build and preview:

```sh
npm run build      # static site -> dist/
npm run preview    # serve dist/
```

## Project structure

```
src/
  pages/index.astro          # masthead + 7 sections (the whole page)
  pages/notebook.astro       # /notebook route — re-slices the nbconvert export
  pages/404.astro            # generated 404 page (picks up the site base path)
  pages/robots.txt.ts        # dynamic robots.txt, points at sitemap-index.xml
  layouts/Layout.astro       # head, meta, JSON-LD, direction contract
  components/
    WorkList.astro           # JSON-driven entry list component
    Icon.astro               # 1.5px-stroke SVG line icons
  data/
    projects.json            # Selected Work entries
    publications.json        # Publications & Tape-outs entries
    tapeouts.json            # Tape-outs (silicon-fabricated work) entries
    finance.json             # Quantitative Finance entries
    notebook.html            # nbconvert (JupyterLab) export served at /notebook
  styles/global.css          # all tokens and styling
  scripts/reveal.js          # scroll reveals, stagger, section scroll-spy
public/
  fonts/                     # self-hosted KaTeX Computer Modern fonts
  favicon.svg
```

Navigation is a single scrollable page; `src/scripts/reveal.js` handles the
scroll-spy on the masthead's in-page anchor links. There is no separate
`Nav.astro` — the "running head" is part of the masthead, and its links are
pure fragment anchors.

## Notebook

The Ron/gm methodology notebook renders at `/notebook` (nav link "NB"). It is
an Astro route over a JupyterLab nbconvert export (`src/data/notebook.html`),
sliced into head + body and themed to the site paper. To refresh it,
re-export from JupyterLab (notebook: HTML) and overwrite
`src/data/notebook.html` — no route changes needed.

## CV

The CV is embedded from Google Drive in the Curriculum Vitae section (a framed
A4 preview plus an "Open full CV" link). To change it, replace the two
`drive.google.com` URLs in `src/pages/index.astro` with the new document's
embed/link URLs.

## Adding content

Work, publications, and finance are all plain JSON — edit the file and rebuild:

```json
{
  "groups": [
    {
      "heading": "Analog blocks",
      "entries": [
        {
          "title": "Low-Dropout Voltage Regulator",
          "url": "https://github.com/chennakeshavadasa/...",
          "desc": "A one-line, faithful summary of the artifact.",
          "meta": "SKY130 · LDO · 17 stars",
          "tag": "Tape-out",          // optional
          "tagHot": true,              // optional: render tag in annotation red
          "links": [                   // optional extra links
            { "label": "Live demo", "url": "https://..." }
          ]
        }
      ]
    }
  ]
}
```

Every entry must be real and verifiable — never invent claims, star counts, or
publications.

## Deployment

The build output in `dist/` is fully static and deploys anywhere (GitHub
Pages, Netlify, Vercel, nginx).

### GitHub Pages (automatic)

A workflow in `.github/workflows/deploy.yml` builds and deploys to GitHub Pages
on every push to `main`:

1. Enable Pages in **Settings → Pages → Source: GitHub Actions**.
2. Push to `main` — that's it. The workflow auto-derives the canonical
   `SITE_URL` and `base` path from the repository name, so it works for both a
   user site (`<owner>.github.io`) and a project site
   (`<owner>.github.io/<repo>/`).

For a custom domain, set a `SITE_URL` repository **Variable** (and optionally
`ASTRO_BASE`) in **Settings → Secrets and variables → Actions**; the workflow
picks them up automatically. `astro.config.mjs` falls back to local defaults
when those variables are absent, so `npm run dev` / `npm run preview` need no
setup.

## Design system

`DESIGN.md` and `.impeccable/design.json` document the visual system: palette,
Computer Modern type hierarchy, the typewriter scale, motion grammar, and the
rules that keep the page a "freshly-typeset paper" (no cards, shadows,
gradients, or rounded corners). Keep changes inside that system.
