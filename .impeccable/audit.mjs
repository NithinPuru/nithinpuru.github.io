import { chromium } from "playwright-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:4321";

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const results = [];

function luminance(rgb) {
  const m = rgb.match(/\d+/g).map(Number);
  const lin = m.map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

for (const vp of [
  { label: "desktop", width: 1440, height: 900 },
  { label: "mobile", width: 390, height: 844 },
]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const data = await page.evaluate((vp) => {
    const cs = (el) => getComputedStyle(el);
    const q = (s) => document.querySelector(s);
    const cq = (s) => cs(document.querySelector(s));
    const body = document.body;
    const out = {};

    out.scroll = {
      clientW: document.documentElement.clientWidth,
      scrollW: document.documentElement.scrollWidth,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };

    out.fonts = {
      serif: document.fonts.check('16px "KaTeX_Main"'),
      mono: document.fonts.check('16px "KaTeX_Typewriter"'),
    };

    const h1 = q("h1");
    out.headings = {
      h1: h1 ? h1.textContent.trim() : null,
      h1Font: h1 ? cs(h1).fontFamily : null,
      h1Size: h1 ? cs(h1).fontSize : null,
      h1Weight: h1 ? cs(h1).fontWeight : null,
      h2Count: document.querySelectorAll("h2").length,
      h3Count: document.querySelectorAll("h3").length,
    };

    out.contrast = {
      body: contrast2(cs(body).color, cs(body).backgroundColor),
      secondary: contrast2(cq(".section-lede").color, cs(body).backgroundColor),
      link: contrast2(cq(".entry__title a").color, cs(body).backgroundColor),
      hotTag: contrast2(cq(".entry__tag.is-hot").color, cs(body).backgroundColor),
      monoMeta: contrast2(cq(".entry__meta").color, cs(body).backgroundColor),
    };

    function contrast2(a, b) {
      return [a, b];
    }

    out.nav = {
      fixed: cs(q(".site-nav")).position === "fixed",
      height: q(".site-nav").getBoundingClientRect().height,
      sheetPadTop: cs(q(".sheet")).paddingTop,
      links: [...document.querySelectorAll("[data-nav]")].map((a) => a.hash),
    };

    out.sections = [...document.querySelectorAll("section, .masthead")].map((s) => ({
      id: s.id,
      labelled: s.getAttribute("aria-labelledby"),
      ok: !s.id ? null : document.getElementById(s.id) ? true : false,
    }));

    out.a11y = {
      skipLink: !!q(".skip-link"),
      main: !!q("#main"),
      lang: document.documentElement.lang,
      revealHiddenAtTop: [...document.querySelectorAll("[data-reveal]")].filter(
        (el) => cs(el).opacity !== "1" || cs(el).transform !== "none"
      ).length,
    };

    out.articleOrder = [...document.querySelectorAll("main h2")].map((h) => h.textContent.trim());

    return out;
  }, vp);

  // Scroll through the page to trigger reveals and measure CLS.
  const cls = await page.evaluate(async () => {
    let cls = 0;
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) cls += e.value;
    });
    obs.observe({ type: "layout-shift", buffered: true });
    const h = document.body.scrollHeight;
    for (let y = 0; y < h; y += Math.max(400, h / 12)) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 400));
    obs.disconnect();
    return cls;
  });

  const afterScroll = await page.evaluate(() => {
    const cs = (el) => getComputedStyle(el);
    const hidden = [...document.querySelectorAll("[data-reveal]")].filter(
      (el) => parseFloat(cs(el).opacity) < 1
    ).length;
    const allIn = [...document.querySelectorAll(".section-rule")].every(
      (el) => getComputedStyle(el).transform === "none" || getComputedStyle(el).transform === "matrix(1, 0, 0, 1, 0, 0)"
    );
    const active = document.querySelector(".site-nav__links a.is-active");
    return { hiddenReveals: hidden, rulesDrawn: allIn, activeNav: active ? active.hash : null };
  });

  // Contrast compute from raw values
  const c = data.contrast;
  data.contrastComputed = {
    body: contrast(c.body[0], c.body[1]),
    secondary: contrast(c.secondary[0], c.secondary[1]),
    link: contrast(c.link[0], c.link[1]),
    hotTag: contrast(c.hotTag[0], c.hotTag[1]),
    monoMeta: contrast(c.monoMeta[0], c.monoMeta[1]),
  };

  results.push({ vp: vp.label, data, cls, afterScroll, errors });
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
