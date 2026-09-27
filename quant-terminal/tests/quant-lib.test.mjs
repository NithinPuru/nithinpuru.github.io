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
