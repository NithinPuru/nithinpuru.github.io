// Region gate: a browser whose clock is on a South Asian time zone sees the
// site as if it had crashed - never a "blocked" or "not available" message.
// nithinpuru.com's server-side block (the portfolio repo's
// functions/_middleware.js) catches those countries by IP, but it can't reach
// GitHub Pages (the tools), and VPNs and proxies get past it - the browser's
// clock still gives those visitors away. The same file is in both repos
// (nithinpuru.github.io and the portfolio): keep the copies identical.
//
// The integration writes the gate into every built page - Astro's and the
// plain ones copied from public/ - as the first script in <head>, except under
// the `skip` paths. In the browser it runs before anything else: on a match it
// stops the page loading and empties it, so nothing else - np.js included -
// runs and the visitor gets a blank page. On nithinpuru.com it also sets the
// np_b cookie and reloads once: the server then answers that browser, from
// then on, with the same empty HTTP 500 it gives blocked IPs, which the
// browser shows as its own "This page isn't working" error. (If the cookie
// can't be set, or the server ignores it, the page just stays blank.)
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
  document.documentElement.innerHTML = "<head></head><body></body>";
  var flagged = /(^|; )np_b=1/;
  if (location.hostname !== "nithinpuru.com" || flagged.test(document.cookie)) return;
  document.cookie = "np_b=1; Max-Age=31536000; Path=/; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "");
  if (flagged.test(document.cookie)) location.reload();
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
        logger.info(`gated ${gated} pages for South Asian clocks`);
      },
    },
  };
}
