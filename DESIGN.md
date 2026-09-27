---
name: nithinpuru.github.io
description: Portfolio of Nithin P, typeset like a freshly-compiled LaTeX document — Computer Modern serif, typewriter metadata, ink on paper.
colors:
  paper: "#ffffff"
  paper-2: "#f4f6f9"
  ink: "#131c28"
  ink-2: "#3d4756"
  ink-3: "#5b6676"
  accent: "#1f4fd1"
  accent-wash: "rgba(31, 79, 209, 0.06)"
  annot: "#b42318"
  annot-soft: "#c4442f"
  plate: "#ffffff"
  rule: "rgba(19, 28, 40, 0.12)"
  rule-strong: "rgba(19, 28, 40, 0.28)"
  dark-paper: "#0f1620"
  dark-paper-2: "#172131"
  dark-ink: "#f2f5fa"
  dark-ink-2: "#cfd7e3"
  dark-ink-3: "#95a1b3"
  dark-accent: "#7aa7ff"
  dark-accent-wash: "rgba(122, 167, 255, 0.1)"
  dark-annot: "#ff8a7a"
  dark-annot-soft: "#f07563"
  dark-plate: "#eef2f7"
  dark-rule: "rgba(242, 245, 250, 0.12)"
  dark-rule-strong: "rgba(242, 245, 250, 0.26)"
  die-well: "#15161a"
  d-ams: "#1f4fd1"
  d-oss: "#0b8a6b"
  d-res: "#7b3fd0"
  d-ml: "#b86200"
  dark-d-ams: "#7aa7ff"
  dark-d-oss: "#4fd1a8"
  dark-d-res: "#b89bff"
  dark-d-ml: "#ffb357"
typography:
  display:
    fontFamily: '"KaTeX_Main", Georgia, "Times New Roman", serif'
    fontSize: "clamp(2.4rem, 6.5vw, 3.9rem)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.015em"
  headline:
    fontFamily: '"KaTeX_Main", Georgia, "Times New Roman", serif'
    fontSize: "clamp(1.75rem, 3.6vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: '"KaTeX_Main", Georgia, "Times New Roman", serif'
    fontSize: "1.2rem"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: '"KaTeX_Main", Georgia, "Times New Roman", serif'
    fontSize: "1.125rem"
    lineHeight: 1.78
  label:
    fontFamily: '"KaTeX_Typewriter", "Courier New", monospace'
    fontSize: "0.72rem"
    letterSpacing: "0.08em"
  scale:
    micro: "0.74rem"
    footnote: "0.76rem"
    small: "0.78rem"
    rubric: "0.8rem"
    meta: "0.82rem"
    compact: "0.84rem"
    skip: "0.86rem"
    doc-meta: "0.88rem"
    contact: "0.9rem"
    aside: "0.95rem"
    nav-name: "0.96rem"
    subhead: "1rem"
    grid-title: "1.12rem"
    figure: "1.35rem"
    sidebar-name: "1.8rem"
    sidebar-name-compact: "1.6rem"
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

A crisp, cool palette: a white page with a faint blue-grey raised surface (`paper-2`, the laptop sidebar), navy-black and slate inks, one saturated "silicon blue" accent, and a clean red held for status. A matching **dark theme** (deep navy page, raised navy surfaces, near-white and blue-grey inks, a bright blue accent and a softened red) is selected on `<html data-theme>` by a pre-paint head script from the saved choice or the system preference, and flipped by the sun/moon `ThemeToggle` (top nav on small screens, sidebar foot on laptops). Every component reads colours from the variables; only image wells (the tape-out die plate `#15161a`) and photo overlays keep fixed dark values in both themes.

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
**Sanctioned exception - skills-graph domain hues.** The skills graph colours its four output domains (blue Analog/MS, teal Open-source EDA & tapeout, violet Research & methodology, amber ML & quant finance, each with a lighter dark-theme variant); every other neuron takes the hue of the domain it reaches by the most paths, edges take the hue of the neuron they feed, domain rings carry their hue at rest, and a colour key sits under the graph. These hues appear nowhere else on the site.
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

