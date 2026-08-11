# TODO

Open items and recommended improvements. A Lighthouse 12.8.2 audit
(Performance 100 / Accessibility 100 / Best Practices 100 / SEO 100) already
cleared the code-level issues; the remaining items need a real domain, real
assets, or deploy-time configuration.

## Before the first deployment

- [ ] Create the client's GitHub repository and push this project.
- [ ] In **Settings → Pages → Build and deployment**, set Source to
      **GitHub Actions** (the workflow in `.github/workflows/deploy.yml` handles
      the rest).
- [ ] Confirm the default branch is `main` — update the `on.push.branches` in
      the workflow if it is not.
- [ ] No domain config needed for a plain `https://<owner>.github.io/<repo>/`
      URL — the workflow auto-derives `SITE_URL` and `ASTRO_BASE` from the repo
      name. Set the `SITE_URL` (and optionally `ASTRO_BASE`) repository
      **Variables** only for a custom domain.
- [ ] Watch the first run in the **Actions** tab; confirm the built site renders
      at the Pages URL.

## Content blockers

- [ ] Drop `public/cv.pdf` — the "Open CV (.pdf)" button currently links to a
      file that doesn't exist yet (404).
- [ ] Drop `public/portrait.jpg` (or `.png`, 4:5) to fill the masthead frame.
- [ ] Re-verify the GitHub star counts and the "28 repositories" figure in
      `src/data/*.json` and `src/pages/index.astro` — they go stale over time
      and must never be fabricated.

## SEO

- [ ] Replace the placeholder default `site` (`https://nithinyahu.example`) in
      `astro.config.mjs` — CI overrides it, but local builds still use it.
- [ ] Add `og:image` / `twitter:image` (1200×630 PNG) to
      `src/layouts/Layout.astro`; none exists today.
- [ ] Add a sitemap (`@astrojs/sitemap`) once the domain is final, then add the
      matching `Sitemap:` line to `public/robots.txt`.
- [ ] Submit the site to Google Search Console.

## Performance / Core Web Vitals

- [ ] When a real portrait is added, preload it (`<link rel="preload"
      as="image" fetchpriority="high">`); width/height and aspect-ratio are
      already reserved, so CLS stays at 0.
- [ ] Re-check LCP (< 2.5 s) on the deployed URL with Lighthouse / PageSpeed
      Insights. Lab audit at time of writing: LCP 1.4 s, CLS 0, TBT 0 ms.

## Security & best practices (deploy-time headers)

- [ ] Add `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
      `Referrer-Policy`, and `Permissions-Policy` headers on the hosting
      edge/CDN.
- [ ] Add a `Content-Security-Policy` (start in report-only). Note: the reveal
      script is an inline module, so the policy needs a hash/nonce for it.
- [ ] `npm audit` reports 0 vulnerabilities — re-run on dependency bumps.

## Hygiene

- [ ] Review `skills-lock.json` / `.agents/` — vendor skill hashes change when
      the skill sources are updated.
- [ ] Confirm `DESIGN.md` / `.impeccable/design.json` still describe the built
      page after any content or structural edits.
