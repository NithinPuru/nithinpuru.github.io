---
name: nithinpuru.github.io
description: Portfolio of Nithin P, typeset like a freshly-compiled LaTeX document — Computer Modern serif, typewriter metadata, ink on paper.
colors:
  paper: "#faf9f4"
  ink: "#191814"
  ink-2: "#45413a"
  ink-3: "#6f6a5e"
  accent: "#2b4863"
  annot: "#8f3526"
  annot-soft: "#a54837"
  rule: "rgba(25, 24, 20, 0.16)"
  rule-strong: "rgba(25, 24, 20, 0.34)"
typography:
  display:
    fontFamily: '"KaTeX_Main", Georgia, "Times New Roman", serif'
    fontSize: "clamp(2.4rem, 6.5vw, 3.9rem)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.015em"
  headline:
    fontFamily: '"KaTeX_Main", Georgia, "Times New Roman", serif'
    fontSize: "clamp(1.6rem, 3.6vw, 2.05rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: '"KaTeX_Main", Georgia, "Times New Roman", serif'
    fontSize: "1.16rem"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: '"KaTeX_Main", Georgia, "Times New Roman", serif'
    fontSize: "1.0625rem"
    lineHeight: 1.78
  label:
    fontFamily: '"KaTeX_Typewriter", "Courier New", monospace'
    fontSize: "0.72rem"
    letterSpacing: "0.08em"
  scale:
    micro: "0.66rem"
    footnote: "0.70rem"
    small: "0.72rem"
    rubric: "0.74rem"
    meta: "0.76rem"
    compact: "0.78rem"
    skip: "0.80rem"
    doc-meta: "0.82rem"
    contact: "0.84rem"
    nav-name: "0.92rem"
    subhead: "1rem"
spacing:
  column: "46rem"
  section-block: "clamp(2.75rem, 6vw, 4.25rem)"
  entry-block: "1.05rem"
  head-gap: "0.9rem"
  nav-h: "3.4rem"
components:
  nav-link:
    fontFamily: '"KaTeX_Typewriter", "Courier New", monospace'
    fontSize: "0.72rem"
    textColor: "{colors.ink-2}"
  nav-link-active:
    textColor: "{colors.accent}"
  entry-title:
    fontFamily: '"KaTeX_Main", Georgia, "Times New Roman", serif'
    fontSize: "1.16rem"
    fontWeight: 700
    textColor: "{colors.ink}"
  entry-meta:
    fontFamily: '"KaTeX_Typewriter", "Courier New", monospace'
    fontSize: "0.76rem"
    textColor: "{colors.ink-3}"
  cv-btn:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    padding: "0.78rem 1.15rem"
    rounded: "0"
    typography: "{typography.label}"
  cv-btn-hover:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
---

# Design System: nithinpuru.github.io

## Overview

**Creative North Star: "The Freshly-Typeset Paper"**

A portfolio that reads as the output of a LaTeX compiler the moment it lands: Computer Modern serif set against warm paper, typewriter metadata, numbered `\section` headers, justified measure, and structure drawn with 1px hairline rules — never cards, never shadows, never rounded corners. The subject is an analog IC designer, and the world is deliberately mechanical: type that looks set, rules that look drawn, and annotation marks used the way a proofreader uses red ink — once and for a reason.

The page refuses the agency card grid and the hero-metric template outright. Density follows the rhythm of a typeset document: a tall `\maketitle` masthead, section bodies paced by hairlines, and entries composed like bibliography items with a hanging rule between them. Motion stays in the document's own register — ink settling, rules drawing themselves — and everything is visible without JavaScript or motion enabled.

**Key Characteristics:**
- Computer Modern serif (`KaTeX_Main`) over typewriter (`KaTeX_Typewriter`) metadata
- Ink-on-paper palette with exactly one blue accent and a sparing annotation red
- Numbered section grammar with hairline rules that draw on reveal
- Justified, hyphenated body measure in a single centered column
- Flat, square, hairline-drawn surfaces — no cards, shadows, gradients, or radii
- Reveal-on-scroll with stagger; full reduced-motion and no-JS fallbacks

## Colors

One warm-paper field, near-black inks, one oxford-blue accent, and a red held for annotation.

