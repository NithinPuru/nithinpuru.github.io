import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// SITE_URL and ASTRO_BASE are injected by the GitHub Pages workflow (see
// .github/workflows/deploy.yml). The defaults mirror the production site so
// local dev/preview builds carry the real URL without any environment setup.
const site = process.env.SITE_URL || "https://nithinpuru.github.io";
const base = process.env.ASTRO_BASE || "/";

export default defineConfig({
  output: "static",
  site,
  base,
  compressHTML: true,
  integrations: [sitemap()],
  build: {
    inlineStylesheets: "always",
  },
});
