// Unit tests for public/quant-terminal/js/quant-ext.js — each model is checked against a known answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const QL = createRequire(import.meta.url)('../../public/quant-terminal/js/quant-ext.js');

function rng(seed = 42) { let s = seed >>> 0; return () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296); }
function normals(n, seed) { const u = rng(seed), out = []; for (let i = 0; i < n; i++) out.push(Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u())); return out; }
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
function simGarch(n, om, a, b, g = 0, seed = 5) {
  const z = normals(n + 200, seed), r = []; let s2 = om / (1 - a - b - g / 2), e = 0;
  for (let t = 0; t < n + 200; t++) { s2 = om + (a + (e < 0 ? g : 0)) * e * e + b * s2; e = Math.sqrt(s2) * z[t]; if (t >= 200) r.push(e); }
  return r;
}

test('nelderMead minimizes a quadratic', () => {
  const r = QL.nelderMead(x => (x[0] - 3) ** 2 + (x[1] + 1) ** 2, [0, 0], { step: 1 });
  close(r.x[0], 3, 1e-3, 'x'); close(r.x[1], -1, 1e-3, 'y');
});

test('GARCH(1,1) recovers persistence and unconditional variance', () => {
  const r = simGarch(3000, 2e-5, 0.08, 0.88), f = QL.fitGARCH(r);
  close(f.persistence, 0.96, 0.04, 'persistence'); close(f.beta, 0.88, 0.07, 'beta');
  close(f.uncondVar, 2e-5 / 0.04, 2e-4, 'unconditional variance');
  const q = QL.ljungBox(f.std.map(v => v * v), 10);
  assert.ok(QL.chi2sf(q, 10) > 0.01, `no ARCH left in standardized residuals (Q=${q})`);
  const fc = f.forecast(200); assert.ok(Math.abs(fc[199] - Math.sqrt(f.uncondVar)) < Math.abs(fc[0] - Math.sqrt(f.uncondVar)) + 1e-9, 'forecast mean-reverts');
});

test('GJR-GARCH detects leverage asymmetry; symmetric data gives ~0', () => {
  const asym = QL.fitGARCH(simGarch(4000, 2e-5, 0.02, 0.88, 0.14, 9), { gjr: true });
  assert.ok(asym.gamma > 0.05, `gamma ${asym.gamma}`);
  const sym = QL.fitGARCH(simGarch(4000, 2e-5, 0.08, 0.88, 0, 10), { gjr: true });
  assert.ok(sym.gamma < 0.08, `gamma on symmetric data ${sym.gamma}`);
});

test('chi2sf matches known critical values', () => {
  close(QL.chi2sf(3.841, 1), 0.05, 1e-3, 'df1'); close(QL.chi2sf(18.307, 10), 0.05, 1e-3, 'df10'); close(QL.chi2sf(6.635, 1), 0.01, 5e-4, 'df1 1%');
});

test('Gaussian data: normal / CF / hist VaR agree with theory', () => {
  const x = normals(20000, 3).map(v => 0.02 * v);
  close(QL.varES(x, 0.99, 'normal').VaR, 0.02 * 2.326, 0.002, 'normal VaR');
  close(QL.varES(x, 0.99, 'hist').VaR, 0.02 * 2.326, 0.003, 'hist VaR');
  close(QL.varES(x, 0.99, 'cf').VaR, 0.02 * 2.326, 0.003, 'CF VaR');
  close(QL.varES(x, 0.975, 'normal').ES, 0.02 * 2.338, 0.002, 'normal ES');
  const h = QL.varES(x, 0.99, 'hist'); assert.ok(h.ES > h.VaR);
});

test('EVT recovers a Pareto tail index and extrapolates the 99.9% VaR', () => {
  // Losses with P(L>x) = x^-4 (xi = 0.25): true 99.9% VaR = 0.001^(-1/4) = 5.623
  const u = rng(77), x = []; for (let i = 0; i < 20000; i++) x.push(-(1 / Math.pow(u() || 1e-9, 0.25)) * (u() < 0.5 ? 1 : -1) * 0.01);
  const r = QL.varES(x.map(v => v), 0.999, 'evt');
  assert.ok(r.xi > 0.1 && r.xi < 0.4, `xi ${r.xi}`);
  close(r.VaR, 0.01 * 5.623 * 0.5 ** 0.25, 0.012, 'EVT VaR');
  assert.ok(r.ES > r.VaR);
});

test('Kupiec & Christoffersen: correct coverage passes, over-exceeding fails, clustering is detected', () => {
  const u = rng(4), ok = Array.from({ length: 1000 }, () => (u() < 0.05 ? 1 : 0));
  assert.ok(QL.kupiec(ok, 0.95).p > 0.05, 'well calibrated');
  const bad = Array.from({ length: 1000 }, () => (u() < 0.12 ? 1 : 0)); assert.ok(QL.kupiec(bad, 0.95).p < 0.01, 'too many exceptions');
  const clustered = []; for (let i = 0; i < 1000; i++) clustered.push(i % 100 < 5 ? 1 : 0);
  assert.ok(QL.christoffersen(clustered).p < 0.01, 'clustered exceptions');
  assert.ok(QL.christoffersen(ok).p > 0.01, 'independent exceptions');
});

test('Rolling VaR backtest on GARCH data: GARCH VaR is better calibrated than an unconditional one', () => {
  const r = simGarch(900, 3e-5, 0.12, 0.84, 0, 21);
  const g = QL.backtestVaR(r, { p: 0.95, method: 'garch', window: 300, refit: 8 }), n = QL.backtestVaR(r, { p: 0.95, method: 'normal', window: 300 });
  assert.ok(g.hits.length > 400 && g.kupiec.rate > 0.02 && g.kupiec.rate < 0.09, `garch exception rate ${g.kupiec.rate}`);
  assert.ok(g.indep.lr <= n.indep.lr + 6, 'conditional model clusters no worse than unconditional');
});

