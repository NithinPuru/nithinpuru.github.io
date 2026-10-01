// First-party analytics for nithinpuru.com and nithinpuru.github.io (the same
// file is served by both sites; keep the copies identical). Sends to the
// nithin-analytics Worker:
//   view   once per page load: path, referrer, query, language, timezone, screen width
//   end    when the page is hidden: time visible so far, deepest scroll (%),
//          the sections read (section[id], else h2[id], that crossed mid-screen)
//          and whether the visitor interacted - also sent at the first
//          tap / click / key / wheel / touch / mouse move (not plain scroll
//          events: the browser scrolls by itself for #links), so it doesn't wait for leaving
//   click  outbound links and mailto:, with their target
// Events of one page load share a random id `v` (not stored anywhere else).
// No cookies are set; the Worker hashes the IP and never stores it.
// Not sent: localhost, the /analytics dashboard, pages framed by another page
// (the gm/ID PDK frames), browsers driven by automation software
// (navigator.webdriver - scanners, headless crawlers), and browsers opted out
// with ?notrack (undo: ?track) or holding the portfolio's owner-pass cookie.
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
  send({ t: "view", r: document.referrer, q: location.search, l: navigator.language || "", z: tz, w: screen.width || 0 });

  // Engagement: time the page was visible and how far down it was read.
  var shownAt = document.visibilityState === "visible" ? Date.now() : 0, visibleMs = 0, depth = 0;
  function measure() {
    var max = document.documentElement.scrollHeight - innerHeight;
    var pct = max > 0 ? Math.round((100 * scrollY) / max) : 100;
    if (pct > depth) depth = Math.min(100, pct);
  }
  addEventListener("scroll", measure, { passive: true });
  addEventListener("load", measure);

  // Sections read: ids of section[id] (else h2[id]) that crossed the middle of the screen.
  var seen = [];
  function watch() {
    if (!("IntersectionObserver" in window)) return;
    var els = document.querySelectorAll("section[id]");
    if (!els.length) els = document.querySelectorAll("h2[id]");
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

  // First real interaction: report it straight away (people stay; scanners don't touch the page).
  var acted = 0;
  function interacted() {
    if (acted) return;
    acted = 1;
    ["pointerdown", "keydown", "touchstart", "wheel", "mousemove"].forEach(function (t) { removeEventListener(t, interacted, true); });
    var ms = visibleMs + (shownAt ? Date.now() - shownAt : 0);
    measure();
    send({ t: "end", ms: ms, s: depth, sec: seen, a: 1 });
  }
  ["pointerdown", "keydown", "touchstart", "wheel", "mousemove"].forEach(function (t) { addEventListener(t, interacted, { capture: true, passive: true }); });

  function flush() {
    if (shownAt) { visibleMs += Date.now() - shownAt; shownAt = 0; }
    measure();
    send({ t: "end", ms: visibleMs, s: depth, sec: seen, a: acted }); // totals so far; the Worker keeps the largest
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") shownAt = Date.now();
    else flush();
  });
  addEventListener("pagehide", flush); // Safari may skip visibilitychange on navigation

  // Outbound clicks (other sites, the other of the two sites, mailto:).
  function onClick(e) {
    var a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var href = a.href;
    if (/^mailto:/i.test(href)) return send({ t: "click", k: "email", u: href.slice(7).split("?")[0] });
    var u;
    try { u = new URL(href); } catch (err) { return; }
    if (!/^https?:$/.test(u.protocol) || u.hostname === host) return;
    send({ t: "click", k: "outbound", u: (u.hostname + u.pathname).slice(0, 200) });
  }
  document.addEventListener("click", onClick, true);
  document.addEventListener("auxclick", onClick, true);
})();
