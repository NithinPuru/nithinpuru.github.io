// Unit tests for public/quant-terminal/js/quant-lib.js — each model is checked
// against a case with a known answer. Run: node --test quant-terminal/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const QL = createRequire(import.meta.url)('../../public/quant-terminal/js/quant-lib.js');

// Deterministic PRNG + normal draws so tests are reproducible.
function rng(seed = 42) { let s = seed >>> 0; return () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296); }
function normals(n, seed) { const u = rng(seed), out = []; for (let i = 0; i < n; i++) out.push(Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u())); return out; }
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

test('inv: A * inv(A) = I', () => {
  const A = [[4, 1, 2], [1, 3, 0], [2, 0, 5]], I = QL.mul(A, QL.inv(A));
  I.forEach((r, i) => r.forEach((v, j) => close(v, i === j ? 1 : 0, 1e-10, `I[${i}][${j}]`)));
});

test('ols recovers known coefficients', () => {
  const e = normals(500, 1), x1 = normals(500, 2), x2 = normals(500, 3);
  const y = x1.map((v, i) => 0.5 + 2 * v - 1.5 * x2[i] + 0.1 * e[i]);
  const r = QL.ols(y, x1.map((v, i) => [1, v, x2[i]]));
  close(r.b[0], 0.5, 0.02, 'intercept'); close(r.b[1], 2, 0.02, 'b1'); close(r.b[2], -1.5, 0.02, 'b2');
  assert.ok(r.r2 > 0.99);
});

test('HMM separates a calm and a turbulent regime', () => {
  const z = normals(600, 7), x = [], truth = [];
  for (let i = 0; i < 600; i++) { const hi = Math.floor(i / 100) % 2 === 1; truth.push(hi ? 1 : 0); x.push(hi ? 0.06 * z[i] - 0.01 : 0.015 * z[i] + 0.003); }
  const h = QL.fitHMM(x, 2);
  close(h.sigma[0], 0.015, 0.005, 'calm sigma'); close(h.sigma[1], 0.06, 0.015, 'turbulent sigma');
  const acc = h.path.filter((s, i) => s === truth[i]).length / x.length;
  assert.ok(acc > 0.9, `viterbi accuracy ${acc}`);
  h.A.forEach(r => close(r.reduce((s, v) => s + v, 0), 1, 1e-9, 'transition rows sum to 1'));
  assert.ok(h.duration[0] > 20, 'regimes are persistent');
});

test('ADF / Engle-Granger: cointegrated pair vs independent random walks', () => {
  const e1 = normals(400, 11), e2 = normals(400, 12), e3 = normals(400, 13);
  let b = 100, sp = 0, rw = 100; const A = [], B = [], C = [];
  for (let i = 0; i < 400; i++) { b *= Math.exp(0.02 * e1[i]); sp = 0.8 * sp + 0.01 * e2[i]; rw *= Math.exp(0.02 * e3[i]); B.push(b); A.push(b ** 1.2 * Math.exp(sp)); C.push(rw); }
  const coint = QL.cointegration(A, B), indep = QL.cointegration(C, B);
  assert.ok(coint.adfT < QL.EG_CRIT[1], `cointegrated ADF t ${coint.adfT}`);
  close(coint.hedge, 1.2, 0.05, 'hedge ratio');
  close(coint.halfLife, Math.log(2) / -Math.log(0.8), 1.5, 'half-life');
  assert.ok(indep.adfT > QL.EG_CRIT[5], `independent walks should not cointegrate (t=${indep.adfT})`);
});

test('projectSimplex lands on the simplex', () => {
  const w = QL.projectSimplex([0.5, -0.2, 1.4, 0.1]);
  close(w.reduce((s, x) => s + x, 0), 1, 1e-12, 'sum'); assert.ok(w.every(x => x >= 0));
});

test('risk parity equalizes risk contributions', () => {
  const C = [[0.04, 0.006, 0.01], [0.006, 0.09, 0.02], [0.01, 0.02, 0.16]], w = QL.riskParity(C);
  const d = QL.riskDecomposition(w, C); d.pct.forEach(p => close(p, 1 / 3, 1e-6, 'risk share'));
});

test('HRP weights are positive and sum to 1; lower-vol assets get more', () => {
  const C = [[0.01, 0.002, 0.001, 0.001], [0.002, 0.04, 0.001, 0.002], [0.001, 0.001, 0.09, 0.03], [0.001, 0.002, 0.03, 0.16]];
  const { w, order } = QL.hrp(C);
  close(w.reduce((s, x) => s + x, 0), 1, 1e-12, 'sum'); assert.ok(w.every(x => x > 0)); assert.equal(order.length, 4);
  assert.ok(w[0] > w[3], 'lowest-variance asset outweighs highest');
});

