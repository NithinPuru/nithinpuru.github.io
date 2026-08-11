# nithinyahu

A single-page portfolio for **Nithin P** ([chennakeshavadasa](https://github.com/chennakeshavadasa)),
an Analog/Mixed-Signal IC designer — typeset like a freshly-compiled LaTeX
document: Computer Modern serif, typewriter metadata, ink on paper, numbered
sections, and hairline rules.

- Abstract, research interests, and selected work from real, open repositories
- Publications & tape-outs, including the IIT Gandhinagar LPC group's
  sub-5 ppm/°C voltage-reference tape-out (TinyTapeout 10)
- A quantitative-finance corner (Career Semi Quant Terminal and more)
- Framed portrait in the masthead, CV that opens in a new tab, fixed
  running-head SPA navigation, and elegant reveal animations with full
  reduced-motion support

## Stack

- [Astro](https://astro.build) (static site generation) — zero client
  framework, tiny bundle, fast LCP, CLS 0
- Self-hosted [KaTeX](https://katex.org) Computer Modern fonts (no CDN)
- Plain CSS custom properties — no UI framework

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
  layouts/Layout.astro       # head, meta, JSON-LD, direction contract
  components/
    Nav.astro                # fixed running-head navigation
    WorkList.astro           # JSON-driven entry list component
    Icon.astro               # 1.5px-stroke SVG line icons
  data/
    projects.json            # Selected Work entries
    publications.json        # Publications & Tape-outs entries
    finance.json             # Quantitative Finance entries
  styles/global.css          # all tokens and styling
  scripts/reveal.js          # scroll reveals, stagger, nav scroll-spy
public/
  fonts/                     # self-hosted KaTeX Computer Modern fonts
  portrait.jpg               # optional portrait; drop here (or .png) to fill the masthead frame
  favicon.svg
```

## Portrait

The masthead shows a framed 4:5 portrait placeholder. Drop `public/portrait.jpg`
(or `portrait.png`) into the repo to replace it — no code change needed.

## CV

Drop your CV as `public/cv.pdf`; the "Open CV (.pdf)" button already links to
`/cv.pdf` and opens it in a new tab.

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
