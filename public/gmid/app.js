/* gm/ID Explorer - one app for the three PDK pages (/gmid/<pdk>/).
 * Data: /gmid/data/manifest.json + 16-bit tables per device and PVT condition
 * (format in gmid/characterise.py). Charts: chart.js (GmChart). No other code. */
(function () {
  "use strict";
  var ROOT = "/gmid/", DATA = ROOT + "data/";
  var ORDER = ["ihp-sg13g2", "sky130a", "gf180mcu-d"];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var NAMES = { "ihp-sg13g2": "IHP SG13G2", "sky130a": "SKY130A", "gf180mcu-d": "GF180MCU-D" };

  var man = null, sheets = {}, cache = new Map(), charts = {};
  var S = {
    pdk: document.body.getAttribute("data-pdk") || null, dev: null,
    c: "tt", s: "nom", t: 27, view: "curves",
    fig: "gmid-vgs", cx: "gmid", cy: "gain", lx: null, ly: null, gstar: 12, ovw: false,
    mode: "lengths", Ls: null, l1: null,
    szL: null, szG: 12, szBy: "gm", szV: { gm: 100, id: 10, w: 5 }, szHold: "id",
    cmp: null, cfig: "gain-gmid", clx: null, cly: null, cgstar: 12
  };

  /* ── colour ───────────────────────────────────────────────────── */
  function dark() { return document.documentElement.getAttribute("data-theme") === "dark"; }
  function oklch(L, C, H) {
    var a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
    var l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3), m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3), s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
    var rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    return "#" + rgb.map(function (c) {
      var v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
      return ("0" + Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16)).slice(-2);
    }).join("");
  }
  /* channel length: neighbouring hues azure to violet, light (short) to dark (long); an ordinal ramp
     checked with the dataviz validator (monotone lightness, steps >= 0.06, light end >= 2:1), flipped in dark mode */
  function lenColor(dev, L) {
    var t = dev.L.length > 1 ? Math.log(L / dev.L[0]) / Math.log(dev.L[dev.L.length - 1] / dev.L[0]) : 0.5, h = 222 + 100 * t;
    return dark() ? oklch(0.53 + 0.37 * t, 0.09 + 0.03 * (1 - t), h) : oklch(0.74 - 0.4 * t, 0.12 + 0.06 * t, h);
  }
  /* MOSFET symbols, 1.5 px line art in currentColor: NMOS arrow leaves the source, PMOS has the gate bubble */
  function sym(pol) {
    var body = '<path d="M9 6v12M12 4.5v15M12 7h5.5V2.5M12 17h5.5v4.5"/>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + body +
      (pol === "n" ? '<path d="M2.5 12H9M14.6 15.3 17 17l-2.4 1.7"/>' : '<path d="M2.5 12h4"/><circle cx="7.75" cy="12" r="1.25"/><path d="M14.9 5.3 12.5 7l2.4 1.7"/>') + "</svg>";
  }
  /* PVT: slow side red, typical ink, fast side blue (plus dash patterns) */
  var SIDE = { slow: ["#b42318", "#e67060"], typ: ["#131c28", "#cfd7e3"], fast: ["#1f4fd1", "#6996ee"] };
  var DASH = { slow: "7 4", typ: null, fast: "2 3.5" };
  function side(k) { return SIDE[k][dark() ? 1 : 0]; }
  /* compare: the site's four domain hues, validated categorical order */
  var CAT = [["#1f4fd1", "#6996ee"], ["#b86200", "#db8833"], ["#0b8a6b", "#2ca985"], ["#7b3fd0", "#936bde"]];
  function cat(i) { return CAT[i % 4][dark() ? 1 : 0]; }

  /* ── quantities ───────────────────────────────────────────────── */
  var Q = {
    vgs:   { l: "V_{GS}", u: "V", d: "gate-source voltage" },
    vov:   { l: "V_{GS} − V_{th}", u: "V", d: "overdrive" },
    gmid:  { l: "g_m/I_D", u: "V^{−1}", d: "transconductance efficiency" },
    idw:   { l: "I_D/W", u: "µA/µm", log: true, d: "current density" },
    gmw:   { l: "g_m/W", u: "µS/µm", log: true, d: "transconductance per width" },
    gain:  { l: "g_m/g_{ds}", u: "", log: true, d: "intrinsic gain" },
    ft:    { l: "f_T", u: "GHz", log: true, d: "transit frequency" },
    fom:   { l: "g_m/I_D · f_T", u: "GHz/V", d: "speed-efficiency product" },
    cggw:  { l: "C_{gg}/W", u: "fF/µm", d: "gate capacitance per width" },
    cgdr:  { l: "C_{gd}/C_{gg}", u: "", d: "Miller fraction" },
    cgsr:  { l: "C_{gs}/C_{gg}", u: "", d: "gate-source fraction" },
    vdsat: { l: "V_{DS,sat}", u: "V", d: "saturation voltage" },
    gmbr:  { l: "g_{mb}/g_m", u: "", d: "body-effect ratio" },
    vth:   { l: "V_{th}", u: "V", d: "threshold voltage" },
    L:     { l: "L", u: "µm", log: true, d: "channel length" }
  };
  var FIGS = [
    { id: "gmid-vgs", x: "vgs", y: "gmid" },
    { id: "gmid-vov", x: "vov", y: "gmid" },
    { id: "idw-vgs", x: "vgs", y: "idw" },
    { id: "idw-gmid", x: "gmid", y: "idw" },
    { id: "gain-gmid", x: "gmid", y: "gain" },
    { id: "ft-gmid", x: "gmid", y: "ft" },
    { id: "fom-gmid", x: "gmid", y: "fom" },
    { id: "cggw-gmid", x: "gmid", y: "cggw" },
    { id: "cgdr-gmid", x: "gmid", y: "cgdr" },
    { id: "cgsr-gmid", x: "gmid", y: "cgsr" },
    { id: "vdsat-gmid", x: "gmid", y: "vdsat" },
    { id: "gmbr-gmid", x: "gmid", y: "gmbr" },
    { id: "gain-L", x: "L", y: "gain", atL: true },
    { id: "ft-L", x: "L", y: "ft", atL: true },
    { id: "idw-L", x: "L", y: "idw", atL: true },
    { id: "vgs-L", x: "L", y: "vgs", atL: true },
    { id: "vth-L", x: "L", y: "vth", atL: true },
    { id: "custom", x: null, y: null }
  ];
  var OVERVIEW = ["gmid-vgs", "idw-gmid", "gain-gmid", "ft-gmid", "cggw-gmid", "vdsat-gmid"];
  function figOf(id) { for (var i = 0; i < FIGS.length; i++) if (FIGS[i].id === id) return FIGS[i]; return FIGS[0]; }
  function figTitle(f, g) {
    if (f.id === "custom") return "Custom axes";
    var t = Q[f.y].l + " versus " + Q[f.x].l;
    return f.atL ? t + (f.y === "vth" ? "" : " at g_m/I_D = " + g + " V^{−1}") : t;
  }
  /* label markup -> plain text (for <option> and file names) */
  function plain(s) { return s.replace(/[_^]\{([^}]*)\}/g, "$1").replace(/[_^](.)/g, "$1"); }
  /* label markup -> HTML */
  function html(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/([_^])(\{[^}]*\}|.)/g, function (m, k, b) { b = b.charAt(0) === "{" ? b.slice(1, -1) : b; return k === "^" ? "<sup>" + b + "</sup>" : "<sub>" + b + "</sub>"; });
  }
  function axisFor(id, logOverride) { var q = Q[id]; return { label: q.l, unit: q.u, log: logOverride != null ? logOverride : !!q.log, zero: /^(cgdr|cgsr|gmbr|cggw|vdsat|fom)$/.test(id) }; }

  /* ── number formats ───────────────────────────────────────────── */
  function sig(v, n) { if (!isFinite(v)) return "—"; var a = Math.abs(v); var s = a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(n > 2 ? 1 : 0) : a >= 1 ? v.toFixed(n > 2 ? 2 : 1) : +v.toPrecision(n) + ""; return s.replace("-", "−"); }
  function eng(v, unit, n) {
    if (!isFinite(v)) return "—";
    var P = [[1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"], [1e-15, "f"], [1e-18, "a"]];
    var a = Math.abs(v);
    for (var i = 0; i < P.length; i++) if (a >= P[i][0] * 0.9995 || i === P.length - 1) return sig(v / P[i][0], n || 3) + " " + P[i][1] + unit;
  }
  function fmt(q, v) {
    if (v == null || !isFinite(v)) return "—";
    switch (q) {
      case "vgs": case "vov": case "vdsat": case "vth": return (v < 0 ? "−" : "") + Math.abs(v).toFixed(3) + " V";
      case "gmid": return v.toFixed(2) + " V⁻¹";
      case "idw": return eng(v * 1e-6, "A/µm");
      case "gmw": return eng(v * 1e-6, "S/µm");
      case "gain": return sig(v, 3) + " (" + (20 * Math.log10(v)).toFixed(1) + " dB)";
      case "ft": return eng(v * 1e9, "Hz");
      case "fom": return sig(v, 3) + " GHz/V";
      case "cggw": return sig(v, 3) + " fF/µm";
      case "L": return sig(v, 3) + " µm";
      default: return v.toFixed(3);
    }
  }
  function volts(v) { return (+v.toFixed(3)).toString() + " V"; }
  function lstr(L) { return +L.toFixed(3) + ""; }

  /* ── manifest, devices, PVT ───────────────────────────────────── */
  function devs(pdk) { return man.pdks[pdk].devices; }
  function devOf(pdk, id) { var d = devs(pdk); for (var i = 0; i < d.length; i++) if (d[i].id === id) return d[i]; return null; }
  var SUP = { lo: 0.9, nom: 1, hi: 1.1 }, TEMPS = [-40, 27, 125], CORNERS = ["ss", "tt", "ff"], SUPS = ["lo", "nom", "hi"];
  function vddOf(dev, s) { return dev.vdd * SUP[s]; }
  function npts(s) { return Math.round(man.method.steps_nom * SUP[s]) + 1; }
  function ttag(t) { return t < 0 ? "m" + -t : String(t); }
  function condName(dev, c, s, t) { return c.toUpperCase() + " · " + volts(vddOf(dev, s)) + " · " + (t < 0 ? "−" + -t : t) + " °C"; }

  function getJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status + " for " + u); return r.json(); }); }
  function load(pdk, id, c, s, t) {
    var key = [pdk, id, c, s, t].join("|");
    if (cache.has(key)) return cache.get(key);
    var dev = devOf(pdk, id);
    var p = fetch(DATA + pdk + "/" + id + "/" + c + "-" + s + "-" + ttag(t) + ".bin?v=" + (man.data_v || man.generated))
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
      .then(function (buf) { return decode(buf, dev, s); });
    p.catch(function () { cache.delete(key); });
    cache.set(key, p);
    if (cache.size > 160) cache.delete(cache.keys().next().value);
    return p;
  }
  function decode(buf, dev, s) {
    var n = npts(s), nL = dev.L.length, qs = man.quant, dv = new DataView(buf), off = 0, q = {};
    qs.forEach(function (x) { q[x[0]] = []; });
    for (var li = 0; li < nL; li++) for (var k = 0; k < qs.length; k++) {
      var lo = qs[k][1], span = qs[k][2] - lo, a = new Float64Array(n);
      for (var i = 0; i < n; i++, off += 2) { var u = dv.getUint16(off, true); a[i] = u === 65535 ? NaN : lo + u / 65534 * span; }
      q[qs[k][0]].push(a);
    }
    var vth = [];
    for (li = 0; li < nL; li++, off += 4) vth.push(dv.getFloat32(off, true));
    return { dev: dev, n: n, step: dev.step, q: q, vth: vth, a: [] };
  }
  /* all quantities of one length, computed once */
  function arrays(cd, li) {
    if (cd.a[li]) return cd.a[li];
    var n = cd.n, q = cd.q, o = {}, k0 = 0, best = -1;
    ["vgs", "vov", "gmid", "idw", "gmw", "gain", "ft", "fom", "cggw", "cgdr", "cgsr", "vdsat", "gmbr"].forEach(function (k) { o[k] = new Float64Array(n); });
    for (var i = 0; i < n; i++) {
      var vg = i * cd.step, g = q.gmid[li][i], idw = Math.pow(10, q.lidw[li][i]), cg = Math.pow(10, q.lcgg[li][i]);
      o.vgs[i] = vg; o.vov[i] = vg - cd.vth[li]; o.gmid[i] = g; o.idw[i] = idw; o.gmw[i] = g * idw;
      o.gain[i] = Math.pow(10, q.lgain[li][i]); o.ft[i] = g * idw / (2 * Math.PI * cg); o.fom[i] = g * o.ft[i];
      o.cggw[i] = cg; o.cgdr[i] = q.cgdr[li][i]; o.cgsr[i] = q.cgsr[li][i]; o.vdsat[i] = q.vdsat[li][i]; o.gmbr[i] = q.gmbr[li][i];
      if (g > best) { best = g; k0 = i; }
    }
    o.k0 = k0;   // the gm/ID peak: curves versus gm/ID start here (strong-inversion branch)
    return (cd.a[li] = o);
  }
  /* fractional index where gm/ID = g on the strong-inversion branch */
  function atGmid(a, g) {
    for (var i = a.k0; i < a.gmid.length - 1; i++) {
      var p = a.gmid[i], r = a.gmid[i + 1];
      if (!isFinite(p) || !isFinite(r)) continue;
      if ((p - g) * (r - g) <= 0 && p !== r) return i + (p - g) / (p - r);
    }
    return null;
  }
  /* fractional index where I_D/W = target (monotonic in V_GS; log interpolation) */
  function atIdw(a, target) {
    var lt = Math.log(target);
    for (var i = 0; i < a.idw.length - 1; i++) {
      var p = a.idw[i], r = a.idw[i + 1];
      if (!(p > 0) || !(r > 0)) continue;
      var lp = Math.log(p), lr = Math.log(r);
      if ((lp - lt) * (lr - lt) <= 0 && lp !== lr) return i + (lp - lt) / (lp - lr);
    }
    return null;
  }
  function at(arr, x, log) {
    if (x == null) return NaN;
    var i = Math.floor(x), f = x - i;
    if (i >= arr.length - 1) return arr[arr.length - 1];
    if (log && arr[i] > 0 && arr[i + 1] > 0) return Math.exp(Math.log(arr[i]) * (1 - f) + Math.log(arr[i + 1]) * f);
    return arr[i] * (1 - f) + arr[i + 1] * f;
  }
  function valueAt(a, x, y, cd, li) { return y === "vth" ? cd.vth[li] : at(a[y], x, Q[y] && Q[y].log); }

  /* points of one length for a figure */
  function points(cd, li, f, g) {
    var a = arrays(cd, li), xs = a[f.x], ys = a[f.y], x = [], y = [];
    for (var i = f.x === "gmid" ? a.k0 : 0; i < cd.n; i++) { x.push(xs[i]); y.push(ys[i]); }
    return { x: x, y: y };
  }
  /* figure "y versus L at fixed gm/ID": one point per length */
  function vsL(cd, f, g) {
    var x = [], y = [];
    cd.dev.L.forEach(function (L, li) {
      var a = arrays(cd, li), k = f.y === "vth" ? 0 : atGmid(a, g);
      x.push(L); y.push(k == null ? NaN : valueAt(a, k, f.y, cd, li));
    });
    return { x: x, y: y };
  }

  /* ── state in the URL ─────────────────────────────────────────── */
  function writeHash() {
    var p = ["d=" + S.dev, "c=" + S.c, "s=" + S.s, "t=" + S.t, "v=" + S.view];
    if (S.view === "curves" || S.view === "compare") p.push("f=" + (S.view === "compare" ? S.cfig : S.fig));
    if (S.view === "curves") {
      if (S.fig === "custom") p.push("x=" + S.cx, "y=" + S.cy);
      if (S.mode !== "lengths") p.push("m=" + S.mode, "l=" + S.l1);
      else p.push("L=" + S.Ls.map(lstr).join(","));
      if (S.lx != null) p.push("lx=" + (S.lx ? 1 : 0));
      if (S.ly != null) p.push("ly=" + (S.ly ? 1 : 0));
      if (figOf(S.fig).atL) p.push("g=" + S.gstar);
      if (S.ovw) p.push("o=1");
    }
    if (S.view === "size") p.push("sl=" + S.szL, "sg=" + S.szG, "sb=" + S.szBy, "sv=" + S.szV[S.szBy], "sh=" + S.szHold);
    if (S.view === "compare") p.push("k=" + S.cmp.map(function (r) { return r.pdk + ":" + r.dev + ":" + lstr(r.L); }).join(","));
    history.replaceState(null, "", location.pathname + "#" + p.join("&"));
  }
  function readHash() {
    var h = {};
    location.hash.replace(/^#/, "").split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) h[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    return h;
  }
  function applyHash(h) {
    // a linked device brings its own default lengths (the PDK's first device may have others)
    if (h.d && devOf(S.pdk, h.d)) setDevice(h.d);
    if (CORNERS.indexOf(h.c) >= 0) S.c = h.c;
    if (SUPS.indexOf(h.s) >= 0) S.s = h.s;
    if (TEMPS.indexOf(+h.t) >= 0) S.t = +h.t;
    if (/^(curves|size|compare|reference)$/.test(h.v)) S.view = h.v;
    var dev = devOf(S.pdk, S.dev);
    if (h.f && FIGS.some(function (f) { return f.id === h.f; })) { if (S.view === "compare") S.cfig = h.f; else S.fig = h.f; }
    if (Q[h.x] && h.x !== "L" && h.x !== "vth") S.cx = h.x;
    if (Q[h.y] && h.y !== "L" && h.y !== "vth") S.cy = h.y;
    if (/^(lengths|corner|supply|temp|pvt)$/.test(h.m)) S.mode = h.m;
    if (h.l && dev.L.indexOf(+h.l) >= 0) S.l1 = +h.l;
    if (h.L) { var ls = h.L.split(",").map(Number).filter(function (L) { return dev.L.indexOf(L) >= 0; }); if (ls.length) S.Ls = ls; }
    if (h.lx != null) S.lx = h.lx === "1";
    if (h.ly != null) S.ly = h.ly === "1";
    if (+h.g > 0) S.gstar = +h.g;
    if (h.o === "1") S.ovw = true;
    if (h.sl && dev.L.indexOf(+h.sl) >= 0) S.szL = +h.sl;
    if (+h.sg > 0) S.szG = +h.sg;
    if (/^(gm|id|w)$/.test(h.sb)) S.szBy = h.sb;
    if (+h.sv > 0) S.szV[S.szBy] = +h.sv;
    if (/^(id|vgs|gmid)$/.test(h.sh)) S.szHold = h.sh;
    if (h.k) {
      var rows = h.k.split(",").map(function (s) { var p = s.split(":"); return { pdk: p[0], dev: p[1], L: +p[2] }; })
        .filter(function (r) { return man.pdks[r.pdk] && devOf(r.pdk, r.dev) && devOf(r.pdk, r.dev).L.indexOf(r.L) >= 0; });
      if (rows.length) S.cmp = rows.slice(0, 4);
    }
  }

  /* ── device defaults ──────────────────────────────────────────── */
  function defaultLs(dev) {
    var want = [dev.L[0], 0.25, 0.5, 1, 2, 5], out = [];
    want.forEach(function (w) { var L = nearest(dev.L, w); if (out.indexOf(L) < 0) out.push(L); });
    [0.7, 3, 0.35, 1.5].forEach(function (w) { if (out.length < 5 && dev.L.indexOf(w) >= 0 && out.indexOf(w) < 0) out.push(w); });
    return out.sort(function (a, b) { return a - b; });
  }
  function nearest(arr, v) { return arr.reduce(function (b, x) { return Math.abs(Math.log(x / v)) < Math.abs(Math.log(b / v)) ? x : b; }, arr[0]); }
  function setDevice(id) {
    var dev = devOf(S.pdk, id) || devs(S.pdk)[0];
    S.dev = dev.id;
    S.Ls = defaultLs(dev);
    S.l1 = nearest(dev.L, 0.5);
    S.szL = nearest(dev.L, 0.5);
  }
  function defaultCompare() {
    return [["ihp-sg13g2", "sg13_lv_nmos"], ["sky130a", "nfet_01v8"], ["gf180mcu-d", "nfet_03v3"]].map(function (p) {
      return { pdk: p[0], dev: p[1], L: nearest(devOf(p[0], p[1]).L, 0.5) };
    });
  }

  /* ── side panel ───────────────────────────────────────────────── */
  function renderSide() {
    var list = devs(S.pdk), groups = [], box = $("#devs"), sel = $("#devsel");
    list.forEach(function (d) { if (groups.indexOf(d.group) < 0) groups.push(d.group); });
    box.innerHTML = groups.map(function (g) {
      return '<p class="devs__group">' + html(g) + "</p>" + list.filter(function (d) { return d.group === g; }).map(function (d) {
        return '<button type="button" class="dev" data-dev="' + d.id + '" aria-pressed="' + (d.id === S.dev) + '">' +
          '<span class="dev__pol" aria-hidden="true">' + sym(d.pol) + "</span>" +
          '<span class="dev__id">' + d.id + "</span>" +
          '<span class="dev__kind">' + (d.pol === "n" ? "NMOS" : "PMOS") + " · " + html(d.kind) + "</span></button>";
      }).join("");
    }).join("");
    sel.innerHTML = list.map(function (d) { return '<option value="' + d.id + '"' + (d.id === S.dev ? " selected" : "") + ">" + d.id + " — " + (d.pol === "n" ? "NMOS" : "PMOS") + ", " + html(d.kind) + "</option>"; }).join("");
    $("#devcount").textContent = list.length + " devices";
    renderPVT();
    renderLens();
  }
  function renderPVT() {
    var dev = devOf(S.pdk, S.dev);
    seg("#seg-corner", S.c); seg("#seg-supply", S.s); seg("#seg-temp", String(S.t)); seg("#seg-mode", S.mode);
    $$("#seg-supply button").forEach(function (b) { b.title = volts(vddOf(dev, b.getAttribute("data-v"))); });
    $("#biasnote").innerHTML = "VDD = " + volts(vddOf(dev, S.s)) + " (nominal " + volts(dev.vdd) + "); V<sub>DS</sub> = " + volts(vddOf(dev, S.s) / 2) + ", V<sub>SB</sub> = 0, W = 5 µm.";
    var notes = {
      lengths: "One curve per channel length at the operating point above.",
      corner: "SS, TT and FF at the chosen supply and temperature.",
      supply: "VDD −10 %, nominal and +10 % at the chosen corner and temperature.",
      temp: "−40, 27 and 125 °C at the chosen corner and supply.",
      pvt: "The band spans all 27 conditions; the lines are TT nominal and the slow and fast extremes."
    };
    $("#modenote").textContent = notes[S.mode];
    $("#l1field").hidden = S.mode === "lengths";
    $("#lensbox").hidden = S.mode !== "lengths";
    $("#l1").innerHTML = dev.L.map(function (L) { return "<option" + (L === S.l1 ? " selected" : "") + ' value="' + L + '">' + lstr(L) + " µm</option>"; }).join("");
  }
  function seg(sel, v) { $$(sel + " button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === String(v))); }); }
  function renderLens() {
    var dev = devOf(S.pdk, S.dev);
    $("#lens").innerHTML = dev.L.map(function (L) {
      var on = S.Ls.indexOf(L) >= 0;
      return '<button type="button" class="len" data-l="' + L + '" aria-pressed="' + on + '" style="--c:' + lenColor(dev, L) + '"><i></i>' + lstr(L) + "</button>";
    }).join("");
  }

  /* ── Curves view ──────────────────────────────────────────────── */
  function figOptions(sel, value) {
    sel.innerHTML = '<optgroup label="Versus VGS and overdrive">' + FIGS.slice(0, 3).map(opt).join("") + "</optgroup>" +
      '<optgroup label="Versus gm/ID (strong-inversion branch)">' + FIGS.slice(3, 12).map(opt).join("") + "</optgroup>" +
      '<optgroup label="Versus channel length">' + FIGS.slice(12, 17).map(opt).join("") + "</optgroup>" + opt(FIGS[17]);
    function opt(f) { return '<option value="' + f.id + '"' + (f.id === value ? " selected" : "") + ">" + plain(figTitle(f, "#")).replace(/ at gm\/ID = # V−1$/, " at a fixed gm/ID") + "</option>"; }
  }
  function currentFig() {
    var f = figOf(S.fig);
    return f.id === "custom" ? { id: "custom", x: S.cx, y: S.cy } : f;
  }
  /* the conditions a figure needs, with their style */
  function seriesPlan(dev) {
    var c = S.c, s = S.s, t = S.t;
    if (S.mode === "corner") return [["ss", s, t, "slow", "SS"], ["tt", s, t, "typ", "TT"], ["ff", s, t, "fast", "FF"]];
    if (S.mode === "supply") return [[c, "lo", t, "slow", volts(vddOf(dev, "lo"))], [c, "nom", t, "typ", volts(vddOf(dev, "nom"))], [c, "hi", t, "fast", volts(vddOf(dev, "hi"))]];
    if (S.mode === "temp") return [[c, s, 125, "slow", "125 °C"], [c, s, 27, "typ", "27 °C"], [c, s, -40, "fast", "−40 °C"]];
    if (S.mode === "pvt") {
      var all = [];
      CORNERS.forEach(function (cc) { SUPS.forEach(function (ss) { TEMPS.forEach(function (tt) { all.push([cc, ss, tt]); }); }); });
      return all;
    }
    return [[c, s, t]];
  }
  /* build chart spec(s) for one figure on the current device */
  function buildSpec(f, conds, dev, logx, logy) {
    var spec = { x: axisFor(f.x, logx), y: axisFor(f.y, logy), series: [], bands: [], refs: [] };
    var g = S.gstar, li1 = dev.L.indexOf(S.l1);
    function pts(cd, li) { return f.atL ? vsL(cd, f, g) : points(cd, li, f, g); }
    if (S.mode === "lengths") {
      var cd = conds[0];
      if (f.atL) {
        var p = pts(cd);
        spec.series.push({ name: dev.id, color: side("typ"), x: p.x, y: p.y });
      } else S.Ls.forEach(function (L) {
        var li = dev.L.indexOf(L), p = pts(cd, li);
        spec.series.push({ name: "L = " + lstr(L) + " µm", color: lenColor(dev, L), x: p.x, y: p.y });
      });
    } else if (S.mode === "pvt") {
      var plan = seriesPlan(dev), lines = [], i0 = -1, iS = -1, iF = -1;
      plan.forEach(function (k, i) {
        lines.push(pts(conds[i], li1));
        if (k[0] === "tt" && k[1] === "nom" && k[2] === 27) i0 = i;
        if (k[0] === "ss" && k[1] === "lo" && k[2] === 125) iS = i;
        if (k[0] === "ff" && k[1] === "hi" && k[2] === -40) iF = i;
      });
      var band = envelope(lines, spec.x.log);
      if (band) spec.bands.push({ x: band.x, lo: band.lo, hi: band.hi, color: side("fast"), opacity: dark() ? 0.26 : 0.16 });
      else lines.forEach(function (p) { spec.series.push({ name: "", color: side("fast"), width: 1, x: p.x, y: p.y }); });
      [[iS, "slow", condName(dev, "ss", "lo", 125)], [i0, "typ", condName(dev, "tt", "nom", 27)], [iF, "fast", condName(dev, "ff", "hi", -40)]].forEach(function (z) {
        spec.series.push({ name: z[2], color: side(z[1]), dash: DASH[z[1]], x: lines[z[0]].x, y: lines[z[0]].y });
      });
    } else {
      seriesPlan(dev).forEach(function (k, i) {
        var p = pts(conds[i], li1);
        spec.series.push({ name: k[4], color: side(k[3]), dash: DASH[k[3]], x: p.x, y: p.y });
      });
    }
    if (f.atL && f.y !== "vth") spec.refs = [];
    return spec;
  }
  /* min/max over many curves on a common x grid (null if x is not monotonic) */
  function envelope(lines, logx) {
    var lo = Infinity, hi = -Infinity, ok = true;
    lines.forEach(function (p) {
      var dir = 0;
      for (var i = 0; i < p.x.length; i++) {
        var v = p.x[i];
        if (!isFinite(v) || !isFinite(p.y[i])) continue;
        lo = Math.min(lo, v); hi = Math.max(hi, v);
        if (i > 0 && isFinite(p.x[i - 1])) { var d = Math.sign(v - p.x[i - 1]); if (d && dir && d !== dir) ok = false; if (d) dir = d; }
      }
    });
    if (!ok || !isFinite(lo) || lo === hi || (logx && lo <= 0)) return null;
    var N = 160, xs = [], bl = [], bh = [];
    for (var k = 0; k < N; k++) {
      var x = logx ? Math.pow(10, Math.log10(lo) + (Math.log10(hi) - Math.log10(lo)) * k / (N - 1)) : lo + (hi - lo) * k / (N - 1);
      var mn = Infinity, mx = -Infinity;
      lines.forEach(function (p) {
        for (var i = 0; i < p.x.length - 1; i++) {
          var a = p.x[i], b = p.x[i + 1];
          if (!isFinite(a) || !isFinite(b) || !isFinite(p.y[i]) || !isFinite(p.y[i + 1]) || (x - a) * (x - b) > 0 || a === b) continue;
          var y = p.y[i] + (x - a) / (b - a) * (p.y[i + 1] - p.y[i]);
          mn = Math.min(mn, y); mx = Math.max(mx, y);
          break;
        }
      });
      xs.push(x); bl.push(isFinite(mn) ? mn : NaN); bh.push(isFinite(mx) ? mx : NaN);
    }
    return { x: xs, lo: bl, hi: bh };
  }
  function logDefault(f, axis) { return !!Q[f[axis]].log; }

  var renderToken = 0;
  function renderCurves() {
    var dev = devOf(S.pdk, S.dev), f = currentFig(), token = ++renderToken;
    var lx = S.lx != null ? S.lx : logDefault(f, "x"), ly = S.ly != null ? S.ly : logDefault(f, "y");
    $("#logx").checked = lx; $("#logy").checked = ly; $("#ovw").checked = S.ovw;
    $("#custom").hidden = S.fig !== "custom";
    $("#atgmid").hidden = !figOf(S.fig).atL || figOf(S.fig).y === "vth";
    $("#gstar").value = S.gstar;
    var plan = seriesPlan(dev), plot = $("#plot");
    var slow = setTimeout(function () { plot.classList.add("is-loading"); $("#status").hidden = false; $("#status").textContent = plan.length > 3 ? "Loading " + plan.length + " PVT tables…" : "Loading data…"; }, 120);
    Promise.all(plan.map(function (k) { return load(S.pdk, S.dev, k[0], k[1], k[2]); })).then(function (conds) {
      clearTimeout(slow);
      if (token !== renderToken) return;
      plot.classList.remove("is-loading"); $("#status").hidden = true;
      var spec = buildSpec(f, conds, dev, lx, ly);
      if (!charts.main) charts.main = GmChart.create(plot, { label: "Figure", onHover: function (x, v, pin) { readout("#readout", charts.main, x, v, pin); }, onZoom: function (on) { $("#unzoom").hidden = !on; } });
      charts.main.update(spec);
      charts.main.mainSpec = spec;
      $("#unzoom").hidden = true;
      legend(spec);
      caption(f, dev);
      readout("#readout", charts.main, null, null, false);
      renderOverview(conds, dev);
    }, function (e) {
      clearTimeout(slow);
      plot.classList.remove("is-loading"); $("#status").hidden = false;
      $("#status").textContent = "Could not load the data (" + e.message + "). Check the connection and try again.";
    });
    writeHash();
  }
  function legend(spec) {
    var items = spec.series.filter(function (s) { return s.name; });
    var band = spec.bands.length ? '<li><svg class="key" viewBox="0 0 22 8" aria-hidden="true"><rect width="22" height="8" fill="' + spec.bands[0].color + '" fill-opacity="' + spec.bands[0].opacity + '"/></svg>All 27 PVT conditions</li>' : "";
    $("#legend").innerHTML = band + items.map(function (s) {
      return '<li><svg class="key" viewBox="0 0 22 8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4" stroke="' + s.color + '" stroke-width="2.2"' + (s.dash ? ' stroke-dasharray="' + s.dash + '"' : "") + "/></svg>" + s.name + "</li>";
    }).join("");
  }
  function caption(f, dev) {
    $("#figtitle").innerHTML = f.id === "custom" ? html(Q[f.y].l) + " versus " + html(Q[f.x].l) : html(figTitle(f, S.gstar));
    $("#figsub").innerHTML = '<span class="mono">' + dev.id + "</span> · " + (S.mode === "lengths" ? condName(dev, S.c, S.s, S.t) + " · " + S.Ls.length + " lengths" :
      "L = " + lstr(S.l1) + " µm · " + { corner: "SS, TT, FF", supply: "VDD −10 %, nominal, +10 %", temp: "−40, 27, 125 °C", pvt: "spread of 27 PVT points" }[S.mode]);
    var what = f.id === "custom" ? html(Q[f.y].l) + " versus " + html(Q[f.x].l) : html(figTitle(f, S.gstar));
    var where = S.mode === "lengths" ? condName(dev, S.c, S.s, S.t) : "L = " + lstr(S.l1) + " µm, " +
      { corner: "process corners at " + volts(vddOf(dev, S.s)) + ", " + S.t + " °C", supply: "supply at " + S.c.toUpperCase() + ", " + S.t + " °C", temp: "temperature at " + S.c.toUpperCase() + ", " + volts(vddOf(dev, S.s)), pvt: "all 27 PVT conditions" }[S.mode];
    $("#caption").innerHTML = "<b>Fig. 1.</b> " + what + " of <span class=\"mono\">" + dev.id + "</span> (" + NAMES[S.pdk] + "), " + where +
      ". W = 5 µm, V<sub>DS</sub> = VDD/2, V<sub>SB</sub> = 0" + (f.x === "gmid" ? "; strong-inversion branch from the g<sub>m</sub>/I<sub>D</sub> peak" : "") + ".";
  }
  function readout(sel, chart, x, vals, pinned) {
    var box = $(sel), spec = chart && chart.mainSpec;
    if (!spec) { box.innerHTML = ""; return; }
    if (x == null) {
      box.innerHTML = '<div class="readout__head"><span>Values at the cursor</span><span>Hover or tap the figure</span></div>';
      return;
    }
    var xq = keyOf(spec.x), yq = keyOf(spec.y);
    var rows = spec.series.map(function (s, i) { return s.name && vals[i] ? '<tr><td><svg class="key" viewBox="0 0 22 8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4" stroke="' + s.color + '" stroke-width="2.2"' + (s.dash ? ' stroke-dasharray="' + s.dash + '"' : "") + '/></svg></td><td class="mono">' + s.name + '</td><td class="n">' + fmt(yq, vals[i].y) + "</td></tr>" : ""; }).join("");
    box.innerHTML = '<div class="readout__head"><span>' + (pinned ? "Pinned at " : "At ") + html(spec.x.label) + " = " + fmt(xq, x) + "</span><span>" + html(spec.y.label) + "</span></div>" +
      (rows ? '<table class="tbl"><tbody>' + rows + "</tbody></table>" : "");
  }
  function keyOf(axis) { for (var k in Q) if (Q[k].l === axis.label) return k; return ""; }
  function renderOverview(conds, dev) {
    var box = $("#overview");
    box.hidden = !S.ovw || S.fig === "custom";
    if (box.hidden) return;
    if (!box.children.length) {
      box.innerHTML = OVERVIEW.map(function (id, i) { return '<figure><div class="mini" id="mini' + i + '"></div><figcaption></figcaption></figure>'; }).join("");
      charts.mini = OVERVIEW.map(function (id, i) { return GmChart.create($("#mini" + i), { compact: true, label: id }); });
    }
    OVERVIEW.forEach(function (id, i) {
      var f = figOf(id);
      charts.mini[i].update(buildSpec(f, conds, dev, logDefault(f, "x"), logDefault(f, "y")));
      box.children[i].querySelector("figcaption").innerHTML = "(" + "abcdef".charAt(i) + ") " + html(figTitle(f, S.gstar));
    });
  }

  /* ── Sizing view ──────────────────────────────────────────────── */
  function renderSize() {
    var dev = devOf(S.pdk, S.dev);
    if (dev.L.indexOf(S.szL) < 0) S.szL = nearest(dev.L, 0.5);
    $("#sz-l").innerHTML = dev.L.map(function (L) { return '<option value="' + L + '"' + (L === S.szL ? " selected" : "") + ">" + lstr(L) + " µm</option>"; }).join("");
    $("#sz-g").value = S.szG;
    seg("#seg-by", S.szBy); seg("#seg-hold", S.szHold);
    $("#sz-vk").innerHTML = { gm: "g<sub>m</sub>", id: "I<sub>D</sub>", w: "W" }[S.szBy];
    $("#sz-vu").textContent = { gm: "µS", id: "µA", w: "µm" }[S.szBy];
    $("#sz-v").value = S.szV[S.szBy];
    var token = ++renderToken;
    load(S.pdk, S.dev, S.c, S.s, S.t).then(function (cd) {
      if (token !== renderToken) return;
      var li = dev.L.indexOf(S.szL), a = arrays(cd, li), k = atGmid(a, S.szG);
      var out = $("#sz-out");
      if (k == null) {
        var gmax = Math.max.apply(null, Array.prototype.filter.call(a.gmid, isFinite));
        out.innerHTML = '<p class="warn">g<sub>m</sub>/I<sub>D</sub> = ' + S.szG + " V<sup>−1</sup> is outside what this device reaches at L = " + lstr(S.szL) + " µm and this operating point (the curve spans about " +
          sig(a.gmid[a.gmid.length - 1], 3) + " to " + sig(gmax, 3) + " V<sup>−1</sup>).</p>";
        $("#sz-ltab").innerHTML = ""; $("#sz-ptab").innerHTML = ""; $("#sz-ltext").textContent = ""; $("#sz-ptext").textContent = "";
        writeHash();
        return;
      }
      var r = sizeAt(cd, li, k, S.szG);
      var nf = Math.max(1, Math.round(r.W / 5));
      var cells = [
        ["W", sig(r.W, 3) + " µm", true, nf > 1 ? nf + " fingers of " + sig(r.W / nf, 3) + " µm" : ""],
        ["I_D", eng(r.ID * 1e-6, "A"), true], ["g_m", eng(r.gm * 1e-6, "S"), true],
        ["V_{GS}", fmt("vgs", r.vgs)], ["V_{GS} − V_{th}", fmt("vov", r.vov)], ["V_{DS,sat}", fmt("vdsat", r.vdsat)],
        ["I_D/W", fmt("idw", r.idw)], ["g_m/g_{ds}", fmt("gain", r.gain)], ["r_o", eng(r.gain / (r.gm * 1e-6), "Ω")],
        ["f_T", fmt("ft", r.ft)], ["C_{gg}", eng(r.cgg * 1e-15, "F")], ["C_{gd}", eng(r.cgd * 1e-15, "F")],
        ["C_{gs}", eng(r.cgs * 1e-15, "F")], ["g_{mb}", eng(r.gmb * 1e-6, "S")], ["W·L", sig(r.W * S.szL, 3) + " µm²"]
      ];
      out.innerHTML = '<div class="specs">' + cells.map(function (c) {
        return '<div class="spec' + (c[2] ? " spec--lead" : "") + '"><div class="spec__k">' + html(c[0]) + '</div><div class="spec__v">' + c[1] + "</div>" + (c[3] ? '<div class="spec__k">' + c[3] + "</div>" : "") + "</div>";
      }).join("") + "</div>" + (r.W < 0.5 ? '<p class="warn">W is below 0.5 µm: narrow-width effects make the per-width numbers optimistic.</p>' : "") +
        '<p class="note">' + dev.id + " at " + condName(dev, S.c, S.s, S.t) + ", L = " + lstr(S.szL) + " µm, g<sub>m</sub>/I<sub>D</sub> = " + S.szG + " V<sup>−1</sup>.</p>";
      // every length at the same gm/ID and the same sizing target
      $("#sz-ltext").innerHTML = "Same target (" + { gm: "g<sub>m</sub> = " + S.szV.gm + " µS", id: "I<sub>D</sub> = " + S.szV.id + " µA", w: "W = " + S.szV.w + " µm" }[S.szBy] + ") and g<sub>m</sub>/I<sub>D</sub> at every characterised length. Longer devices buy gain with area and speed.";
      var rows = dev.L.map(function (L, j) {
        var aj = arrays(cd, j), kj = atGmid(aj, S.szG);
        if (kj == null) return "<tr><td class=\"n\">" + lstr(L) + '</td><td colspan="7">not reached</td></tr>';
        var q = sizeAt(cd, j, kj, S.szG);
        return '<tr class="' + (L === S.szL ? "is-sel" : "") + '"><td class="n">' + lstr(L) + '</td><td class="n">' + fmt("vgs", q.vgs) + '</td><td class="n">' + fmt("idw", q.idw) + '</td><td class="n">' + sig(q.W, 3) + '</td><td class="n">' + sig(q.gain, 3) + '</td><td class="n">' + fmt("ft", q.ft) + '</td><td class="n">' + eng(q.cgg * 1e-15, "F") + '</td><td class="n">' + sig(q.W * L, 3) + "</td></tr>";
      }).join("");
      $("#sz-ltab").innerHTML = '<table class="tbl"><thead><tr><th class="n">L (µm)</th><th class="n">V<sub>GS</sub></th><th class="n">I<sub>D</sub>/W</th><th class="n">W (µm)</th><th class="n">g<sub>m</sub>/g<sub>ds</sub></th><th class="n">f<sub>T</sub></th><th class="n">C<sub>gg</sub></th><th class="n">W·L (µm²)</th></tr></thead><tbody>' + rows + "</tbody></table>";
      renderPVTTable(dev, r, token);
    }, function (e) { $("#sz-out").innerHTML = '<p class="warn">Could not load the data (' + e.message + ").</p>"; });
    writeHash();
  }
  function sizeAt(cd, li, k, g) {
    var a = arrays(cd, li), idw = at(a.idw, k, true), W, ID, gm;
    if (S.szBy === "gm") { gm = S.szV.gm; ID = gm / g; W = ID / idw; }
    else if (S.szBy === "id") { ID = S.szV.id; gm = g * ID; W = ID / idw; }
    else { W = S.szV.w; ID = idw * W; gm = g * ID; }
    var cggw = at(a.cggw, k);
    return { W: W, ID: ID, gm: gm, idw: idw, vgs: at(a.vgs, k), vov: at(a.vov, k), vdsat: at(a.vdsat, k), gain: at(a.gain, k, true),
             ft: at(a.ft, k, true), cgg: cggw * W, cgd: cggw * W * at(a.cgdr, k), cgs: cggw * W * at(a.cgsr, k), gmb: gm * at(a.gmbr, k) };
  }
  function renderPVTTable(dev, r, token) {
    var li = dev.L.indexOf(S.szL), plan = [];
    CORNERS.forEach(function (c) { SUPS.forEach(function (s) { TEMPS.forEach(function (t) { plan.push([c, s, t]); }); }); });
    var hold = S.szHold;
    $("#sz-ptext").innerHTML = { id: "The same transistor (W = " + sig(r.W, 3) + " µm) biased with the same current, I<sub>D</sub> = " + eng(r.ID * 1e-6, "A") + ", as from a current mirror: V<sub>GS</sub>, g<sub>m</sub>/I<sub>D</sub> and the rest move with PVT.",
      vgs: "The same transistor with the same gate voltage, V<sub>GS</sub> = " + fmt("vgs", r.vgs) + ": the current itself moves with PVT.",
      gmid: "The same transistor kept at g<sub>m</sub>/I<sub>D</sub> = " + S.szG + " V<sup>−1</sup> (for example by a constant-g<sub>m</sub>/I<sub>D</sub> bias): current and V<sub>GS</sub> follow." }[hold] +
      " Each column marks its lowest and highest value.";
    $("#sz-ptab").innerHTML = '<p class="note">Loading the 27 PVT tables…</p>';
    Promise.all(plan.map(function (k) { return load(S.pdk, S.dev, k[0], k[1], k[2]); })).then(function (cds) {
      if (token !== renderToken) return;
      var cols = [["vgs", "V<sub>GS</sub>"], ["id", "I<sub>D</sub>"], ["gmid", "g<sub>m</sub>/I<sub>D</sub>"], ["gm", "g<sub>m</sub>"], ["gain", "g<sub>m</sub>/g<sub>ds</sub>"], ["ft", "f<sub>T</sub>"], ["vdsat", "V<sub>DS,sat</sub>"]];
      var rows = plan.map(function (k, i) {
        var a = arrays(cds[i], li), x;
        if (hold === "id") x = atIdw(a, r.ID / r.W);
        else if (hold === "vgs") x = r.vgs / cds[i].step <= cds[i].n - 1 ? r.vgs / cds[i].step : null;
        else x = atGmid(a, S.szG);
        if (x == null) return { k: k, v: null };
        var idw = at(a.idw, x, true), ID = idw * r.W, g = at(a.gmid, x);
        return { k: k, v: { vgs: at(a.vgs, x), id: ID, gmid: g, gm: g * ID, gain: at(a.gain, x, true), ft: at(a.ft, x, true), vdsat: at(a.vdsat, x) } };
      });
      var ext = {};
      cols.forEach(function (c) {
        var vs = rows.filter(function (r) { return r.v; }).map(function (r) { return r.v[c[0]]; });
        ext[c[0]] = [Math.min.apply(null, vs), Math.max.apply(null, vs)];
      });
      function cell(key, v) {
        var t = key === "id" ? eng(v * 1e-6, "A") : key === "gm" ? eng(v * 1e-6, "S") : key === "gain" ? sig(v, 3) : fmt(key, v);
        // the held quantity is the same everywhere: no extremes to mark
        var e = ext[key], flat = key === hold || Math.abs(e[1] - e[0]) <= 1e-6 * Math.max(Math.abs(e[0]), Math.abs(e[1]));
        var m = flat ? "" : v === e[0] ? '<span class="mark mark--lo">min</span>' : v === e[1] ? '<span class="mark">max</span>' : "";
        return '<td class="n">' + t + m + "</td>";
      }
      $("#sz-ptab").innerHTML = '<table class="tbl"><thead><tr><th>Corner</th><th class="n">VDD</th><th class="n">T</th>' + cols.map(function (c) { return '<th class="n">' + c[1] + "</th>"; }).join("") + "</tr></thead><tbody>" +
        rows.map(function (r) {
          var nom = r.k[0] === S.c && r.k[1] === S.s && r.k[2] === S.t;
          return '<tr class="' + (nom ? "is-sel" : "") + '"><td class="mono">' + r.k[0].toUpperCase() + '</td><td class="n">' + volts(vddOf(dev, r.k[1])) + '</td><td class="n">' + (r.k[2] < 0 ? "−" + -r.k[2] : r.k[2]) + " °C</td>" +
            (r.v ? cols.map(function (c) { return cell(c[0], r.v[c[0]]); }).join("") : '<td colspan="7">out of range</td>') + "</tr>";
        }).join("") + "</tbody></table>";
    }, function (e) { $("#sz-ptab").innerHTML = '<p class="warn">Could not load the PVT tables (' + e.message + ").</p>"; });
  }

  /* ── Compare view ─────────────────────────────────────────────── */
  function renderCompare() {
    if (!S.cmp) S.cmp = defaultCompare();
    var box = $("#cmp-rows");
    box.innerHTML = S.cmp.map(function (r, i) {
      var d = devOf(r.pdk, r.dev);
      return '<div class="cmp-row" data-i="' + i + '"><svg class="key" viewBox="0 0 24 3" aria-hidden="true"><rect width="24" height="3" fill="' + cat(i) + '"/></svg>' +
        '<select class="sel" data-k="pdk" aria-label="PDK of series ' + (i + 1) + '">' + ORDER.map(function (p) { return '<option value="' + p + '"' + (p === r.pdk ? " selected" : "") + ">" + NAMES[p] + "</option>"; }).join("") + "</select>" +
        '<select class="sel" data-k="dev" aria-label="Device of series ' + (i + 1) + '">' + devs(r.pdk).map(function (x) { return '<option value="' + x.id + '"' + (x.id === r.dev ? " selected" : "") + ">" + x.id + "</option>"; }).join("") + "</select>" +
        '<select class="sel sel-l" data-k="L" aria-label="Length of series ' + (i + 1) + '">' + d.L.map(function (L) { return '<option value="' + L + '"' + (L === r.L ? " selected" : "") + ">L = " + lstr(L) + " µm</option>"; }).join("") + "</select>" +
        (S.cmp.length > 1 ? '<button type="button" class="linkbtn" data-rm="' + i + '">Remove</button>' : "<span></span>") + "</div>";
    }).join("");
    $("#cmp-add").hidden = S.cmp.length >= 4;
    var f = figOf(S.cfig);
    $("#catgmid").hidden = !f.atL || f.y === "vth";
    $("#cgstar").value = S.cgstar;
    var lx = S.clx != null ? S.clx : logDefault(f.id === "custom" ? FIGS[4] : f, "x"), ly = S.cly != null ? S.cly : logDefault(f.id === "custom" ? FIGS[4] : f, "y");
    if (f.id === "custom") f = FIGS[4];
    $("#clogx").checked = lx; $("#clogy").checked = ly;
    var token = ++renderToken;
    Promise.all(S.cmp.map(function (r) { return load(r.pdk, r.dev, S.c, S.s, S.t); })).then(function (cds) {
      if (token !== renderToken) return;
      var spec = { x: axisFor(f.x, lx), y: axisFor(f.y, ly), series: [], bands: [], refs: [] };
      S.cmp.forEach(function (r, i) {
        var cd = cds[i], li = cd.dev.L.indexOf(r.L), p = f.atL ? vsL(cd, f, S.cgstar) : points(cd, li, f);
        spec.series.push({ name: NAMES[r.pdk] + " " + r.dev + (f.atL ? "" : " L=" + lstr(r.L)), color: cat(i), x: p.x, y: p.y });
      });
      if (!charts.cmp) charts.cmp = GmChart.create($("#cplot"), { label: "Comparison", onHover: function (x, v, pin) { readout("#creadout", charts.cmp, x, v, pin); } });
      charts.cmp.update(spec);
      charts.cmp.mainSpec = spec;
      readout("#creadout", charts.cmp, null, null, false);
      $("#cfigtitle").innerHTML = html(figTitle(f, S.cgstar));
      $("#ccaption").innerHTML = "<b>Fig. 2.</b> " + html(figTitle(f, S.cgstar)) + ", " + S.c.toUpperCase() + ", supply " + { lo: "−10 %", nom: "nominal", hi: "+10 %" }[S.s] + " (each device at its own VDD), " + S.t + " °C. W = 5 µm, V<sub>DS</sub> = VDD/2, V<sub>SB</sub> = 0.";
    }, function (e) { $("#ccaption").textContent = "Could not load the data (" + e.message + ")."; });
    writeHash();
  }

  /* ── Reference view ───────────────────────────────────────────── */
  function renderReference() {
    $$(".ref[data-ref]").forEach(function (a) { a.hidden = a.getAttribute("data-ref") !== S.pdk; });
    var p = man.pdks[S.pdk];
    $("#method-meta").textContent = "Generated " + man.generated + " · " + man.method.simulator + " · " + p.name + " models from " + p.source + " @ " + p.commit.slice(0, 7);
    var art = $('.ref[data-ref="' + S.pdk + '"]');
    sheet(S.pdk).then(function (sh) {
      var c = S.c, rows = devs(S.pdk).map(function (d) {
        var a = sh[d.id][c + "-27"], h = sh[d.id][c + "-125"];
        var ss = a.l1.gmidmax ? 1000 * Math.LN10 / a.l1.gmidmax : NaN;
        return "<tr><td class=\"mono\">" + d.id + "</td><td>" + (d.pol === "n" ? "NMOS" : "PMOS") + ", " + html(d.kind) + '</td><td class="n">' + volts(d.vdd) + '</td><td class="n">' + lstr(d.lmin) + "</td>" +
          '<td class="n">' + a.lmin.vth.toFixed(3) + " / " + a.l1.vth.toFixed(3) + '</td><td class="n">' + eng(a.lmin.ion * 1e-6, "A/µm") + '</td><td class="n">' + eng(a.lmin.ioff * 1e-6, "A/µm") + " / " + eng(h.lmin.ioff * 1e-6, "A/µm") +
          '</td><td class="n">' + a.l1.gmidmax.toFixed(1) + " (" + ss.toFixed(0) + ")</td><td class=\"n\">" + eng(a.lmin.ftpk, "Hz") + '</td><td class="n">' + sig(a.lmin.gain10, 3) + " / " + sig(a.l1.gain10, 3) + "</td></tr>";
      }).join("");
      $("[data-sheet]", art).innerHTML = '<table class="tbl"><caption class="note" style="caption-side:bottom;text-align:left">Corner ' + c.toUpperCase() + " (switch on the left), nominal VDD, 27 °C unless marked; W = 5 µm, V<sub>DS</sub> = VDD/2. I<sub>on</sub> at V<sub>GS</sub> = VDD; I<sub>off</sub> at V<sub>GS</sub> = 0; S is the subthreshold swing in mV/decade. From this site's own simulations.</caption>" +
        '<thead><tr><th>Device</th><th>Type</th><th class="n">VDD</th><th class="n">L<sub>min</sub><br>µm</th><th class="n">V<sub>th</sub> (V)<br>L<sub>min</sub> / 1 µm</th><th class="n">I<sub>on</sub>/W<br>L<sub>min</sub></th><th class="n">I<sub>off</sub>/W at L<sub>min</sub><br>27 / 125 °C</th><th class="n">peak g<sub>m</sub>/I<sub>D</sub> (V<sup>−1</sup>)<br>1 µm (swing mV/dec)</th><th class="n">peak f<sub>T</sub><br>L<sub>min</sub></th><th class="n">g<sub>m</sub>/g<sub>ds</sub> at g<sub>m</sub>/I<sub>D</sub> = 10<br>L<sub>min</sub> / 1 µm</th></tr></thead><tbody>' + rows + "</tbody></table>";
      $$("[data-v]", art).forEach(function (s) {
        var k = s.getAttribute("data-v").split("/"), v = sh[k[0]] && sh[k[0]]["tt-27"][k[1]][k[2]];
        s.textContent = v == null ? "—" : k[2] === "vth" ? v.toFixed(2) + " V" : k[2] === "ion" ? eng(v * 1e-6, "A/µm") : k[2] === "ftpk" ? eng(v, "Hz") : sig(v, 3);
      });
    });
  }

  /* ── PDK identity and the device header ───────────────────────── */
  function brand(pdk) {
    document.body.setAttribute("data-pdk", pdk);
    var m = $("#mast-pdk");
    if (m) m.innerHTML = '<span class="mast__sep"> · </span>' + NAMES[pdk];
  }
  function sheet(pdk) { return sheets[pdk] || (sheets[pdk] = getJSON(DATA + pdk + "/sheet.json?v=" + (man.data_v || man.generated))); }
  function renderDevHead() {
    var dev = devOf(S.pdk, S.dev);
    $("#dh-sym").innerHTML = sym(dev.pol);
    $("#dh-name").textContent = dev.id;
    $("#dh-kind").innerHTML = (dev.pol === "n" ? "NMOS" : "PMOS") + " · " + html(dev.kind) + " · " + html(dev.group) + " · L ≥ " + lstr(dev.lmin) + " µm, " + dev.L.length + " lengths";
    var temp = S.t === 125 ? 125 : 27, pdk = S.pdk, id = S.dev;
    sheet(pdk).then(function (sh) {
      if (S.pdk !== pdk || S.dev !== id) return;
      var a = sh[id][S.c + "-" + temp], d = $$("#dh-strip dd"), sw = a.l1.gmidmax ? 1000 * Math.LN10 / a.l1.gmidmax : NaN;
      var v = [a.lmin.vth.toFixed(3) + " V", a.l1.vth.toFixed(3) + " V", eng(a.lmin.ftpk, "Hz"), a.l1.gain10 ? sig(a.l1.gain10, 3) : "—",
               eng(a.lmin.ion * 1e-6, "A/µm"), eng(a.lmin.ioff * 1e-6, "A/µm"), sw.toFixed(0) + " mV/dec"];
      d.forEach(function (n, i) { n.textContent = v[i]; });
      var note = $("#dh-note");
      if (!note) { note = document.createElement("p"); note.className = "strip-note"; note.id = "dh-note"; $(".devhead").appendChild(note); }
      note.innerHTML = S.c.toUpperCase() + ", nominal VDD, " + temp + " °C" + (S.t === -40 ? " (key figures exist for 27 and 125 °C)" : "") +
        "; V<sub>DS</sub> = VDD/2. I<sub>on</sub> at V<sub>GS</sub> = VDD, I<sub>off</sub> at V<sub>GS</sub> = 0, g<sub>m</sub>/g<sub>ds</sub> at g<sub>m</sub>/I<sub>D</sub> = 10 V<sup>−1</sup>.";
    });
  }

  /* ── views, PDK switch ────────────────────────────────────────── */
  /* lengths must exist for the current device, whatever set them (link, PDK switch) */
  function fixLengths() {
    var dev = devOf(S.pdk, S.dev);
    if (!dev) { setDevice(devs(S.pdk)[0].id); dev = devOf(S.pdk, S.dev); }
    S.Ls = (S.Ls || []).filter(function (L) { return dev.L.indexOf(L) >= 0; });
    if (!S.Ls.length) S.Ls = defaultLs(dev);
    if (dev.L.indexOf(S.l1) < 0) S.l1 = nearest(dev.L, S.l1 || 0.5);
    if (dev.L.indexOf(S.szL) < 0) S.szL = nearest(dev.L, S.szL || 0.5);
  }
  function render() {
    fixLengths();
    renderDevHead();
    $$(".view").forEach(function (b) { var on = b.getAttribute("data-view") === S.view; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    ["curves", "size", "compare", "reference"].forEach(function (v) { $("#v-" + v).hidden = v !== S.view; });
    $$("[data-for]").forEach(function (n) { n.hidden = n.getAttribute("data-for").split(" ").indexOf(S.view) < 0; });
    $$(".dev").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-dev") === S.dev)); });
    $("#devsel").value = S.dev;
    renderPVT();
    if (S.view === "curves") renderCurves();
    else if (S.view === "size") renderSize();
    else if (S.view === "compare") renderCompare();
    else { renderReference(); writeHash(); }
  }
  function setPdk(pdk, push) {
    var prev = S.pdk && S.dev ? devOf(S.pdk, S.dev) : null;
    S.pdk = pdk;
    // keep the kind of device (polarity, core or not) when switching PDK
    var list = devs(pdk), pick = list[0];
    if (prev) pick = list.filter(function (d) { return d.pol === prev.pol; })[0] || pick;
    setDevice(pick.id);
    $$(".pdk").forEach(function (a) { if (a.getAttribute("data-pdk") === pdk) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    document.title = NAMES[pdk] + " gm/ID Explorer: PVT curves, sizing and reference";
    brand(pdk);
    if (push) history.pushState(null, "", ROOT + pdk + "/");
    renderSide();
  }

  /* ── events ───────────────────────────────────────────────────── */
  function on(sel, ev, fn) { var n = $(sel); if (n) n.addEventListener(ev, fn); }
  function bind() {
    $$(".pdk").forEach(function (a) {
      a.addEventListener("click", function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
        e.preventDefault();
        if (a.getAttribute("data-pdk") === S.pdk) return;
        setPdk(a.getAttribute("data-pdk"), true);
        render();
      });
    });
    window.addEventListener("popstate", function () {
      var m = location.pathname.match(/\/gmid\/([^/]+)\//), p = m && man.pdks[m[1]] ? m[1] : ORDER[0];
      if (p !== S.pdk) { setPdk(p, false); render(); }
    });
    on("#devs", "click", function (e) { var b = e.target.closest(".dev"); if (b) { setDevice(b.getAttribute("data-dev")); renderSide(); render(); } });
    on("#devsel", "change", function (e) { setDevice(e.target.value); renderSide(); render(); });
    on("#seg-corner", "click", segHandler(function (v) { S.c = v; }));
    on("#seg-supply", "click", segHandler(function (v) { S.s = v; }));
    on("#seg-temp", "click", segHandler(function (v) { S.t = +v; }));
    on("#seg-mode", "click", segHandler(function (v) { S.mode = v; if (v !== "lengths" && charts.main) charts.main.unpin(); }));
    on("#l1", "change", function (e) { S.l1 = +e.target.value; render(); });
    on("#lens", "click", function (e) {
      var b = e.target.closest(".len"); if (!b) return;
      var L = +b.getAttribute("data-l"), i = S.Ls.indexOf(L);
      if (i >= 0) { if (S.Ls.length > 1) S.Ls.splice(i, 1); } else S.Ls.push(L);
      S.Ls.sort(function (a, b) { return a - b; });
      renderLens(); renderCurves();
    });
    $$("[data-lens]").forEach(function (b) {
      b.addEventListener("click", function () {
        var dev = devOf(S.pdk, S.dev), k = b.getAttribute("data-lens"), n = dev.L.length;
        S.Ls = k === "all" ? dev.L.slice() : k === "few" ? defaultLs(dev) : k === "short" ? dev.L.slice(0, Math.ceil(n / 2)) : dev.L.slice(Math.floor(n / 2));
        renderLens(); renderCurves();
      });
    });
    $$(".view").forEach(function (b) {
      b.addEventListener("click", function () { S.view = b.getAttribute("data-view"); render(); });
      b.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        var all = $$(".view"), i = all.indexOf(b) + (e.key === "ArrowRight" ? 1 : -1);
        var nb = all[(i + all.length) % all.length];
        nb.focus(); nb.click();
      });
    });
    on("#fig", "change", function (e) { S.fig = e.target.value; S.lx = S.ly = null; render(); });
    on("#cx", "change", function (e) { S.cx = e.target.value; S.lx = null; renderCurves(); });
    on("#cy", "change", function (e) { S.cy = e.target.value; S.ly = null; renderCurves(); });
    on("#gstar", "change", function (e) { var v = +e.target.value; if (v > 0) { S.gstar = v; renderCurves(); } });
    on("#logx", "change", function (e) { S.lx = e.target.checked; renderCurves(); });
    on("#logy", "change", function (e) { S.ly = e.target.checked; renderCurves(); });
    on("#ovw", "change", function (e) { S.ovw = e.target.checked; renderCurves(); });
    on("#unzoom", "click", function () { if (charts.main) charts.main.resetZoom(); });
    $$("[data-export]").forEach(function (b) { b.addEventListener("click", function () { exportChart(charts.main, b.getAttribute("data-export"), fileName()); }); });
    $$("[data-cexport]").forEach(function (b) { b.addEventListener("click", function () { exportChart(charts.cmp, b.getAttribute("data-cexport"), "gmid_compare_" + S.cfig); }); });
    on("#share", "click", function () {
      var b = $("#share"), done = function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy link"; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, function () { prompt("Copy this link", location.href); });
      else prompt("Copy this link", location.href);
    });
    // sizing
    on("#sz-l", "change", function (e) { S.szL = +e.target.value; renderSize(); });
    on("#sz-g", "change", function (e) { var v = +e.target.value; if (v > 0) { S.szG = v; renderSize(); } });
    on("#sz-v", "change", function (e) { var v = +e.target.value; if (v > 0) { S.szV[S.szBy] = v; renderSize(); } });
    on("#seg-by", "click", segHandler(function (v) { S.szBy = v; }, renderSize));
    on("#seg-hold", "click", segHandler(function (v) { S.szHold = v; }, renderSize));
    // compare
    on("#cmp-rows", "change", function (e) {
      var row = e.target.closest(".cmp-row"); if (!row) return;
      var r = S.cmp[+row.getAttribute("data-i")], k = e.target.getAttribute("data-k");
      if (k === "pdk") { r.pdk = e.target.value; r.dev = devs(r.pdk)[0].id; r.L = nearest(devOf(r.pdk, r.dev).L, r.L); }
      else if (k === "dev") { r.dev = e.target.value; r.L = nearest(devOf(r.pdk, r.dev).L, r.L); }
      else r.L = +e.target.value;
      renderCompare();
    });
    on("#cmp-rows", "click", function (e) { var b = e.target.closest("[data-rm]"); if (b) { S.cmp.splice(+b.getAttribute("data-rm"), 1); renderCompare(); } });
    on("#cmp-add", "click", function () {
      var used = S.cmp.map(function (r) { return r.pdk; }), p = ORDER.filter(function (x) { return used.indexOf(x) < 0; })[0] || S.pdk;
      var d = devs(p).filter(function (x) { return x.pol === "p"; })[0] || devs(p)[0];
      S.cmp.push({ pdk: p, dev: d.id, L: nearest(d.L, 0.5) });
      renderCompare();
    });
    on("#cfig", "change", function (e) { S.cfig = e.target.value; S.clx = S.cly = null; renderCompare(); });
    on("#cgstar", "change", function (e) { var v = +e.target.value; if (v > 0) { S.cgstar = v; renderCompare(); } });
    on("#clogx", "change", function (e) { S.clx = e.target.checked; renderCompare(); });
    on("#clogy", "change", function (e) { S.cly = e.target.checked; renderCompare(); });
    document.addEventListener("gm-theme", function () {
      renderLens();
      render();
      if (charts.mini) charts.mini.forEach(function (c) { c.redraw(); });
    });
  }
  function segHandler(set, after) {
    return function (e) {
      var b = e.target.closest("button[data-v]"); if (!b) return;
      set(b.getAttribute("data-v"));
      if (after) { seg("#" + e.currentTarget.id, b.getAttribute("data-v")); after(); } else render();
    };
  }
  function fileName() { return [S.pdk, S.dev, S.fig, S.mode === "lengths" ? S.c + "_" + S.s + "_" + ttag(S.t) : S.mode + "_L" + lstr(S.l1)].join("_").replace(/\./g, "p"); }
  function exportChart(chart, kind, name) {
    if (!chart || !chart.mainSpec) return;
    if (kind !== "csv") { GmChart.download(chart, kind, name); return; }
    var sp = chart.mainSpec, xq = sp.x.label.replace(/[_^{}]/g, ""), yq = sp.y.label.replace(/[_^{}]/g, "");
    var lines = ["series,\"" + xq + (sp.x.unit ? " (" + sp.x.unit.replace(/[_^{}]/g, "") + ")" : "") + "\",\"" + yq + (sp.y.unit ? " (" + sp.y.unit.replace(/[_^{}]/g, "") + ")" : "") + "\""];
    sp.series.forEach(function (s) { for (var i = 0; i < s.x.length; i++) if (isFinite(s.x[i]) && isFinite(s.y[i])) lines.push("\"" + (s.name || "pvt") + "\"," + (+s.x[i].toPrecision(6)) + "," + (+s.y[i].toPrecision(6))); });
    sp.bands.forEach(function (b) { for (var i = 0; i < b.x.length; i++) if (isFinite(b.lo[i])) lines.push("\"PVT min\"," + (+b.x[i].toPrecision(6)) + "," + (+b.lo[i].toPrecision(6)) + "\n\"PVT max\"," + (+b.x[i].toPrecision(6)) + "," + (+b.hi[i].toPrecision(6))); });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/csv" }));
    a.download = name + ".csv";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  /* ── start ────────────────────────────────────────────────────── */
  function start() {
    getJSON(DATA + "manifest.json?v=" + (document.body.getAttribute("data-v") || "1")).then(function (m) {
      man = m;
      var path = location.pathname.match(/\/gmid\/([^/]+)\//);
      var pdk = path && man.pdks[path[1]] ? path[1] : (S.pdk && man.pdks[S.pdk] ? S.pdk : null);
      if (!pdk) { try { pdk = localStorage.getItem("gmid-pdk"); } catch (e) {} }
      if (!pdk || !man.pdks[pdk]) pdk = ORDER[0];
      S.pdk = pdk;
      setDevice(devs(pdk)[0].id);
      applyHash(readHash());
      if (!S.cmp) S.cmp = defaultCompare();
      figOptions($("#fig"), S.fig);
      figOptions($("#cfig"), S.cfig);
      var axisOpts = Object.keys(Q).filter(function (k) { return k !== "L" && k !== "vth"; });
      $("#cx").innerHTML = axisOpts.map(function (k) { return '<option value="' + k + '"' + (k === S.cx ? " selected" : "") + ">" + plain(Q[k].l) + "</option>"; }).join("");
      $("#cy").innerHTML = axisOpts.map(function (k) { return '<option value="' + k + '"' + (k === S.cy ? " selected" : "") + ">" + plain(Q[k].l) + "</option>"; }).join("");
      $$(".pdk").forEach(function (a) { if (a.getAttribute("data-pdk") === pdk) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
      brand(pdk);
      if (!location.pathname.match(/\/gmid\/[^/]+\//)) history.replaceState(null, "", ROOT + pdk + "/" + location.hash);
      renderSide();
      bind();
      render();
      $("#foot-data").textContent = "Data generated " + man.generated + " with " + man.method.simulator;
    }, function (e) {
      $("#status").textContent = "Could not load the device list (" + e.message + "). Check the connection and reload.";
    });
    window.addEventListener("pagehide", function () { try { localStorage.setItem("gmid-pdk", S.pdk); } catch (e) {} });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
