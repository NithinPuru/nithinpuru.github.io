// Region gate: a browser whose clock is on a South Asian time zone gets a
// one-line "not available in your region" page instead of the site.
// nithinpuru.com's Cloudflare WAF rule blocks the same countries by IP, but it
// can't reach GitHub Pages (the tools), and VPNs and proxies get past it - the
// browser's clock still gives those visitors away. The same file is in both
// repos (nithinpuru.github.io and the portfolio): keep the copies identical.
//
// The integration writes the gate into every built page - Astro's and the
// plain ones copied from public/ - as the first script in <head>, except under
// the `skip` paths. In the browser it runs before anything else: on a match it
// stops the page loading and swaps in the notice, so no other script,
// stylesheet or the tracker (np.js) ever runs.
//
// Let through: the owner pass (np_owner cookie, ?owner=), browsers opted out of
// counting (np_notrack, ?notrack - the owner's signed-in devices) and np_owner
// in localStorage, which the dashboard's sign-in hop sets on the tools so they
// stay open there even with counting switched back on.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// India, Pakistan, Bangladesh, Sri Lanka, Nepal, Bhutan, the Maldives and
// Afghanistan, plus the old names some browsers report (Chrome: Asia/Calcutta).
export const ZONES = [
  "Asia/Kolkata", "Asia/Calcutta", "Asia/Karachi", "Asia/Dhaka", "Asia/Dacca",
  "Asia/Colombo", "Asia/Kathmandu", "Asia/Katmandu", "Asia/Thimphu", "Asia/Thimbu",
  "Indian/Maldives", "Asia/Kabul",
];

export const NOTICE = "This site is not available in your region.";

const page =
  '<head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Not available</title>' +
  "<style>html{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;" +
  `padding:0 16px;font:1.125rem/1.5 Georgia,serif}</style></head><body><p>${NOTICE}</p></body>`;

// Browser code, joined into one line: no // comments in it.
export const SCRIPT = `(function () {
  try {
    if (/[?&](owner=|notrack\\b)/.test(location.search) || /(^|; )np_owner=/.test(document.cookie)
      || localStorage.getItem("np_notrack") === "1" || localStorage.getItem("np_owner") === "1") return;
  } catch (e) {}
  var tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
  if (${JSON.stringify(ZONES)}.indexOf(tz) < 0) return;
  if (window.stop) window.stop();
  document.documentElement.innerHTML = ${JSON.stringify(page).replace(/<\//g, "<\\/")};
})();`.replace(/\n\s*/g, " ");

export default function regionGate({ skip = [] } = {}) {
  return {
    name: "region-gate",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        let gated = 0;
        for (const file of await readdir(root, { recursive: true })) {
          const path = file.split("\\").join("/");
          if (!path.endsWith(".html") || skip.some((p) => path.startsWith(p))) continue;
          const html = await readFile(join(root, file), "utf8");
          // Right after <head> and the <meta charset> that usually opens it.
          const head = /<head(\s[^>]*)?>(\s*<meta charset=[^>]*>)?/i.exec(html);
          if (!head) { logger.warn(`${path}: no <head> - left ungated`); continue; }
          const at = head.index + head[0].length;
          await writeFile(join(root, file), `${html.slice(0, at)}<script>${SCRIPT}</script>${html.slice(at)}`);
          gated++;
        }
        logger.info(`South Asian clocks get the notice on ${gated} pages`);
      },
    },
  };
}
