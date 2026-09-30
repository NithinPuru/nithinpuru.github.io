import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tools from "./src/data/tools.json" with { type: "json" };

// SITE_URL and ASTRO_BASE are injected by the GitHub Pages workflow (see
// .github/workflows/deploy.yml). The defaults mirror the production site so
// local dev/preview builds carry the real URL without any environment setup.
const site = process.env.SITE_URL || "https://nithinpuru.github.io";
const base = process.env.ASTRO_BASE || "/";

// "/", "/rongm/" and "/tools/" only forward to the portfolio (nithinpuru.com),
// so they stay out of the sitemap; the tools (plain pages in public/) are
// listed instead.
const redirects = ["/", "/rongm/", "/tools/"];
const toolPages = tools.groups.flatMap((g) => g.entries).map((e) => new URL(e.url, site).href);

export default defineConfig({
  output: "static",
  site,
  base,
  compressHTML: true,
  integrations: [
    sitemap({
      filter: (page) => !redirects.includes(new URL(page).pathname),
      customPages: toolPages,
    }),
  ],
  build: {
    inlineStylesheets: "always",
  },
});
