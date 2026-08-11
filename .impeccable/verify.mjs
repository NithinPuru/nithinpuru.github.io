import { chromium } from "playwright-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:4321";
const browser = await chromium.launch({ executablePath: CHROME, headless: true });

const out = {};

// Desktop pass
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  out.desktop = await page.evaluate(() => {
    const cs = (el) => getComputedStyle(el);
    const q = (s) => document.querySelector(s);
    const h1 = q("h1");
    const entry = q(".entry");
    const masthead = q(".masthead");
    const navLinks = [...document.querySelectorAll(".site-nav__links a")];
    return {
      h1Size: cs(h1).fontSize,
      h1LineHeight: cs(h1).lineHeight,
      bodyFontSize: cs(document.body).fontSize,
      bodyLineHeight: cs(document.body).lineHeight,
      bodyAlign: cs(q(".abstract p")).textAlign,
      contentWidth: Math.round(q(".sheet").getBoundingClientRect().width),
      entryTitleSize: cs(entry.querySelector(".entry__title a")).fontSize,
      navLinkCount: navLinks.length,
      navOverflow: q(".site-nav__links").scrollWidth > q(".site-nav__links").clientWidth,
      mastheadHeight: Math.round(masthead.getBoundingClientRect().height),
      docTitle: document.title,
      traceVisible: q(".masthead__trace").getBoundingClientRect().height > 0,
      groupHeadGlyph: getComputedStyle(q(".group-head"), "::before").content,
      sectionNoColor: cs(q(".section-no")).color,
    };
  });

  // Reveal triggering: scroll to a mid section, wait, check its items are visible.
  const reveal = await page.evaluate(async () => {
    const sec = document.getElementById("work");
    sec.scrollIntoView({ behavior: "instant" });
    await new Promise((r) => setTimeout(r, 1200));
    const workHead = document.querySelector("#work .section-head");
    const entry0 = document.querySelector("#work .entry");
    const lastEntry = document.querySelectorAll("#work .entry")[11];
    const rule = document.querySelector("#work .section-rule");
    const st = (el) => getComputedStyle(el);
    return {
      headOpacity: st(workHead).opacity,
      headTransform: st(workHead).transform,
      entry0Opacity: st(entry0).opacity,
      entry0Delay: st(entry0).transitionDelay,
      lastEntryOpacity: st(lastEntry).opacity,
      ruleTransform: st(rule).transform,
      activeNav: document.querySelector(".site-nav__links a.is-active")?.hash,
    };
  });
  out.desktopReveal = reveal;

  // Scroll to bottom, wait, check bottom section items visible.
  const bottom = await page.evaluate(async () => {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 1400));
    const st = (el) => getComputedStyle(el);
    const contact = document.querySelector("#contact");
    return {
      contactHeadOpacity: st(contact.querySelector(".section-head")).opacity,
      contactRowOpacity: st(contact.querySelector(".contact-row")).opacity,
      footerVisible: st(document.querySelector(".site-footer")).opacity === "1",
      activeNav: document.querySelector(".site-nav__links a.is-active")?.hash,
    };
  });
  out.desktopBottom = bottom;
  await ctx.close();
}

// Mobile focused checks
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  out.mobileNav = await page.evaluate(() => {
    const links = document.querySelector(".site-nav__links");
    const brand = document.querySelector(".site-nav__name");
    return {
      navLinksScrollable: links.scrollWidth > links.clientWidth,
      linksScrollWidth: links.scrollWidth,
      linksClientWidth: links.clientWidth,
      brandRect: brand.getBoundingClientRect().width,
    };
  });

  // entry top stacking on mobile
  out.mobileEntryTop = await page.evaluate(() => {
    const top = document.querySelector("#work .entry__top");
    const dir = getComputedStyle(top).flexDirection;
    return dir;
  });
  await ctx.close();
}

// Link resolution checks
{
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll("a[href]")]
      .map((a) => a.href)
      .filter((h) => h.startsWith("http://localhost"))
  );
  const unique = [...new Set(hrefs)];
  out.internalLinks = [];
  for (const h of unique) {
    try {
      const res = await page.request.get(h);
      out.internalLinks.push({ href: h.replace(BASE, ""), status: res.status() });
    } catch (e) {
      out.internalLinks.push({ href: h, status: "ERR" });
    }
  }
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(out, null, 2));
