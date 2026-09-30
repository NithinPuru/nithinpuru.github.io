# nithinpuru.github.io

Browser tools - [nithinpuru.github.io/tools/](https://nithinpuru.github.io/tools/):
gm/ID explorer for open PDKs, semiconductor and FX quant terminals, Research
Radar, a conference deadline tracker and a secure-sensor signal-path explorer,
plus the data bots that keep them fresh.

The site root forwards to the portfolio at [nithinpuru.com](https://nithinpuru.com).

## Stack

Astro (tools index only) · the tools are standalone pages in `public/` ·
self-hosted Computer Modern (KaTeX) fonts · GitHub Actions data bots

## Local dev

```sh
npm install
npm run radar-data   # Research Radar snapshots from the live site
npm run dev          # localhost:4321
```

Pushes to `main` deploy automatically via GitHub Actions (`.github/workflows/deploy.yml`).
