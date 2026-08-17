# nithinpuru.github.io

Personal portfolio - [nithinpuru.github.io](https://nithinpuru.github.io)

Analog/Mixed-Signal IC Designer. Tapeout experience in SKY130, GF180MCU, IHP SG13G2, UMC 55 nm, TSMC 28 nm. IEEE SSCS Code-a-Chip Travel Grant recipient, ESSERC 2026.

---

## Stack

Astro · plain CSS · self-hosted Computer Modern (KaTeX) fonts · zero client framework

## Structure

```
src/
  pages/index.astro        # the whole page
  pages/notebook.astro     # Ron/gm methodology notebook at /notebook
  layouts/Layout.astro
  components/WorkList.astro
  data/                    # JSON content + nbconvert notebook export
  styles/global.css
public/
  fonts/                   # KaTeX Computer Modern
  img/                     # images and assets
```

## Local dev

```sh
npm install
npm run dev      # localhost:4321
```

Pushes to `main` deploy automatically via GitHub Actions.