**Laptop (≥960px; the sidebar is 14rem with a flexible column between 960 and 1199px so small laptops and phones in "desktop site" mode, ~980px, get this layout too):** a two-column shell - a sticky, full-height profile sidebar (15.5rem on the raised surface: portrait, name at 1.8rem, then everything in the **serif** at readable sizes - role (~1rem), a red status line with a filled status dot, a 2×2 grid of icon links, the **pinout** section menu (serif labels ~1rem, small tabular numerals), and the theme toggle + notebook link at its foot; height tiers keep it all on screen - portrait 10.5rem on tall screens, 9.5rem at ≤920px tall (1440×900, 1536×864), 6.5rem at ≤800px (1366×768) and 5rem at ≤740px (1280×720) with progressively tighter spacing) beside the 46rem reading column; the top nav is hidden. The pinout draws each section as an IC pin hanging off a vertical **signal bus**: pin stub, two-digit pin number, net name. A small accent **probe** travels the bus to the scroll-spy's active section (0.6s ease-out), the trace behind it fills with accent like a charged wire, the active pin's stub lights once the probe arrives, and a ring **ping** expands and fades at the pin. Transform/opacity only; with reduced motion the probe and fill jump without transition and there is no ping. The portrait is centred in the sidebar. **Below 960px:** the same profile block renders as the masthead head (name left, portrait right; portrait above the name under 600px) under the fixed running-head nav.

**Section grammar:** each section opens with a schematic **net label** — the two-digit numeral reversed out of an accent, arrow-ended port tag — beside the title, over a 2px ink rule that draws in on reveal. Subsections carry a mono number and count over a `rule-strong` hairline; group rubrics sit over a hairline.

