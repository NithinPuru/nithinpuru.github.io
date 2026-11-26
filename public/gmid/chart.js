/* gm/ID Explorer - a small SVG line-chart component (no dependencies).
 *
 *   var c = GmChart.create(host, { compact, label, onHover(x, values, pinned), onPin(x), onZoom(on) });
 *   c.update(spec[, keepZoom])
 *     spec   = { x: axis, y: axis, series: [...], bands: [...], refs: [...] }
 *     axis   = { label: "g_m/I_D", unit: "V^{-1}", log: false, min, max, zero, fmt(v) -> "12.3 V⁻¹" }
 *     series = { name, color, width, dash, x: [], y: [] }    (non-finite value = gap)
 *     bands  = { x: [], lo: [], hi: [], color, opacity, name, lines }   (filled envelope; lines: its curves, optional, for an exact range in the card)
 *     refs   = { axis: "x" | "y", value, label }              (dashed reference line)
 *   GmChart.download(c, "svg" | "png", filename)
 *
 * Hovering, tapping or arrow keys show a cursor: a dot on every curve, the x value as a tag on the
 * x axis and a card beside the cursor with every curve's value (top curve first) and the band's range.
 *
 * Labels use a small markup: "_x" / "_{xy}" subscript, "^x" / "^{-1}" superscript.
 * Chrome colours come from the page's CSS custom properties (--paper, --ink-2,
 * --ink-3, --rule, --rule-strong, --accent, --font-serif, --font-mono). */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  /* "g_m/I_D (V^{-1})" -> tspans; dy shifts work in every browser (baseline-shift does not) */
  function segments(text) {
    var out = [], re = /([_^])(\{[^}]*\}|.)/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ t: text.slice(last, m.index), k: 0 });
      out.push({ t: m[2].charAt(0) === "{" ? m[2].slice(1, -1) : m[2], k: m[1] === "^" ? 1 : -1 });
      last = re.lastIndex;
    }
    if (last < text.length) out.push({ t: text.slice(last), k: 0 });
    return out;
  }
  function richText(parent, text, size) {
    var off = 0;
    segments(text).forEach(function (s) {
      var target = s.k > 0 ? -0.42 * size : s.k < 0 ? 0.26 * size : 0;
      var t = el("tspan", { dy: (target - off).toFixed(2), "font-size": s.k ? Math.round(size * 0.72) : null }, parent);
      t.textContent = s.t;
      off = target;
    });
  }
  function plainLength(text) { return segments(text).reduce(function (n, s) { return n + s.t.length * (s.k ? 0.72 : 1); }, 0); }

  /* ── scales and ticks ───────────────────────────────────────────── */
  function niceStep(span, n) {
    var raw = span / Math.max(n, 1), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10) * p;
  }
  function linTicks(lo, hi, n) {
    var s = niceStep(hi - lo, n), out = [];
    for (var v = Math.ceil(lo / s - 1e-9) * s; v <= hi + s * 1e-9; v += s) out.push({ v: Math.abs(v) < s * 1e-9 ? 0 : v, major: true, label: true });
    return { ticks: out, step: s };
  }
  function logTicks(lo, hi, n) {
    var a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi)), dec = b - a, out = [];
    var every = Math.max(1, Math.ceil(dec / Math.max(n, 2)));
    // decades inside the range: with fewer than two, also label the 2x and 5x ticks
    var inside = 0;
    for (var d = a; d <= b; d++) { var p = Math.pow(10, d); if (p >= lo * (1 - 1e-9) && p <= hi * (1 + 1e-9)) inside++; }
    for (var e = a; e <= b; e++) for (var m = 1; m <= 9; m++) {
      var v = m * Math.pow(10, e);
      if (v < lo * (1 - 1e-9) || v > hi * (1 + 1e-9)) continue;
      var major = m === 1 && (e - a) % every === 0;
      out.push({ v: v, major: major, label: major || ((dec <= 1 || inside < 2) && (m === 2 || m === 5)) });
    }
    return { ticks: out };
  }
  function fmtTick(v, step) {
    if (v === 0) return "0";
    var a = Math.abs(v);
    if (a >= 1e-3 && a < 1e5) {
      if (step != null) {
        var d = 0;   // as many decimals as the step needs (2.5 -> 1, 0.25 -> 2)
        while (d < 6 && Math.abs(Math.round(step * Math.pow(10, d)) - step * Math.pow(10, d)) > 1e-6) d++;
        return v.toFixed(d).replace("-", "−");
      }
      return String(+v.toPrecision(3)).replace("-", "−");
    }
    var e = Math.floor(Math.log10(a) + 1e-9), m = +(v / Math.pow(10, e)).toPrecision(3);
    return (m === 1 ? "" : m === -1 ? "−" : String(m).replace("-", "−") + "×") + "10^{" + (e < 0 ? "−" + -e : e) + "}";
  }

  function extent(spec) {
    var xs = [Infinity, -Infinity], ys = [Infinity, -Infinity];
    function eat(arr, r, log) {
      for (var i = 0; i < arr.length; i++) {
        var v = arr[i];
        if (!isFinite(v) || (log && v <= 0)) continue;
        if (v < r[0]) r[0] = v;
        if (v > r[1]) r[1] = v;
      }
    }
    (spec.series || []).forEach(function (s) { eat(s.x, xs, spec.x.log); eat(s.y, ys, spec.y.log); });
    (spec.bands || []).forEach(function (b) { eat(b.x, xs, spec.x.log); eat(b.lo, ys, spec.y.log); eat(b.hi, ys, spec.y.log); });
    return { x: xs, y: ys };
  }
  function pad(r, log, frac) {
    if (!isFinite(r[0]) || !isFinite(r[1])) return log ? [1, 10] : [0, 1];
    if (r[0] === r[1]) return log ? [r[0] / 2, r[1] * 2] : [r[0] - 1, r[1] + 1];
    if (log) {
      var a = Math.log10(r[0]), b = Math.log10(r[1]), p = (b - a) * frac;
      return [Math.pow(10, a - p), Math.pow(10, b + p)];
    }
    var q = (r[1] - r[0]) * frac;
    return [r[0] - q, r[1] + q];
  }

  /* ── chart ──────────────────────────────────────────────────────── */
  function create(host, opts) {
    opts = opts || {};
    var compact = !!opts.compact;
    var svg = el("svg", { class: "gm-svg", role: "img", "aria-label": opts.label || "Chart" }, host);
    var spec = null, zoom = null, pinned = null, size = { w: 0, h: 0 }, geo = null, raf = 0;
    var gHover = null, hit = null, drag = null, pinY = null, lastAt = null;   // pinY: tap height as a fraction of the plot; lastAt: where the pinned card sits
    // on-chart readout beside the cursor (the table under the figure stays the accessible copy)
    var tip = document.createElement("div");
    tip.className = "gm-tip" + (compact ? " gm-tip--compact" : "");
    tip.setAttribute("aria-hidden", "true");
    tip.hidden = true;
    host.appendChild(tip);

    function draw() {
      raf = 0;
      if (!spec || !host.isConnected) return;
      var r = host.getBoundingClientRect();
      if (r.width < 10) return;
      size.w = Math.floor(r.width);
      size.h = Math.max(compact ? 150 : 220, Math.floor(r.height));
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.setAttribute("width", size.w);
      svg.setAttribute("height", size.h);
      svg.setAttribute("viewBox", "0 0 " + size.w + " " + size.h);

      var fs = compact ? 10.5 : 12, fsT = compact ? 11.5 : 14;
      var ink2 = css("--ink-2"), ink3 = css("--ink-3"), rule = css("--rule"), rule2 = css("--rule-strong");
      var serif = css("--font-serif") || "serif", mono = css("--font-mono") || "monospace";

      var ex = extent(spec);
      var xr = zoom ? zoom.x : pad([spec.x.min != null ? spec.x.min : ex.x[0], spec.x.max != null ? spec.x.max : ex.x[1]], spec.x.log, 0.02);
      var yr = zoom ? zoom.y : pad([spec.y.min != null ? spec.y.min : ex.y[0], spec.y.max != null ? spec.y.max : ex.y[1]], spec.y.log, 0.05);
      if (!zoom && spec.y.zero && !spec.y.log && yr[0] > 0 && yr[0] < (yr[1] - yr[0]) * 0.8) yr[0] = 0;

      var ny = Math.max(3, Math.round((size.h - 70) / (compact ? 34 : 48)));
      var nx = Math.max(3, Math.round((size.w - 90) / (compact ? 64 : 90)));
      var yt = spec.y.log ? logTicks(yr[0], yr[1], ny) : linTicks(yr[0], yr[1], ny);
      var xt = spec.x.log ? logTicks(xr[0], xr[1], nx) : linTicks(xr[0], xr[1], nx);
      var ylab = function (t) { return fmtTick(t.v, spec.y.log ? null : yt.step); };
      var maxc = yt.ticks.reduce(function (m, t) { return t.label ? Math.max(m, plainLength(ylab(t))) : m; }, 1);
      var L = Math.round((compact ? 24 : 32) + maxc * fs * 0.62), R = compact ? 10 : 18, T = compact ? 8 : 14, B = compact ? 40 : 50;
      var W = Math.max(40, size.w - L - R), H = Math.max(40, size.h - T - B);
      var lx0 = spec.x.log ? Math.log10(xr[0]) : xr[0], lx1 = spec.x.log ? Math.log10(xr[1]) : xr[1];
      var ly0 = spec.y.log ? Math.log10(yr[0]) : yr[0], ly1 = spec.y.log ? Math.log10(yr[1]) : yr[1];
      var tx = function (v) { return L + ((spec.x.log ? Math.log10(v) : v) - lx0) / (lx1 - lx0) * W; };
      var ty = function (v) { return T + H - ((spec.y.log ? Math.log10(v) : v) - ly0) / (ly1 - ly0) * H; };
      var ix = function (p) { var u = lx0 + (p - L) / W * (lx1 - lx0); return spec.x.log ? Math.pow(10, u) : u; };
      var iy = function (p) { var u = ly0 + (T + H - p) / H * (ly1 - ly0); return spec.y.log ? Math.pow(10, u) : u; };
      geo = { L: L, T: T, W: W, H: H, xr: xr, yr: yr, tx: tx, ty: ty, ix: ix, iy: iy };

      var root = el("g", { "font-family": mono, "font-size": fs, fill: ink3 }, svg);
      var clipId = "gmc" + Math.random().toString(36).slice(2, 9);
      el("rect", { x: L, y: T, width: W, height: H }, el("clipPath", { id: clipId }, el("defs", null, root)));

      var plotBg = css("--plot");
      if (plotBg) el("rect", { x: L, y: T, width: W, height: H, fill: plotBg }, root);
      var grid = el("g", { stroke: rule, "stroke-width": 1, "shape-rendering": "crispEdges" }, root);
      yt.ticks.forEach(function (t) {
        var y = Math.round(ty(t.v)) + 0.5;
        if (y < T - 0.5 || y > T + H + 0.5) return;
        if (t.major) el("line", { x1: L, x2: L + W, y1: y, y2: y }, grid);
        el("line", { x1: L - (t.major ? 5 : 3), x2: L, y1: y, y2: y, stroke: rule2 }, grid);
        if (t.label) richText(el("text", { x: L - 8, y: y + fs * 0.35, "text-anchor": "end" }, root), ylab(t), fs);
      });
      xt.ticks.forEach(function (t) {
        var x = Math.round(tx(t.v)) + 0.5;
        if (x < L - 0.5 || x > L + W + 0.5) return;
        if (t.major) el("line", { x1: x, x2: x, y1: T, y2: T + H }, grid);
        el("line", { x1: x, x2: x, y1: T + H, y2: T + H + (t.major ? 5 : 3), stroke: rule2 }, grid);
        if (t.label) richText(el("text", { x: x, y: T + H + fs + 8, "text-anchor": "middle" }, root), fmtTick(t.v, spec.x.log ? null : xt.step), fs);
      });
      el("rect", { x: L + 0.5, y: T + 0.5, width: W - 1, height: H - 1, fill: "none", stroke: rule2, "shape-rendering": "crispEdges" }, root);

      richText(el("text", { x: L + W / 2, y: size.h - (compact ? 7 : 10), "text-anchor": "middle", "font-family": serif, "font-size": fsT, fill: ink2 }, root),
               spec.x.label + (spec.x.unit ? " (" + spec.x.unit + ")" : ""), fsT);
      richText(el("text", { transform: "translate(" + (compact ? 12 : 15) + "," + (T + H / 2) + ") rotate(-90)", "text-anchor": "middle", "font-family": serif, "font-size": fsT, fill: ink2 }, root),
               spec.y.label + (spec.y.unit ? " (" + spec.y.unit + ")" : ""), fsT);

      var plot = el("g", { "clip-path": "url(#" + clipId + ")" }, root);
      (spec.bands || []).forEach(function (b) {
        var top = [], bot = [];
        for (var i = 0; i < b.x.length; i++) {
          if (!isFinite(b.x[i]) || !isFinite(b.lo[i]) || !isFinite(b.hi[i])) continue;
          if ((spec.y.log && b.lo[i] <= 0) || (spec.x.log && b.x[i] <= 0)) continue;
          top.push(tx(b.x[i]).toFixed(1) + "," + ty(b.hi[i]).toFixed(1));
          bot.push(tx(b.x[i]).toFixed(1) + "," + ty(b.lo[i]).toFixed(1));
        }
        if (top.length > 1) el("path", { d: "M" + top.join("L") + "L" + bot.reverse().join("L") + "Z", fill: b.color, "fill-opacity": b.opacity || 0.12 }, plot);
      });
      (spec.refs || []).forEach(function (r) {
        var isX = r.axis === "x", rng = isX ? xr : yr;
        if (r.value <= Math.min(rng[0], rng[1]) || r.value >= Math.max(rng[0], rng[1])) return;
        var p = isX ? tx(r.value) : ty(r.value);
        el("line", isX ? { x1: p, x2: p, y1: T, y2: T + H } : { x1: L, x2: L + W, y1: p, y2: p }, plot)
          .setAttribute("style", "stroke:" + ink3 + ";stroke-width:1;stroke-dasharray:5 4");
        if (r.label) richText(el("text", isX ? { x: p + 5, y: T + fs + 3 } : { x: L + W - 5, y: p - 5, "text-anchor": "end" }, plot), r.label, fs);
      });
      var pts = [];
      (spec.series || []).forEach(function (s) {
        var d = "", pen = false, X0 = 0, Y0 = 0;
        for (var i = 0; i < s.x.length; i++) {
          var xv = s.x[i], yv = s.y[i];
          if (!isFinite(xv) || !isFinite(yv) || (spec.x.log && xv <= 0) || (spec.y.log && yv <= 0)) { pen = false; continue; }
          var X = tx(xv), Y = ty(yv);
          d += (pen ? "L" : "M") + X.toFixed(1) + "," + Y.toFixed(1);
          var n = pen ? Math.min(60, Math.ceil(Math.hypot(X - X0, Y - Y0) / 6)) : 1;
          for (var j = 1; j <= n; j++) {
            var qx = X0 + (X - X0) * j / n, qy = Y0 + (Y - Y0) * j / n;
            if (!pen) { qx = X; qy = Y; }
            if (qx >= L && qx <= L + W && qy >= T && qy <= T + H) pts.push(qx, qy);
          }
          X0 = X; Y0 = Y;
          pen = true;
        }
        if (d) el("path", { d: d, fill: "none", stroke: s.color, "stroke-width": s.width || (compact ? 1.6 : 2.25),
                            "stroke-dasharray": s.dash || null, "stroke-linejoin": "round", "stroke-linecap": "round" }, plot);
      });
      geo.pts = pts;
      gHover = el("g", { class: "gm-hover", "pointer-events": "none" }, root);
      hit = el("rect", { x: L, y: T, width: W, height: H, fill: "transparent", class: "gm-hit" }, root);
      bind();
      if (pinned != null) show(pinned, true);
    }

    /* value of a curve at data x (linear, or log-linear on a log y axis); null where the curve does not reach */
    function interp(s, xv) {
      for (var i = 0; i < s.x.length - 1; i++) {
        var a = s.x[i], b = s.x[i + 1], ya = s.y[i], yb = s.y[i + 1];
        if (!isFinite(a) || !isFinite(b) || !isFinite(ya) || !isFinite(yb) || a === b) continue;
        if ((xv - a) * (xv - b) > 0) continue;
        var f = (xv - a) / (b - a);
        var y = spec.y.log && ya > 0 && yb > 0 ? Math.pow(10, Math.log10(ya) + f * (Math.log10(yb) - Math.log10(ya))) : ya + f * (yb - ya);
        return { x: xv, y: y, i: i + f };
      }
      return null;
    }
    function valuesAt(xv) { return (spec.series || []).map(function (s) { return interp(s, xv); }); }

    function show(xv, isPin, py) {
      if (!gHover) return;
      while (gHover.firstChild) gHover.removeChild(gHover.firstChild);
      if (xv == null || !geo || xv < Math.min(geo.xr[0], geo.xr[1]) || xv > Math.max(geo.xr[0], geo.xr[1])) { tip.hidden = true; return; }
      if (isPin && py == null && pinY != null) py = geo.T + pinY * geo.H;
      var px = geo.tx(xv), vals = valuesAt(xv), paper = css("--paper");
      el("line", { x1: px, x2: px, y1: geo.T, y2: geo.T + geo.H, stroke: css("--ink-3"), "stroke-width": 1, "stroke-dasharray": isPin ? null : "2 3" }, gHover);
      vals.forEach(function (v, k) {
        if (!v || !isFinite(v.y) || v.y < Math.min(geo.yr[0], geo.yr[1]) || v.y > Math.max(geo.yr[0], geo.yr[1])) return;
        el("circle", { cx: px.toFixed(1), cy: geo.ty(v.y).toFixed(1), r: 4, fill: spec.series[k].color, stroke: paper, "stroke-width": 2 }, gHover);
      });
      // the cursor's x value as a tag on the x axis, over the tick labels
      var fsTag = compact ? 10.5 : 12, tag = el("g", null, gHover), box = el("rect", { y: geo.T + geo.H + 2, height: fsTag + 9, fill: css("--ink") }, tag);
      var txt = el("text", { y: geo.T + geo.H + 2 + fsTag + 2.5, "text-anchor": "middle", fill: paper, "font-family": css("--font-mono") || "monospace", "font-size": fsTag }, tag);
      txt.textContent = (spec.x.fmt || dflt)(xv);
      var tw = (txt.getComputedTextLength ? txt.getComputedTextLength() : txt.textContent.length * fsTag * 0.55) + 14;
      var tx0 = Math.max(geo.L, Math.min(px - tw / 2, geo.L + geo.W - tw));
      box.setAttribute("x", tx0.toFixed(1)); box.setAttribute("width", tw.toFixed(1));
      txt.setAttribute("x", (tx0 + tw / 2).toFixed(1));
      renderTip(xv, vals, px, py, !!isPin);
      if (opts.onHover) opts.onHover(xv, vals, !!isPin);
    }

    function dflt(v) { return isFinite(v) ? String(+v.toPrecision(4)) : "—"; }
    /* min and max of a band (the PVT spread) at x */
    function bandAt(b, x) {
      if (b.lines) {
        var lo = Infinity, hi = -Infinity;
        b.lines.forEach(function (l) { var v = interp(l, x); if (v && isFinite(v.y)) { lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); } });
        return isFinite(lo) ? { lo: lo, hi: hi } : null;
      }
      for (var i = 0; i < b.x.length - 1; i++) {
        var a = b.x[i], c = b.x[i + 1];
        if (!isFinite(a) || !isFinite(c) || a === c || (x - a) * (x - c) > 0) continue;
        if (!isFinite(b.lo[i]) || !isFinite(b.lo[i + 1]) || !isFinite(b.hi[i]) || !isFinite(b.hi[i + 1])) return null;
        var f = (x - a) / (c - a);
        return { lo: b.lo[i] + f * (b.lo[i + 1] - b.lo[i]), hi: b.hi[i] + f * (b.hi[i + 1] - b.hi[i]) };
      }
      return null;
    }
    /* "1.52 µA/µm", "5.48 µA/µm" -> "1.52 to 5.48 µA/µm" (the unit once when both share it) */
    function range(a, b) {
      var i = a.search(/\s/), j = b.search(/\s/);   // the formats put a thin space before the unit
      return i > 0 && j > 0 && a.slice(i) === b.slice(j) ? a.slice(0, i) + " to " + b : a + " to " + b;
    }
    /* one row of the card: colour key (line or band swatch), name, value; text nodes only */
    function tipRow(color, dash, name, value, band) {
      var r = document.createElement("div"), k = el("svg", { viewBox: "0 0 22 8", class: "gm-tip__k", "aria-hidden": "true" });
      var n = document.createElement("span"), v = document.createElement("span");
      if (band) el("rect", { width: 22, height: 8, fill: color, "fill-opacity": band.opacity || 0.12 }, k);
      else el("line", { x1: 1, y1: 4, x2: 21, y2: 4, stroke: color, "stroke-width": 2.4, "stroke-dasharray": dash || null }, k);
      r.className = "gm-tip__r" + (band ? " gm-tip__r--band" : "");
      n.className = "gm-tip__n"; n.textContent = name;
      v.className = "gm-tip__v"; v.textContent = value;
      r.appendChild(k); r.appendChild(n); r.appendChild(v);
      return r;
    }
    /* the card beside the cursor: x value, then every curve top to bottom with its value, and the band's range */
    function renderTip(xv, vals, px, py, isPin) {
      var yf = spec.y.fmt || dflt, rows = [];
      (spec.series || []).forEach(function (s, k) { var v = vals[k]; if (s.name && v && isFinite(v.y)) rows.push({ s: s, y: v.y }); });
      var band = (spec.bands || [])[0], br = band ? bandAt(band, xv) : null;
      if (!rows.length && !br) { tip.hidden = true; return; }
      rows.sort(function (a, b) { return b.y - a.y; });   // same order as the curves on the figure
      while (tip.firstChild) tip.removeChild(tip.firstChild);
      var head = document.createElement("div"), hx = document.createElement("span");
      head.className = "gm-tip__x";
      segments(spec.x.label).forEach(function (sg) {
        var node = document.createElement(sg.k > 0 ? "sup" : sg.k < 0 ? "sub" : "span");
        node.textContent = sg.t;
        hx.appendChild(node);
      });
      hx.appendChild(document.createTextNode(" = " + (spec.x.fmt || dflt)(xv)));
      head.appendChild(hx);
      if (isPin) { var pin = document.createElement("span"); pin.className = "gm-tip__pin"; pin.textContent = "pinned"; head.appendChild(pin); }
      tip.appendChild(head);
      if (br) tip.appendChild(tipRow(band.color, null, band.name || "range", range(yf(br.lo), yf(br.hi)), band));
      var nodes = rows.map(function (r) { return tip.appendChild(tipRow(r.s.color, r.s.dash, r.s.name, yf(r.y))); });
      tip.hidden = false;
      // a card taller than the plot drops its lowest rows (the table under the figure keeps them all)
      var more = null, cut = 0;
      while (nodes.length > 1 && tip.offsetHeight > geo.H - 4) {
        tip.removeChild(nodes.pop());
        cut++;
        if (!more) { more = document.createElement("div"); more.className = "gm-tip__more"; tip.appendChild(more); }
        more.textContent = "+ " + cut + " more" + (compact ? "" : " in the table below");
      }
      var at = place(px, py, tip.offsetWidth, tip.offsetHeight, isPin, vals);
      tip.style.left = Math.round(at.x) + "px";
      tip.style.top = Math.round(at.y) + "px";
    }
    /* where the card goes. Following the mouse: beside the cursor at the pointer's height, flipped near the
       right edge. Pinned (click, tap, arrow keys): of the places beside the cursor (at the tap's height, top,
       bottom; right, left) the one that hides the fewest curve points and none of the marked points; it stays
       put while the cursor moves unless another place is clearly better. */
    function place(px, py, w, h, isPin, vals) {
      var gap = compact ? 10 : 16, xmax = geo.L + geo.W - w - 2;
      function cx(x) { return Math.max(0, Math.max(Math.min(x, xmax), Math.min(geo.L + 2, xmax))); }
      function cy(y) { return Math.max(geo.T + 2, Math.min(y, geo.T + geo.H - h - 2)); }
      if (!isPin) {
        lastAt = null;
        var x = px + gap;
        if (x + w > geo.L + geo.W) x = px - gap - w;
        return { x: cx(x), y: cy(py != null ? py - h / 2 : geo.T + 6) };
      }
      var dots = [];
      vals.forEach(function (v) { if (v && isFinite(v.y)) dots.push(geo.ty(v.y)); });
      var best = null, keep = null;
      [["r", px + gap], ["l", px - gap - w]].forEach(function (sx) {
        [["p", py != null ? py - h / 2 : null], ["t", geo.T + 6], ["b", geo.T + geo.H - h - 6]].forEach(function (sy, k) {
          if (sy[1] == null) return;
          var x = cx(sx[1]), y = cy(sy[1]), n = 0, i;
          for (i = 0; i < geo.pts.length; i += 2) {
            var qx = geo.pts[i], qy = geo.pts[i + 1];
            if (qx > x - 3 && qx < x + w + 3 && qy > y - 3 && qy < y + h + 3) n++;
          }
          if (px > x - 8 && px < x + w + 8) dots.forEach(function (dy) { if (dy > y - 8 && dy < y + h + 8) n += 1000; });
          var c = { key: sx[0] + sy[0], x: x, y: y, score: n + k * 0.5 };
          if (!best || c.score < best.score) best = c;
          if (lastAt && c.key === lastAt) keep = c;
        });
      });
      if (keep && keep.score <= best.score + Math.max(12, best.score * 0.25)) best = keep;
      lastAt = best.key;
      return best;
    }

    function point(e) {
      var b = svg.getBoundingClientRect();
      return { x: Math.min(geo.L + geo.W, Math.max(geo.L, e.clientX - b.left)), y: Math.min(geo.T + geo.H, Math.max(geo.T, e.clientY - b.top)) };
    }
    function bind() {
      hit.addEventListener("pointerdown", function (e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        var p = point(e);
        drag = { x0: p.x, y0: p.y, box: null, mouse: e.pointerType === "mouse" };
        if (drag.mouse) hit.setPointerCapture(e.pointerId);
      });
      hit.addEventListener("pointermove", function (e) {
        var p = point(e);
        if (drag && drag.mouse && (Math.abs(p.x - drag.x0) > 4 || Math.abs(p.y - drag.y0) > 4)) {
          if (!drag.box) { drag.box = el("rect", { fill: css("--accent"), "fill-opacity": 0.08, stroke: css("--accent"), "stroke-width": 1 }, gHover); tip.hidden = true; }
          drag.box.setAttribute("x", Math.min(p.x, drag.x0)); drag.box.setAttribute("y", Math.min(p.y, drag.y0));
          drag.box.setAttribute("width", Math.abs(p.x - drag.x0)); drag.box.setAttribute("height", Math.abs(p.y - drag.y0));
          return;
        }
        if (e.pointerType === "mouse") show(geo.ix(p.x), false, p.y);
      });
      hit.addEventListener("pointerup", function (e) {
        var p = point(e), d = drag;
        drag = null;
        if (!d) return;
        if (d.box && Math.abs(p.x - d.x0) > 6 && Math.abs(p.y - d.y0) > 6) {
          zoom = { x: [geo.ix(Math.min(p.x, d.x0)), geo.ix(Math.max(p.x, d.x0))], y: [geo.iy(Math.max(p.y, d.y0)), geo.iy(Math.min(p.y, d.y0))] };
          if (opts.onZoom) opts.onZoom(true);
          schedule();
          return;
        }
        if (d.box) { show(null); return; }
        // a click or tap pins the cursor; clicking the pinned cursor again releases it
        var xv = geo.ix(p.x);
        pinned = pinned != null && Math.abs(geo.tx(pinned) - p.x) < (d.mouse ? 6 : 14) ? null : xv;   // a finger needs a wider target
        pinY = pinned != null ? (p.y - geo.T) / geo.H : null;
        if (pinned == null && !d.mouse) show(null);   // a second tap on a phone releases the cursor and the card
        else show(pinned != null ? pinned : xv, pinned != null, p.y);
        if (opts.onPin) opts.onPin(pinned);
      });
      hit.addEventListener("pointerleave", function () {
        if (drag && drag.mouse) return;
        if (pinned != null) show(pinned, true);
        else { show(null); if (opts.onHover) opts.onHover(null, null, false); }
      });
      hit.addEventListener("dblclick", reset);
    }
    function reset() {
      if (!zoom) return;
      zoom = null;
      if (opts.onZoom) opts.onZoom(false);
      schedule();
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(draw); }

    var ro = new ResizeObserver(schedule);
    ro.observe(host);

    /* keyboard: arrows move a pinned cursor (shift = larger steps), Escape releases it */
    if (!host.hasAttribute("tabindex")) host.tabIndex = 0;
    host.addEventListener("keydown", function (e) {
      if (!geo || !spec) return;
      var k = e.key, span = geo.W;
      if (k === "Escape") { pinned = null; pinY = null; show(null); if (opts.onHover) opts.onHover(null, null, false); if (opts.onPin) opts.onPin(null); return; }
      if (k !== "ArrowLeft" && k !== "ArrowRight" && k !== "Home" && k !== "End") return;
      e.preventDefault();
      var px = pinned != null ? geo.tx(pinned) : geo.L + span / 2;
      if (k === "Home") px = geo.L; else if (k === "End") px = geo.L + span;
      else px += (k === "ArrowRight" ? 1 : -1) * span * (e.shiftKey ? 0.1 : 0.01);
      pinned = geo.ix(Math.min(geo.L + span, Math.max(geo.L, px)));
      show(pinned, true);
      if (opts.onPin) opts.onPin(pinned);
    });

    /* standalone SVG: resolved colours, background, an in-figure legend, embedded fonts */
    function svgString(fonts) {
      var c = svg.cloneNode(true);
      c.setAttribute("xmlns", NS);
      ["g.gm-hover", "rect.gm-hit"].forEach(function (q) { var n = c.querySelector(q); if (n) n.parentNode.removeChild(n); });
      var bg = el("rect", { width: "100%", height: "100%", fill: css("--paper") });
      c.insertBefore(bg, c.firstChild);
      if (spec.series.length > 1 && geo) {
        var items = spec.series.slice(0, 16), lh = 16, w = 0;
        items.forEach(function (s) { w = Math.max(w, s.name.length * 7 + 40); });
        var g = el("g", { "font-family": css("--font-mono"), "font-size": 11, fill: css("--ink-2") }, c);
        var x0 = geo.L + geo.W - w - 8, y0 = geo.T + 8;
        el("rect", { x: x0, y: y0, width: w, height: items.length * lh + 8, fill: css("--paper"), "fill-opacity": 0.94, stroke: css("--rule-strong") }, g);
        items.forEach(function (s, i) {
          var y = y0 + 4 + i * lh + lh / 2;
          el("line", { x1: x0 + 8, x2: x0 + 28, y1: y, y2: y, stroke: s.color, "stroke-width": 2, "stroke-dasharray": s.dash || null }, g);
          el("text", { x: x0 + 34, y: y + 4 }, g).textContent = s.name;
        });
      }
      if (fonts) c.insertBefore(el("style"), c.firstChild).textContent = fonts;
      return new XMLSerializer().serializeToString(c);
    }

    return {
      update: function (s, keepZoom) { spec = s; if (!keepZoom) zoom = null; schedule(); },
      redraw: schedule,
      resetZoom: reset,
      zoomed: function () { return !!zoom; },
      unpin: function () { pinned = null; pinY = null; show(null); },
      pin: function (x) { pinned = x; show(x, x != null); },
      valuesAt: function (x) { return spec ? valuesAt(x) : []; },
      svgString: svgString,
      size: function () { return { w: size.w, h: size.h }; },
      destroy: function () { ro.disconnect(); [svg, tip].forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); }); }
    };
  }

  /* fonts for exported figures, embedded on the first export */
  var fontCss = null;
  function fonts() {
    if (fontCss != null) return Promise.resolve(fontCss);
    var files = [["KaTeX_Main", "/fonts/KaTeX_Main-Regular.woff2"], ["KaTeX_Typewriter", "/fonts/KaTeX_Typewriter-Regular.woff2"]];
    return Promise.all(files.map(function (f) {
      return fetch(f[1]).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); }).then(function (b) {
        return new Promise(function (res) {
          var fr = new FileReader();
          fr.onload = function () { res("@font-face{font-family:\"" + f[0] + "\";src:url(" + fr.result + ") format(\"woff2\")}"); };
          fr.readAsDataURL(b);
        });
      }).catch(function () { return ""; });
    })).then(function (parts) { fontCss = parts.join(""); return fontCss; });
  }
  function save(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function download(chart, kind, name) {
    return fonts().then(function (f) {
      var s = chart.svgString(f);
      if (kind === "svg") { save(new Blob([s], { type: "image/svg+xml" }), name + ".svg"); return; }
      var sz = chart.size(), scale = 2;
      return new Promise(function (res, rej) {
        var img = new Image();
        img.onload = function () {
          var cv = document.createElement("canvas");
          cv.width = sz.w * scale; cv.height = sz.h * scale;
          var cx = cv.getContext("2d");
          cx.scale(scale, scale);
          cx.drawImage(img, 0, 0, sz.w, sz.h);
          cv.toBlob(function (b) { save(b, name + ".png"); res(); }, "image/png");
        };
        img.onerror = rej;
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
      });
    });
  }

  window.GmChart = { create: create, download: download, richText: richText, fmtTick: fmtTick, segments: segments };
})();
