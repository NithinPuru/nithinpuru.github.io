// Smoke test for the built site (dist/): every page loads without script
// errors or broken same-origin requests, nothing overflows horizontally at
// phone / "desktop site" / laptop widths in either theme, the old portfolio
// addresses still forward to nithinpuru.com, and the data bots are still
// delivering.
//
//   npm run build && npm run smoke        (CI: the "checks" job in deploy.yml)
//
// Exits 1 on any failure; warnings are printed but don't fail the run.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, globSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { homedir } from "node:os";
import { chromium } from "playwright-core";

const DIST = new URL("../dist/", import.meta.url).pathname;
const failures = [];
const warnings = [];
const fail = (m) => failures.push(m);
const warn = (m) => warnings.push(m);

// ---- static server for dist/ ----------------------------------------------
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain", ".ics": "text/calendar",
  ".pdf": "application/pdf",
};
const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  let file = join(DIST, path);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---- build output ------------------------------------------------------------
// "/", "/rongm/" and "/tools/" are redirect stubs (the portfolio lives on
// nithinpuru.com): check them statically - loading them would leave the site.
for (const [file, to] of [
  ["index.html", "https://nithinpuru.com/"],
  ["rongm/index.html", "https://nithinpuru.com/rongm/"],
  ["tools/index.html", "https://nithinpuru.com/#tools"],
]) {
  const html = await readFile(join(DIST, file), "utf8").catch(() => "");
  if (!html.includes("location.replace") || !html.includes(`url=${to}`)) fail(`dist/${file}: does not forward to ${to}`);
}

// ---- data freshness ------------------------------------------------------------
const hoursOld = (iso) => (Date.now() - new Date(iso)) / 36e5;
async function json(rel) {
  try { return JSON.parse(await readFile(join(DIST, rel), "utf8")); }
  catch (e) { fail(`${rel}: unreadable (${e.message})`); return null; }
}
const fx = await json("fx-quant/fx_data.json");
if (fx && hoursOld(fx.meta.last_observation) > 6 * 24)
  fail(`FX Quant: last ECB fixing ${fx.meta.last_observation} is over 6 days old (fx-quant-data.yml)`);
const qt = await json("quant-terminal/market_data.json");
if (qt && hoursOld(qt.meta.generated_at) > 4 * 24)
  fail(`Quant Terminal: market data from ${qt.meta.generated_at} is over 4 days old (quant-terminal-data.yml)`);
if (qt?.meta.failed?.length) warn(`Quant Terminal: tickers failed: ${qt.meta.failed.join(", ")}`);
const rr = await json("research-radar/data/index.json");
if (rr) {
  if (hoursOld(rr.generated_at) > 12)
    fail(`Research Radar: snapshot from ${rr.generated_at} is over 12 h old (scheduled deploy)`);
  for (const [d, s] of Object.entries(rr.domains)) {
    const bad = Object.entries(s).filter(([k, v]) => k !== "papers" && v === "failed").map(([k]) => k);
    if (bad.length) warn(`Research Radar ${d}: sources failed: ${bad.join(", ")}`);
    if (!s.papers) fail(`Research Radar ${d}: no papers`);
  }
}
const dl = await json("deadline/data/meta.json");
if (dl) {
  if (hoursOld(dl.last_run) > 3 * 24) fail(`Deadline tracker: last run ${dl.last_run} is over 3 days old (tracker-track.yml)`);
  if (dl.errors) warn(`Deadline tracker: ${dl.errors} errors in the last run`);
  if (dl.deferred && !dl.api_calls) warn(`Deadline tracker: ${dl.deferred} checks deferred, no API calls (ANTHROPIC_API_KEY secret set?)`);
}

// ---- keeping the two sites in step (warnings only) ------------------------------
// Every tool page should load the tracker, and the portfolio's tools list
// (nithinpuru.com/#tools, a separate repo) should match src/data/tools.json.
const tools = JSON.parse(await readFile(new URL("../src/data/tools.json", import.meta.url), "utf8"))
  .groups.flatMap((g) => g.entries);