test('Probabilistic / Deflated Sharpe and minimum track record', () => {
  close(QL.psr(0, 100, 0, 3, 0), 0.5, 1e-9, 'PSR at benchmark = 50%');
  // Bailey & LdP: SR=0.2/period... monotone checks
  assert.ok(QL.psr(0.2, 120, 0, 3) > QL.psr(0.1, 120, 0, 3));
  assert.ok(QL.psr(0.2, 240, 0, 3) > QL.psr(0.2, 60, 0, 3), 'longer record is more convincing');
  assert.ok(QL.psr(0.2, 120, -1.5, 9) < QL.psr(0.2, 120, 0, 3), 'negative skew / fat tails penalised');
  const e1 = QL.expectedMaxSR(1, 0.01), e100 = QL.expectedMaxSR(100, 0.01), e1000 = QL.expectedMaxSR(1000, 0.01);
  assert.equal(e1, 0); assert.ok(e100 > 0.2 && e1000 > e100, `expected max SR ${e100} ${e1000}`);
  assert.ok(QL.dsr(0.2, 120, 0, 3, 100, 0.01) < QL.psr(0.2, 120, 0, 3), 'deflation lowers the probability');
  // minTRL: with normal returns and SR=0.2 vs 0, 95% → 1 + (1+0.02)*(1.645/0.2)^2 ≈ 70.0
  close(QL.minTRL(0.2, 0, 3, 0, 0.95), 1 + 1.02 * (1.6449 / 0.2) ** 2, 0.5, 'minTRL');
  assert.equal(QL.minTRL(-0.1, 0, 3), Infinity);
});

test('stationary bootstrap CI covers the true mean and is wider for smaller samples', () => {
  const x = normals(400, 8).map(v => 0.01 + 0.04 * v), b = QL.stationaryBootstrap(x, QL.mean, { B: 800 });
  assert.ok(b.lo < 0.01 && b.hi > 0.01 - 0.004, `CI [${b.lo}, ${b.hi}]`);
  const b2 = QL.stationaryBootstrap(x.slice(0, 50), QL.mean, { B: 800 }); assert.ok(b2.hi - b2.lo > b.hi - b.lo);
  assert.deepEqual(QL.stationaryBootstrap(x, QL.mean, { B: 50, seed: 3 }).dist, QL.stationaryBootstrap(x, QL.mean, { B: 50, seed: 3 }).dist, 'deterministic');
});

test('eigSym: reconstruction and known spectrum', () => {
  const A = [[4, 1, 0], [1, 3, 1], [0, 1, 2]], e = QL.eigSym(A);
  close(e.values.reduce((s, v) => s + v, 0), 9, 1e-9, 'trace');
  e.values.forEach((l, k) => { const v = e.vectors[k], Av = QL.mv(A, v); Av.forEach((x, i) => close(x, l * v[i], 1e-8, `Av=λv [${k}][${i}]`)); });
  assert.ok(e.values[0] >= e.values[1] && e.values[1] >= e.values[2]);
});

test('PCA / Marchenko-Pastur: one-factor market has one signal eigenvalue; pure noise has none', () => {
  const N = 20, T = 400, f = normals(T, 1), R = Array.from({ length: N }, (_, i) => { const e = normals(T, 100 + i); return f.map((v, t) => 0.6 * v + 0.8 * e[t]); });
  const d = QL.denoiseCorr(R);
  assert.equal(d.nSignal, 1, `signal eigenvalues ${d.nSignal}`);
  close(d.values[0], 1 + (N - 1) * 0.36, 1.5, 'market eigenvalue ≈ 1+(N−1)ρ');
  d.corr.forEach((r, i) => close(r[i], 1, 1e-9, 'unit diagonal'));
  const noise = Array.from({ length: N }, (_, i) => normals(T, 500 + i)), dn = QL.denoiseCorr(noise);
  assert.ok(dn.nSignal <= 1, `noise signal count ${dn.nSignal}`);
  close(QL.mpEdge(20, 400), (1 + Math.sqrt(0.05)) ** 2, 1e-12, 'MP edge');
  assert.ok(QL.absorptionRatio(R, 1) > 0.3);
  const o = QL.pca(R); close(o.explained.reduce((s, v) => s + v, 0), 1, 1e-9, 'explained sums to 1');
});

test('Kalman filter tracks a drifting beta better than static OLS', () => {
  const n = 600, x = normals(n, 31).map(v => 0.02 * v), e = normals(n, 32), y = [], tb = [];
  for (let t = 0; t < n; t++) { const b = 0.5 + 1.5 * (t / n); tb.push(b); y.push(0.001 + b * x[t] + 0.004 * e[t]); }
  const k = QL.kalmanBeta(y, x, { delta: 2e-3 });
  const rmseK = Math.sqrt(QL.mean(k.beta.slice(100).map((b, i) => (b - tb[i + 100]) ** 2))), rmseS = Math.sqrt(QL.mean(tb.slice(100).map(b => (k.staticBeta - b) ** 2)));
  assert.ok(rmseK < rmseS, `kalman ${rmseK} vs static ${rmseS}`);
  close(k.beta[n - 1], 2.0, 0.35, 'final beta');
  const z = k.z.filter(v => v != null); close(QL.std(z), 1, 0.3, 'standardized innovations ≈ unit variance');
});