### Primary
- **Oxford Ink Blue** (#2b4863): the single accent. Links, section numbers, nav active states, small arrow SVGs, and small-caps document labels.

### Neutral
- **Paper** (#faf9f4): page and nav field. Warm, never pure white.
- **Ink** (#191814): primary text and headings; also the CV button fill.
- **Ink Two** (#45413a): secondary prose (entry descriptions, ledes).
- **Ink Three** (#6f6a5e): tertiary metadata, mono labels, footer.
- **Rule** (rgba(25,24,20,0.16)) / **Rule Strong** (rgba(25,24,20,0.34)): all hairline structure — section separators, entry rules, the nav underline.

### Tertiary
- **Annotation Red** (#8f3526): sparing status marks — hot tags such as "Tape-out" / "Chip", rubric dashes. **Annotation Soft** (#a54837): the em-dash prefix on group rubrics.

### Named Rules
**The One Accent Rule.** Exactly one ink-blue accent exists. Hierarchy comes from weight and size, never a second hue; the pre-buid second blue was folded into `--accent`.
**The Sparing Red Rule.** Annotation red appears only as small rubrics and status tags. If a screen shows more than a handful, the point is lost.
**The Hairline Rule.** Structure is drawn with 1px rules. A box, shadow, or radius where a hairline belongs is a foreign object.

## Typography

**Display Font:** KaTeX_Main — Computer Modern (Georgia / Times New Roman fallback)
**Body Font:** KaTeX_Main (Georgia / Times New Roman fallback)
**Label/Mono Font:** KaTeX_Typewriter — Computer Modern typewriter (Courier New fallback)

**Character:** The authentic Computer Modern pairing — serif body and display, typewriter for document machinery. Mono is never used as a "technical" costume; it marks metadata, dates, tags, bibliographic lines, and navigation the way a LaTeX source annotates its own structure.

### Hierarchy
- **Display** (700, `clamp(2.4rem, 6.5vw, 3.9rem)`, 1.04, -0.015em): the masthead name — the only use.
- **Headline** (700, `clamp(1.6rem, 3.6vw, 2.05rem)`, 1.15, -0.01em): `\section` titles, preceded by a serif section numeral.
- **Title** (700, 1.16rem, 1.4): work-entry titles — serif bold, underlined, the link itself.
- **Body** (400, 1.0625rem, 1.78): justified and hyphenated, column measure ≈74ch.
- **Label** (400, typewriter scale `0.66–0.92rem`, 0.05–0.16em tracking, uppercase): tags, group rubrics, mono metadata, nav links. The scale is enumerated in the frontmatter: `micro` (0.66, entry tags) → `footnote` (0.70, abstract label) → `small` (0.72, nav links, highlight keys) → `rubric` (0.74, group heads, footer) → `meta` (0.76, entry metadata) → `compact` (0.78, section footnotes, CV button) → `skip` (0.80) → `doc-meta` (0.82, masthead metadata, contact strip) → `contact` (0.84, contact rows) → `nav-name` (0.92, the running-head name mark).

### Named Rules
**The Justified Measure Rule.** Body copy is justified with `hyphens: auto` inside the 46rem column; left-ragged prose where a typeset page could justify is a miss.

## Layout

A single centered column (`max-width: 46rem`, ≈736px, ≈74ch measure) with generous inline padding that collapses to 1.15rem below 600px. A fixed running-head nav (`3.4rem`) carries the name mark left and the section links right (plus the notebook link); below 760px the strip becomes horizontally scrollable with a hidden scrollbar and auto-scrolls to keep the scroll-spy's active link in view, and below 520px the name mark hides (the masthead carries the name). Sections stack, separated by 1px hairlines, each opening with the numeral + title + a flexed hairline that draws itself on reveal. Vertical rhythm: `padding-block: clamp(2.75rem, 6vw, 4.25rem)` per section, more space above a heading than below it, entries at 1.05rem per row under a 1px top rule. All anchors scroll with `scroll-margin-top` clearing the fixed nav.

## Elevation & Depth

Flat by default — there is no box-shadow anywhere in the shipped CSS. Depth is conveyed by ink weight and hairline structure, not elevation: the nav's 1px bottom rule separates it from scrolling content, section rules draw in, and the masthead delivers the one authored moment, an ink-settle (blur-to-sharp rise) plus a hairline that stroke-draws left to right. Under `prefers-reduced-motion`, every animation is disabled and content is fully visible.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Depth is drawn with rules and ink, never shadowed.

## Shapes

Square. There is no `border-radius` anywhere in the shipped CSS; corners are sharp. The only "container" is the CV frame, a `\fbox`-style 1px bordered box with no rounding. All icons are hand-authored SVG linework at 1.5px stroke, round caps, in the single accent or current text color.

## Components

### Running-Head Navigation
Fixed bar, paper field, 1px bottom rule. Name mark left (typewriter uppercase); mono links (0.72rem, uppercase) right. Hover and active tint the link to the accent; active gets a 1px accent underline. Mobile: subtitle hidden, links scroll horizontally with a hidden scrollbar.

### Work Entry (data-driven)
The reusable, JSON-driven list item (Work / Tape-outs / Finance feed one component; Publications use the bibliography variant below). 1px top rule between entries; serif bold title is the link (ink → accent on hover) with an inline external-arrow SVG; an optional right-aligned mono tag (annotation red when `tagHot`); justified description in Ink Two; a mono metadata line in Ink Three (PDK · domain · stars) with optional accent extra links ("Live demo", "3D GDS view").

### Bibliography (Publications)
`PubList.astro` renders `publications.json` as a LaTeX `thebibliography`: a hanging accent `[n]` label in typewriter (numbered continuously across groups), a plain serif-bold title that underlines only on hover, the author line with the site owner in bold, the venue in italic serif, then the description, an **Abstract** fold, the image strip, and a wrapping row of typewriter links. An optional venue logo (`logo`, `logoAlt`) sits in a fixed 16:9 hairline "plate" in a 9.5rem right-hand column; the logo is contained and multiply-blended into the paper so marks of any shape (square society seal, wide conference wordmark) read as one family. On narrow screens the plate moves above the title at 8rem and the tag drops under the title. Group rubrics carry an accent count ("Conference Papers 2").

### Folds, Image Strip, Lightbox
Collapsible content (`Abstract`, `View Methodology & Results`, image strips) uses `details.fold`: a typewriter uppercase accent summary with a drawn chevron (CSS mask, not a glyph) and a body hung off a 1px `rule-strong` line. Image strips (`Gallery.astro`) are open by default and carry `data-keep-open` so the Publications/Awards auto-collapse observer skips them. Thumbnails are plain anchors to the full image (works without JS); `src/scripts/lightbox.js` upgrades any `a[data-lightbox]` into one shared native `<dialog>` — ink overlay, paper caption, drawn close icon, Esc/backdrop to close, focus returned to the thumbnail.

### Comparison Table
The Awards methodology table is `table.cmp-table`, set booktabs-style: 2px ink top and bottom rules, a 1px ink rule under the header, hairline row rules, small-caps-style section rows, and the "This Work" column tinted with a 6% accent wash. Yes/No cells use drawn check (accent) and cross (annotation red) marks with `aria-label`s — never emoji or face icons. It scrolls horizontally inside its own frame below ~34rem.

### Live GitHub Figures
`src/lib/github.ts` fetches the owner's public repositories once at build time (authenticated with `GITHUB_TOKEN` in CI, 8s timeout). Work entries whose URL points at a repo with stars show a typewriter `☆ n` mark (accent line star) left of the tag — zero counts are omitted — and the Work footer states the live repository and star totals. On any failure the figures are simply absent; nothing is hand-maintained or cached in JSON.

### Group Rubric
Typewriter uppercase in Ink Three, prefixed by an em-dash in Annotation Soft and followed by the group's entry count in the accent, preceding each group of entries inside a section.

### CV Section
The CV is a framed A4 Google Drive preview (`aspect-ratio: 210 / 297`, hairline border, max 700px) centered in the section, with a mono uppercase "Open full CV" link (0.78rem, accent, hairline underline on hover) below it.

### Contact Rows / CV Highlights
Mono small-caps labels (`flex: 0 0 7.5–8.5rem`) followed by the value, separated by 1px top rules; links accent with a hairline underline. On mobile the row stacks to a column.

### Buttons
One face of the button grammar — a square 1px ink frame, mono uppercase 0.78rem with 0.07em tracking, and an arrow SVG in the accent. **Ghost** (`--ghost`): transparent fill with ink text, filling on hover — the masthead "Get in touch" anchor (scrolls to contact) and the 404 page's "Back to the home page".

### Signature: The Masthead (`\maketitle`)
A two-column title block: left, the name set large in Computer Modern over two typewriter lines (role, then affiliation), a single annotation-red status line ("Seeking PhD positions · Fall 2027"), and a row of typewriter profile links (Email, GitHub, LinkedIn, CV) with accent line icons; right, a square portrait printed in grayscale inside a 1px `rule-strong` frame with a paper mat — the photo belongs to the paper, not a colour accent. Below 600px the portrait moves above the name at 6.5rem. Then the small-caps "About me" abstract (research interests set in two columns ≥760px) and a "Get in touch" ghost button. Above it, the authored device: a mechanical 1px hairline that stroke-draws in, then a blur-settle of the whole block.

## Do's and Don'ts

### Do:
- **Do** use the numbered `\section` grammar in section headings — numerals carry the document's structure; the running-head nav uses plain labels.
- **Do** set body copy justified with hyphenation inside the 46rem measure.
- **Do** reserve typewriter for document metadata: labels, dates, tags, bibliographic lines, nav.
- **Do** draw structure with 1px hairlines and ink weight, never with boxes or shadows.
- **Do** use the single oxford-blue accent for links, numerals, and small markers.
- **Do** reveal content on scroll with a subtle fade + 12px rise and a stagger of up to 420ms; honor `prefers-reduced-motion` and no-JS by leaving content visible.
- **Do** add new Work/Publication/Finance entries by editing the corresponding `src/data/*.json` — no markup changes needed.

### Don't:
- **Don't** introduce cards, rounded corners, shadows, gradients, or a glass/dark-terminal surface.
- **Don't** add a second accent hue; fold hierarchy into weight and size.
- **Don't** use unicode glyphs or emoji as icons — author 1.5px SVG linework.
- **Don't** place a kicker or eyebrow above a heading; the heading carries itself.
- **Don't** hand-draw or wobble the masthead line — it is a mechanical hairline.
- **Don't** fabricate biographical, publication, or star-count claims; every entry must be real, supplied content (stale counts are documented in `src/pages/index.astro`).