for (const e of tools) {
  const html = await readFile(join(DIST, e.url, "index.html"), "utf8").catch(() => "");
  if (!html) fail(`${e.url}: listed in tools.json but missing from the build`);
  else if (!html.includes("/np.js")) warn(`${e.url}: no /np.js - visits to this tool aren't counted`);
}
try {
  const r = await fetch("https://nithinpuru.com/", { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const portfolio = await r.text();
  for (const e of tools)
    if (!portfolio.includes(`https://nithinpuru.github.io${e.url}`))
      warn(`nithinpuru.com doesn't list ${e.url} - add it to the portfolio repo's src/data/tools.json`);
  const linked = new Set(portfolio.match(/https:\/\/nithinpuru\.github\.io\/[^"'#?\s<]*/g) || []);
  for (const u of linked) {
    const path = new URL(u).pathname;
    const file = path.endsWith("/") ? join(DIST, path, "index.html") : join(DIST, path);
    if (!existsSync(file)) warn(`nithinpuru.com links to ${u}, which this build doesn't have`);
  }
} catch (e) {
  warn(`couldn't compare with nithinpuru.com (${e.message}) - it blocks India, so this only runs from CI`);
}

// ---- pages ---------------------------------------------------------------------
const PAGES = [
  "/404.html", "/go/",
  "/gmid/", "/gmid/sky130a/", "/gmid/gf180mcu-d/", "/gmid/ihp-sg13g2/",
  "/fx-quant/", "/research-radar/", "/quant-terminal/", "/deadline/", "/deadline/updates.html",
  "/secure_sensor_with_puf/", "/analytics/",
];
const WIDTHS = { "/404.html": [360, 768, 1440] };
const DEFAULT_WIDTHS = [360, 1440];

function browserPath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const local = globSync(join(homedir(), ".cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell"));
  return local.length ? local.sort().at(-1) : undefined; // undefined -> playwright's own install
}
const exe = browserPath();
const browser = await chromium.launch(exe && existsSync(exe) ? { executablePath: exe } : {});

for (const theme of ["light", "dark"]) {
  for (const path of PAGES) {
    for (const width of WIDTHS[path] || DEFAULT_WIDTHS) {
      const tag = `${path} @${width}px ${theme}`;
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, theme);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("response", (r) => {
        if (r.url().startsWith(BASE) && r.status() >= 400 && !r.url().endsWith("/favicon.ico"))
          errors.push(`${r.status()} ${r.url().slice(BASE.length)}`);
      });
      try {
        const resp = await page.goto(BASE + path, { waitUntil: "load", timeout: 45000 });
        if (!resp || (resp.status() >= 400 && path !== "/404.html")) errors.push(`HTTP ${resp?.status()}`);
        await page.waitForTimeout(1500); // let data fetches and first renders settle
        const o = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth, vw: window.innerWidth,
          text: document.body.innerText.trim().length,
          theme: document.documentElement.getAttribute("data-theme"),
        }));
        if (o.sw > o.vw + 1) fail(`${tag}: horizontal overflow (${o.sw}px wide in a ${o.vw}px viewport)`);
        if (o.text < 50) fail(`${tag}: page rendered almost no text`);
        if (o.theme && o.theme !== theme) warn(`${tag}: theme is "${o.theme}", expected "${theme}"`);
      } catch (e) {
        errors.push(e.message.split("\n")[0]);
      }
      for (const e of [...new Set(errors)]) fail(`${tag}: ${e}`);
      await ctx.close();
    }
  }
}
await browser.close();
server.close();

for (const w of warnings) console.log(`${process.env.CI ? "::warning::" : "warning: "}${w}`);
for (const f of failures) console.log(`${process.env.CI ? "::error::" : "FAIL: "}${f}`);
console.log(`smoke: ${PAGES.length} pages, ${failures.length} failures, ${warnings.length} warnings`);
process.exit(failures.length ? 1 : 0);
