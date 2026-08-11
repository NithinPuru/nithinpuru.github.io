import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { execFileSync } from "node:child_process";
import { readdirSync, renameSync } from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DIST = join("dist");
const PORT = 4173;
const OUT_WEBM = "site-scroll.webm";
const OUT_MP4 = "site-scroll.mp4";
const VIDEO_DIR = join(process.cwd(), ".impeccable", "video");
const SCROLL_MS = 14000;

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  const file = join(DIST, normalize(path));
  if (!file.startsWith(join(DIST))) {
    res.writeHead(403);
    return res.end();
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(PORT, r));
console.log("serving", DIST, "on", PORT);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
});

const page = await context.newPage();
await page.goto(`http://localhost:${PORT}`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1500); // let the masthead settle animation finish

// Steady, linear scroll to the bottom, then hold. The page CSS sets
// `scroll-behavior: smooth`, which makes every scrollTo animate and lag then
// catch up — force instant positioning so the recorded motion is truly linear.
const samples = await page.evaluate(async (duration) => {
  document.documentElement.style.scrollBehavior = "auto";
  const maxY = document.documentElement.scrollHeight - window.innerHeight;
  const start = performance.now();
  const pts = [];
  let lastK = -1;
  await new Promise((resolve) => {
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      window.scrollTo(0, maxY * t);
      const k = Math.floor(t * 10);
      if (k !== lastK) {
        lastK = k;
        pts.push({ k, y: Math.round(scrollY) });
      }
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  return pts;
}, SCROLL_MS);
console.log("linearity samples (10% steps):", JSON.stringify(samples));

await page.waitForTimeout(800);

await context.close(); // flushes the webm
await browser.close();
await new Promise((r) => server.close(r));

const webm = readdirSync(VIDEO_DIR).find((f) => f.endsWith(".webm"));
if (!webm) throw new Error("no webm produced");
renameSync(join(VIDEO_DIR, webm), join(process.cwd(), OUT_WEBM));
console.log("wrote", OUT_WEBM);

execFileSync(
  "ffmpeg",
  [
    "-y", "-i", OUT_WEBM,
    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-an", OUT_MP4,
  ],
  { stdio: "ignore" }
);
console.log("wrote", OUT_MP4);
