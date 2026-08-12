import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// SITE_URL and ASTRO_BASE are injected by the GitHub Pages workflow (see
// .github/workflows/deploy.yml). The fallbacks keep local dev/preview working
// without any environment setup; CI always passes the real values.
const site = process.env.SITE_URL || "https://nithinyahu.example";
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
