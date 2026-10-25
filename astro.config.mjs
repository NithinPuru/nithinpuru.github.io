import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import regionGate from "./scripts/region-gate.mjs";
import tools from "./src/data/tools.json" with { type: "json" };

// SITE_URL and ASTRO_BASE are injected by the GitHub Pages workflow (see
// .github/workflows/deploy.yml). The defaults mirror the production site so
// local dev/preview builds carry the real URL without any environment setup.
const site = process.env.SITE_URL || "https://nithinpuru.github.io";
const base = process.env.ASTRO_BASE || "/";

// "/", "/tools/" and "/puf/" only forward to the portfolio (nithinpuru.com),
// "/rongm/" is a copy of the portfolio's page (search engines should index
// that one) and /go/ is the owner's unlisted links page, so they stay out of
// the sitemap; the tools (plain pages in public/) are listed instead.
const unlisted = ["/", "/rongm/", "/tools/", "/puf/", "/go/"];
const toolPages = tools.groups.flatMap((g) => g.entries).map((e) => new URL(e.url, site).href);

// Every built page gets the South Asia region gate (scripts/region-gate.mjs)
// except the dashboard's hop and relay, the owner's /go/ page and gm/ID (a
// public tool, deliberately untracked).
const ungated = ["analytics/", "go/", "gmid/"];

export default defineConfig({
  output: "static",
  site,
  base,
  compressHTML: true,
  integrations: [
    sitemap({
      filter: (page) => !unlisted.includes(new URL(page).pathname),
      customPages: toolPages,
    }),
    regionGate({ skip: ungated }),
  ],
  build: {
    inlineStylesheets: "always",
  },
});
