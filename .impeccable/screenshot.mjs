import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const CHROME =
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:4321";
const OUT = ".impeccable/review";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
});

async function capture(label, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1800);
  const fullPage = label.startsWith("desktop");
  await page.screenshot({
    path: `${OUT}/${label}.png`,
    fullPage,
  });
  if (!fullPage) {
    // mobile viewport shot (first screen)
    await page.screenshot({ path: `${OUT}/${label}-viewport.png` });
  }
  await ctx.close();
  console.log("captured", label);
}

await capture("desktop", 1440, 900);
await capture("mobile", 390, 844);

await browser.close();
