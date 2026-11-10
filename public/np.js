// First-party analytics for nithinpuru.com and nithinpuru.github.io (the same
// file is served by both sites; keep the copies identical). Sends to the
// nithin-analytics Worker:
//   view   once per page load: path, referrer, query, #fragment, language,
//          timezone, screen size and pixel ratio, window size, touch points and
//          a few headless-browser hints (to tell people from scanners)
//   end    time engaged so far (`ms`: the page shown and some input - mouse,
//          scroll, wheel, touch or key - within the last minute, so a tab left
//          open on a desk stops counting; `vm`: plain time visible), deepest
//          scroll (%), the sections read (section[id], else h2[id], that
//          crossed mid-screen; on the home page's side-by-side pages, each page
//          shown) and the engaged time each held the screen, whether the visitor interacted, how many
//          clicks / taps / key presses, the time to the first one, text copies,
//          the page load time and what they did: buttons, tabs, #links,
//          menu choices, switches and sliders (never typed text), links to
//          other pages of the site, the side-by-side pages turned to and the
//          section they copied text from (up to 30 steps). Sent at the
//          first tap / click / key / wheel / touch / mouse move (not plain
//          scroll events: the browser scrolls by itself for #links), every
//          15 s while something changes (at least once a minute while engaged,
//          for 30 min: phones often drop the last report) and when the page is
//          hidden
//   click  outbound links and mailto:, with their target and link text
// Events of one page load share a random id `v` (not stored anywhere else).
// No cookies are set; the Worker hashes the IP and never stores it.
// Not sent: localhost, the /analytics dashboard, pages framed by another page
// (the gm/ID PDK frames), browsers driven by automation software
// (navigator.webdriver - scanners, headless crawlers), and browsers opted out
// with ?notrack (undo: ?track) or holding the portfolio's owner-pass cookie.
// A prerendered page is counted only once it is actually shown.
(function () {
  var ENDPOINT = "https://nithin-analytics.nithinpurushothama.workers.dev/collect";
  var host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || location.protocol === "file:") return;
  if (location.pathname.indexOf("/analytics") === 0) return;
  if (navigator.webdriver) return;
  try { if (window.top !== window.self) return; } catch (e) { return; }
  try {
    var qs = location.search;
    if (/[?&]notrack\b/.test(qs)) localStorage.setItem("np_notrack", "1");
    if (/[?&]track\b/.test(qs)) localStorage.removeItem("np_notrack");
    if (localStorage.getItem("np_notrack") === "1") return;
  } catch (e) {}
  if (/(^|; )np_owner=/.test(document.cookie)) return;
  if (document.prerendering) document.addEventListener("prerenderingchange", start, { once: true });
  else start();

  function start() {
    var view = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    function send(o) {
      o.v = view; o.h = host; o.p = location.pathname;
      var data = JSON.stringify(o);
      // A keepalive fetch survives page unload like sendBeacon, but common
      // blocklists (uBlock/AdGuard "$ping,3p") drop every third-party beacon.
      // text/plain + no-cors = no CORS preflight.
      try {
        if (window.fetch) return void fetch(ENDPOINT, { method: "POST", body: data, keepalive: true, mode: "no-cors", headers: { "Content-Type": "text/plain" } }).catch(function () {});
      } catch (e) {}
      if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, data);
    }

    var tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    // Headless hints: 1 no browser window, 2 no languages, 4 Chrome without window.chrome.
    var hl = 0, ua = navigator.userAgent || "";
    try {
      if (!window.outerWidth && !window.outerHeight) hl |= 1;
      if (navigator.languages && !navigator.languages.length) hl |= 2;
      if (/Chrome\//.test(ua) && !/Edg\/|OPR\/|SamsungBrowser/.test(ua) && !window.chrome) hl |= 4;
    } catch (e) {}
    send({ t: "view", r: document.referrer, q: location.search, l: navigator.language || "", z: tz, w: screen.width || 0,
           sh: screen.height || 0, dpr: window.devicePixelRatio || 0, vw: window.innerWidth || 0, vh: window.innerHeight || 0,
           tp: navigator.maxTouchPoints || 0, hl: hl, hs: location.hash.slice(0, 61) });

    // Engagement: time the page was visible and how far down it was read.
    var shownAt = document.visibilityState === "visible" ? Date.now() : 0, visibleMs = 0, depth = 0;
    function visibleNow() { return visibleMs + (shownAt ? Date.now() - shownAt : 0); }
    // Engaged time: counted only while the page is shown and the visitor gave some input
    // (mouse, scroll, wheel, touch, key) within the last IDLE ms. A tab left open counts
    // at most IDLE after the last input; time is added up in tick().
    var IDLE = 60000, lastInput = Date.now(), engagedMs = 0, tickedAt = 0;
    function poke(e) {
      // Browsers fake a still pointermove when the page moves under the cursor: not input.
      if (e && e.type === "pointermove" && !e.movementX && !e.movementY) return;
      lastInput = Date.now();
    }
    ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"].forEach(function (t) {
      addEventListener(t, poke, { capture: true, passive: true });
    });
    function engaged() { return !!shownAt && Date.now() - lastInput < IDLE; }
    function measure() {
      var max = document.documentElement.scrollHeight - innerHeight;
      var pct = max > 0 ? Math.round((100 * scrollY) / max) : 100;
      // Home page in side-by-side pages: depth = pages turned plus the share
      // of the current page read.
      var deck = document.documentElement.getAttribute("data-layout") === "deck" && document.querySelector("[data-deck]");
      if (deck) {
        var ps = deck.querySelectorAll(".panel"), i = Math.min(ps.length - 1, Math.round(deck.scrollLeft / (deck.clientWidth || 1)));
        var pm = ps[i].scrollHeight - ps[i].clientHeight;
        pct = Math.round((100 * (i + (pm > 0 ? ps[i].scrollTop / pm : 1))) / ps.length);
      }
      if (pct > depth) depth = Math.min(100, pct);
    }
    addEventListener("scroll", measure, { capture: true, passive: true });
    addEventListener("load", measure);

    // Sections read: ids of section[id] (else h2[id]) that crossed the middle of the screen,
    // and the engaged time each one held mid-screen (sampled every second; a heading's
    // section runs to the next heading). On the home page's side-by-side pages (deck) all
    // sections share one top, so there the page in view counts instead (its data-panel name).
    var seen = [], parts = [], whole = false, dwell = {}, nDwell = 0, lastPage = "", prevId = "";
    function deckPage() {
      var deck = document.documentElement.getAttribute("data-layout") === "deck" && document.querySelector("[data-deck]");
      if (!deck) return null;
      var ps = deck.querySelectorAll(".panel");
      var p = ps[Math.min(ps.length - 1, Math.round(deck.scrollLeft / (deck.clientWidth || 1)))];
      return p ? p.getAttribute("data-panel") || (p.querySelector("section[id]") || {}).id || "" : "";
    }
    function current() {
      var page = deckPage();
      if (page !== null) return page;
      if (!parts.length) return "";
      var mid = innerHeight / 2, cur = null;
      for (var i = 0; i < parts.length && parts[i].getBoundingClientRect().top <= mid; i++) cur = parts[i];
      if (!cur || (whole && cur.getBoundingClientRect().bottom <= mid)) return "";
      return cur.id;
    }
    function tick() {
      var now = Date.now(), dt = tickedAt ? Math.min(now - tickedAt, 2000) : 0;
      tickedAt = now;
      if (!engaged()) return;
      engagedMs += dt;
      var id = current().slice(0, 40), deck = deckPage() !== null;
      if (!id) return;
      // A page counts as turned to once it holds for two ticks (a jump slides past the pages between).
      if (deck && id === prevId && id !== lastPage) { if (lastPage) step("page", id); lastPage = id; }
      prevId = id;
      if (deck && seen.indexOf(id) < 0 && seen.length < 40) seen.push(id);
      if (!(id in dwell)) { if (nDwell >= 40) return; nDwell++; dwell[id] = 0; }
      dwell[id] += dt;
    }
    setInterval(tick, 1000);
    function watch() {
      var els = document.querySelectorAll("section[id]");
      whole = els.length > 0;
      if (!els.length) els = document.querySelectorAll("h2[id]");
      parts = [].slice.call(els, 0, 60);
      if (!("IntersectionObserver" in window)) return;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var id = en.target.id.slice(0, 40);
          if (en.isIntersecting && seen.indexOf(id) < 0 && seen.length < 40) seen.push(id);
        });
      }, { rootMargin: "-40% 0px -40% 0px" });
      for (var i = 0; i < els.length && i < 60; i++) io.observe(els[i]);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
    else watch();

    // Totals so far; the Worker keeps the largest of each.
    var acted = 0, taps = 0, firstMs, copies = 0, steps = [], sentKey = "", sentAt = 0;
    function loadMs() {
      try { var n = performance.getEntriesByType("navigation")[0]; return n && n.loadEventEnd > 0 ? Math.round(n.loadEventEnd) : 0; } catch (e) { return 0; }
    }
    function report() {
      measure();
      var ms = visibleNow();
      var st = {};
      for (var id in dwell) if (dwell[id] >= 500) st[id] = Math.round(dwell[id]);
      sentKey = [depth, seen.length, acted, taps, copies, steps.length].join(); sentAt = engagedMs;
      send({ t: "end", ms: Math.round(engagedMs), vm: ms, s: depth, sec: seen, st: st, a: acted, n: taps, fi: firstMs, cp: copies, lt: loadMs(), ac: steps });
    }

    // First real interaction: report it straight away (people stay; scanners don't touch the page).
    function interacted(e) {
      if (acted || (e.type === "mousemove" && !e.movementX && !e.movementY)) return;   // browsers fake a still mousemove after layout
      acted = 1; firstMs = visibleNow();
      ["pointerdown", "keydown", "touchstart", "wheel", "mousemove"].forEach(function (t) { removeEventListener(t, interacted, true); });
      report();
    }
    ["pointerdown", "keydown", "touchstart", "wheel", "mousemove"].forEach(function (t) { addEventListener(t, interacted, { capture: true, passive: true }); });
    function tapped() { if (taps < 1e5) taps++; }
    addEventListener("pointerdown", tapped, { capture: true, passive: true });
    addEventListener("keydown", tapped, { capture: true, passive: true });
    document.addEventListener("copy", function () {
      copies++;
      var sel = window.getSelection && getSelection(), node = sel && sel.anchorNode;
      var el = node && (node.nodeType === 1 ? node : node.parentElement), sec = el && el.closest("section[id]");
      step("copy", sec ? sec.id : "page");
      report();
    });

    // What they did (up to 30 steps, never typed text): [seconds visible, kind, label].
    function step(kind, text) {
      text = (text || "").replace(/\s+/g, " ").trim().slice(0, 50);
      var last = steps[steps.length - 1];
      if (!text || steps.length >= 30 || (last && last[1] === kind && last[2] === text)) return;
      steps.push([Math.round(visibleNow() / 1000), kind, text]);
    }
    function nameOf(el) {
      var lab = el.labels && el.labels[0];
      return el.getAttribute("aria-label") || (lab && lab.textContent) || el.title || el.name || el.id || "";
    }
    document.addEventListener("click", function (e) {
      var el = e.target && e.target.closest && e.target.closest("button, [role=button], [role=tab], summary, a[href]");
      if (!el) return;
      if (el.tagName !== "A") return step("click", el.getAttribute("aria-label") || el.title || el.textContent);
      if (el.getAttribute("href").charAt(0) === "#") return step("link", label(el));
      try { var u = new URL(el.href); } catch (err) { return; }
      // Another page of this site (a lab, the notebook, the CV): its label and address.
      if (!/^https?:$/.test(u.protocol) || u.hostname !== host) return;
      if (u.pathname !== location.pathname) step("open", label(el).slice(0, 48 - Math.min(u.pathname.length, 30)) + " (" + u.pathname.slice(0, 30) + ")");
      else if (u.hash) step("link", label(el));   // "/#cv" from the page itself
    }, true);
    document.addEventListener("change", function (e) {
      var el = e.target;
      if (el.tagName === "SELECT") step("pick", nameOf(el) + ": " + (el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].text : el.value));
      else if (el.type === "checkbox" || el.type === "radio") step("switch", nameOf(el) + (el.checked ? " on" : " off"));
      else if (el.type === "range") step("set", nameOf(el) + " = " + el.value);
      else if (el.type === "number") step("set", nameOf(el));   // typed by the visitor: the field only, never its value
    }, true);

    // While the page is shown: report every 15 s if anything changed, else once a minute
    // while engaged (an idle tab sends nothing new), for 30 min of engaged time.
    setInterval(function () {
      if (!shownAt || engagedMs > 18e5) return;
      measure();
      if ([depth, seen.length, acted, taps, copies, steps.length].join() !== sentKey || engagedMs - sentAt >= 6e4) report();
    }, 15000);

    function flush() {
      tick();
      if (shownAt) { visibleMs += Date.now() - shownAt; shownAt = 0; }
      report();
    }
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") { shownAt = Date.now(); tickedAt = 0; poke(); }
      else flush();
    });
    addEventListener("pagehide", flush); // Safari may skip visibilitychange on navigation

    // Outbound clicks (other sites, the other of the two sites, mailto:), with the link's text.
    function label(a) {
      var img = a.querySelector("img[alt]");
      return (a.getAttribute("aria-label") || a.title || (a.textContent || "").replace(/\s+/g, " ").trim() || (img && img.alt) || "").slice(0, 80);
    }
    function onClick(e) {
      var a = e.target && e.target.closest && e.target.closest("a[href]");
      if (!a) return;
      var href = a.href;
      if (/^mailto:/i.test(href)) return send({ t: "click", k: "email", u: href.slice(7).split("?")[0], x: label(a) });
      var u;
      try { u = new URL(href); } catch (err) { return; }
      if (!/^https?:$/.test(u.protocol) || u.hostname === host) return;
      send({ t: "click", k: "outbound", u: (u.hostname + u.pathname).slice(0, 200), x: label(a) });
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
  }
})();
