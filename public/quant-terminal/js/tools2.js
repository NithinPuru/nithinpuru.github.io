/* Institutional tools, part 2 — volatility & tail risk (GARCH, EVT, VaR backtests), market
 * structure (PCA, Marchenko-Pastur denoising, Kalman beta) and strategy validation
 * (deflated Sharpe, bootstrap CIs). Depends on quant-lib.js, quant-ext.js and tools.js
 * (window.registerTool / window._ui). Weekly data throughout. */
(function () {
  'use strict';
  if (typeof registerTool !== 'function' || !window.QL || !QL.fitGARCH) return;
  const U = window._ui, { panel, returnMatrix, visibleTickers, chart, baseOpts, table, stat, sign, pct, pctU, num, css, cssA, nameOf, fmtDate, shortDate, needMore, universeNote, heat, showTab } = U;
  const $ = id => document.getElementById(id);
  const RF = 0.045;
  const opt = (v, sel, label) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${label}</option>`;
  const tickerOpts = (sel, extra = []) => [...new Set([...extra, ...visibleTickers({ includeSpy: true })])].map(t => opt(t, sel, `${t} · ${nameOf(t)}`)).join('');
  // Weekly return series for one ticker with its dates (nulls dropped).
  function series(t) {
    const pn = panel([t]), r = [], d = [];
    pn.R[0].forEach((v, i) => { if (v != null && isFinite(v)) { r.push(v); d.push(pn.dates[i]); } });
    return { r, d };
  }
  const ann = v => v * Math.sqrt(52);
  const pv = p => (p == null ? '—' : p < 0.001 ? '<0.001' : p.toFixed(3));
  const verdict = (p, a = 0.05) => (p == null ? '' : p < a ? 'r' : 'g');
  function hist(x, bins = 28) {
    const lo = Math.min(...x), hi = Math.max(...x), w = (hi - lo) / bins || 1, c = new Array(bins).fill(0);
    x.forEach(v => c[Math.min(bins - 1, Math.floor((v - lo) / w))]++);
    return { centers: c.map((_, i) => lo + (i + 0.5) * w), counts: c, lo, hi, w };
  }
  const defaultTicker = () => { const v = visibleTickers(); return v.includes('NVDA') ? 'NVDA' : v[0] || 'SPY'; };

  // ═════════════════════════════════════════════════════════════════════════
  // VOLATILITY & TAIL RISK
  // ═════════════════════════════════════════════════════════════════════════
  const vo = { t: null, gjr: true, conf: 0.99 };
  const garchCache = new Map();
  function garchFor(t, gjr) {
    const key = `${t}|${gjr}|${MARKET.meta && MARKET.meta.generated_at}`;
    if (!garchCache.has(key)) { const s = series(t); garchCache.set(key, s.r.length >= 150 ? { fit: QL.fitGARCH(s.r, { gjr }), ...s } : null); }
    return garchCache.get(key);
  }
  const volTool = {
    title: 'Volatility & Tail Risk',
    sub: () => `Conditional volatility (GARCH / GJR-GARCH by quasi-ML), extreme-value tail estimates and out-of-sample VaR backtests with Kupiec &amp; Christoffersen tests. Weekly returns, full history. ${universeNote(visibleTickers().length)}`,
    tabs: [
      { id: 'garch', label: 'GARCH forecast', render(body) {
        vo.t = vo.t || defaultTicker();
        const g = garchFor(vo.t, vo.gjr);
        const head = `<div class="tool-controls"><label class="range-wrap"><span>Stock</span> <select class="search" id="vo-t">${tickerOpts(vo.t)}</select></label>
          <label class="range-wrap"><span>Model</span> <select class="search" id="vo-m">${opt('1', vo.gjr ? '1' : '0', 'GJR-GARCH(1,1) — asymmetric')}${opt('0', vo.gjr ? '1' : '0', 'GARCH(1,1)')}</select></label></div>`;
        const bind = () => { $('vo-t').addEventListener('change', e => { vo.t = e.target.value; showTab('garch'); }); $('vo-m').addEventListener('change', e => { vo.gjr = e.target.value === '1'; showTab('garch'); }); };
        if (!g || !g.fit) { body.innerHTML = head; bind(); return body.insertAdjacentHTML('beforeend', '<div class="empty-state"><div class="es-title">Not enough history to fit GARCH (needs ≥ 150 weeks)</div></div>'); }
        const f = g.fit, other = garchFor(vo.t, !vo.gjr), cur = ann(f.sigma[f.sigma.length - 1]), lr = f.uncondVol, fc = f.forecast(26);
        const lb = QL.ljungBox(f.std.map(v => v * v), 10), lbp = QL.chi2sf(lb, 10), fcAvg = ann(Math.sqrt(QL.mean(fc.map(v => v * v))));
        body.innerHTML = `${head}<div class="kpis">${stat('Current vol (ann.)', pctU(cur), '', 'Conditional volatility at the last observation, annualized')}
          ${stat('Long-run vol', pctU(lr), '', 'Unconditional volatility implied by the fitted model')}${stat('Next-26w avg forecast', pctU(fcAvg), fcAvg > cur ? 'r' : 'g')}
          ${stat('Persistence α+β+γ/2', num(f.persistence, 3), '', 'Closer to 1 = shocks to volatility die out more slowly')}${stat('Vol half-life', isFinite(f.halfLife) ? num(f.halfLife, 1) + ' w' : '∞', '', 'Weeks for a volatility shock to decay by half')}
          ${stat('Leverage γ', num(f.gamma, 3), f.gamma > 0.05 ? 'r' : '', 'Extra variance response to negative returns (GJR); 0 = symmetric')}
          ${stat('ARCH left? (LB p)', pv(lbp), lbp < 0.05 ? 'r' : 'g', 'Ljung-Box on squared standardized residuals, 10 lags. p<0.05: volatility clustering not fully captured')}
          ${other && other.fit ? stat('AIC (this / other)', `${num(f.aic, 0)} <small>/ ${num(other.fit.aic, 0)}</small>`, f.aic <= other.fit.aic ? 'g' : '', 'Lower is better; compares GARCH with GJR-GARCH') : ''}</div>
          <p class="tool-note"><b>Why it matters:</b> volatility is persistent and asymmetric — calm weeks follow calm weeks, and drops raise volatility more than rallies. GARCH turns that into a forecast that mean-reverts to the long-run level; it is the standard input to risk budgets and VaR. Parameters: α=${num(f.alpha, 3)}, β=${num(f.beta, 3)}${f.gjr ? `, γ=${num(f.gamma, 3)}` : ''}; ${f.n} weekly observations ending ${fmtDate(g.d[g.d.length - 1])}.</p>
          <div class="panel"><h4>Conditional volatility and 26-week forecast (annualized)</h4><div class="chart-box tall"><canvas id="vo-ch"></canvas></div></div>`;
        bind();
        const H = 260, hs = g.d.slice(-H), v = f.sigma.slice(-H).map(x => ann(x) * 100), labels = [...hs.map(shortDate), ...fc.map((_, i) => `+${i + 1}w`)];
        const rolling = f.sigma.map((_, i) => (i >= 12 ? ann(QL.std(g.r.slice(i - 12, i + 1))) * 100 : null)).slice(-H);
        chart('vo-ch', { type: 'line', data: { labels, datasets: [
          { label: 'Conditional vol', data: [...v, ...fc.map(() => null)], borderColor: css('--accent'), borderWidth: 2, pointRadius: 0 },
          { label: 'Realized 13w vol', data: [...rolling, ...fc.map(() => null)], borderColor: css('--ink-3'), borderWidth: 1, pointRadius: 0, borderDash: [2, 3] },
          { label: 'Forecast', data: [...v.map(() => null).slice(0, -1), v[v.length - 1], ...fc.map(x => ann(x) * 100)], borderColor: css('--warn'), borderWidth: 2, pointRadius: 0, borderDash: [6, 4] },
          { label: 'Long-run', data: labels.map(() => lr * 100), borderColor: css('--down'), borderWidth: 1, pointRadius: 0, borderDash: [1, 4] }] },
          options: baseOpts({ scales: { x: { grid: { display: false } }, y: { ticks: { callback: x => x + '%' } } } }) });
      } },
      { id: 'var', label: 'VaR / ES & backtest', render(body) {
        vo.t = vo.t || defaultTicker();
        const s = series(vo.t), c = vo.conf;
        const head = `<div class="tool-controls"><label class="range-wrap"><span>Stock</span> <select class="search" id="vo-t">${tickerOpts(vo.t)}</select></label>
          <label class="range-wrap"><span>Confidence</span> <select class="search" id="vo-c">${opt(0.95, c, '95%')}${opt(0.99, c, '99%')}</select></label></div>`;
        const bind = () => { $('vo-t').addEventListener('change', e => { vo.t = e.target.value; showTab('var'); }); $('vo-c').addEventListener('change', e => { vo.conf = +e.target.value; showTab('var'); }); };
        if (s.r.length < 260) { body.innerHTML = head; bind(); return body.insertAdjacentHTML('beforeend', '<div class="empty-state"><div class="es-title">Needs ≥ 260 weeks of history for a backtest</div></div>'); }
        const M = { hist: 'Historical', normal: 'Gaussian', cf: 'Cornish-Fisher', evt: 'EVT (GPD)', garch: 'GARCH-filtered' };
        const g = garchFor(vo.t, true), est = {};
        ['hist', 'normal', 'cf', 'evt'].forEach(k => (est[k] = QL.varES(s.r, c, k)));
        if (g && g.fit) est.garch = QL.garchVaR(g.fit, c);
        const mo = QL.moments(s.r), bt = {}, win = 156;
        ['hist', 'normal', 'cf', 'garch'].forEach(k => (bt[k] = QL.backtestVaR(s.r, { p: c, method: k, window: win, refit: 4 })));
        const rows = Object.keys(M).filter(k => est[k]).map(k => ({ k, m: M[k], VaR: est[k].VaR, ES: est[k].ES, bt: bt[k] }));
        const evt = est.evt;
        body.innerHTML = `${head}<div class="kpis">${stat('Weekly skew', num(mo.skew), mo.skew < -0.3 ? 'r' : '', 'Negative = left tail heavier than the right')}${stat('Excess kurtosis', num(mo.kurt - 3), mo.kurt - 3 > 1 ? 'r' : '', 'Normal = 0. Above 0 = fat tails, so Gaussian VaR understates risk')}
          ${stat('Tail index ξ (EVT)', evt && evt.xi != null ? num(evt.xi, 2) : '—', evt && evt.xi > 0.3 ? 'r' : '', 'Generalized-Pareto shape fitted to the worst 10% of weeks. ξ>0: power-law tail; ξ≈0.25–0.35 is typical for equities')}
          ${stat(`${(c * 100).toFixed(0)}% 1w ES (EVT)`, evt ? pctU(evt.ES, 1) : '—', 'r')}${stat('Observations', s.r.length)}</div>
          <div class="tool-grid2 wide-left"><div id="vr-tbl"></div><div class="panel"><h4>Loss estimates by method (1 week)</h4><div class="chart-box"><canvas id="vr-bar"></canvas></div></div></div>
          <p class="tool-note"><b>Backtest:</b> each week the model is re-estimated on the previous ${win} weeks (GARCH refit every 16 weeks, state filtered weekly) and the next week's return is checked against the VaR. A well-calibrated ${(c * 100).toFixed(0)}% VaR should be breached ${((1 - c) * 100).toFixed(0)}% of weeks (Kupiec test), and breaches should not cluster (Christoffersen). <span class="r">Red</span> p-value &lt; 0.05 = model rejected. Expect Gaussian to fail at 99%.</p>
          <div class="panel"><h4>Returns vs GARCH VaR threshold, with exceptions</h4><div class="chart-box tall"><canvas id="vr-ts"></canvas></div></div>`;
        bind();
        table($('vr-tbl'), [{ key: 'm', label: 'Method' }, { key: 'VaR', label: 'VaR', num: true, fmt: v => pctU(v, 2) }, { key: 'ES', label: 'ES', num: true, fmt: v => pctU(v, 2) },
          { key: 'rate', label: 'Breaches', num: true, fmt: (v, r) => (r.bt ? pctU(r.bt.kupiec.rate, 1) : '—'), title: `Out-of-sample exception rate (expected ${pctU(1 - c, 0)})` },
          { key: 'pk', label: 'Kupiec p', num: true, title: 'Proportion-of-failures test', fmt: v => (v == null ? '—' : `<span class="${verdict(v) === 'r' ? 'r' : 'g'}">${pv(v)}</span>`) },
          { key: 'pc', label: 'Indep. p', num: true, title: 'Christoffersen independence test', fmt: v => (v == null ? '—' : `<span class="${verdict(v) === 'r' ? 'r' : 'g'}">${pv(v)}</span>`) }],
          rows.map(r => ({ ...r, rate: r.bt ? r.bt.kupiec.rate : null, pk: r.bt ? r.bt.kupiec.p : null, pc: r.bt ? r.bt.indep.p : null })), { sortKey: 'ES', sortDir: 1 });
        const pal = [css('--accent'), css('--warn')];
        chart('vr-bar', { type: 'bar', data: { labels: rows.map(r => r.k), datasets: [{ label: 'VaR', data: rows.map(r => r.VaR * 100), backgroundColor: cssA('--accent', 0.6), borderRadius: 4 }, { label: 'ES', data: rows.map(r => r.ES * 100), backgroundColor: cssA('--down', 0.55), borderRadius: 4 }] },
          options: baseOpts({ scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => v + '%' } } } }) });
        const b = bt.garch;
        if (b) {
          const lab = b.idx.map(t => shortDate(s.d[t]));
          chart('vr-ts', { type: 'line', data: { labels: lab, datasets: [
            { label: 'Weekly return', data: b.idx.map(t => s.r[t] * 100), borderColor: css('--ink-3'), borderWidth: 1, pointRadius: 0 },
            { label: 'GARCH VaR', data: b.var.map(v => -v * 100), borderColor: css('--accent'), borderWidth: 1.6, pointRadius: 0, stepped: true },
            { label: 'Exceptions', data: b.idx.map((t, i) => (b.hits[i] ? s.r[t] * 100 : null)), borderColor: 'transparent', backgroundColor: css('--down'), pointRadius: 4, showLine: false }] },
            options: baseOpts({ scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => v + '%' } } } }) });
        }
        void pal;
      } },
      { id: 'uni', label: 'Universe vol monitor', render(body) {
        const vis = visibleTickers(), rows = [];
        vis.forEach(t => {
          const g = garchFor(t, true); if (!g || !g.fit) return; const f = g.fit, fc = f.forecast(13), e = QL.varES(g.r, 0.99, 'evt'), cur = ann(f.sigma[f.sigma.length - 1]);
          rows.push({ t, name: nameOf(t), cur, lr: f.uncondVol, ratio: cur / f.uncondVol, fc13: ann(Math.sqrt(QL.mean(fc.map(v => v * v)))), pers: f.persistence, hl: f.halfLife, gamma: f.gamma, es99: e ? e.ES : null, xi: e && e.xi != null ? e.xi : null });
        });
        if (!rows.length) return needMore(body, 'No visible companies have ≥ 150 weeks of data.');
        body.innerHTML = `<div class="kpis">${stat('Companies', rows.length)}${stat('Median current vol', pctU(QL.mean(rows.map(r => r.cur))), '')}${stat('Above long-run', `${rows.filter(r => r.ratio > 1).length} <small>of ${rows.length}</small>`, '', 'Stocks whose current conditional vol exceeds their own long-run level')}
          ${stat('Median persistence', num(rows.map(r => r.pers).sort((a, b) => a - b)[Math.floor(rows.length / 2)], 3))}</div>
          <p class="tool-note">GJR-GARCH(1,1) fitted per stock. <b>Vol ratio</b> = current ÷ long-run conditional vol: &gt;1 means the stock is in a high-volatility episode and the model expects it to calm, &lt;1 the reverse. ES 99% is the EVT tail estimate of a one-week loss. Click a row to open the stock's GARCH forecast.</p><div id="vu-tbl"></div>`;
        table($('vu-tbl'), [{ key: 't', label: 'Ticker', fmt: v => `<b>${escapeHtml(v)}</b>` }, { key: 'name', label: 'Company' },
          { key: 'cur', label: 'Vol now', num: true, fmt: v => pctU(v, 0) }, { key: 'lr', label: 'Long-run', num: true, fmt: v => pctU(v, 0) },
          { key: 'ratio', label: 'Ratio', num: true, fmt: v => num(v), style: v => heat(v - 1, 0.6, true) }, { key: 'fc13', label: '13w fcst', num: true, fmt: v => pctU(v, 0) },
          { key: 'pers', label: 'Persist.', num: true, fmt: v => num(v, 3) }, { key: 'hl', label: 'Half-life (w)', num: true, fmt: v => (isFinite(v) ? num(v, 0) : '∞') },
          { key: 'gamma', label: 'Leverage γ', num: true, fmt: v => num(v, 3) }, { key: 'xi', label: 'Tail ξ', num: true, fmt: v => num(v, 2) }, { key: 'es99', label: 'ES 99% (1w)', num: true, fmt: v => pctU(v, 1) }],
          rows, { sortKey: 'ratio', onRow: r => { vo.t = r.t; showTab('garch'); } });
      } },
    ],
  };

  // ═════════════════════════════════════════════════════════════════════════
  // MARKET STRUCTURE
  // ═════════════════════════════════════════════════════════════════════════
  const ms = { y: null, x: 'SPY', delta: 0.002 };
  function structMatrix() {
    const vis = visibleTickers().slice(0, 60), M = returnMatrix(vis, Math.max(rangeWeeks(), 156));
    return M.tickers.length >= 8 && M.R[0].length >= 52 ? M : null;
  }
  const structTool = {
    title: 'Market Structure',
    sub: () => `Principal components of the correlation matrix, Marchenko-Pastur noise filtering, and a Kalman-filter beta that adapts through time. ${universeNote(visibleTickers().length)}`,
    tabs: [
      { id: 'pca', label: 'PCA & absorption', render(body) {
        const M = structMatrix(); if (!M) return needMore(body, 'Needs at least 8 visible companies with a common history of ≥ 52 weeks.');
        const p = QL.pca(M.R), N = M.tickers.length, T = M.R[0].length, lp = QL.mpEdge(N, T), nSig = p.values.filter(v => v > lp).length, k = Math.max(1, Math.ceil(N / 5));
        const arNow = QL.absorptionRatio(M.R, k);
        const win = 104, step = 4, ar = []; for (let t = win; t <= T; t += step) ar.push({ d: M.dates[t - 1], v: QL.absorptionRatio(M.R.map(r => r.slice(t - win, t)), k) });
        body.innerHTML = `<div class="kpis">${stat('Assets × weeks', `${N} × ${T}`)}${stat('PC1 (market) share', pctU(p.explained[0], 0), '', 'Share of total variance explained by the first principal component')}
          ${stat('Signal factors', nSig, '', `Eigenvalues above the Marchenko-Pastur noise edge λ₊ = ${lp.toFixed(2)}`)}${stat(`Absorption ratio (top ${k})`, pctU(arNow, 0), arNow > 0.7 ? 'r' : '', 'Kritzman et al. 2011: variance absorbed by the top fifth of eigenvectors. High = tightly coupled, fragile market')}
          ${stat('Top-3 explain', pctU(p.explained.slice(0, 3).reduce((a, b) => a + b, 0), 0))}</div>
          <p class="tool-note">Random-matrix theory says a correlation matrix of ${N} unrelated assets observed for ${T} weeks still shows eigenvalues up to λ₊ = ${lp.toFixed(2)} purely from sampling noise. Only eigenvalues above that edge (${nSig}) carry real structure — in semis typically the market/sector factor and a few sub-industry blocs. A rising absorption ratio means diversification is collapsing.</p>
          <div class="tool-grid2"><div class="panel"><h4>Scree plot — eigenvalues vs noise edge</h4><div class="chart-box"><canvas id="ms-scree"></canvas></div>
            <h4 style="margin-top:14px">Absorption ratio over time (${win}w window)</h4><div class="chart-box"><canvas id="ms-ar"></canvas></div></div><div><h4>Factor loadings</h4><div id="ms-tbl"></div></div></div>`;
        const m = Math.min(15, N);
        chart('ms-scree', { type: 'bar', data: { labels: p.values.slice(0, m).map((_, i) => `PC${i + 1}`), datasets: [{ label: 'Eigenvalue', data: p.values.slice(0, m), backgroundColor: p.values.slice(0, m).map(v => (v > lp ? cssA('--accent', 0.7) : cssA('--ink', 0.25))), borderRadius: 4 },
          { type: 'line', label: 'Noise edge λ₊', data: p.values.slice(0, m).map(() => lp), borderColor: css('--down'), borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0 }] }, options: baseOpts({ scales: { x: { grid: { display: false } } } }) });
        chart('ms-ar', { type: 'line', data: { labels: ar.map(x => shortDate(x.d)), datasets: [{ label: `Absorption ratio (top ${k})`, data: ar.map(x => x.v * 100), borderColor: css('--warn'), borderWidth: 2, pointRadius: 0, fill: true, backgroundColor: cssA('--warn', 0.1) }] },
          options: baseOpts({ plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => v + '%' } } } }) });
        const sg = p.vectors[0].reduce((s, v) => s + v, 0) < 0 ? -1 : 1;
        table($('ms-tbl'), [{ key: 't', label: 'Ticker', fmt: v => `<b>${escapeHtml(v)}</b>` }, { key: 'l1', label: 'PC1', num: true, fmt: v => num(v), style: v => heat(v, 0.4) }, { key: 'l2', label: 'PC2', num: true, fmt: v => num(v), style: v => heat(v, 0.5) }, { key: 'l3', label: 'PC3', num: true, fmt: v => num(v), style: v => heat(v, 0.5) }],
          M.tickers.map((t, i) => ({ t, l1: sg * p.vectors[0][i], l2: p.vectors[1][i], l3: p.vectors[2][i] })), { sortKey: 'l2', maxRows: 80 });
      } },
      { id: 'denoise', label: 'Denoised covariance', render(body) {
        const M = structMatrix(); if (!M) return needMore(body, 'Needs at least 8 visible companies with a common history of ≥ 52 weeks.');
        const N = M.tickers.length, T = M.R[0].length, cut = Math.floor(T * 0.65);
        if (cut < 52 || T - cut < 26) return needMore(body, 'Needs more weeks of common history for a train/test split.');
        const tr = M.R.map(r => r.slice(0, cut)), te = M.R.map(r => r.slice(cut)), sd = tr.map(r => QL.std(r));
        const raw = QL.covMatrix(tr), dn = QL.denoiseCorr(tr), dc = dn.corr.map((r, i) => r.map((v, j) => v * sd[i] * sd[j])), sh = QL.shrinkCov(raw, 0.25);
        const zero = new Array(N).fill(0), mkw = C => QL.meanVariance(zero, C, 1, 1500);
        const cands = [['Equal weight', new Array(N).fill(1 / N)], ['Min-var · sample cov', mkw(raw)], ['Min-var · constant-corr shrinkage', mkw(sh)], ['Min-var · Marchenko-Pastur denoised', mkw(dc)]];
        const rows = cands.map(([name, w]) => { const pr = te[0].map((_, t) => w.reduce((s, x, i) => s + x * te[i][t], 0)); return { name, ins: Math.sqrt(QL.dot(w, QL.mv(raw, w)) * 52), oos: ann(QL.std(pr)), eff: 1 / w.reduce((s, x) => s + x * x, 0) }; });
        const best = rows.reduce((a, b) => (b.oos < a.oos ? b : a)), off = c => { let s = 0, n = 0; c.forEach((r, i) => r.forEach((v, j) => { if (i < j) { s += v; n++; } })); return s / n; };
        body.innerHTML = `<div class="kpis">${stat('Signal / noise eigenvalues', `${dn.nSignal} <small>/ ${N - dn.nSignal}</small>`, '', `Eigenvalues above λ₊ = ${dn.lambdaPlus.toFixed(2)} are kept; the rest are averaged`)}${stat('Variance in noise band', pctU(dn.noiseShare, 0))}
          ${stat('Mean pairwise corr (raw → denoised)', `${num(off(dn.raw))} <small>→ ${num(off(dn.corr))}</small>`)}${stat('Lowest out-of-sample vol', `${best.name.replace('Min-var · ', '')}`, 'g')}</div>
          <p class="tool-note">Covariance is estimated on the first ${cut} weeks (${fmtDate(M.dates[0])} – ${fmtDate(M.dates[cut - 1])}); the long-only minimum-variance portfolio it implies is then held for the next ${T - cut} weeks, and its <b>realized</b> volatility is measured. Denoising (Laloux 1999; López de Prado 2020) averages the noise-band eigenvalues so the optimizer stops chasing sampling error. Results depend on the window — treat as a diagnostic, not a guarantee.</p>
          <div id="dn-tbl"></div><div class="panel" style="margin-top:12px"><h4>Realized out-of-sample volatility (annualized)</h4><div class="chart-box"><canvas id="dn-ch"></canvas></div></div>`;
        table($('dn-tbl'), [{ key: 'name', label: 'Portfolio' }, { key: 'ins', label: 'In-sample vol', num: true, fmt: v => pctU(v) }, { key: 'oos', label: 'Out-of-sample vol', num: true, fmt: v => pctU(v), style: (v, r) => (r === best ? heat(1, 1, true) : '') },
          { key: 'eff', label: 'Effective # holdings', num: true, fmt: v => num(v, 1), title: '1 / Σw²' }], rows);
        chart('dn-ch', { type: 'bar', data: { labels: rows.map(r => r.name), datasets: [{ label: 'In-sample', data: rows.map(r => r.ins * 100), backgroundColor: cssA('--ink', 0.3), borderRadius: 4 }, { label: 'Out-of-sample', data: rows.map(r => r.oos * 100), backgroundColor: rows.map(r => (r === best ? cssA('--up', 0.7) : cssA('--accent', 0.6))), borderRadius: 4 }] },
          options: baseOpts({ scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => v + '%' } } } }) });
      } },
      { id: 'kalman', label: 'Kalman beta', render(body) {
        ms.y = ms.y || defaultTicker();
        const head = `<div class="tool-controls"><label class="range-wrap"><span>Stock</span> <select class="search" id="ms-y">${tickerOpts(ms.y)}</select></label>
          <label class="range-wrap"><span>vs</span> <select class="search" id="ms-x">${['SPY', 'SOXX'].map(t => opt(t, ms.x, t)).join('')}</select></label>
          <label class="range-wrap"><span>Adaptation</span> <select class="search" id="ms-d">${opt(0.0005, ms.delta, 'Slow')}${opt(0.002, ms.delta, 'Medium')}${opt(0.01, ms.delta, 'Fast')}</select></label></div>`;
        const ys = series(ms.y), xp = panel([ms.y, ms.x]), n = xp.dates.length, y = xp.R[0], x = xp.R[1];
        const bind = () => { $('ms-y').addEventListener('change', e => { ms.y = e.target.value; showTab('kalman'); }); $('ms-x').addEventListener('change', e => { ms.x = e.target.value; showTab('kalman'); }); $('ms-d').addEventListener('change', e => { ms.delta = +e.target.value; showTab('kalman'); }); };
        if (ys.r.length < 104 || ms.y === ms.x) { body.innerHTML = head; bind(); return body.insertAdjacentHTML('beforeend', '<div class="empty-state"><div class="es-title">Pick a stock other than the benchmark with ≥ 104 weeks of history</div></div>'); }
        const k = QL.kalmanBeta(y, x, { delta: ms.delta }), lastB = k.beta[n - 1], from = y.findIndex(v => v != null) + 26, bs = k.beta.slice(from), lastZ = [...k.z].reverse().find(v => v != null);
        body.innerHTML = `${head}<div class="kpis">${stat('Beta now (Kalman)', num(lastB), '', 'Time-varying sensitivity to the benchmark')}${stat('Beta (static OLS)', num(k.staticBeta), '', 'Full-sample regression beta')}
          ${stat('Beta range', `${num(Math.min(...bs))} – ${num(Math.max(...bs))}`)}${stat('Alpha now (ann.)', pct(k.alpha[n - 1] * 52), sign(k.alpha[n - 1]))}${stat('Latest innovation z', num(lastZ), Math.abs(lastZ) > 2 ? 'r' : '', 'Standardized one-step prediction error — |z|>2 is an unusually large surprise vs the model')}</div>
          <p class="tool-note">A rolling-window OLS beta lags and jumps when old observations drop out; the Kalman filter treats α and β as random walks and updates them every week, weighting new data by how noisy the stock is. Use the dynamic beta for hedge ratios and pairs trading, and the static line to see how far the stock has drifted from its long-run relationship. Window: ${fmtDate(xp.dates[from])} – ${fmtDate(xp.dates[n - 1])}.</p>
          <div class="panel"><h4>${ms.y} beta to ${ms.x}</h4><div class="chart-box tall"><canvas id="ms-kb"></canvas></div></div>
          <div class="panel" style="margin-top:12px"><h4>Dynamic alpha (annualized)</h4><div class="chart-box"><canvas id="ms-ka"></canvas></div></div>`;
        bind();
        const L = xp.dates.slice(from).map(shortDate);
        chart('ms-kb', { type: 'line', data: { labels: L, datasets: [{ label: 'Kalman beta', data: bs, borderColor: css('--accent'), borderWidth: 2, pointRadius: 0 }, { label: 'Static OLS', data: bs.map(() => k.staticBeta), borderColor: css('--ink-3'), borderDash: [5, 4], borderWidth: 1.2, pointRadius: 0 }] }, options: baseOpts({ scales: { x: { grid: { display: false } } } }) });
        chart('ms-ka', { type: 'line', data: { labels: L, datasets: [{ label: 'α', data: k.alpha.slice(from).map(v => v * 5200), borderColor: css('--warn'), borderWidth: 1.6, pointRadius: 0 }] }, options: baseOpts({ plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => v + '%' } } } }) });
      } },
    ],
  };

  // ═════════════════════════════════════════════════════════════════════════
  // STRATEGY VALIDATION
  // ═════════════════════════════════════════════════════════════════════════
  const sv = { cost: 10, src: 'EW' };
  // Equal-weight net returns of one (strategy, params) applied to every visible stock, aligned by date.
  function ewStrategy(P, dates, strat, g, cost) {
    const S = QL.STRATEGIES[strat], by = new Map();
    P.forEach(p => { const s0 = p.findIndex(v => v != null); if (s0 < 0) return; const seg = p.slice(s0); if (seg.some(v => v == null) || seg.length < 120) return;
      QL.strategyReturns(seg, S.positions(seg, g), cost).forEach((v, k) => { const d = dates[s0 + k + 1], e = by.get(d) || { s: 0, n: 0 }; e.s += v; e.n++; by.set(d, e); }); });
    const ds = [...by.keys()].sort(); return { d: ds, r: ds.map(d => by.get(d).s / by.get(d).n) };
  }
  function ewBuyHold(P, dates) {
    const by = new Map(); P.forEach(p => p.forEach((v, i) => { if (i && v != null && p[i - 1] != null) { const e = by.get(dates[i]) || { s: 0, n: 0 }; e.s += v / p[i - 1] - 1; e.n++; by.set(dates[i], e); } }));
    const ds = [...by.keys()].sort(); return { d: ds, r: ds.map(d => by.get(d).s / by.get(d).n) };
  }
  const validateTool = {
    title: 'Strategy Validation',
    sub: () => `Is a backtest result skill or luck? Deflated Sharpe Ratio (Bailey &amp; López de Prado), minimum track-record length and stationary-bootstrap confidence intervals. ${universeNote(visibleTickers().length)}`,
    tabs: [
      { id: 'dsr', label: 'Deflated Sharpe', render(body) {
        const vis = visibleTickers().slice(0, 45), pn = panel(vis);
        const head = `<div class="tool-controls"><label class="range-wrap"><span>Costs</span> <select class="search" id="sv-c">${[0, 10, 25, 50].map(v => opt(v, sv.cost, v + ' bps')).join('')}</select></label></div>`;
        const rfw = RF / 52, configs = [];
        Object.entries(QL.STRATEGIES).forEach(([k, S]) => S.grid.forEach(g => { const o = ewStrategy(pn.P, pn.dates, k, g, sv.cost); if (o.r.length >= 104) configs.push({ k, label: S.label, params: S.describe(g), ...o, ...QL.sharpeStats(o.r, rfw) }); }));
        if (configs.length < 4) { body.innerHTML = head; $('sv-c')?.addEventListener('change', () => {}); return body.insertAdjacentHTML('beforeend', '<div class="empty-state"><div class="es-title">Not enough history across visible companies</div></div>'); }
        const bh = ewBuyHold(pn.P, pn.dates), bhS = QL.sharpeStats(bh.r, rfw), srs = configs.map(c => c.sr), N = configs.length, v = QL.variance(srs);
        const emax = QL.expectedMaxSR(N, v), best = configs.reduce((a, b) => (b.sr > a.sr ? b : a));
        configs.forEach(c => { c.psr = QL.psr(c.sr, c.n, c.skew, c.kurt, 0); c.dsr = QL.dsr(c.sr, c.n, c.skew, c.kurt, N, v); });
        const trl = QL.minTRL(best.sr, best.skew, best.kurt, emax, 0.95);
        body.innerHTML = `${head}<div class="kpis">${stat('Strategy variants tried', N, '', 'Every strategy × parameter point in this terminal — the "trials" a researcher would have chosen the winner from')}
          ${stat('Best variant', best.k + ' · ' + best.params.replace(/&/g, '&amp;'), '', best.label)}${stat('Its Sharpe (ann.)', num(best.srAnn), 'g')}${stat('Buy &amp; hold Sharpe', num(bhS.srAnn))}
          ${stat('Luck threshold (ann.)', num(emax * Math.sqrt(52)), '', `Expected best Sharpe among ${N} skill-less variants given the dispersion of Sharpes tried`)}
          ${stat('Probabilistic SR (vs 0)', pctU(best.psr, 0), best.psr > 0.95 ? 'g' : '', 'P(true Sharpe > 0) adjusting for sample length, skew and kurtosis')}
          ${stat('Deflated SR', pctU(best.dsr, 0), best.dsr > 0.95 ? 'g' : 'r', 'P(true Sharpe > luck threshold). Above 95% = survives multiple-testing')}
          ${stat('Min track record', isFinite(trl) ? num(trl / 52, 1) + ' y' : '∞', trl / 52 > best.n / 52 ? 'r' : 'g', `Years of data needed to be 95% sure the best variant beats the luck threshold (have ${num(best.n / 52, 1)})`)}</div>
          <p class="tool-note">Each variant is run on every visible stock separately and equal-weighted, net of ${sv.cost} bps costs, ${fmtDate(best.d[0])} – ${fmtDate(best.d[best.d.length - 1])} (${best.n} weeks). Picking the best of ${N} variants inflates the Sharpe; the <b>Deflated Sharpe Ratio</b> asks whether it still clears the bar after that selection. PSR ignores selection, DSR accounts for it. This is in-sample by construction — see the Backtest tool for walk-forward results.</p>
          <div class="tool-grid2 wide-left"><div id="sv-tbl"></div><div class="panel"><h4>Annualized Sharpe by variant vs luck threshold</h4><div class="chart-box tall"><canvas id="sv-ch"></canvas></div></div></div>`;
        $('sv-c').addEventListener('change', e => { sv.cost = +e.target.value; showTab('dsr'); });
        table($('sv-tbl'), [{ key: 'label', label: 'Strategy' }, { key: 'params', label: 'Params' }, { key: 'srAnn', label: 'Sharpe', num: true, fmt: v => num(v), style: v => heat(v, 1) }, { key: 'psr', label: 'PSR', num: true, fmt: v => pctU(v, 0) },
          { key: 'dsr', label: 'DSR', num: true, fmt: v => `<span class="${v > 0.95 ? 'g' : 'r'}">${pctU(v, 0)}</span>` }, { key: 'skew', label: 'Skew', num: true, fmt: v => num(v) }], configs, { sortKey: 'srAnn' });
        chart('sv-ch', { type: 'bar', data: { labels: configs.map(c => `${c.k} ${c.params.replace(/&amp;/g, '&')}`), datasets: [{ label: 'Sharpe', data: configs.map(c => c.srAnn), backgroundColor: configs.map(c => (c === best ? cssA('--up', 0.75) : cssA('--accent', 0.5))), borderRadius: 3 },
          { type: 'line', label: 'Luck threshold', data: configs.map(() => emax * Math.sqrt(52)), borderColor: css('--down'), borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0 }, { type: 'line', label: 'Buy & hold', data: configs.map(() => bhS.srAnn), borderColor: css('--ink-3'), borderDash: [2, 3], borderWidth: 1.2, pointRadius: 0 }] },
          options: baseOpts({ indexAxis: 'y', scales: { y: { position: 'left', grid: { display: false }, ticks: { font: { size: 10 } } }, x: {} } }) });
      } },
      { id: 'boot', label: 'Bootstrap confidence', render(body) {
        const head = `<div class="tool-controls"><label class="range-wrap"><span>Return stream</span> <select class="search" id="sv-s">${opt('EW', sv.src, 'Equal-weight visible universe')}${tickerOpts(sv.src)}</select></label></div>`;
        let r; if (sv.src === 'EW') { const pn = panel(visibleTickers()); r = ewBuyHold(pn.P, pn.dates).r; } else r = series(sv.src).r;
        const bind = () => $('sv-s').addEventListener('change', e => { sv.src = e.target.value; showTab('boot'); });
        if (r.length < 104) { body.innerHTML = head; bind(); return body.insertAdjacentHTML('beforeend', '<div class="empty-state"><div class="es-title">Needs ≥ 104 weeks of returns</div></div>'); }
        const rfw = RF / 52, st = QL.sharpeStats(r, rfw), B = 1500, blk = 8;
        const shB = QL.stationaryBootstrap(r, x => { const s = QL.sharpeStats(x, rfw); return s.srAnn; }, { B, blk }), ddB = QL.stationaryBootstrap(r, x => QL.perfStats(x).maxDD, { B, blk, seed: 11 }), cgB = QL.stationaryBootstrap(r, x => QL.perfStats(x).cagr, { B, blk, seed: 13 });
        const ps = QL.perfStats(r), pPos = shB.dist.filter(v => v > 0).length / B, psrv = QL.psr(st.sr, st.n, st.skew, st.kurt, 0);
        body.innerHTML = `${head}<div class="kpis">${stat('Sharpe (ann.)', num(st.srAnn), sign(st.srAnn))}${stat('95% CI', `${num(shB.lo)} to ${num(shB.hi)}`, shB.lo > 0 ? 'g' : '', 'Stationary bootstrap, 8-week mean block')}${stat('P(Sharpe > 0)', pctU(pPos, 0), '', 'Share of bootstrap resamples with a positive Sharpe')}${stat('PSR (analytic)', pctU(psrv, 0), '', 'Closed-form check, adjusts for skew and kurtosis')}
          ${stat('CAGR', pct(ps.cagr), sign(ps.cagr))}${stat('CAGR 95% CI', `${pct(cgB.lo, 0)} to ${pct(cgB.hi, 0)}`)}${stat('Max drawdown', pctU(ps.maxDD, 0), 'r')}${stat('Drawdown 95% CI', `${pctU(ddB.lo, 0)} to ${pctU(ddB.hi, 0)}`, '', 'Worst-case range: the realized history is just one path')}</div>
          <p class="tool-note">Resamples the ${r.length} weekly returns in random blocks (mean length ${blk} weeks, preserving volatility clustering) ${B} times. The realized Sharpe is a single draw from a wide distribution — with only ${num(r.length / 52, 1)} years of data the interval is wide, and the realized maximum drawdown is typically <i>better</i> than what a different ordering of the same returns would have produced.</p>
          <div class="tool-grid2"><div class="panel"><h4>Bootstrap distribution of the Sharpe ratio</h4><div class="chart-box tall"><canvas id="bs-sh"></canvas></div></div><div class="panel"><h4>Bootstrap distribution of max drawdown</h4><div class="chart-box tall"><canvas id="bs-dd"></canvas></div></div></div>`;
        bind();
        const hg = (id, dist, lo, hi, mult, colorVar) => { const h = hist(dist.map(v => v * mult)); chart(id, { type: 'bar', data: { labels: h.centers.map(c => c.toFixed(mult === 100 ? 0 : 2) + (mult === 100 ? '%' : '')), datasets: [{ data: h.counts, backgroundColor: h.centers.map(c => (c >= lo * mult && c <= hi * mult ? cssA(colorVar, 0.65) : cssA('--ink', 0.2))), borderRadius: 2 }] },
          options: baseOpts({ plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } }, y: { ticks: { display: false } } } }) }); };
        hg('bs-sh', shB.dist, shB.lo, shB.hi, 1, '--accent'); hg('bs-dd', ddB.dist, ddB.lo, ddB.hi, 100, '--down');
      } },
    ],
  };

  registerTool('vol', volTool); registerTool('struct', structTool); registerTool('validate', validateTool);
})();