**Tape-outs ("chip plates"):** the first image leads as a square die plate on a dark well (zoom-in to the lightbox), the datasheet body beside it; further images are 4:3 captioned thumbnails. **Key specifications** on tape-outs/projects render as a ruled datasheet strip of parameter/value cells (`specs` in JSON; values copied from the entry's own text).

The footer reads like a datasheet foot: name · Portfolio · `Rev. <build date>` · typeset note · links.

### Previous single-column notes

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
Entries lead with a serif-bold title (underlined only on hover), a typewriter keyword line (`meta`: PDK · block · tools), then `points` rendered as a hanging en-dash list — left-aligned, never justified inline bullets — and a link row that automatically gains a **Source** link (GitHub line icon) for repository URLs. `Featured` tags are neutral ink; annotation red is reserved for status such as `Fabricated`. Work subsections are numbered `\subsection`s ("6.1 Tape-outs", "6.2 Projects") with an accent count; `layout="grid"` (Projects) sets entries in two hairline-ruled columns ≥760px with link rows aligned to the row bottom.

### Bibliography (Publications)
`PubList.astro` renders `publications.json` as a LaTeX `thebibliography`: a hanging accent `[n]` label in typewriter (numbered continuously across groups), a plain serif-bold title that underlines only on hover, the author line with the site owner in bold, the venue in italic serif, then the description, an **Abstract** fold, the image strip, and a wrapping row of typewriter links. An optional venue logo (`logo`, `logoAlt`) sits in a fixed 16:9 hairline "plate" in a 9.5rem right-hand column; the logo is contained and multiply-blended into the paper so marks of any shape (square society seal, wide conference wordmark) read as one family. On narrow screens the plate moves above the title at 8rem and the tag drops under the title. Group rubrics carry an accent count ("Conference Papers 2"). Each entry has a **Cite this** fold: an IEEE-style reference line, the BibTeX entry in a ruled mono block on the raised surface, and a "Copy BibTeX" button (`src/scripts/cite.js`). Citation data (`cite.text`, `cite.bibtex` in JSON) uses only details shown on the site — no invented DOIs, pages or expanded venue names.

### Folds, Image Strip, Lightbox
Collapsible content (`Abstract`, `View Methodology & Results`, image strips) uses `details.fold`: a typewriter uppercase accent summary with a drawn chevron (CSS mask, not a glyph) and a body hung off a 1px `rule-strong` line. Image strips (`Gallery.astro`) are open by default and carry `data-keep-open` so the Publications/Awards auto-collapse observer skips them. Thumbnails are plain anchors to the full image (works without JS); `src/scripts/lightbox.js` upgrades any `a[data-lightbox]` into one shared native `<dialog>` — ink overlay, paper caption, drawn close icon, Esc/backdrop to close, focus returned to the thumbnail.

### Comparison Table
The Awards methodology table is `table.cmp-table`, set booktabs-style: 2px ink top and bottom rules, a 1px ink rule under the header, hairline row rules, small-caps-style section rows, and the "This Work" column tinted with a 6% accent wash. Yes/No cells use drawn check (accent) and cross (annotation red) marks with `aria-label`s — never emoji or face icons. It scrolls horizontally inside its own frame below ~34rem.

### Live GitHub Figures
`src/lib/github.ts` fetches the owner's public repositories once at build time (authenticated with `GITHUB_TOKEN` in CI, 8s timeout). Work entries whose URL points at a repo with stars show a typewriter `☆ n` mark (accent line star) left of the tag — zero counts are omitted — and the Work footer states the live repository and star totals. On any failure the figures are simply absent; nothing is hand-maintained or cached in JSON.

### Group Rubric
Typewriter uppercase in Ink Three, prefixed by an em-dash in Annotation Soft and followed by the group's entry count in the accent, preceding each group of entries inside a section.

### CV Section (document viewer)
A framed viewer on the raised surface: a toolbar strip (accent file icon, serif-bold "Curriculum Vitae", a typewriter "PDF" chip) with **Open** (Drive viewer, new tab) and **Download PDF** (Drive direct download) actions on the right, then the Drive preview iframe at A4 aspect capped at 85vh, and a note inviting an email for the latest version.

### CV Section (legacy)
The CV is a framed A4 Google Drive preview (`aspect-ratio: 210 / 297`, hairline border, max 700px) centered in the section, with a mono uppercase "Open full CV" link (0.78rem, accent, hairline underline on hover) below it.

### Experience Timeline (`Experience.astro`, data in `experience.json`)
A plot-style **time axis**: a solid 1px ink rail with a triangular arrowhead and an italic serif *t* label pointing up to "now"; each role's start year is an axis tick (typewriter, right-aligned in the gutter, with a short tick mark), and a ring-and-dot SVG node sits on the rail (current role: accent node + accent tick). In place of organisation logos each entry carries the **schematic symbol** of the circuit class worked on there — ADC (Omni), multiphase buck converter (PhyTau), class-AB push-pull stage (IIT Gandhinagar), RF TX/RX antenna pair (ISRO) — with a short typewriter caption; accent for the current role and on hover. No spec tables in Experience. The summary shows typewriter dates · tenure (computed at build time from `start`/`end`, e.g. "1 yr 1 mo") with a right-aligned kind label (Industry / Research / Internship), the serif-bold role (accent on hover), organisation line, keyword line, an always-visible datasheet **spec strip** of headline figures (copied from the role's own bullets), an optional "Advisor · name" line, and a "Details / Hide" fold that reveals the full detail hung off a `rule-strong` line as hanging en-dash lists. The role — not the employer — is the title. Under 600px the axis collapses to a plain rail, ticks and symbols hide.

### Schematic & Finance Symbols (`Symbol.astro`)
One 48×40 line-art set at 1.5px stroke in `currentColor` (Ink Three at rest, accent on hover): ADC / DAC, comparator (and POR comparator with supply ramp), op-amp, fully differential op-amp, class-AB push-pull stage (ring amplifier output), two-transistor reference (native NMOS over diode-tied NMOS), LDO (error amp driving a PMOS pass device with feedback), corner sweep, ground — and, for Quantitative Finance, candlesticks, a series with a dashed forecast past a "now" line, and a return distribution with the VaR tail filled. Circuit projects and finance entries set `symbol` in JSON and render it inside a 3.9rem square **schematic tile** (raised `paper-2` fill, hairline frame, accent on hover) beside the entry. The section heading rule ends in an open **terminal** (drawn in after the rule), and the document ends with a centred **ground** symbol above the footer.