test('mean-variance: frontier is ordered and max-Sharpe beats min-variance on Sharpe', () => {
  const mu = [0.08, 0.12, 0.18, 0.1], C = [[0.02, 0.004, 0.006, 0.002], [0.004, 0.05, 0.01, 0.006], [0.006, 0.01, 0.12, 0.01], [0.002, 0.006, 0.01, 0.03]];
  const f = QL.efficientFrontier(mu, C, 0.03);
  assert.ok(f.maxSharpe.sharpe >= f.minVar.sharpe - 1e-9);
  f.frontier.forEach(p => close(p.w.reduce((s, x) => s + x, 0), 1, 1e-9, 'weights sum'));
  // Min-variance should match the grid's lowest-vol point and be <= every asset's vol.
  assert.ok(f.minVar.vol <= Math.sqrt(Math.min(...C.map((r, i) => r[i]))) + 1e-9);
});

test('Black-Litterman: no views -> equilibrium; a bullish view raises that asset', () => {
  const C = [[0.04, 0.01, 0.01], [0.01, 0.05, 0.012], [0.01, 0.012, 0.06]], w = [0.5, 0.3, 0.2];
  const none = QL.blackLitterman(C, w, []);
  none.mu.forEach((v, i) => close(v, none.pi[i], 1e-12, 'no-view posterior = prior'));
  const bull = QL.blackLitterman(C, w, [{ i: 2, q: 0.3, conf: 0.8 }]);
  assert.ok(bull.mu[2] > none.mu[2] + 0.05, 'view pulls expected return up');
  assert.ok(bull.mu[2] < 0.3, 'posterior shrinks toward prior (not all the way to the view)');
});

test('factor regression recovers exposures and attribution sums to 1', () => {
  const f1 = normals(300, 21).map(v => 0.02 * v), f2 = normals(300, 22).map(v => 0.01 * v), e = normals(300, 23);
  const r = f1.map((v, i) => 0.001 + 1.3 * v - 0.7 * f2[i] + 0.005 * e[i]);
  const fr = QL.factorRegression(r, [f1, f2], ['A', 'B']);
  close(fr.beta[0], 1.3, 0.05, 'beta A'); close(fr.beta[1], -0.7, 0.1, 'beta B');
  close(fr.contrib.reduce((s, x) => s + x, 0) + fr.idio, 1, 1e-9, 'attribution sums to 1');
});

test('long-short factor has no look-ahead: a signal equal to NEXT return must not be used', () => {
  // If the engine peeked, signal(i,t)=R[i][t] would earn a large positive premium only when shifted.
  const n = 12, len = 200, z = normals(n * len, 31), R = Array.from({ length: n }, (_, i) => Array.from({ length: len }, (_, t) => 0.02 * z[i * len + t]));
  const f = QL.longShortFactor(R, (i, t) => R[i][t]).filter(v => v != null);
  close(QL.mean(f), 0, 0.004, 'factor built from past-only signal has ~0 premium on iid returns');
});

test('walk-forward backtest runs out-of-sample only and applies costs', () => {
  const z = normals(520, 41); let p = 100; const P = z.map(v => (p *= Math.exp(0.002 + 0.04 * v)));
  const free = QL.walkForward(P, 'trend', { costBps: 0 }), costly = QL.walkForward(P, 'trend', { costBps: 50 });
  assert.equal(free.oos.length, P.length - 1 - 104, 'OOS covers everything after the first training window');
  assert.ok(costly.stats.total < free.stats.total, 'costs reduce returns');
  assert.ok(free.turnover > 0);
});

test('rsiSeries matches the textbook value on a constant uptrend', () => {
  const p = Array.from({ length: 40 }, (_, i) => 100 + i);
  assert.equal(QL.rsiSeries(p, 14)[39], 100);
});

// ─── Validation against statsmodels (fixtures/statsmodels.json, see gen_fixtures.py) ───
const FIX = JSON.parse((await import('node:fs')).readFileSync(new URL('./fixtures/statsmodels.json', import.meta.url)));

test('ADF t-stat and MacKinnon p-value match statsmodels adfuller', () => {
  FIX.cases.forEach((c, k) => {
    const r = QL.adf(c.a.map(Math.log), 1, 'c');
    close(r.t, c.adf_t, 1e-6, `case ${k} ADF t`);
    close(QL.mackinnonp(r.t, 1), c.adf_p, 1e-5, `case ${k} ADF p`);
  });
});

