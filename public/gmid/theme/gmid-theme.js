/* Shared theme runtime for the gm/ID tools.
 * 1. Sets html[data-theme] before paint (saved choice, else system).
 * 2. Wraps Plotly.react so every chart uses the theme's colours and
 *    Computer Modern fonts, and restyles live charts on theme change.
 * 3. Adds a theme switch on standalone pages and keeps embedded pages
 *    (the hub's iframes) in sync through the shared "theme" key. */
(function () {
  var root = document.documentElement;
  function pick() {
    var t = null;
    try { t = localStorage.getItem('theme'); } catch (e) {}
    if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return t;
  }
  root.setAttribute('data-theme', pick());
  if (window.self !== window.top) root.classList.add('gm-embedded');

  function tok() {
    var cs = getComputedStyle(root), g = function (v) { return cs.getPropertyValue(v).trim(); };
    return { card: g('--qt-card'), well: g('--qt-well'), ink: g('--qt-ink'), ink2: g('--qt-ink-2'), ink3: g('--qt-ink-3'),
             rule: g('--qt-rule'), rule2: g('--qt-rule-strong'), tipBg: g('--qt-tooltip-bg'), tipInk: g('--qt-tooltip-ink'),
             mono: g('--qt-mono') || 'monospace', serif: g('--qt-serif') || 'serif' };
  }
  function styleAxis(ax, t) {
    ax = ax || {};
    ax.gridcolor = t.rule; ax.zerolinecolor = t.rule2; ax.linecolor = t.rule2;
    ax.tickfont = Object.assign({}, ax.tickfont, { family: t.mono, color: t.ink3 });
    if (typeof ax.title === 'string') ax.title = { text: ax.title };
    if (ax.title) ax.title.font = Object.assign({}, ax.title.font, { family: t.serif, color: t.ink2 });
    return ax;
  }
  function theme(layout) {
    var t = tok();
    layout = layout || {};
    layout.paper_bgcolor = 'rgba(0,0,0,0)';
    layout.plot_bgcolor = t.card;
    layout.font = Object.assign({}, layout.font, { family: t.mono, color: t.ink2 });
    if (!layout.xaxis) layout.xaxis = {};
    if (!layout.yaxis) layout.yaxis = {};
    Object.keys(layout).forEach(function (k) { if (/^[xy]axis\d*$/.test(k)) layout[k] = styleAxis(layout[k], t); });
    if (typeof layout.title === 'string') layout.title = { text: layout.title };
    if (layout.title) layout.title.font = Object.assign({}, layout.title.font, { family: t.serif, color: t.ink });
    layout.legend = Object.assign({}, layout.legend, { bgcolor: 'rgba(0,0,0,0)', font: Object.assign({}, (layout.legend || {}).font, { family: t.mono, color: t.ink2 }) });
    layout.hoverlabel = Object.assign({}, layout.hoverlabel, { bgcolor: t.tipBg, bordercolor: t.tipBg, font: { family: t.mono, color: t.tipInk } });
    (layout.annotations || []).forEach(function (a) { a.font = Object.assign({}, a.font, { family: t.mono, color: t.ink2 }); });
    return layout;
  }
  var react = null;
  function wrap() {
    var P = window.Plotly;
    if (!P || P.__gmThemed) return !!P;
    react = P.react.bind(P);
    P.react = function (gd, data, layout, config) { return react(gd, data, theme(layout), config); };
    P.__gmThemed = true;
    return true;
  }
  wrap();
  document.addEventListener('DOMContentLoaded', wrap);

  function restyleAll() {
    if (!react) return;
    document.querySelectorAll('.js-plotly-plot').forEach(function (gd) {
      if (gd.data && gd.layout) react(gd, gd.data, theme(gd.layout), gd._context);
    });
  }
  function set(t, save) {
    root.setAttribute('data-theme', t);
    if (save) { try { localStorage.setItem('theme', t); } catch (e) {} }
    restyleAll();
  }
  window.gmToggleTheme = function () { set(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true); };
  window.addEventListener('storage', function (e) { if (e.key === 'theme' && (e.newValue === 'light' || e.newValue === 'dark')) set(e.newValue, false); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { var s = null; try { s = localStorage.getItem('theme'); } catch (e) {} if (!s) set(pick(), false); });

  document.addEventListener('DOMContentLoaded', function () {
    if (document.querySelector('[data-gm-theme-inline]')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'gm-theme-btn'; b.setAttribute('aria-label', 'Switch colour theme');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/></svg>Theme';
    b.addEventListener('click', window.gmToggleTheme);
    document.body.appendChild(b);
  });
})();
