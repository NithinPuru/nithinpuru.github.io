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
  const PAL = () => [css('--blue'), css('--green-bright'), css('--orange'), css('--purple'), css('--cyan'), css('--red'), '#f778ba', '#79c0ff', '#ffa657', '#7ee787', '#d2a8ff', '#56d4dd'];
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
    Chart.defaults.color = css('--text-muted') || '#9aa7bd';
    Chart.defaults.font.family = "'JetBrains Mono', monospace";
    const grid = { color: 'rgba(255,255,255,0.06)' };
    const tick = { font: { size: 9 }, maxRotation: 0, autoSkip: true };
    const base = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: { backgroundColor: 'rgba(10,14,22,0.94)', borderColor: css('--border'), borderWidth: 1 } },
      scales: { x: { grid, ticks: { ...tick, maxTicksLimit: 8 } }, y: { grid, position: 'right', ticks: { ...tick } } },
    };
    // Merge axis options so per-chart overrides keep the default tick hygiene.
    const scales = { ...base.scales };
    Object.entries(extra.scales || {}).forEach(([k, v]) => { const d = base.scales[k] || { grid, ticks: { ...tick } }; scales[k] = { ...d, ...v, ticks: { ...d.ticks, ...(v.ticks || {}) } }; });
    return { ...base, ...extra, plugins: { ...base.plugins, ...(extra.plugins || {}) }, scales };
  }
  // Diverging heat background for a value in [-lim, lim].
  function heat(v, lim = 1, invert = false) {
    if (v == null || !isFinite(v)) return '';
    const t = Math.max(-1, Math.min(1, v / lim)) * (invert ? -1 : 1);
    const c = t >= 0 ? '52,211,153' : '248,113,113';
    return `background:rgba(${c},${(0.06 + Math.abs(t) * 0.38).toFixed(2)})`;
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
  function factorScores(tickers) {
    const pn = panel(tickers, 60), rows = tickers.map((t, i) => {
      const p = pn.P[i], d = D[t] || {}, f = (MARKET.tickers[t] || {}).fund || {};
      const L = p.length - 1, momv = p[L - 4] != null && p[L - 52] != null ? p[L - 4] / p[L - 52] - 1 : null;
      const r26 = pn.R[i].slice(-26).filter(v => v != null), vol = r26.length > 15 ? QL.std(r26) * Math.sqrt(52) : null;
      const pe = f.pe > 0 ? f.pe : f.fpe > 0 ? f.fpe : null;
      return { t, name: nameOf(t), sector: sectorOf(t), mom: momv, vol, ey: pe ? 1 / pe : null, cap: capUSD(t),
        sortino: d.ok ? d.sortino : null, maxDD: d.ok ? d.maxDD : null, ulcer: d.ok ? d.ulcer : null };
    });
    const z = (k, inv = false) => QL.zscores(rows.map(r => (r[k] == null ? null : inv ? -r[k] : r[k])));
    const zm = z('mom'), zv = z('vol', true), ze = z('ey'), zs = QL.zscores(rows.map(r => (r.cap ? -Math.log(r.cap) : null)));
    const zq = (() => { const a = z('sortino'), b = z('maxDD'), c = z('ulcer', true); return rows.map((_, i) => { const v = [a[i], b[i], c[i]].filter(x => x != null); return v.length ? QL.mean(v) : null; }); })();
    rows.forEach((r, i) => {
      Object.assign(r, { zMom: zm[i], zLowVol: zv[i], zValue: ze[i], zSize: zs[i], zQuality: zq[i] });
      const v = [zm[i], zv[i], ze[i], zq[i]].filter(x => x != null); r.composite = v.length ? QL.mean(v) : null;
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
          chart('fx-attr', { type: 'bar', data: { labels: [...fc.names, 'Specific'], datasets: [{ data: [...r.contrib, r.idio].map(v => v * 100), backgroundColor: [...pal.slice(0, fc.names.length), 'rgba(160,170,190,0.5)'], borderRadius: 4 }] },
            options: baseOpts({ indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.x.toFixed(1) + '% of variance' } } }, scales: { x: { grid: { color: 'rgba(255,255,255,.06)' }, ticks: { callback: v => v + '%' } }, y: { grid: { display: false } } } }) });
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
        body.innerHTML = `<p class="tool-note">Cross-sectional z-scores versus the visible universe (winsorized at ±3). <b>Value</b> = earnings yield (1 / P/E), <b>Quality</b> is a price-based proxy (Sortino, drawdown depth, Ulcer index) since balance-sheet data isn't available. <b>Composite</b> = equal-weight average of Momentum, Low-Vol, Value and Quality.</p><div id="fs-tbl"></div>`;
        const z = k => ({ key: k, num: true, fmt: v => num(v), style: v => heat(v, 2) });
        table($('fs-tbl'), [
          { key: 'rank', label: '#', num: true, fmt: v => v ?? '—' },
          { key: 't', label: 'Ticker', fmt: v => `<b>${escapeHtml(v)}</b>` }, { key: 'name', label: 'Company' }, { key: 'sector', label: 'Sector' },
          { ...z('zMom'), label: 'Momentum', title: '12-1 month return' }, { ...z('zLowVol'), label: 'Low-Vol', title: 'Negative 26-week volatility' },
          { ...z('zValue'), label: 'Value', title: 'Earnings yield' }, { ...z('zQuality'), label: 'Quality*', title: 'Price-based proxy: Sortino, drawdown, Ulcer' },
          { ...z('zSize'), label: 'Small size', title: 'Negative log USD market cap (positive = smaller)' },
          { ...z('composite'), label: 'Composite' },
        ], rows, { sortKey: 'composite', onRow: r => { closeTool(); openDetail(r.t); } });
      } },
      { id: 'fret', label: 'Factor returns', render(body) {
        const fc = computeFactors(), pal = PAL();
        const st = fc.names.map(k => { const r = fc.F[k].filter(v => v != null), p = QL.perfStats(r, 0); return { k, desc: FACTOR_DESC[k], ann: QL.mean(r) * 52, vol: p.vol, sharpe: p.vol ? QL.mean(r) * 52 / p.vol : 0, t: QL.mean(r) / (QL.std(r) / Math.sqrt(r.length)), total: p.total }; });
        body.innerHTML = `<p class="tool-note">Cumulative returns of each factor portfolio (long-short factors are dollar-neutral, rebalanced weekly, no costs). A t-stat above ~2 suggests the premium is unlikely to be noise.</p>
          <div class="panel"><div class="chart-box tall"><canvas id="fr-ch"></canvas></div></div><div id="fr-tbl" style="margin-top:12px"></div><h4 style="margin-top:14px">Factor correlations</h4><div id="fr-corr"></div>`;
        chart('fr-ch', { type: 'line', data: { labels: fc.dates.map(shortDate), datasets: fc.names.map((k, j) => { let e = 1; return { label: k, data: fc.F[k].map(v => (v == null ? e : (e *= 1 + v))), borderColor: pal[j], borderWidth: 1.6, pointRadius: 0, tension: 0.1 }; }) },
          options: baseOpts({ scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { position: 'right', grid: { color: 'rgba(255,255,255,.06)' }, ticks: { callback: v => v.toFixed(2) + 'x' } } } }) });
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
  const STATE_COL = { 2: ['52,211,153', '248,113,113'], 3: ['52,211,153', '251,191,36', '248,113,113'] };
  let regimeK = 2, regimeBench = 'SOXX';
  function hmmFor(t, K) { const s = fullSeries(t); if (!s) return null; return { s, h: QL.fitHMM(QL.rets(s.closes), K) }; }
  const regimeTool = {
    title: 'Market Regimes',
    sub: () => 'Gaussian hidden Markov model fitted on the full 10-year weekly return history. It infers unobserved market states from return behaviour (mean and volatility) and the probability of being in each one — the same family of models many risk desks use for regime-aware sizing.',
    tabs: [
      { id: 'mkt', label: 'Market regime', render(body) {
        const K = regimeK, names = STATE_NAMES[K], cols = STATE_COL[K], r = hmmFor(regimeBench, K);
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
          ...names.map((nm, k) => ({ type: 'line', label: `P(${nm})`, data: h.gamma.slice(off).map(g => g[k]), yAxisID: 'p', fill: true, stack: 'p', backgroundColor: `rgba(${cols[k]},0.28)`, borderWidth: 0, pointRadius: 0, tension: 0.2 })),
          { type: 'line', label: regimeBench, data: s.closes.slice(1).slice(off), yAxisID: 'px', borderColor: css('--text-main'), borderWidth: 1.6, pointRadius: 0, tension: 0.1 } ] },
          options: baseOpts({ scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } }, p: { position: 'left', stacked: true, min: 0, max: 1, grid: { display: false }, ticks: { callback: v => (v * 100) + '%' } }, px: { position: 'right', grid: { color: 'rgba(255,255,255,.06)' } } } }) });
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
  const labTool = {
    title: 'Portfolio Lab · Risk & Stress Testing',
    sub: () => 'Risk decomposition (component VaR, marginal risk, diversification) and historical + hypothetical stress tests for a portfolio of your choice.',
    render(body) {
      const srcs = { ew: 'Equal-weight (visible)', tracker: 'My tracker holdings', maxSharpe: 'Max Sharpe', minVar: 'Min variance', erc: 'Risk parity', hrp: 'HRP', bl: 'Black-Litterman' };
      const H = labHoldings();
      const ctrl = `<div class="tool-controls"><label class="range-wrap">Portfolio <select class="search" id="lab-src">${Object.entries(srcs).map(([k, v]) => `<option value="${k}" ${k === labSource ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <span class="tool-note">${H.length} holdings${labSource !== 'tracker' ? ' · built from visible companies (max 40 for optimized portfolios)' : ''}</span></div>`;
      if (H.length < 2) { body.innerHTML = ctrl + `<div class="empty-state big"><div class="es-icon">◇</div><div class="es-title">Need at least 2 holdings</div><div class="es-sub">${labSource === 'tracker' ? 'Add holdings in the Tracker first.' : 'Clear the dashboard filter so more companies are visible.'}</div></div>`; bindSrc(); return; }
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
      bindSrc();
      // Risk contribution chart (top 15 by risk)
      const items = M.tickers.map((t, i) => ({ t, w: w[i], rc: rd.pct[i] })).sort((a, b) => b.rc - a.rc).slice(0, 15);
      chart('lab-rc', { type: 'bar', data: { labels: items.map(x => x.t), datasets: [{ label: 'Weight', data: items.map(x => x.w * 100), backgroundColor: css('--blue') + 'aa', borderRadius: 3 }, { label: 'Risk contribution', data: items.map(x => x.rc * 100), backgroundColor: css('--red') + 'cc', borderRadius: 3 }] },
        options: baseOpts({ indexAxis: 'y', scales: { x: { grid: { color: 'rgba(255,255,255,.06)' }, ticks: { callback: v => v + '%' } }, y: { grid: { display: false }, ticks: { font: { size: 9 } } } } }) });
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
      function bindSrc() { $('lab-src')?.addEventListener('change', e => { labSource = e.target.value; showTab('main'); }); }
    },
  };

  // ═════════════════════════════════════════════════════════════════════════
  // PAIRS / COINTEGRATION
  // ═════════════════════════════════════════════════════════════════════════
  let pairsSameSector = true;
  const pairsTool = {
    title: 'Pairs & Cointegration Screener',
    sub: () => `Engle-Granger two-step test on log prices: hedge ratio by OLS, then an augmented Dickey-Fuller test on the spread. Cointegrated pairs have spreads that mean-revert — the basis of statistical-arbitrage pair trading. Window ≥ 2 years. ${universeNote(visibleTickers().length)}`,
    render(body) {
      const weeks = Math.max(rangeWeeks(), 104), vis = visibleTickers().slice(0, 60), pn = panel(vis, weeks);
      const ok = vis.map((t, i) => i).filter(i => pn.P[i].every(v => v != null));
      const res = [];
      for (let a = 0; a < ok.length; a++) for (let b = a + 1; b < ok.length; b++) {
        const i = ok[a], j = ok[b], ti = vis[i], tj = vis[j];
        if (pairsSameSector && sectorOf(ti) !== sectorOf(tj)) continue;
        const c1 = QL.cointegration(pn.P[i], pn.P[j]), c2 = QL.cointegration(pn.P[j], pn.P[i]);
        const c = c1.adfT <= c2.adfT ? { ...c1, y: ti, x: tj, yi: i, xi: j } : { ...c2, y: tj, x: ti, yi: j, xi: i };
        res.push(c);
      }
      res.sort((a, b) => a.adfT - b.adfT);
      const sig = res.filter(r => r.pval <= 0.05).length;
      body.innerHTML = `<div class="tool-controls"><div class="seg"><button class="btn ${pairsSameSector ? 'on' : ''}" data-s="1">Same sector</button><button class="btn ${!pairsSameSector ? 'on' : ''}" data-s="0">All visible</button></div>
          <span class="tool-note">${res.length} pairs tested · ${sig} significant at 5% · ${ok.length} companies with full history in the window</span></div>
        <p class="tool-note warnline">With many pairs tested, some will look cointegrated by chance (≈5% at the 5% level). Prefer pairs with an economic link, short half-lives and a stable hedge ratio.</p>
        <div class="tool-grid2"><div id="pr-tbl"></div><div class="panel"><h4 id="pr-h">Spread z-score</h4><div class="chart-box tall"><canvas id="pr-ch"></canvas></div><p class="tool-note" id="pr-note">Click a pair to plot its spread.</p></div></div>`;
      body.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => { pairsSameSector = b.dataset.s === '1'; showTab('main'); }));
      if (!res.length) { $('pr-tbl').innerHTML = '<p class="tool-note">No pairs to test — widen the universe.</p>'; return; }
      const rows = res.slice(0, 40).map(r => ({ ...r, pair: `${r.y} / ${r.x}`, sector: sectorOf(r.y) === sectorOf(r.x) ? sectorOf(r.y) : `${sectorOf(r.y)} / ${sectorOf(r.x)}`,
        sig: r.pval <= 0.01 ? '1%' : r.pval <= 0.05 ? '5%' : r.pval <= 0.1 ? '10%' : '—', signal: r.pval > 0.1 ? '—' : r.z > 2 ? `Short ${r.y} / long ${r.x}` : r.z < -2 ? `Long ${r.y} / short ${r.x}` : 'Inside ±2σ' }));
      const plot = r => {
        clearCharts();
        const z = r.spread.map(v => (v - r.mean) / r.sd), labels = pn.dates.map(shortDate);
        $('pr-h').textContent = `Spread z-score · ${r.y} − ${num(r.hedge)}×${r.x}`;
        $('pr-note').innerHTML = `ADF t = ${num(r.adfT)} (5% critical ${QL.EG_CRIT[5]}) · half-life ${isFinite(r.halfLife) ? r.halfLife.toFixed(1) + ' weeks' : '∞'} · return correlation ${num(r.corr)} · current z ${num(r.z)}`;
        const band = v => labels.map(() => v);
        chart('pr-ch', { type: 'line', data: { labels, datasets: [
          { label: 'z', data: z, borderColor: css('--blue'), borderWidth: 1.6, pointRadius: 0, tension: 0.1 },
          { label: '+2σ', data: band(2), borderColor: css('--red'), borderDash: [5, 4], borderWidth: 1, pointRadius: 0 },
          { label: '−2σ', data: band(-2), borderColor: css('--green-bright'), borderDash: [5, 4], borderWidth: 1, pointRadius: 0 },
          { label: 'mean', data: band(0), borderColor: 'rgba(255,255,255,.3)', borderWidth: 1, pointRadius: 0 } ] },
          options: baseOpts({ plugins: { legend: { display: false } } }) });
      };
      table($('pr-tbl'), [{ key: 'pair', label: 'Pair (Y / X)', fmt: v => `<b>${escapeHtml(v)}</b>` }, { key: 'sector', label: 'Sector' },
        { key: 'adfT', label: 'ADF t', num: true, fmt: v => num(v), style: v => heat(v < QL.EG_CRIT[5] ? 1 : v < QL.EG_CRIT[10] ? 0.4 : 0, 1) }, { key: 'sig', label: 'Sig.' },
        { key: 'halfLife', label: 'Half-life', num: true, fmt: v => (isFinite(v) ? v.toFixed(1) + 'w' : '∞') }, { key: 'hedge', label: 'Hedge β', num: true, fmt: v => num(v) },
        { key: 'z', label: 'z now', num: true, fmt: v => num(v), style: v => heat(Math.abs(v) > 2 ? v : 0, 3, true) }, { key: 'signal', label: 'Signal' }],
        rows, { sortKey: 'adfT', sortDir: 1, onRow: plot });
      plot(rows[0]);
    },
  };

  // ═════════════════════════════════════════════════════════════════════════
  // RELATIVE ROTATION GRAPH
  // ═════════════════════════════════════════════════════════════════════════
  let rrgBench = 'SOXX';
  const quadrant = p => (p.x >= 100 ? (p.y >= 100 ? 'Leading' : 'Weakening') : p.y >= 100 ? 'Improving' : 'Lagging');
  const Q_COL = { Leading: '52,211,153', Weakening: '251,191,36', Lagging: '248,113,113', Improving: '91,157,255' };
  const rrgTool = {
    title: 'Relative Rotation Graph',
    sub: () => `Relative strength (x) and its momentum (y) versus a benchmark, with 8-week tails. Stocks typically rotate clockwise: Improving → Leading → Weakening → Lagging. RRG-style open approximation of the JdK RS-Ratio / RS-Momentum. ${universeNote(visibleTickers().length)}`,
    render(body) {
      const b = fullSeries(rrgBench); const vis = visibleTickers().filter(t => t !== rrgBench && t !== 'SOXX');
      const pts = vis.map(t => { const s = fullSeries(t), m = new Map(b.dates.map((d, i) => [d, b.closes[i]])); const idx = s.dates.map((d, i) => [m.get(d), s.closes[i]]).filter(x => x[0] != null);
        const tail = QL.rrg(idx.map(x => x[1]), idx.map(x => x[0]), 10, 8); return tail.length ? { t, tail, head: tail[tail.length - 1] } : null; }).filter(Boolean);
      if (!pts.length) return needMore(body, 'Not enough history.');
      pts.forEach(p => (p.q = quadrant(p.head)));
      body.innerHTML = `<div class="tool-controls"><div class="seg">${['SOXX', 'SPY'].map(x => `<button class="btn ${x === rrgBench ? 'on' : ''}" data-b="${x}">vs ${x}</button>`).join('')}</div><span class="tool-note">Click a dot to open that company.</span></div>
        <div class="tool-grid2 wide-left"><div class="panel"><div class="chart-box xtall"><canvas id="rrg-ch"></canvas></div></div><div id="rrg-q"></div></div>`;
      body.querySelectorAll('[data-b]').forEach(x => x.addEventListener('click', () => { rrgBench = x.dataset.b; showTab('main'); }));
      const all = pts.flatMap(p => p.tail), ext = Math.max(2.2, ...all.map(p => Math.abs(p.x - 100)), ...all.map(p => Math.abs(p.y - 100))) * 1.1;
      const quadBg = { id: 'quadBg', beforeDraw(c) { const { ctx, chartArea: a, scales: { x, y } } = c; const cx = x.getPixelForValue(100), cy = y.getPixelForValue(100);
        [[cx, a.top, a.right - cx, cy - a.top, 'Leading'], [cx, cy, a.right - cx, a.bottom - cy, 'Weakening'], [a.left, cy, cx - a.left, a.bottom - cy, 'Lagging'], [a.left, a.top, cx - a.left, cy - a.top, 'Improving']].forEach(([x0, y0, w, h, q]) => {
          ctx.fillStyle = `rgba(${Q_COL[q]},0.07)`; ctx.fillRect(x0, y0, w, h); ctx.fillStyle = `rgba(${Q_COL[q]},0.8)`; ctx.font = '600 11px Outfit, sans-serif'; ctx.textAlign = q === 'Leading' || q === 'Weakening' ? 'right' : 'left';
          ctx.fillText(q.toUpperCase(), q === 'Leading' || q === 'Weakening' ? x0 + w - 8 : x0 + 8, q === 'Leading' || q === 'Improving' ? y0 + 16 : y0 + h - 8); }); } };
      const c = chart('rrg-ch', { type: 'scatter', plugins: [quadBg], data: { datasets: pts.map(p => ({ label: p.t, data: p.tail, showLine: true, borderColor: `rgba(${Q_COL[p.q]},0.3)`, borderWidth: 1,
          pointRadius: p.tail.map((_, i) => (i === p.tail.length - 1 ? 5 : 1.5)), pointBackgroundColor: `rgb(${Q_COL[p.q]})`, pointBorderColor: `rgb(${Q_COL[p.q]})` })) },
        options: baseOpts({ interaction: { mode: 'nearest', intersect: true }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: x => `${x.dataset.label}: RS-Ratio ${x.parsed.x.toFixed(2)}, RS-Mom ${x.parsed.y.toFixed(2)}` } } },
          onClick: (e, els) => { if (els.length) { const t = c.data.datasets[els[0].datasetIndex].label; closeTool(); openDetail(t); } },
          scales: { x: { min: 100 - ext, max: 100 + ext, title: { display: true, text: 'RS-Ratio (relative strength)' }, grid: { color: 'rgba(255,255,255,.05)' } }, y: { position: 'left', min: 100 - ext, max: 100 + ext, title: { display: true, text: 'RS-Momentum' }, grid: { color: 'rgba(255,255,255,.05)' } } } }) });
      $('rrg-q').innerHTML = ['Leading', 'Improving', 'Weakening', 'Lagging'].map(q => { const m = pts.filter(p => p.q === q); return `<div class="quad" style="border-color:rgba(${Q_COL[q]},.5)"><h4 style="color:rgb(${Q_COL[q]})">${q} <span class="cnt">${m.length}</span></h4><div class="quad-list">${m.map(p => `<button class="chip" data-t="${p.t}">${p.t}</button>`).join('') || '<span class="tool-note">none</span>'}</div></div>`; }).join('');
      $('rrg-q').querySelectorAll('[data-t]').forEach(x => x.addEventListener('click', () => { closeTool(); openDetail(x.dataset.t); }));
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
        options: baseOpts({ scales: { x: { grid: { display: false } }, y: { type: 'logarithmic', position: 'right', grid: { color: 'rgba(255,255,255,.06)' }, ticks: { autoSkip: false, callback: v => ([0.5, 0.75, 1, 1.5, 2, 3, 5, 7.5, 10, 15, 20, 30, 50, 75, 100].includes(+(+v).toPrecision(3)) ? '$' + (+v) : '') } } } }) });
      chart('bt-dd', { type: 'line', data: { labels: L, datasets: [{ label: 'Strategy', data: dd(s.curve.slice(1)), borderColor: css('--red'), backgroundColor: css('--red') + '33', fill: true, borderWidth: 1.4, pointRadius: 0 }, { label: 'Buy & hold', data: dd(b.curve.slice(1)), borderColor: css('--text-muted'), borderWidth: 1, pointRadius: 0 }] },
        options: baseOpts({ scales: { x: { grid: { display: false } }, y: { position: 'right', grid: { color: 'rgba(255,255,255,.06)' }, ticks: { callback: v => v + '%' } } } }) });
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
      options: baseOpts({ plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { position: 'right', min: 0, max: 100, grid: { color: 'rgba(255,255,255,.06)' }, ticks: { callback: v => v + '%' } } } }) });
    const fnames = (factorCache && factorCache.names) || FACTOR_NAMES;
    if (fx) mk('det-fx', { type: 'bar', data: { labels: fnames, datasets: [{ data: fx.beta, backgroundColor: fx.beta.map(v => (v >= 0 ? css('--green-bright') : css('--red')) + 'bb'), borderRadius: 4 }] },
      options: baseOpts({ plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `β ${c.parsed.y.toFixed(2)} (t = ${fx.tstat[c.dataIndex].toFixed(1)})` } } }, scales: { x: { grid: { display: false } }, y: { position: 'right', grid: { color: 'rgba(255,255,255,.06)' } } } }) });
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  const TOOLS = { factor: factorTool, regime: regimeTool, lab: labTool, pairs: pairsTool, rrg: rrgTool, backtest: backtestTool };
  Object.assign(window, {
    openTool: (k, tab) => openTool(TOOLS[k], tab), closeTool, renderScreener, setView, renderDetailProfile,
    invalidateToolCaches: () => { factorCache = null; },
    _toolInternals: { panel, returnMatrix, computeFactors, factorScores, labHoldings, SCENARIOS },
  });
})();
