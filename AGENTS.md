# AGENTS.md

Guidance for AI agents working in this repository. Read `DESIGN.md` and
`.impeccable/design.json` before any visual change; they are the authoritative
record of the built world.

## Project

A single-page portfolio for **Nithin P** (chennakeshavadasa), an
Analog/Mixed-Signal IC designer. The visual world is a freshly-typeset LaTeX
document: Computer Modern serif over typewriter metadata, ink on warm paper,
numbered sections, hairline rules, justified measure. No cards, shadows,
gradients, or rounded corners. See the direction contract in the body comment
of `src/layouts/Layout.astro` (first child of `<body>`).

## Commands

```sh
npm run dev       # local dev server
npm run build     # static build -> dist/
npm run preview   # serve dist/ (use: node node_modules/astro/astro.js preview --port 4321)
```

## Structure

```
src/
  pages/index.astro          # the entire page: masthead + 7 sections
  layouts/Layout.astro       # head, meta, JSON-LD, direction contract, reveal script
  components/
    Nav.astro                # fixed running-head nav (SPA section links)
    WorkList.astro           # reusable JSON-driven entry list (Work/Publications/Finance)
    Icon.astro               # 1.5px-stroke SVG line icons (external, down)
  data/
    projects.json            # Selected Work entries
    publications.json        # Publications & Tape-outs entries
    finance.json             # Quantitative Finance entries
  styles/global.css          # all tokens + styling (single stylesheet)
  scripts/reveal.js          # scroll reveals, stagger, nav scroll-spy
public/
  fonts/                     # self-hosted KaTeX Computer Modern woff2
  portrait.jpg               # optional; drop it (or portrait.png) to replace the masthead placeholder
  cv/README.txt              # drop public/cv.pdf here to wire the CV button
```

## Content edits (most common task)

All work/publication/finance entries are plain JSON — no markup changes needed:

```json
{
  "groups": [
    {
      "heading": "Analog blocks",
      "entries": [
        {
          "title": "Low-Dropout Voltage Regulator",
          "url": "https://github.com/chennakeshavadasa/Low-dropout-Voltage-Regulator-LDO-using-SKY130PDK",
          "desc": "LDO design in SKY130 covering regulation, dropout behaviour and stability.",
          "meta": "SKY130 · LDO · 17 stars",
          "tag": "Tape-out",      // optional; rendered right of the title
          "tagHot": true,          // optional; renders the tag in annotation red
          "links": [               // optional extra links (demo, 3D view, ...)
            { "label": "Live demo", "url": "https://..." }
          ]
        }
      ]
    }
  ]
}
```

Rules for content:
- **Never fabricate.** Every entry, star count, affiliation, and claim must be
  real and verifiable. Star counts and the "28 repositories" figure go stale;
  re-verify when editing data (note in `src/pages/index.astro` frontmatter).
- Keep `desc` as a real, faithful summary of the linked artifact.
- One JSON file per domain; `WorkList.astro` renders every group/entry.
- The masthead holds a framed portrait: it renders the real image when
  `public/portrait.jpg` (or `.png`) exists, otherwise a typewriter placeholder.
  The CV button opens `/cv.pdf` in a new tab — drop the file into `public/` to
  wire it.

## Design system (must follow)

- **Palette** (`:root` in `src/styles/global.css`): paper `#faf9f4`, ink
  `#191814`, ink-2 `#45413a`, ink-3 `#6f6a5e`, accent `#2b4863` (the ONLY
  accent), annotation red `#8f3526`, rules `rgba(25,24,20,.16/.34)`.
- **Fonts**: KaTeX_Main (Computer Modern serif) + KaTeX_Typewriter, self-hosted
  in `public/fonts/`. Typewriter is reserved for document metadata (labels,
  dates, tags, bibliographic lines, nav) — never as a "technical" costume.
- **Typewriter size scale**: 0.66/0.70/0.72/0.74/0.76/0.78/0.80/0.82/0.84/0.92rem
  (enumerated as `typography.scale` in DESIGN.md; the detector flags literals
  off this ramp).
- **Structure**: numbered `\section` headers (`<span class="section-no">`),
  hairline rules (1px, `border-top`/`border-bottom`), justified hyphenated body
  in the 46rem column.
- **Motion**: reveals via `data-reveal` + `data-reveal-group` (stagger),
  rule-draw `scaleX`, masthead ink-settle + hairline stroke-draw. All gated on
  `prefers-reduced-motion: no-preference`; content must stay visible without JS
  or motion. Keep motion to the documented moments; do not scatter new ones.
- **Browser surfaces**: `::selection`, `:focus-visible`, scrollbar, caret are
  themed from the palette — keep that up when adding UI.
- **Bans**: no cards, no `border-radius`, no `box-shadow`, no gradients, no
  glass/blur decoration, no second accent, no unicode/emoji icons (draw
  1.5px-stroke SVGs), no kickers/eyebrows above headings, no hero-metric
  templates, no imitation materials (hand-drawn flourishes) — the masthead line
  is a mechanical hairline.

## Verification

- Build before finishing: `npm run build`.
- Run the impeccable design detector over changed files:
  `node .agents/skills/impeccable/scripts/detect.mjs --json <changed targets>`
  Fix mechanical findings; advisory off-ramp sizes mean the DESIGN.md
  `typography.scale` needs the new step, not an ignore.
- After a build, the direction contract seed key must survive in `dist/index.html`
  (grep for `impeccable:direction contract`).
- Visual checks: preview the built site; confirm no horizontal overflow at
  360/768/1024/1440px and every text color ≥ 4.5:1 on paper.