test('Engle-Granger t-stat and p-value match statsmodels coint', () => {
  FIX.cases.forEach((c, k) => {
    const r = QL.cointegration(c.a, c.b);
    close(r.adfT, c.coint_t, 1e-6, `case ${k} coint t`);
    close(r.pval, c.coint_p, 1e-5, `case ${k} coint p`);
  });
});

test('Benjamini-Hochberg q-values match statsmodels multipletests(fdr_bh)', () => {
  QL.benjaminiHochberg(FIX.bh.p).forEach((q, i) => close(q, FIX.bh.q[i], 1e-12, `q[${i}]`));
});

test('RRG trajectories rotate clockwise when relative performance cycles', () => {
  // Stock = benchmark × a slow sine wave of outperformance: a textbook rotation.
  const n = 400, B = [], P = []; let b = 100;
  const z = normals(n, 51);
  for (let t = 0; t < n; t++) { b *= Math.exp(0.02 * z[t]); B.push(b); P.push(b * Math.exp(0.15 * Math.sin((2 * Math.PI * t) / 52))); }
  const { ratio, mom } = QL.rrgSeries(P, B, { window: 14, smooth: 3 });
  // Signed (shoelace) area over each full cycle: negative = clockwise.
  let cw = 0, cycles = 0;
  for (let s = 60; s + 52 < n; s += 52) {
    let a = 0; for (let t = s; t < s + 52; t++) a += (ratio[t] - 100) * (mom[t + 1] - 100) - (ratio[t + 1] - 100) * (mom[t] - 100);
    cycles++; if (a < 0) cw++;
  }
  assert.ok(cycles >= 5 && cw === cycles, `clockwise in ${cw}/${cycles} cycles`);
  // RS-Momentum must LEAD RS-Ratio: their correlation peaks with momentum shifted earlier.
  const lagCorr = k => { const x = [], y = []; for (let t = 60; t + k < n; t++) { x.push(mom[t] - 100); y.push(ratio[t + k] - 100); } const mx = QL.mean(x), my = QL.mean(y); let c = 0, vx = 0, vy = 0; x.forEach((v, i) => { c += (v - mx) * (y[i] - my); vx += (v - mx) ** 2; vy += (y[i] - my) ** 2; }); return c / Math.sqrt(vx * vy); };
  // Rate of change leads its level by 90°, and z-scoring it adds more lead; any lead
  // strictly between 0 and half a cycle (26 of 52 weeks) produces clockwise rotation.
  let best = 0; for (let k = -25; k <= 25; k++) if (lagCorr(k) > lagCorr(best)) best = k;
  assert.ok(best > 0 && best < 26, `momentum should lead ratio by (0, 26) weeks, got ${best}`);
});

test('quality score ranks strong businesses above weak ones and is outlier-robust', () => {
  const firm = (lvl, extra = {}) => ({ roe: 0.05 * lvl, roa: 0.02 * lvl, grossMargin: 0.3 + 0.05 * lvl, opMargin: 0.05 * lvl, fcfMargin: 0.04 * lvl,
    revGrowth: 0.03 * lvl, epsGrowth: 0.04 * lvl, debtToEquity: 1.2 - 0.2 * lvl, currentRatio: 1 + 0.4 * lvl, beta: 1.6 - 0.1 * lvl, vol: 0.6 - 0.05 * lvl, ...extra });
  const rows = [firm(1), firm(2), firm(3), firm(4), firm(5), { beta: 1, vol: 0.3 } /* no fundamentals */, firm(3, { epsGrowth: 11.9 }) /* outlier */];
  const q = QL.qualityScores(rows);
  for (let i = 1; i < 5; i++) assert.ok(q[i].quality > q[i - 1].quality, `firm ${i + 1} beats firm ${i}`);
  assert.equal(q[5].quality, null, 'no profitability data -> no quality score');
  assert.ok(q[6].quality < q[4].quality, 'a huge EPS-growth outlier cannot outrank the best all-round firm');
  assert.ok(q[5].coverage < 0.3 && q[0].coverage === 1);
});

test('rankZ is monotone, symmetric and handles ties/missing', () => {
  const z = QL.rankZ([3, 1, 2, null, 2]);
  assert.equal(z[3], null); assert.ok(z[1] < z[2] && z[2] < z[0]); assert.equal(z[2], z[4]);
  close(z[1] + z[0], 0, 1e-12, 'symmetric extremes');
});
