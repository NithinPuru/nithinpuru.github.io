/* Institutional tools UI — factor model, regimes, portfolio lab (risk + stress),
 * pairs / cointegration, relative rotation, walk-forward backtester, screener.
 * Depends on quant-lib.js (QL) and globals from index.html: MARKET, D, COS, PUB,
 * rangeWeeks, fmtPx, escapeHtml, openDetail, toast, cardMatches, activeFilter, searchQ.
 * All tools run on the data file (full 10y history) so results don't depend on
 * which live-API fallbacks happen to be configured. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const pct = (v, d = 1) => (v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(d) + '%');
  const pctU = (v, d = 1) => (v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d) + '%');
  const num = (v, d = 2) => (v == null || !isFinite(v) ? '—' : v.toFixed(d));
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const cssA = (n, a) => `rgba(${css(n + '-rgb')},${a})`;
  const PAL = () => [css('--accent'), css('--up'), css('--warn'), css('--violet'), css('--teal'), css('--down'), css('--pink'), css('--ink-3')];
  const nameOf = t => (COS.find(c => c.t === t) || {}).n || t;
  // USD market cap; falls back to local cap / FX (or USD listings) for older data files.
  function capUSD(t) {
    const e = (MARKET.tickers || {})[t] || {}, f = e.fund || {}, fx = (MARKET.meta && MARKET.meta.fx) || {};
    if (f.mcapUSD) return f.mcapUSD;
    const cur = e.currency || 'USD';
    if (f.mcap && (cur === 'USD' || fx[cur])) return f.mcap / (cur === 'USD' ? 1 : fx[cur]);
    return null;
  }
  const sectorOf = t => (COS.find(c => c.t === t) || {}).sector || '';

  // ─── Data helpers ─────────────────────────────────────────────────────────
  function fullSeries(t) { const e = MARKET.tickers && MARKET.tickers[t]; return e && e.closes && e.dates ? { dates: e.dates, closes: e.closes } : null; }
  function grid() {
    if (MARKET.dates && MARKET.dates.length) return MARKET.dates;
    const s = new Set(); Object.values(MARKET.tickers || {}).forEach(e => (e.dates || []).forEach(d => s.add(d))); return [...s].sort();
  }
  // Aligned closes/returns on the shared weekly calendar (nulls where a ticker has no data).
  function panel(tickers, weeks) {
    const g = weeks ? grid().slice(-weeks) : grid();
    const P = tickers.map(t => { const s = fullSeries(t); if (!s) return g.map(() => null); const m = new Map(s.dates.map((d, i) => [d, s.closes[i]])); return g.map(d => m.get(d) ?? null); });
    const R = P.map(p => p.map((v, i) => (i > 0 && v != null && p[i - 1] != null ? v / p[i - 1] - 1 : null)));
    return { dates: g, P, R };
  }
  // Tickers currently visible on the dashboard (respects filter + search), with data.
  function visibleTickers({ includeSpy = false } = {}) {
    const vis = [...document.querySelectorAll('#grid .card')].filter(el => el.style.display !== 'none').map(el => el.dataset.t);
    return vis.filter(t => (includeSpy || t !== 'SPY') && fullSeries(t));
  }
  const universeNote = n => `${n} companies · uses the dashboard's current filter &amp; search`;
  const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const shortDate = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', year: '2-digit' });

  // ─── Rendering helpers ────────────────────────────────────────────────────
  let charts = [];
  function chart(id, cfg) { const el = $(id); if (!el) return null; const c = new Chart(el.getContext('2d'), cfg); charts.push(c); return c; }
  function clearCharts() { charts.forEach(c => { try { c.destroy(); } catch {} }); charts = []; }
  function baseOpts(extra = {}) {
    Chart.defaults.color = css('--ink-3');
    Chart.defaults.font.family = 'KaTeX_Typewriter, "Courier New", monospace';
    const grid = { color: cssA('--ink', 0.06) };
    const tick = { font: { size: 9 }, maxRotation: 0, autoSkip: true };
    const base = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: { backgroundColor: css('--tooltip-bg'), titleColor: css('--tooltip-ink'), bodyColor: css('--tooltip-ink'), borderColor: css('--rule-strong'), borderWidth: 1, titleFont: { family: 'KaTeX_Main, serif', size: 12 }, bodyFont: { family: 'KaTeX_Typewriter, monospace', size: 11 } } },
      scales: { x: { grid, ticks: { ...tick, maxTicksLimit: 8 } }, y: { grid, position: 'right', ticks: { ...tick } } },
    };
    // Merge axis options so per-chart overrides keep the default tick hygiene. Charts that
    // define their own axis ids (e.g. regime: p / px) don't get an empty default y axis.
    const custom = Object.keys(extra.scales || {}).some(k => k !== 'x' && k !== 'y');
    const scales = custom ? { x: base.scales.x } : { ...base.scales };
    Object.entries(extra.scales || {}).forEach(([k, v]) => { const d = base.scales[k] || { grid, ticks: { ...tick } }; scales[k] = { ...d, ...v, ticks: { ...d.ticks, ...(v.ticks || {}) } }; });
    return { ...base, ...extra, plugins: { ...base.plugins, ...(extra.plugins || {}) }, scales };
  }
  // Diverging heat background for a value in [-lim, lim].
  function heat(v, lim = 1, invert = false) {
    if (v == null || !isFinite(v)) return '';
    const t = Math.max(-1, Math.min(1, v / lim)) * (invert ? -1 : 1);
    const c = css(t >= 0 ? '--up-rgb' : '--down-rgb');
    return `background:rgba(${c},${(0.05 + Math.abs(t) * 0.3).toFixed(2)})`;
  }
  // Sortable table. cols: {key,label,fmt?,style?,title?,num?}; rows: objects.
  function table(el, cols, rows, { onRow, sortKey, sortDir = -1, maxRows } = {}) {
    let key = sortKey, dir = sortDir;
    function draw() {
      const r = key ? [...rows].sort((a, b) => { const x = a[key], y = b[key]; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir; }) : rows;
      const shown = maxRows ? r.slice(0, maxRows) : r;
      el.innerHTML = `<div class="tbl-wrap"><table class="tbl dense"><thead><tr>${cols.map(c => `<th data-k="${c.key}" class="${c.num ? 'num' : ''} ${key === c.key ? 'sorted' : ''}" ${c.title ? `title="${escapeHtml(c.title)}"` : ''}>${c.label}${key === c.key ? (dir < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead>
        <tbody>${shown.map((row, i) => `<tr data-i="${rows.indexOf(row)}" ${onRow ? 'class="clickable"' : ''}>${cols.map(c => `<td class="${c.num ? 'num' : ''}${c.wrap ? ' wrap' : ''}" style="${c.style ? c.style(row[c.key], row) : ''}">${c.fmt ? c.fmt(row[c.key], row) : escapeHtml(row[c.key] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        ${maxRows && r.length > maxRows ? `<p class="tool-note">Showing top ${maxRows} of ${r.length}.</p>` : ''}`;
      el.querySelectorAll('th').forEach(th => th.addEventListener('click', () => { const k = th.dataset.k; if (key === k) dir = -dir; else { key = k; dir = -1; } draw(); }));
      if (onRow) el.querySelectorAll('tbody tr').forEach(tr => tr.addEventListener('click', () => onRow(rows[+tr.dataset.i])));
    }
    draw();
  }
  const stat = (label, value, cls = '', tip = '') => `<div class="kpi" ${tip ? `title="${escapeHtml(tip)}"` : ''}><span>${label}</span><b class="${cls}">${value}</b></div>`;
  const sign = v => (v == null ? '' : v >= 0 ? 'g' : 'r');

  // ─── Generic tool modal ───────────────────────────────────────────────────
  let current = null;
  function openTool(tool, tabId) {
    const m = $('tool-modal');
    if (!MARKET.tickers || !Object.keys(MARKET.tickers).length) { toast('Market data is still loading — try again in a moment', 'warn'); return; }
    current = tool;
    $('tool-title').textContent = tool.title;
    $('tool-sub').innerHTML = tool.sub ? tool.sub() : '';
    const tabs = tool.tabs || [{ id: 'main', label: '', render: tool.render }];
    $('tool-tabs').innerHTML = tabs.length > 1 ? tabs.map(t => `<button class="tab" data-tab="${t.id}">${t.label}</button>`).join('') : '';
    $('tool-tabs').querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
    m.style.display = 'flex';
    showTab(tabId || tabs[0].id);
  }
  function showTab(id) {
    const tabs = current.tabs || [{ id: 'main', render: current.render }];
    const t = tabs.find(x => x.id === id) || tabs[0];
    $('tool-tabs').querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t.id));
    clearCharts();
    const body = $('tool-body');
    body.innerHTML = '<div class="tool-loading"><span class="spinner"></span>Computing…</div>';
    body.scrollTop = 0;
    // Defer so the spinner paints before heavy computation.
    setTimeout(() => { try { t.render(body); } catch (e) { console.error(e); body.innerHTML = `<div class="empty-state"><div class="es-icon">!</div><div class="es-title">Couldn’t compute this view</div><div class="es-sub">${escapeHtml(e.message || String(e))}</div></div>`; } }, 30);
  }
  function closeTool() { $('tool-modal').style.display = 'none'; clearCharts(); current = null; }
  function needMore(body, msg) { body.innerHTML = `<div class="empty-state big"><div class="es-icon">◌</div><div class="es-title">Not enough data</div><div class="es-sub">${msg}</div></div>`; }

  // ═════════════════════════════════════════════════════════════════════════
  // FACTOR MODEL
  // ═════════════════════════════════════════════════════════════════════════
  const FACTOR_NAMES = ['MKT', 'SEMI', 'MOM', 'LOWVOL', 'SIZE'];
  const FACTOR_DESC = {
    MKT: 'Market — S&P 500 (SPY) weekly return',
    SEMI: 'Semiconductor sector — SOXX minus SPY',
    MOM: 'Momentum — long top-third / short bottom-third by 12-1 month return',
    LOWVOL: 'Low volatility — long the calmest third / short the most volatile third (26-week vol)',
    SIZE: 'Size — long the smallest third / short the largest third by USD market cap',
  };
  let factorCache = null;
  function computeFactors() {
    const est = Math.max(rangeWeeks(), 104), warm = 56;
    const key = `${est}|${MARKET.meta && MARKET.meta.generated_at}`;
    if (factorCache && factorCache.key === key) return factorCache;
    const tick = PUB.filter(c => c.t !== 'SPY' && fullSeries(c.t)).map(c => c.t);
    const pn = panel([...tick, 'SPY', 'SOXX'], est + warm), n = tick.length;
    const P = pn.P.slice(0, n), R = pn.R.slice(0, n), spy = pn.R[n], sox = pn.R[n + 1];
    const last = P.map(p => { for (let i = p.length - 1; i >= 0; i--) if (p[i] != null) return p[i]; return null; });
    const mcap = tick.map(capUSD);
    const mom = (i, t) => (t >= 52 && P[i][t - 4] != null && P[i][t - 52] != null ? P[i][t - 4] / P[i][t - 52] - 1 : null);
    const lowvol = (i, t) => { if (t < 26) return null; const w = R[i].slice(t - 25, t + 1).filter(v => v != null); return w.length >= 20 ? -QL.std(w) : null; };
    const size = (i, t) => (mcap[i] && P[i][t] != null && last[i] ? -Math.log(mcap[i] * P[i][t] / last[i]) : null);
    const F = {
      MKT: spy, SEMI: sox.map((v, i) => (v != null && spy[i] != null ? v - spy[i] : null)),
      MOM: QL.longShortFactor(R, mom), LOWVOL: QL.longShortFactor(R, lowvol), SIZE: QL.longShortFactor(R, size),
    };
    const cut = a => a.slice(warm);
    // Drop any factor without enough history (e.g. SIZE when market caps are missing)
    // instead of letting it null out every regression.
    const names = FACTOR_NAMES.filter(k => cut(F[k]).filter(v => v != null).length >= 0.8 * est);
    const Fc = names.map(k => cut(F[k])), dates = cut(pn.dates);
    // factorRegression returns its t-stats as `t`; keep them as `tstat` so `t` stays the ticker.
    const exposures = tick.map((t, i) => { const fr = QL.factorRegression(cut(R[i]), Fc, names); return fr ? { ...fr, tstat: fr.t, t } : null; }).filter(Boolean);
    factorCache = { key, est, dates, names, F: Object.fromEntries(names.map((k, j) => [k, Fc[j]])), exposures };
    return factorCache;
  }
  const QUALITY_FIELDS = ['roe', 'roa', 'grossMargin', 'opMargin', 'fcfMargin', 'revGrowth', 'epsGrowth', 'debtToEquity', 'currentRatio'];
  function factorScores(tickers) {
    const pn = panel(tickers, 60), rows = tickers.map((t, i) => {
      const p = pn.P[i], d = D[t] || {}, f = (MARKET.tickers[t] || {}).fund || {};
      const L = p.length - 1, momv = p[L - 4] != null && p[L - 52] != null ? p[L - 4] / p[L - 52] - 1 : null;
      const r26 = pn.R[i].slice(-26).filter(v => v != null), vol = r26.length > 15 ? QL.std(r26) * Math.sqrt(52) : null;
      const pe = f.pe > 0 ? f.pe : f.fpe > 0 ? f.fpe : null;
      return { t, name: nameOf(t), sector: sectorOf(t), mom: momv, vol, ey: pe ? 1 / pe : null, cap: capUSD(t), beta: d.ok ? d.beta : null,
        sortino: d.ok ? d.sortino : null, maxDD: d.ok ? d.maxDD : null, ulcer: d.ok ? d.ulcer : null,
        ...Object.fromEntries(QUALITY_FIELDS.map(k => [k, f[k] ?? null])) };
    });
    const z = (k, inv = false) => QL.zscores(rows.map(r => (r[k] == null ? null : inv ? -r[k] : r[k])));
    const zm = z('mom'), zv = z('vol', true), ze = z('ey'), zs = QL.zscores(rows.map(r => (r.cap ? -Math.log(r.cap) : null)));
    // Fundamental quality (QMJ); price-based proxy only where fundamentals are missing.
    const qm = QL.qualityScores(rows);
    const proxy = (() => { const a = z('sortino'), b = z('maxDD'), c = z('ulcer', true); return rows.map((_, i) => { const v = [a[i], b[i], c[i]].filter(x => x != null); return v.length ? QL.mean(v) : null; }); })();
    rows.forEach((r, i) => {
      const q = qm[i], useProxy = q.quality == null;
      Object.assign(r, { zMom: zm[i], zLowVol: zv[i], zValue: ze[i], zSize: zs[i], zQuality: useProxy ? proxy[i] : q.quality, qProxy: useProxy && proxy[i] != null,
        zProf: q.profitability, zGrowth: q.growth, zSafety: q.safety, qCoverage: q.coverage });
      const v = [zm[i], zv[i], ze[i], r.zQuality].filter(x => x != null); r.composite = v.length ? QL.mean(v) : null;
    });
    const ranked = rows.filter(r => r.composite != null).sort((a, b) => b.composite - a.composite); ranked.forEach((r, i) => (r.rank = i + 1));
    return rows;
  }
  const factorTool = {
    title: 'Multi-Factor Model',
    sub: () => `Barra-style factor model: each stock's weekly returns regressed on five factor portfolios built from this universe. Estimation window ≥ 2 years (follows the Range selector). ${universeNote(visibleTickers().length)}`,
    tabs: [
      { id: 'exp', label: 'Exposures & risk attribution', render(body) {
        const fc = computeFactors(), vis = new Set(visibleTickers());
        const rows = fc.exposures.filter(e => vis.has(e.t)).map(e => ({ t: e.t, name: nameOf(e.t), ...Object.fromEntries(fc.names.map((k, j) => [k, e.beta[j]])),
          alpha: e.alpha, r2: e.r2, idioVol: e.idioVol, sys: 1 - e.idio, contrib: e.contrib, idio: e.idio }));
        if (!rows.length) return needMore(body, 'No visible companies have enough history. Clear the dashboard filter.');
        body.innerHTML = `<p class="tool-note">Betas are sensitivities to each factor's weekly return (MKT β≈1 moves with the market). <b>Systematic</b> = share of variance explained by the factors; the rest is stock-specific. Click a row for the company's full analysis. Window: ${fmtDate(fc.dates[0])} – ${fmtDate(fc.dates[fc.dates.length - 1])}.</p>
          <div class="tool-grid2"><div id="fx-tbl"></div><div class="panel"><h4 id="fx-sel-h">Risk attribution</h4><div class="chart-box"><canvas id="fx-attr"></canvas></div><p class="tool-note" id="fx-sel-note"></p></div></div>`;
        const pal = PAL();
        const drawAttr = r => {
          $('fx-sel-h').textContent = `Risk attribution · ${r.name}`;
          $('fx-sel-note').innerHTML = `R² ${num(r.r2)} · annualized alpha ${pct(r.alpha)} · stock-specific vol ${pctU(r.idioVol)}`;
          clearCharts();
          chart('fx-attr', { type: 'bar', data: { labels: [...fc.names, 'Specific'], datasets: [{ data: [...r.contrib, r.idio].map(v => v * 100), backgroundColor: [...pal.slice(0, fc.names.length), cssA('--ink', 0.3)], borderRadius: 4 }] },
            options: baseOpts({ indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.x.toFixed(1) + '% of variance' } } }, scales: { x: { grid: { color: cssA('--ink', .06) }, ticks: { callback: v => v + '%' } }, y: { grid: { display: false } } } }) });
        };
        table($('fx-tbl'), [
          { key: 't', label: 'Ticker', fmt: (v, r) => `<b>${escapeHtml(v)}</b>` },
          ...fc.names.map(k => ({ key: k, label: k, num: true, title: FACTOR_DESC[k], fmt: v => num(v), style: v => heat(k === 'MKT' ? v - 1 : v, k === 'MKT' ? 1 : 1.5) })),
          { key: 'alpha', label: 'Alpha/yr', num: true, fmt: v => pct(v), style: v => heat(v, 0.4) },
          { key: 'sys', label: 'Systematic', num: true, fmt: v => pctU(v, 0), title: 'Share of return variance explained by the five factors' },
        ], rows, { sortKey: 'sys', onRow: r => drawAttr(r) });
        $('fx-tbl').querySelectorAll('tbody tr').forEach(tr => tr.addEventListener('dblclick', () => { const r = rows[+tr.dataset.i]; closeTool(); openDetail(r.t); }));
        drawAttr(rows.slice().sort((a, b) => b.sys - a.sys)[0]);
      } },
      { id: 'scores', label: 'Factor scores (today)', render(body) {
        const rows = factorScores(visibleTickers());
        const nProxy = rows.filter(r => r.qProxy).length;
        body.innerHTML = `<p class="tool-note">Cross-sectional z-scores versus the visible universe (winsorized at ±3). <b>Value</b> = earnings yield (1 / P/E). <b>Quality</b> = fundamental QMJ score from profitability, growth and safety (see the Quality tab)${nProxy ? `; ${nProxy} name${nProxy > 1 ? 's' : ''} without fundamentals use a price-based proxy, marked ~` : ''}. <b>Composite</b> = equal-weight average of Momentum, Low-Vol, Value and Quality.</p><div id="fs-tbl"></div>`;
        const z = k => ({ key: k, num: true, fmt: v => num(v), style: v => heat(v, 2) });
        table($('fs-tbl'), [
          { key: 'rank', label: '#', num: true, fmt: v => v ?? '—' },
          { key: 't', label: 'Ticker', fmt: v => `<b>${escapeHtml(v)}</b>` }, { key: 'name', label: 'Company' }, { key: 'sector', label: 'Sector' },
          { ...z('zMom'), label: 'Momentum', title: '12-1 month return' }, { ...z('zLowVol'), label: 'Low-Vol', title: 'Negative 26-week volatility' },
          { ...z('zValue'), label: 'Value', title: 'Earnings yield' },
          { ...z('zQuality'), label: 'Quality', title: 'QMJ fundamental quality (price proxy where marked ~)', fmt: (v, r) => (v == null ? '—' : (r.qProxy ? '~' : '') + v.toFixed(2)) },
          { ...z('zSize'), label: 'Small size', title: 'Negative log USD market cap (positive = smaller)' },
          { ...z('composite'), label: 'Composite' },
        ], rows, { sortKey: 'composite', onRow: r => { closeTool(); openDetail(r.t); } });
      } },
      { id: 'quality', label: 'Quality (QMJ)', render(body) {
        const rows = factorScores(visibleTickers()).filter(r => r.zProf != null);
        const pc = v => (v == null ? '—' : (v * 100).toFixed(0) + '%');
        body.innerHTML = `<p class="tool-note">Quality in the spirit of Asness, Frazzini &amp; Pedersen, <i>Quality Minus Junk</i>: <b>Profitability</b> (ROE, ROA, gross, operating and free-cash-flow margins), <b>Growth</b> (revenue and earnings growth, latest year over year) and <b>Safety</b> (low debt/equity, current ratio, low beta, low volatility). Each input is converted to a rank-based z-score, so one extreme figure can't dominate; pillars are averaged and re-standardized. Fundamentals are Yahoo's trailing figures, refreshed with prices. ${rows.length} companies with fundamentals.</p><div id="q-tbl"></div>`;
        const z = (k, label, title) => ({ key: k, label, title, num: true, fmt: v => num(v), style: v => heat(v, 2) });
        table($('q-tbl'), [
          { key: 't', label: 'Ticker', fmt: v => `<b>${escapeHtml(v)}</b>` }, { key: 'name', label: 'Company' },
          z('zQuality', 'Quality'), z('zProf', 'Profitability'), z('zGrowth', 'Growth'), z('zSafety', 'Safety'),
          { key: 'roe', label: 'ROE', num: true, fmt: pc }, { key: 'opMargin', label: 'Op margin', num: true, fmt: pc }, { key: 'fcfMargin', label: 'FCF margin', num: true, fmt: pc },
          { key: 'revGrowth', label: 'Rev growth', num: true, fmt: v => pct(v, 0) }, { key: 'debtToEquity', label: 'Debt/Eq', num: true, fmt: v => (v == null ? '—' : v.toFixed(2)) },
          { key: 'currentRatio', label: 'Current', num: true, fmt: v => (v == null ? '—' : v.toFixed(1)) },
          { key: 'qCoverage', label: 'Data', num: true, fmt: v => pctU(v, 0), title: 'Share of the 11 quality inputs available' },
        ], rows, { sortKey: 'zQuality', onRow: r => { closeTool(); openDetail(r.t); } });
      } },
      { id: 'fret', label: 'Factor returns', render(body) {
        const fc = computeFactors(), pal = PAL();
        const st = fc.names.map(k => { const r = fc.F[k].filter(v => v != null), p = QL.perfStats(r, 0); return { k, desc: FACTOR_DESC[k], ann: QL.mean(r) * 52, vol: p.vol, sharpe: p.vol ? QL.mean(r) * 52 / p.vol : 0, t: QL.mean(r) / (QL.std(r) / Math.sqrt(r.length)), total: p.total }; });
        body.innerHTML = `<p class="tool-note">Cumulative returns of each factor portfolio (long-short factors are dollar-neutral, rebalanced weekly, no costs). A t-stat above ~2 suggests the premium is unlikely to be noise.</p>
          <div class="panel"><div class="chart-box tall"><canvas id="fr-ch"></canvas></div></div><div id="fr-tbl" style="margin-top:12px"></div><h4 style="margin-top:14px">Factor correlations</h4><div id="fr-corr"></div>`;
        chart('fr-ch', { type: 'line', data: { labels: fc.dates.map(shortDate), datasets: fc.names.map((k, j) => { let e = 1; return { label: k, data: fc.F[k].map(v => (v == null ? e : (e *= 1 + v))), borderColor: pal[j], borderWidth: 1.6, pointRadius: 0, tension: 0.1 }; }) },
          options: baseOpts({ scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { position: 'right', grid: { color: cssA('--ink', .06) }, ticks: { callback: v => v.toFixed(2) + 'x' } } } }) });
        table($('fr-tbl'), [{ key: 'k', label: 'Factor', fmt: v => `<b>${v}</b>` }, { key: 'desc', label: 'Definition', wrap: true }, { key: 'ann', label: 'Return/yr', num: true, fmt: v => pct(v), style: v => heat(v, 0.3) },
          { key: 'vol', label: 'Vol', num: true, fmt: v => pctU(v) }, { key: 'sharpe', label: 'Sharpe', num: true, fmt: v => num(v) }, { key: 't', label: 't-stat', num: true, fmt: v => num(v), style: v => heat(Math.abs(v) > 2 ? v : 0, 4) }], st);
        const M = fc.names.map(k => fc.F[k]), idx = fc.dates.map((_, t) => t).filter(t => M.every(f => f[t] != null));
        const C = QL.corrFromCov(QL.covMatrix(M.map(f => idx.map(t => f[t]))));
        $('fr-corr').innerHTML = `<div class="tbl-wrap"><table class="tbl dense"><tr><th></th>${fc.names.map(k => `<th class="num">${k}</th>`).join('')}</tr>${C.map((r, i) => `<tr><th>${fc.names[i]}</th>${r.map(v => `<td class="num" style="${heat(v, 1)}">${v.toFixed(2)}</td>`).join('')}</tr>`).join('')}</table></div>`;
      } },
    ],
  };

  // ═════════════════════════════════════════════════════════════════════════
  // REGIMES (hidden Markov model)
  // ═════════════════════════════════════════════════════════════════════════
  const STATE_NAMES = { 2: ['Calm', 'Turbulent'], 3: ['Calm', 'Normal', 'Stress'] };
  const STATE_COL = k => (k === 2 ? [css('--up-rgb'), css('--down-rgb')] : [css('--up-rgb'), css('--warn-rgb'), css('--down-rgb')]);
  let regimeK = 2, regimeBench = 'SOXX';
  function hmmFor(t, K) { const s = fullSeries(t); if (!s) return null; return { s, h: QL.fitHMM(QL.rets(s.closes), K) }; }
  const regimeTool = {
    title: 'Market Regimes',
    sub: () => 'Gaussian hidden Markov model fitted on the full 10-year weekly return history. It infers unobserved market states from return behaviour (mean and volatility) and the probability of being in each one — the same family of models many risk desks use for regime-aware sizing.',
    tabs: [
      { id: 'mkt', label: 'Market regime', render(body) {
        const K = regimeK, names = STATE_NAMES[K], cols = STATE_COL(K), r = hmmFor(regimeBench, K);
        if (!r || !r.h) return needMore(body, 'Benchmark history unavailable.');
        const { s, h } = r, n = h.gamma.length, show = Math.min(n, Math.max(rangeWeeks(), 104)), off = n - show;
        const cur = h.gamma[n - 1], cs = cur.indexOf(Math.max(...cur));
        let run = 0; for (let i = n - 1; i >= 0 && h.path[i] === h.path[n - 1]; i--) run++;
        const share = names.map((_, k) => h.path.filter(p => p === k).length / n);
        body.innerHTML = `<div class="tool-controls">
            <div class="seg">${['SOXX', 'SPY'].map(b => `<button class="btn ${b === regimeBench ? 'on' : ''}" data-b="${b}">${b === 'SOXX' ? 'Semis (SOXX)' : 'S&amp;P 500 (SPY)'}</button>`).join('')}</div>
            <div class="seg">${[2, 3].map(k => `<button class="btn ${k === K ? 'on' : ''}" data-k="${k}">${k} states</button>`).join('')}</div></div>
          <div class="kpis">
            ${stat('Current regime', `<span style="color:rgb(${cols[cs]})">${names[cs]}</span>`, '', 'Most likely state this week')}
            ${stat('Probability', pctU(cur[cs], 0))}
            ${stat('Weeks in regime', run)}
            ${stat('Expected duration', Math.round(h.duration[cs]) + ' wks', '', '1 / (1 − probability of staying)')}
          </div>
          <div class="panel"><h4>${regimeBench} price with regime probabilities</h4><div class="chart-box tall"><canvas id="rg-ch"></canvas></div></div>
          <div class="tool-grid2" style="margin-top:12px"><div><h4>State characteristics</h4><div id="rg-st"></div></div><div><h4>Transition probabilities (weekly)</h4><div id="rg-tm"></div></div></div>`;
        body.querySelectorAll('[data-b]').forEach(b => b.addEventListener('click', () => { regimeBench = b.dataset.b; showTab('mkt'); }));
        body.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { regimeK = +b.dataset.k; showTab('mkt'); }));
        const labels = s.dates.slice(1).slice(off).map(shortDate);
        chart('rg-ch', { data: { labels, datasets: [
          ...names.map((nm, k) => ({ type: 'line', label: `P(${nm})`, data: h.gamma.slice(off).map(g => g[k]), yAxisID: 'p', fill: k === 0 ? 'origin' : '-1', stack: 'p', backgroundColor: `rgba(${cols[k]},0.22)`, borderWidth: 0, pointRadius: 0, tension: 0.2 })),
          { type: 'line', label: regimeBench, data: s.closes.slice(1).slice(off), yAxisID: 'px', borderColor: css('--text-main'), borderWidth: 1.6, pointRadius: 0, tension: 0.1 } ] },
          options: baseOpts({ scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } }, p: { position: 'left', stacked: true, min: 0, max: 1, grid: { display: false }, ticks: { callback: v => (v * 100) + '%' } }, px: { position: 'right', grid: { color: cssA('--ink', .06) } } } }) });
        table($('rg-st'), [{ key: 'nm', label: 'State', fmt: (v, r) => `<span class="dot" style="background:rgb(${r.col})"></span> <b>${v}</b>` }, { key: 'ret', label: 'Return/yr', num: true, fmt: v => pct(v), style: v => heat(v, 0.5) },
          { key: 'vol', label: 'Vol/yr', num: true, fmt: v => pctU(v) }, { key: 'dur', label: 'Avg duration', num: true, fmt: v => Math.round(v) + ' w' }, { key: 'share', label: 'Time in state', num: true, fmt: v => pctU(v, 0) }],
          names.map((nm, k) => ({ nm, col: cols[k], ret: h.mu[k] * 52, vol: h.sigma[k] * Math.sqrt(52), dur: h.duration[k], share: share[k] })));
        $('rg-tm').innerHTML = `<div class="tbl-wrap"><table class="tbl dense"><tr><th>from \\ to</th>${names.map(n => `<th class="num">${n}</th>`).join('')}</tr>${h.A.map((r, i) => `<tr><th>${names[i]}</th>${r.map(v => `<td class="num" style="${heat(v - 0.5, 0.5)}">${pctU(v, 1)}</td>`).join('')}</tr>`).join('')}</table></div>`;
      } },
      { id: 'uni', label: 'Company regimes', render(body) {
        const rows = visibleTickers().map(t => { const r = hmmFor(t, 2); if (!r || !r.h) return null; const h = r.h, n = h.gamma.length; let run = 0; for (let i = n - 1; i >= 0 && h.path[i] === h.path[n - 1]; i--) run++;
          return { t, name: nameOf(t), sector: sectorOf(t), pT: h.gamma[n - 1][1], state: h.path[n - 1] ? 'Turbulent' : 'Calm', run, calmVol: h.sigma[0] * Math.sqrt(52), turbVol: h.sigma[1] * Math.sqrt(52), turbRet: h.mu[1] * 52 }; }).filter(Boolean);
        const hot = rows.filter(r => r.pT > 0.5).length;
        body.innerHTML = `<div class="kpis">${stat('In turbulent regime', `${hot} / ${rows.length}`, hot > rows.length / 2 ? 'r' : 'g')}${stat('Share', pctU(hot / (rows.length || 1), 0))}</div>
          <p class="tool-note">Two-state model fitted separately to each stock. <b>P(turbulent)</b> is the probability that the stock is currently in its high-volatility state. Click a row for the full analysis.</p><div id="ru-tbl"></div>`;
        table($('ru-tbl'), [{ key: 't', label: 'Ticker', fmt: v => `<b>${escapeHtml(v)}</b>` }, { key: 'name', label: 'Company' }, { key: 'sector', label: 'Sector' },
          { key: 'pT', label: 'P(turbulent)', num: true, fmt: v => pctU(v, 0), style: v => heat(v - 0.5, 0.5, true) }, { key: 'state', label: 'State' }, { key: 'run', label: 'Weeks in state', num: true },
          { key: 'calmVol', label: 'Calm vol', num: true, fmt: v => pctU(v, 0) }, { key: 'turbVol', label: 'Turbulent vol', num: true, fmt: v => pctU(v, 0) }], rows, { sortKey: 'pT', onRow: r => { closeTool(); openDetail(r.t); } });
      } },
    ],
  };

  // ═════════════════════════════════════════════════════════════════════════
  // PORTFOLIO CONSTRUCTION (shared by the optimizer and the portfolio lab)
  // ═════════════════════════════════════════════════════════════════════════
  const BL_KEY = 'csq_bl_views';
  const getViews = () => { try { return JSON.parse(localStorage.getItem(BL_KEY) || '[]'); } catch { return []; } };
  const setViews = v => localStorage.setItem(BL_KEY, JSON.stringify(v));
  // Aligned return matrix over the Range window; drops tickers with too little overlap.
  function returnMatrix(tickers, weeks) {
    const pn = panel(tickers, weeks + 1);
    let keep = tickers.map((t, i) => i).filter(i => pn.R[i].filter(v => v != null).length >= Math.min(52, weeks * 0.6));
    let idx = pn.dates.map((_, t) => t).filter(t => t > 0 && keep.every(i => pn.R[i][t] != null));
    if (idx.length < 26) { keep = keep.filter(i => pn.R[i].filter(v => v != null).length >= weeks * 0.95); idx = pn.dates.map((_, t) => t).filter(t => t > 0 && keep.every(i => pn.R[i][t] != null)); }
    return { tickers: keep.map(i => tickers[i]), R: keep.map(i => idx.map(t => pn.R[i][t])), dates: idx.map(t => pn.dates[t]) };
  }
  function buildPortfolios(tickers, weeks = Math.max(rangeWeeks(), 52)) {
    const M = returnMatrix(tickers, weeks); const n = M.tickers.length;
    if (n < 3) return null;
    const Cw = QL.shrinkCov(QL.covMatrix(M.R), 0.25), C = Cw.map(r => r.map(v => v * 52));
    const muHist = M.R.map(r => QL.mean(r) * 52), gm = QL.mean(muHist);
    const mu = muHist.map(v => 0.5 * v + 0.5 * gm); // James-Stein-style shrinkage toward the grand mean
    const fr = QL.efficientFrontier(mu, C);
    const erc = QL.riskParity(C), h = QL.hrp(C).w, ew = new Array(n).fill(1 / n);
    const caps = M.tickers.map(t => capUSD(t) || 0), capSum = caps.reduce((s, x) => s + x, 0);
    const wMkt = capSum ? caps.map(c => c / capSum) : ew;
    const views = getViews().map(v => ({ ...v, i: M.tickers.indexOf(v.t) })).filter(v => v.i >= 0);
    const bl = QL.blackLitterman(C, wMkt, views.map(v => ({ i: v.i, q: v.q / 100, conf: v.conf / 100 })), { delta: 2.5, tau: 0.05 });
    const wBL = QL.meanVariance(bl.mu, C, 2.5, 1500);
    const S = w => ({ w, ...QL.portStats(w, mu, C) });
    return { M, C, mu, muHist, bl, wMkt, views,
      ports: { maxSharpe: { ...fr.maxSharpe, ...S(fr.maxSharpe.w) }, minVar: S(fr.minVar.w), erc: S(erc), hrp: S(h), bl: S(wBL), ew: S(ew), mkt: S(wMkt) },
      frontier: fr.frontier.map(p => ({ x: p.vol * 100, y: QL.portStats(p.w, mu, C).ret * 100 })) };
  }
  const PORT_META = {
    maxSharpe: ['★ Max Sharpe (tangency)', '--green-bright', 'Highest expected return per unit of risk on the exact long-only frontier'],
    minVar: ['● Minimum variance', '--blue', 'Lowest-risk fully-invested long-only portfolio'],
    erc: ['◆ Risk parity (ERC)', '--purple', 'Every holding contributes the same share of total risk'],
    hrp: ['◈ Hierarchical risk parity', '--cyan', 'López de Prado: clusters correlated names, then splits risk top-down — robust to noisy covariances'],
    bl: ['◉ Black-Litterman', '--orange', 'Market-cap equilibrium returns blended with your views, then optimized'],
    ew: ['○ Equal weight (1/N)', '--text-muted', 'Naive benchmark that is surprisingly hard to beat out-of-sample'],
  };
  window.buildPortfolios = buildPortfolios;
  window.PORT_META = PORT_META;
  window.blViewsUI = function (container, pf, onChange) {
    const views = getViews(), opts = pf.M.tickers.map(t => `<option value="${t}">${t} · ${escapeHtml(nameOf(t))}</option>`).join('');
    container.innerHTML = `<div class="bl-box"><div class="bl-head"><b>Black-Litterman views</b><span class="tool-note">Absolute annual return you expect, and how confident you are. No views = pure market-cap equilibrium.</span></div>
      <div id="bl-rows">${views.map((v, k) => `<div class="bl-row" data-k="${k}"><select class="search bl-t">${opts.replace(`value="${v.t}"`, `value="${v.t}" selected`)}</select>
        <label>E[r] <input class="search bl-q" type="number" step="1" value="${v.q}">%</label><label>conf <input class="search bl-c" type="number" min="5" max="95" step="5" value="${v.conf}">%</label>
        <button class="btn btn-xs bl-x" aria-label="Remove view">✕</button></div>`).join('') || '<p class="tool-note">No views yet.</p>'}</div>
      <div class="bl-actions"><button class="btn btn-xs" id="bl-add">+ Add view</button><button class="btn btn-xs" id="bl-sug" title="Top-3 quant scores: equilibrium +5%, bottom-3: −5%, 40% confidence">Suggest from Quant Score</button>${views.length ? '<button class="btn btn-xs" id="bl-clr">Clear</button>' : ''}</div></div>`;
    const read = () => [...container.querySelectorAll('.bl-row')].map(r => ({ t: r.querySelector('.bl-t').value, q: +r.querySelector('.bl-q').value || 0, conf: Math.min(95, Math.max(5, +r.querySelector('.bl-c').value || 50)) }));
    container.querySelectorAll('.bl-row input, .bl-row select').forEach(el => el.addEventListener('change', () => { setViews(read()); onChange(); }));
    container.querySelectorAll('.bl-x').forEach(b => b.addEventListener('click', () => { const v = read(); v.splice(+b.closest('.bl-row').dataset.k, 1); setViews(v); onChange(); }));
    container.querySelector('#bl-add').addEventListener('click', () => { const v = read(); v.push({ t: pf.M.tickers[0], q: 15, conf: 50 }); setViews(v); onChange(); });
    container.querySelector('#bl-clr')?.addEventListener('click', () => { setViews([]); onChange(); });
    container.querySelector('#bl-sug').addEventListener('click', () => {
      const sc = pf.M.tickers.map((t, i) => ({ t, i, s: D[t] && D[t].ok ? D[t].score : 50 })).sort((a, b) => b.s - a.s);
      const v = [...sc.slice(0, 3).map(x => ({ t: x.t, q: Math.round((pf.bl.pi[x.i] + 0.05) * 100), conf: 40 })), ...sc.slice(-3).map(x => ({ t: x.t, q: Math.round((pf.bl.pi[x.i] - 0.05) * 100), conf: 40 }))];
      setViews(v); onChange();
    });
  };

  // ═════════════════════════════════════════════════════════════════════════
  // PORTFOLIO LAB — risk decomposition + stress tests
  // ═════════════════════════════════════════════════════════════════════════
  const SCENARIOS = [
    { id: 'q418', name: 'Q4 2018 sell-off', from: '2018-09-24', to: '2018-12-17', note: 'Fed tightening + trade war; semis −25%' },
    { id: 'covid', name: 'COVID crash', from: '2020-02-10', to: '2020-03-16', note: 'Fastest bear market on record' },
    { id: 'bear22', name: '2022 rate-hike bear', from: '2021-12-27', to: '2022-10-10', note: 'Inflation shock, fastest hikes since 1980s' },
    { id: 'aug24', name: 'Jul–Aug 2024 AI unwind', from: '2024-07-08', to: '2024-08-05', note: 'Yen carry unwind + AI capex doubts' },
    { id: 'deepseek', name: 'DeepSeek shock (Jan 2025)', from: '2025-01-20', to: '2025-01-27', note: 'Cheap-AI-model fear hit AI hardware' },
    { id: 'tariff25', name: '2025 tariff shock', from: '2025-02-10', to: '2025-03-31', note: 'Tariff escalation into "Liberation Day"' },
  ];
  let labSource = 'ew';
  function labHoldings() {
    const vis = visibleTickers();
    if (labSource === 'tracker') {
      const fx = (MARKET.meta && MARKET.meta.fx) || { USD: 1 };
      const h = (typeof myPortfolio !== 'undefined' ? myPortfolio : []).map(p => { const d = D[p.t]; if (!d || !d.ok) return null; const usd = (d.price * p.s) / (fx[d.currency] || 1); return { t: p.t, v: usd }; }).filter(x => x && x.v > 0 && fullSeries(x.t));
      const tot = h.reduce((s, x) => s + x.v, 0); return tot ? h.map(x => ({ t: x.t, w: x.v / tot })) : [];
    }
    if (labSource === 'ew') return vis.map(t => ({ t, w: 1 / vis.length }));
    const pf = buildPortfolios(vis.slice(0, 40)); if (!pf) return [];
    return pf.M.tickers.map((t, i) => ({ t, w: pf.ports[labSource].w[i] })).filter(x => x.w > 1e-4);
  }
  const LAB_SRCS = { ew: 'Equal-weight (visible)', tracker: 'My tracker holdings', maxSharpe: 'Max Sharpe', minVar: 'Min variance', erc: 'Risk parity', hrp: 'HRP', bl: 'Black-Litterman' };
  const activeTab = () => (document.querySelector('#tool-tabs .tab.on') || {}).dataset?.tab;
  function labControls(H, extra = '') {
    return `<div class="tool-controls"><label class="range-wrap"><span>Portfolio</span> <select class="search" id="lab-src">${Object.entries(LAB_SRCS).map(([k, v]) => `<option value="${k}" ${k === labSource ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      ${extra}<span class="tool-note" style="margin:0">${H.length} holdings${labSource !== 'tracker' ? ' · built from visible companies (max 40 for optimized portfolios)' : ''}</span></div>`;
  }
  function bindLab() { $('lab-src')?.addEventListener('change', e => { labSource = e.target.value; showTab(activeTab()); }); }
  const needHoldings = body => { body.innerHTML = labControls([]) + `<div class="empty-state big"><div class="es-icon">◇</div><div class="es-title">Need at least 2 holdings</div><div class="es-sub">${labSource === 'tracker' ? 'Add holdings in the Tracker first.' : 'Clear the dashboard filter so more companies are visible.'}</div></div>`; bindLab(); };
  // Weekly portfolio returns over the longest available history. Weeks before a holding
  // listed use the remaining holdings, re-weighted (needs ≥ 60% of the weight present).
  function portfolioReturns(H, weeks) {
    const pn = panel(H.map(h => h.t), weeks ? weeks + 1 : undefined), rp = [], dates = [];
    for (let t = 1; t < pn.dates.length; t++) {
      let s = 0, w = 0; H.forEach((h, i) => { const r = pn.R[i][t]; if (r != null) { s += h.w * r; w += h.w; } });
      if (w >= 0.6) { rp.push(s / w); dates.push(pn.dates[t]); }
    }
    return { rp, dates };
  }
  const labRisk = {
    render(body) {
      const H = labHoldings();
      const ctrl = labControls(H);
      if (H.length < 2) return needHoldings(body);
      const weeks = Math.max(rangeWeeks(), 52), M = returnMatrix(H.map(h => h.t), weeks);
      const wMap = new Map(H.map(h => [h.t, h.w])); let w = M.tickers.map(t => wMap.get(t) || 0); const ws = w.reduce((s, x) => s + x, 0); w = w.map(x => x / ws);
      const C = QL.covMatrix(M.R), rd = QL.riskDecomposition(w, C, 0.95), rd99 = QL.riskDecomposition(w, C, 0.99);
      const rp = M.dates.map((_, t) => M.R.reduce((s, r, i) => s + w[i] * r[t], 0));
      const sorted = [...rp].sort((a, b) => a - b), q = p => sorted[Math.floor(p * (sorted.length - 1))];
      const hVaR = -q(0.05), tail = sorted.filter(v => v <= q(0.05)), hES = -QL.mean(tail);
      const bench = panel(['SPY', 'SOXX'], weeks + 1), bi = new Map(bench.dates.map((d, i) => [d, i]));
      const spyR = M.dates.map(d => bench.R[0][bi.get(d)]), soxR = M.dates.map(d => bench.R[1][bi.get(d)]);
      const beta = (r, b) => { const idx = r.map((_, i) => i).filter(i => b[i] != null); const rr = idx.map(i => r[i]), bb = idx.map(i => b[i]); const mb = QL.mean(bb), mr = QL.mean(rr); let c = 0, v = 0; idx.forEach((_, k) => { c += (rr[k] - mr) * (bb[k] - mb); v += (bb[k] - mb) ** 2; }); return v ? c / v : 0; };
      const perf = QL.perfStats(rp);
      body.innerHTML = ctrl + `
        <div class="kpis">
          ${stat('Volatility', pctU(rd.sigma * Math.sqrt(52)), '', 'Annualized standard deviation of weekly portfolio returns')}
          ${stat('VaR 95% (1w)', pctU(rd.VaR, 2), 'r', 'Parametric (Gaussian) one-week Value-at-Risk')}
          ${stat('VaR 99% (1w)', pctU(rd99.VaR, 2), 'r')}
          ${stat('Hist. VaR 95%', pctU(hVaR, 2), 'r', 'Empirical 5th-percentile weekly loss')}
          ${stat('Exp. shortfall 95%', pctU(hES, 2), 'r', 'Average loss in the worst 5% of weeks')}
          ${stat('Beta (SPY)', num(beta(rp, spyR)))}
          ${stat('Beta (SOXX)', num(beta(rp, soxR)))}
          ${stat('Diversification', num(rd.divRatio) + 'x', rd.divRatio > 1.4 ? 'g' : '', 'Σ w·σ / σ_portfolio — above 1 means correlations are reducing risk')}
          ${stat('Sharpe', num(perf.sharpe), sign(perf.sharpe))}
          ${stat('Max drawdown', pctU(perf.maxDD), 'r')}
        </div>
        <div class="tool-grid2 lab-grid"><div class="panel"><h4>Risk contribution vs weight</h4><div class="chart-box tall"><canvas id="lab-rc"></canvas></div><p class="tool-note">Names whose risk bar is much longer than their weight bar dominate portfolio risk.</p></div>
          <div class="panel"><h4>Historical stress scenarios</h4><div id="lab-sc"></div></div></div>
        <div class="panel" style="margin-top:12px"><h4>Hypothetical shock</h4>
          <div class="tool-controls"><label class="range-wrap">S&amp;P 500 <input class="search num-in" id="shk-spy" type="number" value="-10" step="1">%</label>
            <label class="range-wrap">Semis (SOXX) <input class="search num-in" id="shk-sox" type="number" value="-20" step="1">%</label><span class="tool-note">Impact estimated from each holding's two-factor (SPY + SOXX) betas over the Range window.</span></div>
          <div id="shk-out"></div></div>`;
      bindLab();
      // Risk contribution chart (top 15 by risk)
      const items = M.tickers.map((t, i) => ({ t, w: w[i], rc: rd.pct[i] })).sort((a, b) => b.rc - a.rc).slice(0, 15);
      chart('lab-rc', { type: 'bar', data: { labels: items.map(x => x.t), datasets: [{ label: 'Weight', data: items.map(x => x.w * 100), backgroundColor: css('--blue') + 'aa', borderRadius: 3 }, { label: 'Risk contribution', data: items.map(x => x.rc * 100), backgroundColor: css('--red') + 'cc', borderRadius: 3 }] },
        options: baseOpts({ indexAxis: 'y', scales: { x: { grid: { color: cssA('--ink', .06) }, ticks: { callback: v => v + '%' } }, y: { grid: { display: false }, ticks: { font: { size: 9 } } } } }) });
      // Stress scenarios over the full history
      const full = panel([...M.tickers, 'SPY', 'SOXX']), di = new Map(full.dates.map((d, i) => [d, i]));
      const at = d => { let i = full.dates.findIndex(x => x >= d); return i < 0 ? full.dates.length - 1 : i; };
      const scen = SCENARIOS.map(sc => {
        const a = at(sc.from), b = at(sc.to), ret = k => (full.P[k][a] != null && full.P[k][b] != null ? full.P[k][b] / full.P[k][a] - 1 : null);
        let cov = 0, pr = 0; const per = M.tickers.map((t, i) => ({ t, r: ret(i), w: w[i] }));
        per.forEach(x => { if (x.r != null) { cov += x.w; pr += x.w * x.r; } });
        const n = M.tickers.length;
        return { ...sc, spy: ret(n), sox: ret(n + 1), port: cov ? pr / cov : null, coverage: cov, worst: per.filter(x => x.r != null).sort((x, y) => x.r - y.r).slice(0, 3) };
      });
      // Worst 4-week window for this portfolio inside the Range window
      let worst = 0, wi = 0; for (let t = 4; t <= rp.length; t++) { const r = rp.slice(t - 4, t).reduce((e, x) => e * (1 + x), 1) - 1; if (r < worst) { worst = r; wi = t; } }
      table($('lab-sc'), [
        { key: 'name', label: 'Scenario', wrap: true, fmt: (v, r) => `<b>${escapeHtml(v)}</b><div class="tool-note">${r.from ? `${fmtDate(r.from)} → ${fmtDate(r.to)}` : ''}${r.note ? ' · ' + escapeHtml(r.note) : ''}</div>` },
        { key: 'spy', label: 'SPY', num: true, fmt: v => pct(v), style: v => heat(v, 0.35) },
        { key: 'sox', label: 'SOXX', num: true, fmt: v => pct(v), style: v => heat(v, 0.35) },
        { key: 'port', label: 'Portfolio', num: true, fmt: (v, r) => `<b>${pct(v)}</b>${r.coverage != null && r.coverage < 0.999 ? `<div class="tool-note">${pctU(r.coverage, 0)} of weight existed</div>` : ''}`, style: v => heat(v, 0.35) },
        { key: 'worst', label: 'Worst holdings', wrap: true, fmt: v => (v || []).map(x => `${escapeHtml(x.t)} ${pct(x.r, 0)}`).join(' · ') },
      ], [...scen, { name: 'Worst 4 weeks (Range window)', note: wi ? `ending ${fmtDate(M.dates[wi - 1])}` : '', spy: null, sox: null, port: worst, coverage: 1, worst: [] }]);
      // Hypothetical shock via two-factor betas
      const betas = M.tickers.map((t, i) => { const idx = M.dates.map((_, k) => k).filter(k => spyR[k] != null && soxR[k] != null); const reg = QL.ols(idx.map(k => M.R[i][k]), idx.map(k => [1, spyR[k], soxR[k]])); return { t, b1: reg.b[1], b2: reg.b[2] }; });
      const shock = () => {
        const s1 = (+$('shk-spy').value || 0) / 100, s2 = (+$('shk-sox').value || 0) / 100;
        const rows = betas.map((b, i) => ({ t: b.t, name: nameOf(b.t), w: w[i], b1: b.b1, b2: b.b2, imp: b.b1 * s1 + b.b2 * s2 }));
        const port = rows.reduce((s, r) => s + r.w * r.imp, 0);
        $('shk-out').innerHTML = `<div class="kpis">${stat('Estimated portfolio move', pct(port), sign(port))}</div><div id="shk-tbl"></div>`;
        table($('shk-tbl'), [{ key: 't', label: 'Ticker', fmt: v => `<b>${escapeHtml(v)}</b>` }, { key: 'name', label: 'Company' }, { key: 'w', label: 'Weight', num: true, fmt: v => pctU(v) },
          { key: 'b1', label: 'β SPY', num: true, fmt: v => num(v) }, { key: 'b2', label: 'β SOXX', num: true, fmt: v => num(v) }, { key: 'imp', label: 'Est. move', num: true, fmt: v => pct(v), style: v => heat(v, 0.4) }], rows, { sortKey: 'imp', sortDir: 1, maxRows: 20 });
      };
      $('shk-spy').addEventListener('input', shock); $('shk-sox').addEventListener('input', shock); shock();
    },
  };

  // ═════════════════════════════════════════════════════════════════════════
  // PAIRS / COINTEGRATION
  // ═════════════════════════════════════════════════════════════════════════
  let pairsSameSector = true;
  const pairsTool = {
    title: 'Pairs & Cointegration Screener',
    sub: () => `Engle-Granger two-step test on log prices (OLS hedge ratio, then an ADF test on the spread, MacKinnon p-values). Because many pairs are tested at once, significance is controlled with the Benjamini-Hochberg false-discovery rate, and each pair must also hold up in both halves of the window. Window ≥ 2 years. ${universeNote(visibleTickers().length)}`,
    render(body) {
      const weeks = Math.max(rangeWeeks(), 104), vis = visibleTickers().slice(0, 60), pn = panel(vis, weeks);
      const ok = vis.map((t, i) => i).filter(i => pn.P[i].every(v => v != null));
      const res = [], half = Math.floor(weeks / 2);
      for (let a = 0; a < ok.length; a++) for (let b = a + 1; b < ok.length; b++) {
        const i = ok[a], j = ok[b], ti = vis[i], tj = vis[j];
        if (pairsSameSector && sectorOf(ti) !== sectorOf(tj)) continue;
        const c1 = QL.cointegration(pn.P[i], pn.P[j]), c2 = QL.cointegration(pn.P[j], pn.P[i]);
        const [c, yi, xi] = c1.adfT <= c2.adfT ? [c1, i, j] : [c2, j, i];
        res.push({ ...c, y: vis[yi], x: vis[xi], yi, xi });
      }
      // False-discovery-rate control across every pair tested in this run.
      const q = QL.benjaminiHochberg(res.map(r => r.pval)); res.forEach((r, k) => (r.q = q[k]));
      // Split-sample stability for the candidates worth looking at.
      res.filter(r => r.pval < 0.1).forEach(r => {
        const h1 = QL.cointegration(pn.P[r.yi].slice(0, half), pn.P[r.xi].slice(0, half)), h2 = QL.cointegration(pn.P[r.yi].slice(half), pn.P[r.xi].slice(half));
        r.p1 = h1.pval; r.p2 = h2.pval; r.hedgeDrift = Math.abs(h1.hedge - h2.hedge) / (Math.abs(r.hedge) || 1);
      });
      res.forEach(r => {
        const stable = r.p1 < 0.1 && r.p2 < 0.1 && r.hedgeDrift < 0.5 && r.hedge > 0, hlOk = r.halfLife >= 1 && r.halfLife <= 26;
        r.status = r.q < 0.1 && stable && hlOk ? 'Robust' : r.q < 0.1 ? (stable ? 'FDR-sig., slow' : 'FDR-sig., unstable') : r.pval < 0.05 ? 'Nominal only' : '—';
      });
      res.sort((a, b) => a.pval - b.pval || a.adfT - b.adfT);
      const m = res.length, nom = res.filter(r => r.pval < 0.05).length, fdr = res.filter(r => r.q < 0.1).length, rob = res.filter(r => r.status === 'Robust').length;
      body.innerHTML = `<div class="tool-controls"><div class="seg"><button class="btn ${pairsSameSector ? 'on' : ''}" data-s="1">Same sector</button><button class="btn ${!pairsSameSector ? 'on' : ''}" data-s="0">All visible</button></div>
          <span class="tool-note">${ok.length} companies with full history in the window</span></div>
        <div class="kpis">${stat('Pairs tested', m)}${stat('p < 5% (nominal)', nom, '', 'Uncorrected. About 5% of tested pairs would pass by chance alone')}${stat('Expected by chance', '≈ ' + Math.round(0.05 * m), '', '5% of pairs tested')}${stat('FDR q < 10%', fdr, fdr ? 'g' : '', 'Benjamini-Hochberg: at most ~10% of these are expected to be false discoveries')}${stat('Robust', rob, rob ? 'g' : '', 'FDR-significant, cointegrated in both halves of the window, stable positive hedge ratio, half-life 1–26 weeks')}</div>
        <p class="tool-note"><b>Robust</b> pairs pass all checks. Trade signals are shown only for them. <b>FDR-sig., unstable</b> means the relationship didn't hold in one half of the window or its hedge ratio drifted by more than 50%. <b>Nominal only</b> means significant before, but not after, correcting for the number of pairs tested.</p>
        <div class="tool-grid2 pairs-grid"><div id="pr-tbl"></div><div class="panel"><h4 id="pr-h">Spread z-score</h4><div class="chart-box tall"><canvas id="pr-ch"></canvas></div><p class="tool-note" id="pr-note">Click a pair to plot its spread.</p></div></div>`;
      body.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => { pairsSameSector = b.dataset.s === '1'; showTab('main'); }));
      if (!res.length) { $('pr-tbl').innerHTML = '<p class="tool-note">No pairs to test — widen the universe.</p>'; return; }
      const rows = res.slice(0, 40).map(r => ({ ...r, pair: `${r.y} / ${r.x}`, sector: sectorOf(r.y) === sectorOf(r.x) ? sectorOf(r.y) : `${sectorOf(r.y)} / ${sectorOf(r.x)}`,
        signal: r.status !== 'Robust' ? '—' : r.z > 2 ? `Short ${r.y} / long ${r.x}` : r.z < -2 ? `Long ${r.y} / short ${r.x}` : 'Inside ±2σ' }));
      const plot = r => {
        clearCharts();
        const z = r.spread.map(v => (v - r.mean) / r.sd), labels = pn.dates.map(shortDate);
        $('pr-h').textContent = `Spread z-score · ${r.y} − ${num(r.hedge)}×${r.x}`;
        $('pr-note').innerHTML = `${r.status} · ADF t = ${num(r.adfT)}, p = ${num(r.pval, 3)}, q = ${num(r.q, 3)} · halves p = ${r.p1 != null ? num(r.p1, 3) + ' / ' + num(r.p2, 3) : '—'} · half-life ${isFinite(r.halfLife) ? r.halfLife.toFixed(1) + ' weeks' : '∞'} · current z ${num(r.z)}. The dotted line marks the split used for the stability check.`;
        const band = v => labels.map(() => v);
        const split = { id: 'split', afterDraw(c) { const x = c.scales.x.getPixelForValue(half), { top, bottom } = c.chartArea; c.ctx.save(); c.ctx.strokeStyle = cssA('--ink', .25); c.ctx.setLineDash([3, 4]); c.ctx.beginPath(); c.ctx.moveTo(x, top); c.ctx.lineTo(x, bottom); c.ctx.stroke(); c.ctx.restore(); } };
        chart('pr-ch', { type: 'line', plugins: [split], data: { labels, datasets: [
          { label: 'z', data: z, borderColor: css('--blue'), borderWidth: 1.6, pointRadius: 0, tension: 0.1 },
          { label: '+2σ', data: band(2), borderColor: css('--red'), borderDash: [5, 4], borderWidth: 1, pointRadius: 0 },
          { label: '−2σ', data: band(-2), borderColor: css('--green-bright'), borderDash: [5, 4], borderWidth: 1, pointRadius: 0 },
          { label: 'mean', data: band(0), borderColor: cssA('--ink', .3), borderWidth: 1, pointRadius: 0 } ] },
          options: baseOpts({ plugins: { legend: { display: false } } }) });
      };
      const pv = v => (v == null ? '—' : v < 0.001 ? '<0.001' : v.toFixed(3));
      table($('pr-tbl'), [{ key: 'pair', label: 'Pair (Y / X)', fmt: v => `<b>${escapeHtml(v)}</b>` }, { key: 'sector', label: 'Sector' },
        { key: 'pval', label: 'p', num: true, fmt: pv, title: 'MacKinnon p-value of the Engle-Granger test' },
        { key: 'q', label: 'q (FDR)', num: true, fmt: pv, style: v => heat(v < 0.1 ? 1 : 0, 1), title: 'Benjamini-Hochberg q-value across all pairs tested' },
        { key: 'p1', label: 'p 1st half', num: true, fmt: pv }, { key: 'p2', label: 'p 2nd half', num: true, fmt: pv },
        { key: 'halfLife', label: 'Half-life', num: true, fmt: v => (isFinite(v) ? v.toFixed(1) + 'w' : '∞') }, { key: 'hedge', label: 'Hedge β', num: true, fmt: v => num(v) },
        { key: 'z', label: 'z now', num: true, fmt: v => num(v), style: v => heat(Math.abs(v) > 2 ? v : 0, 3, true) },
        { key: 'status', label: 'Status', fmt: v => `<span class="${v === 'Robust' ? 'g' : v.startsWith('FDR') ? '' : 'muted'}">${v}</span>` }, { key: 'signal', label: 'Signal' }],
        rows, { sortKey: 'pval', sortDir: 1, onRow: plot });
      plot(rows[0]);
    },
  };

  // ═════════════════════════════════════════════════════════════════════════
  // RELATIVE ROTATION GRAPH
  // ═════════════════════════════════════════════════════════════════════════
  let rrgBench = 'SOXX', rrgWindow = 14, rrgMode = 'stocks';
  const quadrant = p => (p.x >= 100 ? (p.y >= 100 ? 'Leading' : 'Weakening') : p.y >= 100 ? 'Improving' : 'Lagging');
  const Q_COL = {}; const refreshQ = () => Object.assign(Q_COL, { Leading: css('--up-rgb'), Weakening: css('--warn-rgb'), Lagging: css('--down-rgb'), Improving: css('--accent-rgb') });
  const compass = h => (h == null ? '—' : ['→ E', '↗ NE', '↑ N', '↖ NW', '← W', '↙ SW', '↓ S', '↘ SE'][((Math.round(h / 45) % 8) + 8) % 8]);
  // Equal-weight sector indices built from the members' weekly returns.
  function sectorIndices(tickers) {
    const pn = panel(tickers), by = {};
    tickers.forEach((t, i) => (by[sectorOf(t)] = by[sectorOf(t)] || []).push(i));
    return Object.entries(by).filter(([, ix]) => ix.length >= 2).map(([sec, ix]) => {
      let lvl = 100; const px = pn.dates.map((_, t) => { if (t === 0) return lvl; const r = ix.map(i => pn.R[i][t]).filter(v => v != null); if (r.length) lvl *= 1 + QL.mean(r); return lvl; });
      return { t: sec, label: `${sec} (${ix.length})`, dates: pn.dates, closes: px };
    });
  }
  const rrgTool = {
    title: 'Relative Rotation Graph',
    sub: () => `Relative strength (RS-Ratio, x) and its momentum (RS-Momentum, y) versus a benchmark, with 8-week tails. Leaders typically rotate clockwise: Improving → Leading → Weakening → Lagging. Open reconstruction of the proprietary JdK method (rolling z-score of relative strength; momentum = z-score of its rate of change). Unit-tested to rotate clockwise and lead, as the real indicator does. ${universeNote(visibleTickers().length)}`,
    render(body) {
      refreshQ();
      const b = fullSeries(rrgBench); const vis = visibleTickers().filter(t => t !== rrgBench && t !== 'SOXX');
      const series = rrgMode === 'sectors' ? sectorIndices(vis) : vis.map(t => ({ t, label: t, ...fullSeries(t) }));
      const bm = new Map(b.dates.map((d, i) => [d, b.closes[i]]));
      const pts = series.map(s => { const idx = s.dates.map((d, i) => [bm.get(d), s.closes[i]]).filter(x => x[0] != null && x[1] != null);
        const tail = QL.rrg(idx.map(x => x[1]), idx.map(x => x[0]), { window: rrgWindow, tail: 8 }); return tail.length ? { t: s.t, label: s.label, tail, head: tail[tail.length - 1], ...QL.rrgHeading(tail) } : null; }).filter(Boolean);
      if (!pts.length) return needMore(body, 'Not enough history.');
      pts.forEach(p => (p.q = quadrant(p.head)));
      body.innerHTML = `<div class="tool-controls">
          <div class="seg">${['SOXX', 'SPY'].map(x => `<button class="btn ${x === rrgBench ? 'on' : ''}" data-b="${x}">vs ${x}</button>`).join('')}</div>
          <div class="seg">${[['stocks', 'Stocks'], ['sectors', 'Sectors']].map(([k, l]) => `<button class="btn ${k === rrgMode ? 'on' : ''}" data-m="${k}">${l}</button>`).join('')}</div>
          <label class="range-wrap" title="Look-back of the rolling z-scores: shorter reacts faster, longer is smoother">Window <select class="search" id="rrg-w">${[10, 14, 26].map(w => `<option value="${w}" ${w === rrgWindow ? 'selected' : ''}>${w}w</option>`).join('')}</select></label>
          <span class="tool-note">${rrgMode === 'stocks' ? 'Click a dot to open that company.' : 'Equal-weight sector indices built from the visible members.'}</span></div>
        <div class="tool-grid2 rrg-grid"><div class="panel"><div class="chart-box xtall"><canvas id="rrg-ch"></canvas></div></div><div><div id="rrg-q"></div><h4 style="margin-top:6px">Direction &amp; strength</h4><div id="rrg-t"></div></div></div>`;
      body.querySelectorAll('[data-b]').forEach(x => x.addEventListener('click', () => { rrgBench = x.dataset.b; showTab('main'); }));
      body.querySelectorAll('[data-m]').forEach(x => x.addEventListener('click', () => { rrgMode = x.dataset.m; showTab('main'); }));
      $('rrg-w').addEventListener('change', e => { rrgWindow = +e.target.value; showTab('main'); });
      const all = pts.flatMap(p => p.tail), ext = Math.max(1.5, ...all.map(p => Math.abs(p.x - 100)), ...all.map(p => Math.abs(p.y - 100))) * 1.1;
      const quadBg = { id: 'quadBg', beforeDraw(c) { const { ctx, chartArea: a, scales: { x, y } } = c; const cx = x.getPixelForValue(100), cy = y.getPixelForValue(100);
        [[cx, a.top, a.right - cx, cy - a.top, 'Leading'], [cx, cy, a.right - cx, a.bottom - cy, 'Weakening'], [a.left, cy, cx - a.left, a.bottom - cy, 'Lagging'], [a.left, a.top, cx - a.left, cy - a.top, 'Improving']].forEach(([x0, y0, w, h, q]) => {
          ctx.fillStyle = `rgba(${Q_COL[q]},0.06)`; ctx.fillRect(x0, y0, w, h); ctx.fillStyle = `rgba(${Q_COL[q]},0.8)`; ctx.font = '12px KaTeX_Main, serif'; ctx.textAlign = q === 'Leading' || q === 'Weakening' ? 'right' : 'left';
          ctx.fillText(q.toUpperCase(), q === 'Leading' || q === 'Weakening' ? x0 + w - 8 : x0 + 8, q === 'Leading' || q === 'Improving' ? y0 + 16 : y0 + h - 8); }); } };
      const labels = { id: 'headLabels', afterDatasetsDraw(c) { if (rrgMode !== 'sectors' && pts.length > 25) return; const { ctx } = c; ctx.save(); ctx.font = '11px KaTeX_Typewriter, monospace'; ctx.fillStyle = css('--ink');
        c.data.datasets.forEach((ds, i) => { const m = c.getDatasetMeta(i), el = m.data[m.data.length - 1]; if (el) ctx.fillText(ds.label, el.x + 7, el.y - 6); }); ctx.restore(); } };
      const c = chart('rrg-ch', { type: 'scatter', plugins: [quadBg, labels], data: { datasets: pts.map(p => ({ label: p.label, t: p.t, data: p.tail, showLine: true, borderColor: `rgba(${Q_COL[p.q]},${rrgMode === 'sectors' ? 0.7 : 0.3})`, borderWidth: rrgMode === 'sectors' ? 1.6 : 1,
          pointRadius: p.tail.map((_, i) => (i === p.tail.length - 1 ? 5 : 1.5)), pointBackgroundColor: `rgb(${Q_COL[p.q]})`, pointBorderColor: `rgb(${Q_COL[p.q]})` })) },
        options: baseOpts({ interaction: { mode: 'nearest', intersect: true }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: x => `${x.dataset.label}: RS-Ratio ${x.parsed.x.toFixed(2)}, RS-Mom ${x.parsed.y.toFixed(2)}` } } },
          onClick: (e, els) => { if (els.length && rrgMode === 'stocks') { const t = c.data.datasets[els[0].datasetIndex].t; closeTool(); openDetail(t); } },
          scales: { x: { min: 100 - ext, max: 100 + ext, title: { display: true, text: 'RS-Ratio (relative strength)' }, grid: { color: cssA('--ink', .05) } }, y: { position: 'left', min: 100 - ext, max: 100 + ext, title: { display: true, text: 'RS-Momentum' }, grid: { color: cssA('--ink', .05) } } } }) });
      $('rrg-q').innerHTML = ['Leading', 'Improving', 'Weakening', 'Lagging'].map(q => { const m = pts.filter(p => p.q === q); return `<div class="quad" style="border-color:rgba(${Q_COL[q]},.5)"><h4 style="color:rgb(${Q_COL[q]})">${q} <span class="cnt">${m.length}</span></h4><div class="quad-list">${m.map(p => `<button class="chip" data-t="${escapeHtml(p.t)}">${escapeHtml(p.label)}</button>`).join('') || '<span class="tool-note">none</span>'}</div></div>`; }).join('');
      if (rrgMode === 'stocks') $('rrg-q').querySelectorAll('[data-t]').forEach(x => x.addEventListener('click', () => { closeTool(); openDetail(x.dataset.t); }));
      table($('rrg-t'), [{ key: 'label', label: rrgMode === 'sectors' ? 'Sector' : 'Ticker', fmt: v => `<b>${escapeHtml(v)}</b>` }, { key: 'q', label: 'Quadrant', fmt: v => `<span style="color:rgb(${Q_COL[v]})">${v}</span>` },
        { key: 'rsr', label: 'RS-Ratio', num: true, fmt: v => num(v) }, { key: 'rsm', label: 'RS-Mom', num: true, fmt: v => num(v) },
        { key: 'heading', label: 'Heading', fmt: v => compass(v), title: 'Direction of the latest weekly move on the chart' }, { key: 'dist', label: 'Strength', num: true, fmt: v => num(v), title: 'Distance from the centre (100, 100)' }],
        pts.map(p => ({ ...p, rsr: p.head.x, rsm: p.head.y })), { sortKey: 'dist', maxRows: 30 });
    },
  };

  // ═════════════════════════════════════════════════════════════════════════
  // WALK-FORWARD BACKTESTER
  // ═════════════════════════════════════════════════════════════════════════
  const bt = { strat: 'trend', cost: 10, train: 104, test: 26 };
  function rotationWF(P, dates, { train, test, cost }) {
    const grid = [[13, 5], [26, 5], [52, 5], [13, 10], [26, 10], [52, 10]], len = P[0].length;
    const series = grid.map(([look, top]) => { const r = QL.momentumRotation(P, { look, top, skip: 4, every: 4, costBps: cost }); const full = new Array(len - 1).fill(null); r.rets.forEach((v, k) => (full[r.start + k] = v)); return full; });
    const start = 56 + train, oos = [], chosen = [];
    for (let s = start; s < len - 1; s += test) {
      const e = Math.min(s + test, len - 1); let best = 0, bs = -Infinity;
      series.forEach((r, gi) => { const seg = r.slice(s - train, s).filter(v => v != null); const sh = QL.perfStats(seg).sharpe; if (seg.length > train * 0.8 && sh > bs) { bs = sh; best = gi; } });
      chosen.push(grid[best]); for (let t = s; t < e; t++) oos.push(series[best][t] ?? 0);
    }
    const ew = []; for (let t = start; t < len - 1; t++) { const r = P.map(p => (p[t] != null && p[t + 1] != null ? p[t + 1] / p[t] - 1 : null)).filter(v => v != null); ew.push(r.length ? QL.mean(r) : 0); }
    return { oos, bh: ew.slice(0, oos.length), dates: dates.slice(start + 1, start + 1 + oos.length), chosen };
  }
  const backtestTool = {
    title: 'Walk-Forward Backtester',
    sub: () => `Out-of-sample testing: on each training window the best parameter set (by Sharpe) is chosen, then traded blind on the next test window, rolling forward through 10 years. Includes transaction costs. ${universeNote(visibleTickers().length)}`,
    render(body) {
      const labels = { ...Object.fromEntries(Object.entries(QL.STRATEGIES).map(([k, v]) => [k, v.label])), xsmom: 'Cross-sectional momentum rotation' };
      body.innerHTML = `<div class="tool-controls">
          <label class="range-wrap">Strategy <select class="search" id="bt-s">${Object.entries(labels).map(([k, v]) => `<option value="${k}" ${k === bt.strat ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="range-wrap">Costs <select class="search" id="bt-c">${[0, 5, 10, 25, 50].map(v => `<option value="${v}" ${v === bt.cost ? 'selected' : ''}>${v} bps</option>`).join('')}</select></label>
          <label class="range-wrap">Train <select class="search" id="bt-tr">${[52, 104, 156].map(v => `<option value="${v}" ${v === bt.train ? 'selected' : ''}>${v / 52}y</option>`).join('')}</select></label>
          <label class="range-wrap">Test <select class="search" id="bt-te">${[13, 26, 52].map(v => `<option value="${v}" ${v === bt.test ? 'selected' : ''}>${v}w</option>`).join('')}</select></label>
          <button class="btn on" id="bt-run">Run</button></div><div id="bt-out"></div>`;
      $('bt-run').addEventListener('click', () => { bt.strat = $('bt-s').value; bt.cost = +$('bt-c').value; bt.train = +$('bt-tr').value; bt.test = +$('bt-te').value; showTab('main'); });
      const vis = visibleTickers(), full = panel(vis), out = $('bt-out');
      let agg, bh, dates, perTicker = [], note;
      if (bt.strat === 'xsmom') {
        const r = rotationWF(full.P, full.dates, bt); agg = r.oos; bh = r.bh; dates = r.dates;
        note = `Each 4 weeks, buys the top-N stocks by trailing return (skipping the last month), equal-weighted. Walk-forward picks lookback ∈ {13, 26, 52}w and N ∈ {5, 10}. Last choice: ${r.chosen.length ? `${r.chosen[r.chosen.length - 1][0]}w, top ${r.chosen[r.chosen.length - 1][1]}` : '—'}.`;
      } else {
        const S = QL.STRATEGIES[bt.strat], byDate = new Map();
        vis.forEach((t, i) => {
          const p = full.P[i]; const s0 = p.findIndex(v => v != null); if (s0 < 0) return; const seg = p.slice(s0); if (seg.some(v => v == null)) return;
          const wf = QL.walkForward(seg, bt.strat, { train: bt.train, test: bt.test, costBps: bt.cost }); if (!wf) return;
          wf.oos.forEach((v, k) => { const d = full.dates[s0 + wf.start + k + 1]; const e = byDate.get(d) || { s: 0, b: 0, n: 0 }; e.s += v; e.b += wf.bh[k]; e.n++; byDate.set(d, e); });
          const last = wf.chosen[wf.chosen.length - 1];
          perTicker.push({ t, name: nameOf(t), sharpe: wf.stats.sharpe, cagr: wf.stats.cagr, bhCagr: wf.bhStats.cagr, excess: wf.stats.cagr - wf.bhStats.cagr, maxDD: wf.stats.maxDD, turnover: wf.turnover, exposure: wf.exposure, param: last ? S.describe(last.grid) : '—', years: wf.oos.length / 52 });
        });
        dates = [...byDate.keys()].sort(); agg = dates.map(d => byDate.get(d).s / byDate.get(d).n); bh = dates.map(d => byDate.get(d).b / byDate.get(d).n);
        note = `Strategy applied to each stock separately; the portfolio line equal-weights all per-stock strategies active that week. Parameter grid: ${S.grid.map(g => S.describe(g)).join(' · ')}.`;
      }
      if (!agg || agg.length < 26) return (out.innerHTML = '<div class="empty-state"><div class="es-title">Not enough history for this train/test setup</div></div>');
      const s = QL.perfStats(agg), b = QL.perfStats(bh);
      const cmp = (label, a, bb, f, better = 1, tip) => stat(label, `${f(a)} <small>vs ${f(bb)}</small>`, (a - bb) * better >= 0 ? 'g' : 'r', tip);
      out.innerHTML = `<p class="tool-note">${note} Out-of-sample period: ${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}. Right-hand figure is equal-weight buy &amp; hold of the same stocks.</p>
        <div class="kpis">${cmp('CAGR', s.cagr, b.cagr, pct)}${cmp('Volatility', s.vol, b.vol, pctU, -1)}${cmp('Sharpe', s.sharpe, b.sharpe, num)}${cmp('Sortino', s.sortino, b.sortino, num)}${cmp('Max drawdown', s.maxDD, b.maxDD, pctU)}${cmp('Hit rate', s.hit, b.hit, v => pctU(v, 0), 1, 'Share of positive weeks')}</div>
        <div class="panel"><h4>Growth of $1 — strategy (net of costs) vs buy &amp; hold</h4><div class="chart-box tall"><canvas id="bt-ch"></canvas></div></div>
        <div class="panel" style="margin-top:12px"><h4>Drawdown</h4><div class="chart-box"><canvas id="bt-dd"></canvas></div></div>
        ${perTicker.length ? '<h4 style="margin-top:14px">Per-stock out-of-sample results</h4><div id="bt-tbl"></div>' : ''}`;
      const L = dates.map(shortDate), dd = c => { let pk = -Infinity; return c.map(v => { pk = Math.max(pk, v); return (v / pk - 1) * 100; }); };
      chart('bt-ch', { type: 'line', data: { labels: L, datasets: [{ label: 'Strategy', data: s.curve.slice(1), borderColor: css('--green-bright'), borderWidth: 2, pointRadius: 0 }, { label: 'Buy & hold', data: b.curve.slice(1), borderColor: css('--text-muted'), borderWidth: 1.4, borderDash: [4, 3], pointRadius: 0 }] },
        options: baseOpts({ scales: { x: { grid: { display: false } }, y: { type: 'logarithmic', position: 'right', grid: { color: cssA('--ink', .06) }, ticks: { autoSkip: false, callback: v => ([0.5, 0.75, 1, 1.5, 2, 3, 5, 7.5, 10, 15, 20, 30, 50, 75, 100].includes(+(+v).toPrecision(3)) ? '$' + (+v) : '') } } } }) });
      chart('bt-dd', { type: 'line', data: { labels: L, datasets: [{ label: 'Strategy', data: dd(s.curve.slice(1)), borderColor: css('--red'), backgroundColor: css('--red') + '33', fill: true, borderWidth: 1.4, pointRadius: 0 }, { label: 'Buy & hold', data: dd(b.curve.slice(1)), borderColor: css('--text-muted'), borderWidth: 1, pointRadius: 0 }] },
        options: baseOpts({ scales: { x: { grid: { display: false } }, y: { position: 'right', grid: { color: cssA('--ink', .06) }, ticks: { callback: v => v + '%' } } } }) });
      if (perTicker.length) table($('bt-tbl'), [{ key: 't', label: 'Ticker', fmt: v => `<b>${escapeHtml(v)}</b>` }, { key: 'name', label: 'Company' },
        { key: 'sharpe', label: 'OOS Sharpe', num: true, fmt: v => num(v), style: v => heat(v, 1.5) }, { key: 'cagr', label: 'CAGR', num: true, fmt: v => pct(v) }, { key: 'bhCagr', label: 'B&H CAGR', num: true, fmt: v => pct(v) },
        { key: 'excess', label: 'Excess', num: true, fmt: v => pct(v), style: v => heat(v, 0.3) }, { key: 'maxDD', label: 'Max DD', num: true, fmt: v => pctU(v, 0) }, { key: 'exposure', label: 'Time in market', num: true, fmt: v => pctU(v, 0) },
        { key: 'turnover', label: 'Turnover/yr', num: true, fmt: v => num(v, 1) + 'x' }, { key: 'param', label: 'Latest params' }], perTicker, { sortKey: 'sharpe' });
    },
  };

  // ═════════════════════════════════════════════════════════════════════════
  // SCREENER TABLE VIEW
  // ═════════════════════════════════════════════════════════════════════════
  let screenerOn = false;
  function renderScreener() {
    const el = $('screener'); if (!el || !screenerOn) return;
    const rows = [...document.querySelectorAll('#grid .card')].filter(c => c.style.display !== 'none').map(c => c.dataset.t).filter(t => D[t] && D[t].ok).map(t => {
      const d = D[t], f = d.fund || {};
      const mc = capUSD(t);
      return { t, name: nameOf(t), sector: sectorOf(t), price: d.price, d, chg1y: d.chg1y / 100, chg6m: d.chg6m / 100, score: d.score, vol: d.vol, sharpe: d.sharpe, sortino: d.sortino, maxDD: d.maxDD / 100, beta: d.beta, alpha: d.alpha, rsi: d.rsi, fg: d.fg.val, mom: d.momFactor / 100, pe: f.pe, fpe: f.fpe, mcap: mc, var95: d.var95 / 100 };
    });
    if (!rows.length) { el.innerHTML = ''; return; }
    table(el, [
      { key: 't', label: 'Ticker', fmt: v => `<b>${escapeHtml(v)}</b>` }, { key: 'name', label: 'Company' }, { key: 'sector', label: 'Sector' },
      { key: 'price', label: 'Price', num: true, fmt: (v, r) => fmtPx(r.d, v) },
      { key: 'score', label: 'Score', num: true, style: v => heat(v - 50, 45) },
      { key: 'chg6m', label: '6M', num: true, fmt: v => pct(v), style: v => heat(v, 0.8) }, { key: 'chg1y', label: '1Y', num: true, fmt: v => pct(v), style: v => heat(v, 1.2) },
      { key: 'mom', label: '12-1 Mom', num: true, fmt: v => pct(v), style: v => heat(v, 1) },
      { key: 'vol', label: 'Vol', num: true, fmt: v => pctU(v, 0) }, { key: 'sharpe', label: 'Sharpe', num: true, fmt: v => num(v), style: v => heat(v, 2) },
      { key: 'sortino', label: 'Sortino', num: true, fmt: v => num(v) }, { key: 'maxDD', label: 'Max DD', num: true, fmt: v => pctU(v, 0), style: v => heat(v, 0.6) },
      { key: 'var95', label: 'VaR 95%', num: true, fmt: v => pctU(v, 1) },
      { key: 'beta', label: 'Beta', num: true, fmt: v => num(v) }, { key: 'alpha', label: 'Alpha', num: true, fmt: v => pct(v), style: v => heat(v, 0.5) },
      { key: 'rsi', label: 'RSI', num: true, fmt: v => num(v, 0), style: v => heat(50 - v, 30) }, { key: 'fg', label: 'F&G', num: true, fmt: v => num(v, 0) },
      { key: 'pe', label: 'P/E', num: true, fmt: v => (v ? v.toFixed(1) : '—') }, { key: 'fpe', label: 'Fwd P/E', num: true, fmt: v => (v ? v.toFixed(1) : '—') },
      { key: 'mcap', label: 'Mkt cap (USD)', num: true, fmt: v => (v ? fmtBig(v, '$') : '—') },
    ], rows, { sortKey: 'score', onRow: r => openDetail(r.t) });
  }
  function setView(mode) {
    screenerOn = mode === 'table';
    $('grid').style.display = screenerOn ? 'none' : '';
    $('screener').style.display = screenerOn ? '' : 'none';
    document.querySelectorAll('#view-seg .btn').forEach(b => b.classList.toggle('on', b.dataset.v === mode));
    localStorage.setItem('csq_view', mode);
    renderScreener();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // DETAIL MODAL — regime & factor profile for one stock
  // ═════════════════════════════════════════════════════════════════════════
  let detailCharts = [];
  function renderDetailProfile(ticker) {
    detailCharts.forEach(c => c.destroy()); detailCharts = [];
    const box = $('det-profile'); if (!box) return;
    const r = hmmFor(ticker, 2);
    let fx = null; try { fx = computeFactors().exposures.find(e => e.t === ticker); } catch (e) { console.warn(e); }
    if (!r || !r.h) { box.innerHTML = '<p class="tool-note">Not enough history for the regime model.</p>'; return; }
    const h = r.h, n = h.gamma.length, show = Math.min(n, Math.max(rangeWeeks(), 104)), off = n - show, pT = h.gamma[n - 1][1];
    box.innerHTML = `<div class="kpis">${stat('Regime now', pT > 0.5 ? '<span class="r">Turbulent</span>' : '<span class="g">Calm</span>')}${stat('P(turbulent)', pctU(pT, 0))}${stat('Calm vol', pctU(h.sigma[0] * Math.sqrt(52), 0))}${stat('Turbulent vol', pctU(h.sigma[1] * Math.sqrt(52), 0))}
      ${fx ? stat('Systematic risk', pctU(1 - fx.idio, 0), '', 'Share of variance explained by the 5-factor model') + stat('Factor alpha', pct(fx.alpha), sign(fx.alpha), 'Annualized intercept of the 5-factor regression') : ''}</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap"><div class="panel" style="flex:1.4;min-width:300px"><h4>Probability of the turbulent regime</h4><div class="chart-box"><canvas id="det-rg"></canvas></div></div>
      ${fx ? '<div class="panel" style="flex:1;min-width:260px"><h4>Factor exposures (β)</h4><div class="chart-box"><canvas id="det-fx"></canvas></div></div>' : ''}</div>`;
    const mk = (id, cfg) => { const c = new Chart($(id).getContext('2d'), cfg); detailCharts.push(c); };
    mk('det-rg', { type: 'line', data: { labels: r.s.dates.slice(1).slice(off).map(shortDate), datasets: [{ data: h.gamma.slice(off).map(g => g[1] * 100), borderColor: css('--red'), backgroundColor: css('--red') + '30', fill: true, borderWidth: 1.3, pointRadius: 0, tension: 0.2 }] },
      options: baseOpts({ plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { position: 'right', min: 0, max: 100, grid: { color: cssA('--ink', .06) }, ticks: { callback: v => v + '%' } } } }) });
    const fnames = (factorCache && factorCache.names) || FACTOR_NAMES;
    if (fx) mk('det-fx', { type: 'bar', data: { labels: fnames, datasets: [{ data: fx.beta, backgroundColor: fx.beta.map(v => (v >= 0 ? css('--green-bright') : css('--red')) + 'bb'), borderRadius: 4 }] },
      options: baseOpts({ plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `β ${c.parsed.y.toFixed(2)} (t = ${fx.tstat[c.dataIndex].toFixed(1)})` } } }, scales: { x: { grid: { display: false } }, y: { position: 'right', grid: { color: cssA('--ink', .06) } } } }) });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PORTFOLIO LAB — drawdown forecast, volatility targeting, attribution
  // ═════════════════════════════════════════════════════════════════════════
  let ddHorizon = 52, ddDrift = 'zero', vtTarget = 0.2, vtMaxLev = 1.5, vtCapital = 100000, attrBench = 'cap';
  const labDD = {
    render(body) {
      const H = labHoldings(); if (H.length < 2) return needHoldings(body);
      const { rp, dates } = portfolioReturns(H);
      body.innerHTML = labControls(H, `<label class="range-wrap"><span>Horizon</span> <select class="search" id="dd-h">${[26, 52, 104].map(w => `<option value="${w}" ${w === ddHorizon ? 'selected' : ''}>${w === 104 ? '2 years' : w === 52 ? '1 year' : '6 months'}</option>`).join('')}</select></label>
        <label class="range-wrap" title="Zero drift removes the sample's average return, so a strong past decade doesn't flatter the forecast"><span>Drift</span> <select class="search" id="dd-d"><option value="zero" ${ddDrift === 'zero' ? 'selected' : ''}>Zero (conservative)</option><option value="hist" ${ddDrift === 'hist' ? 'selected' : ''}>Historical average</option></select></label>`);
      bindLab(); $('dd-h').addEventListener('change', e => { ddHorizon = +e.target.value; showTab('dd'); }); $('dd-d').addEventListener('change', e => { ddDrift = e.target.value; showTab('dd'); });
      const sim = QL.simulateDrawdowns(rp, { weeks: ddHorizon, paths: 5000, seed: 11, drift: ddDrift }), iid = QL.simulateDrawdowns(rp, { weeks: ddHorizon, paths: 5000, seed: 11, regime: false, drift: ddDrift });
      if (!sim) return body.insertAdjacentHTML('beforeend', '<div class="empty-state"><div class="es-title">Not enough history</div></div>');
      const g = sim.hmm.gamma[sim.hmm.gamma.length - 1], turb = g[1];
      body.insertAdjacentHTML('beforeend', `
        <p class="tool-note">5,000 simulated paths. Each week the market regime evolves by the hidden Markov model's transition probabilities (starting from today's regime probabilities), and a historical weekly return from that regime is drawn. This keeps volatility clustering and fat tails that a normal-distribution simulation misses. Fitted on ${dates.length} weeks of portfolio history (${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}). ${ddDrift === 'zero' ? 'Average return removed (zero drift): the forecast shows risk, not an expected gain.' : 'Uses the historical average return, which reflects a very strong decade for semiconductors, so the upside is likely optimistic.'}</p>
        <div class="kpis">
          ${stat('Median max drawdown', pctU(sim.maxDD.p50), 'r', 'Half of simulated paths have a deeper worst fall than this')}
          ${stat('Bad case (95th pct)', pctU(sim.maxDD.p5), 'r', '1 in 20 paths is worse than this')}
          ${stat('P(drawdown > 10%)', pctU(sim.prob(0.1), 0))}
          ${stat('P(drawdown > 20%)', pctU(sim.prob(0.2), 0))}
          ${stat('P(drawdown > 30%)', pctU(sim.prob(0.3), 0))}
          ${stat('Median return', pct(sim.terminal.p50), sign(sim.terminal.p50))}
          ${stat('Regime now', turb > 0.5 ? '<span class="r">Turbulent</span>' : '<span class="g">Calm</span>', '', `P(turbulent) = ${pctU(turb, 0)}`)}
          ${stat('vs i.i.d. model', pctU(iid.maxDD.p5), '', 'Bad-case drawdown if regimes are ignored (returns drawn independently)')}
        </div>
        <div class="tool-grid2"><div class="panel"><h4>Portfolio value paths (start = 1.00)</h4><div class="chart-box tall"><canvas id="dd-fan"></canvas></div><p class="tool-note">Shaded: 5–95% and 25–75% of paths; line: median.</p></div>
          <div class="panel"><h4>Distribution of the worst drawdown</h4><div class="chart-box tall"><canvas id="dd-hist"></canvas></div><p class="tool-note">Regime-switching vs an i.i.d. bootstrap of the same returns.</p></div></div>`);
      const L = sim.fan.map((_, w) => (w % 4 === 0 ? `wk ${w}` : ''));
      chart('dd-fan', { type: 'line', data: { labels: sim.fan.map((_, w) => w), datasets: [
        { label: '95%', data: sim.fan.map(f => f.p95), borderWidth: 0, pointRadius: 0, fill: false },
        { label: '5–95%', data: sim.fan.map(f => f.p5), borderWidth: 0, pointRadius: 0, fill: '-1', backgroundColor: cssA('--accent', 0.12) },
        { label: '75%', data: sim.fan.map(f => f.p75), borderWidth: 0, pointRadius: 0, fill: false },
        { label: '25–75%', data: sim.fan.map(f => f.p25), borderWidth: 0, pointRadius: 0, fill: '-1', backgroundColor: cssA('--accent', 0.22) },
        { label: 'Median', data: sim.fan.map(f => f.p50), borderColor: css('--accent'), borderWidth: 2, pointRadius: 0 } ] },
        options: baseOpts({ plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxTicksLimit: 60, callback(v) { const w = +this.getLabelForValue(v); return w % 13 === 0 ? `wk ${w}` : ''; } } }, y: { ticks: { callback: v => (+v).toFixed(2) } } } }) });
      const bins = []; for (let b = 0; b <= 60; b += 5) bins.push(b);
      const hist = arr => bins.map((b, i) => arr.filter(v => -v * 100 >= b && -v * 100 < (bins[i + 1] ?? 999)).length / arr.length * 100);
      chart('dd-hist', { type: 'bar', data: { labels: bins.map(b => `${b}%`), datasets: [
        { label: 'Regime-switching', data: hist(sim.mdd), backgroundColor: cssA('--down', 0.6), borderRadius: 3 },
        { label: 'i.i.d.', data: hist(iid.mdd), backgroundColor: cssA('--ink', 0.25), borderRadius: 3 } ] },
        options: baseOpts({ scales: { x: { grid: { display: false }, title: { display: true, text: 'Max drawdown over the horizon' } }, y: { ticks: { callback: v => v + '%' } } } }) });
    },
  };
  const labVT = {
    render(body) {
      const H = labHoldings(); if (H.length < 2) return needHoldings(body);
      body.innerHTML = labControls(H, `
        <label class="range-wrap"><span>Target vol</span> <select class="search" id="vt-t">${[0.1, 0.15, 0.2, 0.25, 0.3].map(v => `<option value="${v}" ${v === vtTarget ? 'selected' : ''}>${v * 100}%</option>`).join('')}</select></label>
        <label class="range-wrap"><span>Max leverage</span> <select class="search" id="vt-l">${[1, 1.5, 2].map(v => `<option value="${v}" ${v === vtMaxLev ? 'selected' : ''}>${v.toFixed(1)}×</option>`).join('')}</select></label>
        <label class="range-wrap"><span>Capital $</span> <input class="search num-in" id="vt-c" type="number" step="1000" value="${vtCapital}" style="width:110px !important"></label>`);
      bindLab();
      $('vt-t').addEventListener('change', e => { vtTarget = +e.target.value; showTab('vt'); });
      $('vt-l').addEventListener('change', e => { vtMaxLev = +e.target.value; showTab('vt'); });
      $('vt-c').addEventListener('change', e => { vtCapital = Math.max(0, +e.target.value || 0); showTab('vt'); });
      // Current EWMA vol per holding and a covariance rescaled to those vols.
      const M = returnMatrix(H.map(h => h.t), 104), n = M.tickers.length;
      if (n < 2) return body.insertAdjacentHTML('beforeend', '<div class="empty-state"><div class="es-title">Not enough overlapping history</div></div>');
      const sig = M.R.map(r => { const s = QL.ewmaVolSeries(r); return s[s.length - 1] || QL.std(r) * Math.sqrt(52); });
      const Corr = QL.corrFromCov(QL.covMatrix(M.R)), C = Corr.map((r, i) => r.map((c, j) => c * sig[i] * sig[j]));
      const wMap = new Map(H.map(h => [h.t, h.w])); let w0 = M.tickers.map(t => wMap.get(t) || 0); const z0 = w0.reduce((a, b) => a + b, 0); w0 = w0.map(x => x / z0);
      const pv = w => Math.sqrt(Math.max(0, QL.dot(w, QL.mv(C, w))));
      // Inverse-vol tilt (equal risk budget per unit of weight), then scale the whole book to the target.
      let wv = w0.map((x, i) => x / sig[i]); const zv = wv.reduce((a, b) => a + b, 0); wv = wv.map(x => x / zv);
      const scaleOrig = Math.min(vtMaxLev, vtTarget / pv(w0)), scaleVol = Math.min(vtMaxLev, vtTarget / pv(wv));
      const rows = M.tickers.map((t, i) => ({ t, name: nameOf(t), vol: sig[i], w: w0[i], wVol: wv[i], expo: wv[i] * scaleVol, usd: wv[i] * scaleVol * vtCapital, d: D[t] }));
      const { rp } = portfolioReturns(H), vm = QL.volManaged(rp, { target: vtTarget, maxLev: vtMaxLev });
      const raw = rp.slice(vm.start), sRaw = QL.perfStats(raw), sVm = QL.perfStats(vm.rets);
      const roll = a => a.map((_, i) => (i < 25 ? null : QL.std(a.slice(i - 25, i + 1)) * Math.sqrt(52) * 100));
      const { dates } = portfolioReturns(H), dts = dates.slice(vm.start);
      const cmp = (label, a, b, f, better = 1) => stat(label, `${f(a)} <small>vs ${f(b)}</small>`, (a - b) * better >= 0 ? 'g' : 'r');
      body.insertAdjacentHTML('beforeend', `
        <p class="tool-note">Volatility forecasts use RiskMetrics EWMA (λ = 0.94). <b>Position sizing</b>: holdings are tilted toward equal risk (weight ÷ volatility), then the whole book is scaled so forecast portfolio volatility hits the target, capped at the maximum leverage. The <b>backtest</b> applies the same idea over time (exposure = target ÷ last week's vol forecast), the "volatility-managed portfolio" of Moreira &amp; Muir (2017).</p>
        <div class="kpis">
          ${stat('Forecast vol (as held)', pctU(pv(w0)), '', 'Portfolio volatility with the current weights and no scaling')}
          ${stat('Exposure needed', num(scaleOrig, 2) + '×', '', `Scale the current weights by this to reach ${pctU(vtTarget, 0)} volatility`)}
          ${stat('Vol-tilted exposure', num(scaleVol, 2) + '×', '', 'Total exposure after the equal-risk tilt')}
          ${stat('Gross $ deployed', fmtBig(scaleVol * vtCapital, '$'))}
        </div>
        <div class="tool-grid2"><div id="vt-tbl"></div>
          <div><div class="kpis">${cmp('Realized vol', sVm.vol, sRaw.vol, pctU, -1)}${cmp('Sharpe', sVm.sharpe, sRaw.sharpe, num)}${cmp('Max drawdown', sVm.maxDD, sRaw.maxDD, pctU)}${cmp('CAGR', sVm.cagr, sRaw.cagr, pct)}</div>
            <div class="panel"><h4>Rolling 26-week volatility: vol-targeted vs as held</h4><div class="chart-box"><canvas id="vt-roll"></canvas></div></div></div></div>`);
      table($('vt-tbl'), [{ key: 't', label: 'Ticker', fmt: v => `<b>${escapeHtml(v)}</b>` }, { key: 'name', label: 'Company' },
        { key: 'vol', label: 'EWMA vol', num: true, fmt: v => pctU(v, 0) }, { key: 'w', label: 'Weight now', num: true, fmt: v => pctU(v) },
        { key: 'wVol', label: 'Vol-tilted', num: true, fmt: v => pctU(v) }, { key: 'expo', label: 'Target exposure', num: true, fmt: v => pctU(v) },
        { key: 'usd', label: 'Position $', num: true, fmt: v => fmtPx({ sym: '$' }, v) }], rows, { sortKey: 'expo' });
      chart('vt-roll', { type: 'line', data: { labels: dts.map(shortDate), datasets: [
        { label: 'Vol-targeted', data: roll(vm.rets), borderColor: css('--up'), borderWidth: 1.8, pointRadius: 0 },
        { label: 'As held', data: roll(raw), borderColor: css('--ink-3'), borderWidth: 1.2, borderDash: [4, 3], pointRadius: 0 },
        { label: 'Target', data: dts.map(() => vtTarget * 100), borderColor: css('--accent'), borderWidth: 1, borderDash: [2, 3], pointRadius: 0 } ] },
        options: baseOpts({ scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => v + '%' } } } }) });
    },
  };
  const labAttr = {
    render(body) {
      const H = labHoldings(); if (H.length < 2) return needHoldings(body);
      body.innerHTML = labControls(H, `<label class="range-wrap"><span>Benchmark</span> <select class="search" id="at-b"><option value="cap" ${attrBench === 'cap' ? 'selected' : ''}>Cap-weighted universe</option><option value="ew" ${attrBench === 'ew' ? 'selected' : ''}>Equal-weight universe</option></select></label>`);
      bindLab(); $('at-b').addEventListener('change', e => { attrBench = e.target.value; showTab('attr'); });
      const weeks = Math.max(rangeWeeks(), 52), uni = visibleTickers(), all = [...new Set([...uni, ...H.map(h => h.t)])];
      const M = returnMatrix(all, weeks), n = M.tickers.length;
      if (n < 3) return body.insertAdjacentHTML('beforeend', '<div class="empty-state"><div class="es-title">Not enough overlapping history</div></div>');
      const wMap = new Map(H.map(h => [h.t, h.w])); let wp = M.tickers.map(t => wMap.get(t) || 0); const zp = wp.reduce((a, b) => a + b, 0); wp = wp.map(x => x / zp);
      const inUni = new Set(uni), caps = M.tickers.map(t => (inUni.has(t) ? (attrBench === 'cap' ? capUSD(t) || 0 : 1) : 0)), zc = caps.reduce((a, b) => a + b, 0); const wb = caps.map(c => c / zc);
      const grp = M.tickers.map(sectorOf), T = M.dates.length;
      // Weekly Brinson-Fachler (weights held constant, i.e. rebalanced weekly), Carino-linked.
      const rp = [], rb = [], eff = [], secs = [...new Set(grp)], perSec = [];
      for (let t = 0; t < T; t++) {
        const r = M.R.map(x => x[t]), b = QL.brinson(wp, wb, r, grp); rp.push(b.Rp); rb.push(b.Rb);
        const row = []; secs.forEach(sc => { const x = b.rows.find(y => y.g === sc); row.push(x.alloc, x.select, x.inter); }); eff.push(row);
      }
      const L = QL.carinoLink(rp, rb, eff);
      secs.forEach((sc, k) => { const ix = grp.map((g, i) => (g === sc ? i : -1)).filter(i => i >= 0);
        perSec.push({ sc, wp: ix.reduce((s, i) => s + wp[i], 0), wb: ix.reduce((s, i) => s + wb[i], 0), alloc: L.linked[3 * k], select: L.linked[3 * k + 1], inter: L.linked[3 * k + 2] }); });
      perSec.forEach(r => (r.total = r.alloc + r.select + r.inter));
      const tot = k => perSec.reduce((s, r) => s + r[k], 0);
      // Factor attribution of the portfolio's own return over the same window.
      let fa = null;
      try {
        const fc = computeFactors(), fi = new Map(fc.dates.map((d, i) => [d, i])), idx = M.dates.map(d => fi.get(d));
        const y = [], X = []; M.dates.forEach((d, t) => { const i = idx[t]; if (i == null) return; const f = fc.names.map(k => fc.F[k][i]); if (f.some(v => v == null)) return; y.push(rp[t]); X.push([1, ...f]); });
        if (y.length > 30) { const reg = QL.ols(y, X), sumF = fc.names.map((_, k) => X.reduce((s, x) => s + x[k + 1], 0));
          fa = { rows: fc.names.map((k, j) => ({ k, beta: reg.b[j + 1], contrib: reg.b[j + 1] * sumF[j] })), alpha: reg.b[0] * y.length, resid: reg.resid.reduce((s, v) => s + v, 0), total: y.reduce((s, v) => s + v, 0), r2: reg.r2 }; }
      } catch (e) { console.warn(e); }
      body.insertAdjacentHTML('beforeend', `
        <p class="tool-note"><b>Brinson-Fachler</b> splits the portfolio's excess return over the benchmark into <b>allocation</b> (over/under-weighting sectors that beat or lagged the benchmark), <b>selection</b> (picking better or worse stocks within a sector) and <b>interaction</b>. Weekly effects are linked with Carino smoothing so they add up exactly to the compounded excess return. ${fmtDate(M.dates[0])} – ${fmtDate(M.dates[T - 1])}, ${n} companies.</p>
        <div class="kpis">${stat('Portfolio return', pct(L.Rp), sign(L.Rp))}${stat('Benchmark return', pct(L.Rb), sign(L.Rb))}${stat('Excess return', pct(L.excess), sign(L.excess))}
          ${stat('Allocation', pct(tot('alloc')), sign(tot('alloc')))}${stat('Selection', pct(tot('select')), sign(tot('select')))}${stat('Interaction', pct(tot('inter')), sign(tot('inter')))}</div>
        <div class="tool-grid2"><div id="at-tbl"></div><div class="panel"><h4>Excess return by sector</h4><div class="chart-box tall"><canvas id="at-ch"></canvas></div></div></div>
        ${fa ? `<h4 style="margin-top:16px">Factor attribution of the portfolio's return</h4><p class="tool-note">Return explained by exposure to each factor (β × cumulative factor return), plus alpha and an unexplained residual. Arithmetic sums of weekly returns, R² ${num(fa.r2)}.</p><div id="at-fa"></div>` : ''}`);
      table($('at-tbl'), [{ key: 'sc', label: 'Sector', fmt: v => `<b>${escapeHtml(v)}</b>` }, { key: 'wp', label: 'Port. wt', num: true, fmt: v => pctU(v) }, { key: 'wb', label: 'Bench. wt', num: true, fmt: v => pctU(v) },
        { key: 'alloc', label: 'Allocation', num: true, fmt: v => pct(v, 2), style: v => heat(v, 0.1) }, { key: 'select', label: 'Selection', num: true, fmt: v => pct(v, 2), style: v => heat(v, 0.1) },
        { key: 'inter', label: 'Interaction', num: true, fmt: v => pct(v, 2) }, { key: 'total', label: 'Total', num: true, fmt: v => pct(v, 2), style: v => heat(v, 0.1) }], perSec, { sortKey: 'total' });
      const sorted = [...perSec].sort((a, b) => b.total - a.total);
      chart('at-ch', { type: 'bar', data: { labels: sorted.map(r => r.sc), datasets: [
        { label: 'Allocation', data: sorted.map(r => r.alloc * 100), backgroundColor: css('--accent') + 'cc', stack: 's' },
        { label: 'Selection', data: sorted.map(r => r.select * 100), backgroundColor: css('--violet') + 'cc', stack: 's' },
        { label: 'Interaction', data: sorted.map(r => r.inter * 100), backgroundColor: cssA('--ink', 0.3), stack: 's' } ] },
        options: baseOpts({ indexAxis: 'y', scales: { x: { stacked: true, ticks: { callback: v => v + '%' } }, y: { stacked: true, grid: { display: false } } } }) });
      if (fa) table($('at-fa'), [{ key: 'k', label: 'Source', fmt: v => `<b>${escapeHtml(v)}</b>` }, { key: 'beta', label: 'Exposure β', num: true, fmt: v => (v == null ? '' : num(v)) }, { key: 'contrib', label: 'Return contribution', num: true, fmt: v => pct(v, 1), style: v => heat(v, 0.5) }],
        [...fa.rows, { k: 'Alpha', beta: null, contrib: fa.alpha }, { k: 'Residual', beta: null, contrib: fa.resid }, { k: 'Total (sum of weekly returns)', beta: null, contrib: fa.total }]);
    },
  };
  const labTool = {
    title: 'Portfolio Lab',
    sub: () => 'Risk decomposition and stress tests, regime-aware drawdown forecasting, volatility-targeted sizing and performance attribution for a portfolio of your choice.',
    tabs: [
      { id: 'main', label: 'Risk & stress', render: b => labRisk.render(b) },
      { id: 'dd', label: 'Drawdown forecast', render: b => labDD.render(b) },
      { id: 'vt', label: 'Volatility targeting', render: b => labVT.render(b) },
      { id: 'attr', label: 'Attribution', render: b => labAttr.render(b) },
    ],
  };

  // ═════════════════════════════════════════════════════════════════════════
  // REGIMES — correlation dynamics tab
  // ═════════════════════════════════════════════════════════════════════════
  regimeTool.tabs.push({ id: 'corr', label: 'Correlation dynamics', render(body) {
    const weeks = Math.max(rangeWeeks(), 156), vis = visibleTickers().slice(0, 45), pn = panel(vis, weeks + 1);
    const keep = vis.map((t, i) => i).filter(i => pn.R[i].slice(1).every(v => v != null));
    if (keep.length < 4) return needMore(body, 'Need at least 4 visible companies with full history over the window.');
    const R = keep.map(i => pn.R[i].slice(1)), dates = pn.dates.slice(1), tk = keep.map(i => vis[i]);
    const roll = QL.rollingAvgCorr(R, 26), ew = QL.ewmaAvgCorr(R, 0.94);
    // Regime of the sector (SOXX) each week, from the 2-state HMM fitted on full history.
    const sx = hmmFor('SOXX', 2), sxIdx = new Map(sx.s.dates.slice(1).map((d, i) => [d, i]));
    const pT = dates.map(d => { const i = sxIdx.get(d); return i == null ? null : sx.h.gamma[i][1]; });
    const calmIx = dates.map((_, t) => t).filter(t => pT[t] != null && pT[t] < 0.5), turbIx = dates.map((_, t) => t).filter(t => pT[t] != null && pT[t] >= 0.5);
    const corrOn = ix => QL.corrFromCov(QL.covMatrix(R.map(r => ix.map(t => r[t]))));
    const Cc = calmIx.length > 20 ? corrOn(calmIx) : null, Ct = turbIx.length > 20 ? corrOn(turbIx) : null;
    const ewNow = ew.filter(v => v != null).slice(-1)[0], med = [...roll.filter(v => v != null)].sort((a, b) => a - b), medV = med[Math.floor(med.length / 2)];
    const divRatio = ix => { const Rm = R.map(r => ix.map(t => r[t])), C = QL.covMatrix(Rm), w = R.map(() => 1 / R.length); return QL.riskDecomposition(w, C).divRatio; };
    body.innerHTML = `<p class="tool-note">Average pairwise correlation of weekly returns across ${keep.length} visible companies with full history over ${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}. Shading shows when the semiconductor sector (SOXX) was in its turbulent regime (${turbIx.length} turbulent vs ${calmIx.length} calm weeks). Diversification typically weakens exactly when it's needed: correlations rise in sell-offs. Pair-level figures rest on few turbulent weeks, so treat individual pairs as indicative.</p>
      <div class="kpis">${stat('Avg correlation now', num(ewNow), '', 'EWMA (λ = 0.94), RiskMetrics-style')}${stat('Median (window)', num(medV))}
        ${Cc ? stat('In calm weeks', num(QL.avgCorr(Cc))) : ''}${Ct ? stat('In turbulent weeks', num(QL.avgCorr(Ct)), Ct && Cc && QL.avgCorr(Ct) > QL.avgCorr(Cc) ? 'r' : '') : ''}
        ${Cc ? stat('Diversification (calm)', num(divRatio(calmIx)) + '×', '', 'Equal-weight portfolio: Σ w·σ ÷ σ_portfolio') : ''}${Ct ? stat('Diversification (turbulent)', num(divRatio(turbIx)) + '×') : ''}</div>
      <div class="panel"><h4>Average pairwise correlation over time</h4><div class="chart-box tall"><canvas id="cd-ch"></canvas></div></div>
      ${Cc && Ct ? '<h4 style="margin-top:14px">Pairs whose correlation rises most in turbulent markets</h4><div id="cd-tbl"></div>' : ''}`;
    chart('cd-ch', { data: { labels: dates.map(shortDate), datasets: [
      { type: 'line', label: 'Turbulent regime', data: pT.map(v => (v != null && v >= 0.5 ? 1 : 0)), yAxisID: 'bg', fill: 'origin', backgroundColor: cssA('--down', 0.1), borderWidth: 0, pointRadius: 0, stepped: true },
      { type: 'line', label: 'Rolling 26-week', data: roll, yAxisID: 'y', borderColor: css('--ink-3'), borderWidth: 1.2, pointRadius: 0 },
      { type: 'line', label: 'EWMA (λ = 0.94)', data: ew, yAxisID: 'y', borderColor: css('--accent'), borderWidth: 1.8, pointRadius: 0 } ] },
      options: baseOpts({ scales: { x: { grid: { display: false } }, y: { position: 'right', min: 0, max: 1 }, bg: { display: false, min: 0, max: 1 } } }) });
    if (Cc && Ct) {
      const pairs = []; for (let i = 0; i < tk.length; i++) for (let j = i + 1; j < tk.length; j++) pairs.push({ pair: `${tk[i]} / ${tk[j]}`, calm: Cc[i][j], turb: Ct[i][j], jump: Ct[i][j] - Cc[i][j] });
      table($('cd-tbl'), [{ key: 'pair', label: 'Pair', fmt: v => `<b>${escapeHtml(v)}</b>` }, { key: 'calm', label: 'Calm corr', num: true, fmt: v => num(v) }, { key: 'turb', label: 'Turbulent corr', num: true, fmt: v => num(v) },
        { key: 'jump', label: 'Change', num: true, fmt: v => (v >= 0 ? '+' : '') + num(v), style: v => heat(v, 0.5, true) }], pairs, { sortKey: 'jump', maxRows: 20 });
    }
  } });

  // ═════════════════════════════════════════════════════════════════════════
  // EARNINGS — event study, post-earnings drift, upcoming reports
  // ═════════════════════════════════════════════════════════════════════════
  let earnBench = 'SOXX', earnTicker = '__all';
  const earnCache = new Map();
  function earningsStudy(t, bench) {
    const key = `${t}|${bench}|${MARKET.meta && MARKET.meta.generated_at}`; if (earnCache.has(key)) return earnCache.get(key);
    const ev = ((MARKET.tickers[t] || {}).earnings || []).map(e => (Array.isArray(e) ? { d: e[0], est: e[1], act: e[2], surp: e[3] } : e));
    const pn = panel([t, bench]), r = pn.R[0], m = pn.R[1];
    const events = ev.map(e => ({ ...e, t0: QL.eventWeekIndex(pn.dates, e.d), beat: e.est != null ? e.act > e.est : null })).filter(e => e.t0 > 0);
    const es = QL.eventStudy(r, m, events, { pre: 4, post: 8 });
    es.events.forEach(e => { e.date = pn.dates[e.t0]; e.drift = e.car[e.car.length - 1] - e.car[es.pre]; });
    const out = { t, raw: ev, es }; earnCache.set(key, out); return out;
  }
  const poolEvents = list => { const evs = list.flatMap(x => x.es.events); const L = evs[0] ? evs[0].ar.length : 0;
    const path = (sel, key) => { const e = evs.filter(sel); return { n: e.length, m: Array.from({ length: L }, (_, k) => QL.mean(e.map(x => x[key][k]))), se: Array.from({ length: L }, (_, k) => (e.length > 1 ? QL.std(e.map(x => x[key][k])) / Math.sqrt(e.length) : 0)) }; };
    return { evs, path }; };
  const earningsTool = {
    title: 'Earnings Analysis',
    sub: () => `Market-model event study around ${Object.values(MARKET.tickers || {}).reduce((s, e) => s + ((e.earnings || []).length), 0).toLocaleString()} past earnings reports (EPS estimate vs actual from Yahoo). Abnormal return = weekly return minus what the stock's beta to the benchmark predicts, estimated on the year before each report (excluding other earnings weeks). ${universeNote(visibleTickers().length)}`,
    tabs: [
      { id: 'up', label: 'Upcoming & earnings risk', render(body) {
        const now = Date.now();
        const rows = visibleTickers().map(t => {
          const st = earningsStudy(t, earnBench), es = st.es, f = normFund((MARKET.tickers[t] || {}).fund) || {};
          const days = f.earnDate ? Math.ceil((f.earnDate.getTime() - now) / 86400000) : null;
          const withEst = st.raw.filter(e => e.est != null), beats = withEst.filter(e => e.act > e.est).length;
          const b = es.events.filter(e => e.beat === true), m = es.events.filter(e => e.beat === false);
          return { t, name: nameOf(t), next: f.earnDate ? f.earnDate.toISOString().slice(0, 10) : null, days: days != null && days >= -3 ? days : null, n: es.n,
            absMove: es.absAr0, mult: es.moveMultiple, beat: withEst.length ? beats / withEst.length : null,
            surp: withEst.length ? QL.mean(st.raw.filter(e => e.surp != null).map(e => e.surp / 100)) : null,
            pead: b.length >= 3 && m.length >= 3 ? QL.mean(b.map(e => e.drift)) - QL.mean(m.map(e => e.drift)) : null };
        });
        const soon = rows.filter(r => r.days != null && r.days >= 0 && r.days <= 21).length;
        const valid = rows.filter(r => r.mult != null);
        body.innerHTML = `<div class="tool-controls"><div class="seg">${['SOXX', 'SPY'].map(x => `<button class="btn ${x === earnBench ? 'on' : ''}" data-b="${x}">vs ${x}</button>`).join('')}</div></div>
          <div class="kpis">${stat('Reporting in 3 weeks', soon)}${stat('Median move multiple', valid.length ? num([...valid.map(r => r.mult)].sort((a, b) => a - b)[Math.floor(valid.length / 2)]) + '×' : '—', '', 'Earnings-week abnormal move ÷ a typical week’s move')}
            ${stat('Median beat rate', pctU([...rows.filter(r => r.beat != null).map(r => r.beat)].sort((a, b) => a - b)[Math.floor(rows.filter(r => r.beat != null).length / 2)], 0))}</div>
          <p class="tool-note"><b>Move multiple</b>: how many times bigger the stock's earnings-week move is than a normal week (above ~2× means earnings dominate its risk). <b>Beat rate</b>: share of reports with actual EPS above the consensus estimate. <b>Drift</b>: average abnormal return in the 8 weeks <i>after</i> beats minus after misses. Positive values are the classic post-earnings-announcement drift. Click a row for its event study.</p><div id="eu-tbl"></div>`;
        body.querySelectorAll('[data-b]').forEach(x => x.addEventListener('click', () => { earnBench = x.dataset.b; showTab('up'); }));
        table($('eu-tbl'), [{ key: 't', label: 'Ticker', fmt: v => `<b>${escapeHtml(v)}</b>` }, { key: 'name', label: 'Company' },
          { key: 'next', label: 'Next report', fmt: v => (v ? fmtDate(v) : '—') }, { key: 'days', label: 'Days', num: true, fmt: v => (v == null ? '—' : v), style: v => (v != null && v >= 0 && v <= 14 ? 'background:var(--accent-wash);color:var(--accent)' : '') },
          { key: 'n', label: 'Events', num: true }, { key: 'absMove', label: 'Avg |move|', num: true, fmt: v => pctU(v, 1), title: 'Average absolute abnormal return in the earnings week' },
          { key: 'mult', label: 'Move ×', num: true, fmt: v => (v == null ? '—' : v.toFixed(1) + '×'), style: v => heat(v == null ? 0 : v - 2, 3, true) },
          { key: 'beat', label: 'Beat rate', num: true, fmt: v => pctU(v, 0) }, { key: 'surp', label: 'Avg surprise', num: true, fmt: v => pct(v, 0) },
          { key: 'pead', label: 'Drift beat−miss', num: true, fmt: v => pct(v, 1), style: v => heat(v, 0.1), title: 'Post-earnings drift: 8-week abnormal return after beats minus after misses' }],
          rows, { sortKey: 'days', sortDir: 1, onRow: r => { earnTicker = r.t; showTab('study'); } });
      } },
      { id: 'study', label: 'Event study', render(body) {
        const vis = visibleTickers(), list = earnTicker === '__all' ? vis.map(t => earningsStudy(t, earnBench)) : [earningsStudy(earnTicker, earnBench)];
        const P = poolEvents(list), all = P.path(() => true, 'car'), beat = P.path(e => e.beat === true, 'car'), miss = P.path(e => e.beat === false, 'car');
        const pre = 4, taus = Array.from({ length: all.m.length }, (_, k) => k - pre);
        const drift = sel => { const e = P.evs.filter(sel).map(x => x.drift); return { m: QL.mean(e), t: e.length > 2 ? QL.mean(e) / (QL.std(e) / Math.sqrt(e.length)) : 0, n: e.length }; };
        const dB = drift(e => e.beat === true), dM = drift(e => e.beat === false), ar0 = P.evs.map(e => e.ar0);
        const opts = `<option value="__all" ${earnTicker === '__all' ? 'selected' : ''}>All visible companies (pooled)</option>` + vis.map(t => `<option value="${t}" ${t === earnTicker ? 'selected' : ''}>${t} · ${escapeHtml(nameOf(t))}</option>`).join('');
        body.innerHTML = `<div class="tool-controls"><label class="range-wrap"><span>Company</span> <select class="search" id="es-t">${opts}</select></label>
            <div class="seg">${['SOXX', 'SPY'].map(x => `<button class="btn ${x === earnBench ? 'on' : ''}" data-b="${x}">vs ${x}</button>`).join('')}</div></div>
          ${!P.evs.length ? '<div class="empty-state big"><div class="es-title">No earnings history for this selection</div><div class="es-sub">Yahoo has no past reports for it (common for some ADRs).</div></div>' : `
          <div class="kpis">${stat('Events', P.evs.length)}${stat('Avg |earnings-week move|', pctU(QL.mean(ar0.map(Math.abs)), 1))}${stat('Avg move (signed)', pct(QL.mean(ar0), 2), sign(QL.mean(ar0)))}
            ${stat('Drift after beats', `${pct(dB.m, 1)} <small>t=${num(dB.t, 1)}</small>`, Math.abs(dB.t) > 2 ? sign(dB.m) : '', `n = ${dB.n}; weeks +1..+8`)}
            ${stat('Drift after misses', `${pct(dM.m, 1)} <small>t=${num(dM.t, 1)}</small>`, Math.abs(dM.t) > 2 ? sign(dM.m) : '', `n = ${dM.n}; weeks +1..+8`)}</div>
          <div class="panel"><h4>Cumulative abnormal return around the report (week 0 = earnings week)</h4><div class="chart-box tall"><canvas id="es-ch"></canvas></div><p class="tool-note">Shaded bands: ±2 standard errors of the mean. If the lines keep separating after week 0, the market under-reacted to the news (post-earnings drift).</p></div>
          ${earnTicker !== '__all' ? '<h4 style="margin-top:14px">Individual reports</h4><div id="es-tbl"></div>' : ''}`}`;
        $('es-t').addEventListener('change', e => { earnTicker = e.target.value; showTab('study'); });
        body.querySelectorAll('[data-b]').forEach(x => x.addEventListener('click', () => { earnBench = x.dataset.b; showTab('study'); }));
        if (!P.evs.length) return;
        const band = (p, col, label) => [
          { label: label + ' +2se', data: p.m.map((v, k) => (v + 2 * p.se[k]) * 100), borderWidth: 0, pointRadius: 0, fill: false },
          { label: label + ' band', data: p.m.map((v, k) => (v - 2 * p.se[k]) * 100), borderWidth: 0, pointRadius: 0, fill: '-1', backgroundColor: cssA(col, 0.12) },
          { label: `${label} (n=${p.n})`, data: p.m.map(v => v * 100), borderColor: css(col), borderWidth: 2, pointRadius: 2 } ];
        chart('es-ch', { type: 'line', data: { labels: taus.map(k => (k === 0 ? 'wk 0' : (k > 0 ? '+' : '') + k)), datasets: [
          ...(beat.n >= 3 ? band(beat, '--up', 'Beats') : []), ...(miss.n >= 3 ? band(miss, '--down', 'Misses') : []),
          { label: `All (n=${all.n})`, data: all.m.map(v => v * 100), borderColor: css('--ink-3'), borderWidth: 1.4, borderDash: [4, 3], pointRadius: 0 } ] },
          options: baseOpts({ plugins: { legend: { labels: { filter: i => !/\+2se|band/.test(i.text) } } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => v + '%' } } } }) });
        if (earnTicker !== '__all') table($('es-tbl'), [{ key: 'd', label: 'Report', fmt: v => fmtDate(v) }, { key: 'est', label: 'EPS est.', num: true, fmt: v => (v == null ? '—' : v.toFixed(2)) }, { key: 'act', label: 'EPS actual', num: true, fmt: v => v.toFixed(2) },
          { key: 'surp', label: 'Surprise', num: true, fmt: v => (v == null ? '—' : pct(v / 100, 1)) }, { key: 'ar0', label: 'Week-0 abnormal', num: true, fmt: v => pct(v, 1), style: v => heat(v, 0.2) },
          { key: 'drift', label: 'Drift +1..+8', num: true, fmt: v => pct(v, 1), style: v => heat(v, 0.2) }], [...list[0].es.events].reverse(), {});
      } },
    ],
  };

  // ═════════════════════════════════════════════════════════════════════════
  // TIMELINE REPLAY & SIGNAL RESEARCH (information coefficient)
  // ═════════════════════════════════════════════════════════════════════════
  // The dashboard's quant score, recomputed using only data up to week T (point in time).
  function pointInTime(closes, spy) {
    const cur = closes[closes.length - 1], i6 = Math.max(0, closes.length - 26), i1 = Math.max(0, closes.length - 52);
    const chg6m = ((cur - closes[i6]) / closes[i6]) * 100, chg1y = ((cur - closes[i1]) / closes[i1]) * 100;
    const rsi = calcRSI(closes, 14), stoch = calcStoch(closes, 14), { vol, sharpe, sortino } = calcVolAndRisk(closes);
    const macd = calcMACD(closes), bb = calcBollinger(closes, 20), tech = calcTechAndFib(closes), fg = calcFearGreed(rsi, stoch, vol);
    const alpha = spy && spy.length === closes.length ? calcBetaAlphaAndMore(closes, spy).alpha : 0;
    let momentum = 'NEUTRAL'; if (cur < bb.lower || (cur < bb.sma && rsi < 30)) momentum = 'OVERSOLD'; else if (cur > bb.upper || rsi > 75) momentum = 'OVERBOUGHT';
    return { score: quantScore({ chg6m, chg1y, macdHist: macd.hist, price: cur, momentum, fg: fg.val, sortino, sharpe, sma10: tech.sma10, sma40: tech.sma40, alpha }), momentum, fg: fg.val, fgLabel: fg.label, rsi, chg1y: chg1y / 100 };
  }
  function scoresAt(pn, spyP, T, W) {
    const out = [];
    pn.P.forEach((p, i) => {
      if (T - W + 1 < 0) return; const c = p.slice(T - W + 1, T + 1), s = spyP.slice(T - W + 1, T + 1);
      if (c.some(v => v == null) || s.some(v => v == null)) return;
      out.push({ i, ...pointInTime(c, s) });
    });
    return out;
  }
  const fwd = (p, T, h) => (T + h < p.length && p[T] != null && p[T + h] != null ? p[T + h] / p[T] - 1 : null);
  let replayT = null, icHorizon = 13;
  const replayTool = {
    title: 'Timeline Replay & Signal Research',
    sub: () => `Recompute the dashboard's quant score as it would have looked on any past week, using only data available then, and measure how well it predicted what happened next. ${universeNote(visibleTickers().length)}`,
    tabs: [
      { id: 'replay', label: 'Replay a week', render(body) {
        const vis = visibleTickers(), pn = panel(vis), spyP = panel(['SPY']).P[0], W = rangeWeeks(), G = pn.dates.length;
        const minT = W + 1, maxT = G - 1; if (replayT == null || replayT > maxT || replayT < minT) replayT = Math.max(minT, G - 1 - 26);
        const T = replayT, sc = scoresAt(pn, spyP, T, W);
        const rows = sc.map(x => ({ t: vis[x.i], name: nameOf(vis[x.i]), price: pn.P[x.i][T], d: D[vis[x.i]], score: x.score, momentum: sentence(x.momentum), fg: x.fg, f4: fwd(pn.P[x.i], T, 4), f13: fwd(pn.P[x.i], T, 13), f26: fwd(pn.P[x.i], T, 26) }));
        const ic = QL.spearman(rows.map(r => r.score), rows.map(r => r.f13));
        const q = [...rows].filter(r => r.f13 != null).sort((a, b) => b.score - a.score), k = Math.max(1, Math.floor(q.length / 5));
        const top = q.length ? QL.mean(q.slice(0, k).map(r => r.f13)) : null, bot = q.length ? QL.mean(q.slice(-k).map(r => r.f13)) : null;
        const spyF = fwd(spyP, T, 13);
        body.innerHTML = `<div class="tool-controls" style="flex-wrap:nowrap"><span class="label">Week</span><input type="range" id="rp-s" min="${minT}" max="${maxT}" value="${T}" style="flex:1;accent-color:var(--accent)"><b style="font:15px var(--mono);white-space:nowrap">${fmtDate(pn.dates[T])}</b>
            <button class="btn btn-xs" id="rp-b">← 4w</button><button class="btn btn-xs" id="rp-f">4w →</button></div>
          <div class="kpis">${stat('Companies scored', rows.length)}${stat('Next-13-week IC', ic == null ? '—' : num(ic), sign(ic), 'Spearman rank correlation between the score that week and the next 13 weeks’ return')}
            ${stat('Top-quintile next 13w', pct(top), sign(top))}${stat('Bottom-quintile next 13w', pct(bot), sign(bot))}${stat('Spread', pct(top != null && bot != null ? top - bot : null), sign(top - bot))}${stat('SPY next 13w', pct(spyF), sign(spyF))}</div>
          <p class="tool-note">Scores use the same model and look-back (the Range selector) as the dashboard, computed only from prices up to the selected week. Forward returns show what happened afterwards. Blank means the future hasn't happened yet. The company list is today's, so results carry survivorship bias.</p><div id="rp-tbl"></div>`;
        const go = v => { replayT = Math.min(maxT, Math.max(minT, v)); showTab('replay'); };
        $('rp-s').addEventListener('change', e => go(+e.target.value));
        $('rp-b').addEventListener('click', () => go(T - 4)); $('rp-f').addEventListener('click', () => go(T + 4));
        table($('rp-tbl'), [{ key: 't', label: 'Ticker', fmt: v => `<b>${escapeHtml(v)}</b>` }, { key: 'name', label: 'Company' },
          { key: 'price', label: 'Price then', num: true, fmt: (v, r) => fmtPx(r.d, v) }, { key: 'score', label: 'Score then', num: true, style: v => heat(v - 50, 45) },
          { key: 'momentum', label: 'Signal' }, { key: 'fg', label: 'F&G', num: true, fmt: v => num(v, 0) },
          { key: 'f4', label: 'Next 4w', num: true, fmt: v => pct(v), style: v => heat(v, 0.3) }, { key: 'f13', label: 'Next 13w', num: true, fmt: v => pct(v), style: v => heat(v, 0.5) }, { key: 'f26', label: 'Next 26w', num: true, fmt: v => pct(v), style: v => heat(v, 0.8) }],
          rows, { sortKey: 'score', onRow: r => { closeTool(); openDetail(r.t); } });
      } },
      { id: 'ic', label: 'Signal research (IC)', render(body) {
        const vis = visibleTickers(), pn = panel(vis), spyP = panel(['SPY']).P[0], W = rangeWeeks(), G = pn.dates.length;
        const hs = [1, 4, 8, 13, 26], step = 4, start = Math.max(W + 1, G - 1 - 260), dates = [];
        const ics = Object.fromEntries(hs.map(h => [h, []])), quint = [[], [], [], [], []];
        for (let T = start; T < G - 1; T += step) {
          const sc = scoresAt(pn, spyP, T, W); if (sc.length < 10) continue;
          dates.push({ T, d: pn.dates[T] });
          hs.forEach(h => { const f = sc.map(x => fwd(pn.P[x.i], T, h)); ics[h].push({ T, ic: f.some(v => v != null) ? QL.spearman(sc.map(x => x.score), f) : null }); });
          const f = sc.map(x => ({ s: x.score, r: fwd(pn.P[x.i], T, icHorizon) })).filter(x => x.r != null).sort((a, b) => a.s - b.s);
          if (f.length >= 10) for (let q = 0; q < 5; q++) { const a = Math.floor((q * f.length) / 5), b = Math.floor(((q + 1) * f.length) / 5); quint[q].push(QL.mean(f.slice(a, b).map(x => x.r))); }
        }
        // t-stat on non-overlapping observations (every h weeks) so overlapping horizons don't inflate it.
        const summary = h => { const all = ics[h].filter(x => x.ic != null), no = all.filter((x, k) => ((x.T - start) / step) % Math.max(1, Math.round(h / step)) === 0).map(x => x.ic), v = all.map(x => x.ic);
          return { h, mean: QL.mean(v), ir: QL.std(v) ? QL.mean(v) / QL.std(v) : 0, t: no.length > 2 ? QL.mean(no) / (QL.std(no) / Math.sqrt(no.length)) : null, pos: v.filter(x => x > 0).length / (v.length || 1), n: v.length, nNo: no.length }; };
        const S = hs.map(summary), cur = S.find(x => x.h === icHorizon);
        body.innerHTML = `<div class="tool-controls"><label class="range-wrap"><span>Horizon</span> <select class="search" id="ic-h">${[4, 13, 26].map(h => `<option value="${h}" ${h === icHorizon ? 'selected' : ''}>${h} weeks</option>`).join('')}</select></label>
            <span class="tool-note" style="margin:0">${dates.length} rebalance dates, every ${step} weeks, ${fmtDate(dates[0].d)} – ${fmtDate(dates[dates.length - 1].d)}</span></div>
          <div class="kpis">${stat('Mean IC', num(cur.mean, 3), sign(cur.mean), 'Average Spearman correlation between score and forward return')}${stat('IC t-stat', cur.t == null ? '—' : num(cur.t, 1), cur.t != null && Math.abs(cur.t) > 2 ? sign(cur.mean) : '', `Non-overlapping dates only (n = ${cur.nNo})`)}
            ${stat('IC information ratio', num(cur.ir, 2), '', 'Mean IC ÷ its standard deviation')}${stat('Dates with IC > 0', pctU(cur.pos, 0))}
            ${stat('Q5 − Q1 per period', pct(QL.mean(quint[4]) - QL.mean(quint[0]), 1), sign(QL.mean(quint[4]) - QL.mean(quint[0])), 'Top-quintile minus bottom-quintile average forward return')}</div>
          <p class="tool-note">The <b>information coefficient</b> (IC) is the standard way quant desks judge a signal: the rank correlation between today's score and each stock's subsequent return. An average IC of 0.05 with a t-stat above 2 is considered useful. A negative IC means the score has been pointing the wrong way over this period. The score was designed as a descriptive composite, not fitted to predict returns, so treat this as an honest audit. <b>Survivorship bias</b>: the universe is today's list of companies, so firms that collapsed or were acquired are missing, which tends to flatter any backward-looking test.</p>
          <div class="tool-grid2"><div class="panel"><h4>IC over time (${icHorizon}-week horizon)</h4><div class="chart-box tall"><canvas id="ic-ts"></canvas></div></div>
            <div><div class="panel"><h4>Average forward return by score quintile</h4><div class="chart-box"><canvas id="ic-q"></canvas></div></div>
              <div class="panel" style="margin-top:12px"><h4>Signal decay: mean IC by horizon</h4><div class="chart-box"><canvas id="ic-decay"></canvas></div></div></div></div>`;
        $('ic-h').addEventListener('change', e => { icHorizon = +e.target.value; showTab('ic'); });
        const ser = ics[icHorizon];
        chart('ic-ts', { type: 'bar', data: { labels: ser.map(x => shortDate(pn.dates[x.T])), datasets: [{ label: 'IC', data: ser.map(x => x.ic), backgroundColor: ser.map(x => (x.ic >= 0 ? cssA('--up', 0.65) : cssA('--down', 0.65))) }] },
          options: baseOpts({ plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { min: -1, max: 1 } } }) });
        chart('ic-q', { type: 'bar', data: { labels: ['Q1 (low score)', 'Q2', 'Q3', 'Q4', 'Q5 (high)'], datasets: [{ data: quint.map(q => QL.mean(q) * 100), backgroundColor: quint.map((q, i) => cssA(i === 4 ? '--up' : i === 0 ? '--down' : '--ink', i === 4 || i === 0 ? 0.65 : 0.3)), borderRadius: 4 }] },
          options: baseOpts({ plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => v + '%' } } } }) });
        chart('ic-decay', { type: 'bar', data: { labels: S.map(x => `${x.h}w`), datasets: [{ data: S.map(x => x.mean), backgroundColor: S.map(x => (x.mean >= 0 ? cssA('--accent', 0.6) : cssA('--down', 0.6))), borderRadius: 4 }] },
          options: baseOpts({ plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => (+v).toFixed(2) } } } }) });
      } },
    ],
  };

  // ─── Public API ──────────────────────────────────────────────────────────
  const TOOLS = { factor: factorTool, regime: regimeTool, lab: labTool, pairs: pairsTool, rrg: rrgTool, backtest: backtestTool, earnings: earningsTool, replay: replayTool };
  Object.assign(window, {
    openTool: (k, tab) => openTool(TOOLS[k], tab), closeTool, renderScreener, setView, renderDetailProfile,
    rerenderTool: () => { const t = document.querySelector('#tool-tabs .tab.on'); if (current) showTab(t ? t.dataset.tab : undefined); },
    invalidateToolCaches: () => { factorCache = null; },
    _toolInternals: { panel, returnMatrix, computeFactors, factorScores, labHoldings, SCENARIOS },
  });
})();