### Skills Graph (`SkillsSFG.astro`)
A four-layer signal-flow network (Source → Skills → Projects · Places → Domains) with typewriter layer headers above each column. Hover or keyboard focus previews a node by tracing **every signal path through it** — upstream to the Σ source and downstream to the domain outputs: edges touching the node are drawn boldest, the rest of its paths in accent with arrowheads (lifted above the mesh), and every node off those paths fades to 30% — and click pins it, filling the detail panel (and scrolling the panel into view if it is off-screen). **Activation propagation** (3Blue1Brown-style) runs while the graph is on screen: nothing travels along the wires - a genuine **forward pass** sets the brightness: the source fires at 1, each neuron's activation is the weighted sum of its inputs (source activation × edge weight) min-max normalised within its layer, neurons fill with accent in proportion to that activation, and every edge brightens along its whole length with the signal it carries (source activation × weight; thickness from the weight) - so lines and neurons agree and the outputs light unevenly according to how much reaches them, then fades as the next layer lights: Σ → skills → places → domains, one hop per second in a 5s ease-in-out cycle. While a node is previewed or pinned, only its paths animate. Paused off-screen (IntersectionObserver) and disabled under reduced motion. The panel opens pre-filled with "Analog / Mixed-Signal IC Design" while the graph stays un-highlighted until the visitor interacts; the legend sits directly under the graph. All strokes and fills read theme variables.

### Latest (news ticker, `News.astro` + `news.json`)
Directly after the About masthead: an accent, arrow-ended "Latest" net label beside a ruled strip of dated items (typewriter accent date, optional red tag, serif text linking to the relevant section or source) scrolling right-to-left in a 70s loop; it pauses on hover and keyboard focus, the duplicate track is `aria-hidden`, and under reduced motion it becomes a static, horizontally scrollable row. Items must be real and dated from site content.

### Education
One entry hung off a 2px accent left rule: typewriter dates · duration with a right-aligned level label, the serif-bold degree, the university line, a single CGPA figure (typewriter label, bold 1.35rem value, "/ 10") in a hairline box on the raised surface, then "Courses taken" over a hairline and one aligned row per area (Circuits & VLSI, Signals & Systems, Communication & RF, Digital & Embedded): accent typewriter label in an 11.5rem column, course names flowing right separated by trailing middots, rows divided by hairlines (label stacks above on mobile).

### Awards
A bibliography-like entry: the SSCS logo in a 16:9 venue plate on the left; right, a typewriter meta line (accent year · category, right-aligned kind), the serif-bold award title (link, underline on hover), the society line, the grant as one figure box (typewriter "GRANT", bold 1.35rem "$5,000") on the raised surface, a left-aligned description, a pair of captioned 4:3 thumbnails - the award certificate (contained on the raised surface) and the ceremony photo (cropped) - both opening the lightbox, a link row (award listing, notebook, talk), and the methodology fold with the booktabs comparison table.

### Quantitative Finance
The featured project (Semi-Quant Terminal) renders full-width with a finance symbol tile, keyword line, points, a framed **live-app preview strip** (the app's real header, lightbox on click) and Live app / Source links; "Quantitative Methods" render in the two-column grid. The lede is drawn from the About text.

### Contact
A lead sentence (PhD search, email preferred), a solid accent **Email me** button beside a ghost **Copy address** button (copies via `cite.js`, flips to "Copied"), then ruled rows — accent line icon, typewriter label, typewriter value, and an arrow that nudges up-right on hover over an accent wash — for Email, GitHub, LinkedIn and the CV PDF. On mobile the label stacks over the value.

### Contact Rows / CV Highlights (legacy)
Mono small-caps labels (`flex: 0 0 7.5–8.5rem`) followed by the value, separated by 1px top rules; links accent with a hairline underline. On mobile the row stacks to a column.

### Buttons
One face of the button grammar — a square 1px ink frame, mono uppercase 0.78rem with 0.07em tracking, and an arrow SVG in the accent. **Ghost** (`--ghost`): transparent fill with ink text, filling on hover — the masthead "Get in touch" anchor (scrolls to contact) and the 404 page's "Back to the home page".

### Signature: The Masthead (`\maketitle`)
A two-column title block: left, the name set large in Computer Modern over a typewriter role line (no employer — this is a personal site), a single annotation-red status line ("Seeking PhD positions · Fall 2027"), and a row of typewriter profile links (Email, GitHub, LinkedIn, CV) with accent line icons; right, a square colour portrait inside a 1px `rule-strong` frame with a paper mat. Below 600px the portrait moves above the name at 6.5rem. Then the small-caps "About me" abstract (research interests set in two columns ≥760px) and a "Get in touch" ghost button. Above it, the authored device: a mechanical 1px hairline that stroke-draws in, then a blur-settle of the whole block.

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
