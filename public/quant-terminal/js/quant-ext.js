/* Quant library extension — institutional risk & validation models. Pure functions,
 * no DOM. Extends QL (quant-lib.js), so load it after quant-lib.js. Weekly data: annualize with 52.
 *
 * Contents
 *   Volatility ............ GARCH(1,1) / GJR-GARCH(1,1) (variance-targeted QMLE), term-structure forecast
 *   Tail risk ............. historical / Gaussian / Cornish-Fisher / EVT (GPD peaks-over-threshold) VaR & ES,
 *                           rolling VaR backtest with Kupiec POF + Christoffersen independence tests
 *   Strategy validation ... Probabilistic & Deflated Sharpe ratio, minimum track-record length,
 *                           stationary bootstrap confidence intervals (Politis-Romano)
 *   Market structure ...... Jacobi eigendecomposition, PCA, Marchenko-Pastur denoising,
 *                           absorption ratio (Kritzman et al. 2011)
 *   State space ........... Kalman filter for time-varying alpha / beta (hedge ratio)
 */
(function (root) {
  'use strict';
  const QL = typeof module !== 'undefined' && module.exports ? require('./quant-lib.js') : root.QL;
  const { mean, variance, std, normCdf, normInv, mulberry32 } = QL;
  const W = 52;
  const EULER = 0.5772156649015329;

  // ─── Derivative-free optimizer (Nelder-Mead) ─────────────────────────────
  function nelderMead(f, x0, { step = 0.1, iters = 400, tol = 1e-9 } = {}) {
    const n = x0.length;
    let S = [x0.slice()];
    for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += step; S.push(p); }
    let F = S.map(f);
    for (let it = 0; it < iters; it++) {
      const o = F.map((v, i) => i).sort((a, b) => F[a] - F[b]); S = o.map(i => S[i]); F = o.map(i => F[i]);
      if (Math.abs(F[n] - F[0]) < tol) break;
      const c = S[0].map((_, j) => S.slice(0, n).reduce((s, p) => s + p[j], 0) / n);
      const at = k => c.map((v, j) => v + k * (S[n][j] - v));
      const xr = at(-1), fr = f(xr);
      if (fr < F[0]) { const xe = at(-2), fe = f(xe); if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; } }
      else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
      else {
        const xc = fr < F[n] ? at(-0.5) : at(0.5), fc = f(xc);
        if (fc < Math.min(fr, F[n])) { S[n] = xc; F[n] = fc; }
        else for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, j) => S[0][j] + 0.5 * (v - S[0][j])); F[i] = f(S[i]); }
      }
    }
    const b = F.indexOf(Math.min(...F));
    return { x: S[b], f: F[b] };
  }

  // ─── GARCH(1,1) / GJR-GARCH(1,1) ─────────────────────────────────────────
  // σ²_t = ω + (α + γ·1[ε_{t−1}<0])·ε²_{t−1} + β·σ²_{t−1}, Gaussian quasi-MLE. Returns are
  // handled in percent for numerical conditioning; ω is variance-targeted (ω = V(1−P)), which
  // leaves a 2-parameter (GARCH) or 3-parameter (GJR) search with the stationarity constraint
  // P = α + β + γ/2 < 1 built into the parameterization.
  function garchRun(e, V, a, b, g) {
    const n = e.length, s2 = new Array(n), P = a + b + g / 2, om = V * (1 - P);
    s2[0] = V; let ll = 0;
    for (let t = 0; t < n; t++) {
      if (t > 0) s2[t] = om + (a + (e[t - 1] < 0 ? g : 0)) * e[t - 1] ** 2 + b * s2[t - 1];
      if (!(s2[t] > 1e-12)) return { s2, ll: -1e12 };
      ll += -0.5 * (Math.log(2 * Math.PI) + Math.log(s2[t]) + e[t] ** 2 / s2[t]);
    }
    return { s2, ll, om, P };
  }
  function fitGARCH(r, { gjr = false } = {}) {
    const x = r.filter(v => v != null && isFinite(v)); if (x.length < 100) return null;
    const mu = mean(x), e = x.map(v => (v - mu) * 100), V = e.reduce((s, v) => s + v * v, 0) / e.length;
    const sg = v => 1 / (1 + Math.exp(-v));
    // Unconstrained θ → (α, β, γ), P = α + γ/2 + β < 0.9995 by construction.
    const dec = th => {
      const P = 0.9995 * sg(th[0]), arch = P * sg(th[1]); // α + γ/2 + β = P ; α + γ/2 = arch
      const asym = gjr ? sg(th[2]) : 0;                   // fraction of the ARCH term that is leverage (γ/2)
      return { a: arch * (1 - asym), g: 2 * arch * asym, b: P - arch };
    };
    const obj = th => { const p = dec(th); return -garchRun(e, V, p.a, p.b, p.g).ll; };
    let best = null;
    for (const s of [[2.5, -2, 0], [3.5, -1.5, 0.3], [1.5, -1, -0.5]]) {
      const r1 = nelderMead(obj, gjr ? s : s.slice(0, 2), { step: 0.5, iters: 500 });
      if (!best || r1.f < best.f) best = r1;
    }
    const p = dec(gjr ? best.x : [...best.x, 0]), run = garchRun(e, V, p.a, p.b, p.g);
    const sigma = run.s2.map(v => Math.sqrt(v) / 100), last = e[e.length - 1];
    const next = run.om + (p.a + (last < 0 ? p.g : 0)) * last ** 2 + p.b * run.s2[run.s2.length - 1];
    const uncond = V / 10000;
    const k = gjr ? 3 : 2;
    return {
      gjr, mu, alpha: p.a, beta: p.b, gamma: p.g, persistence: run.P, uncondVar: uncond, uncondVol: Math.sqrt(uncond * W),
      halfLife: run.P < 1 && run.P > 0 ? Math.log(0.5) / Math.log(run.P) : Infinity,
      loglik: run.ll, aic: 2 * k - 2 * run.ll, bic: k * Math.log(e.length) - 2 * run.ll, n: e.length,
      sigma, // in-sample conditional weekly vol (decimal)
      std: e.map((v, i) => v / 100 / sigma[i]), // standardized residuals
      next: Math.sqrt(next) / 100,
      // Forecast σ_{t+1..t+h} (weekly, decimal): variance mean-reverts to V at rate P.
      forecast(h = 26) { const out = []; for (let i = 0; i < h; i++) out.push(Math.sqrt(V + run.P ** i * (next - V)) / 100); return out; },
    };
  }
  // Ljung-Box Q statistic on a series (use squared standardized residuals to test leftover ARCH effects).
  function ljungBox(x, lags = 10) {
    const n = x.length, m = mean(x), d = x.map(v => v - m), c0 = d.reduce((s, v) => s + v * v, 0); let Q = 0;
    for (let k = 1; k <= lags; k++) { let c = 0; for (let t = k; t < n; t++) c += d[t] * d[t - k]; Q += (c / c0) ** 2 / (n - k); }
    return n * (n + 2) * Q;
  }
  // Chi-square survival function via the regularized incomplete gamma (series / continued fraction).
  function chi2sf(x, k) {
    if (x <= 0) return 1; const a = k / 2, xx = x / 2;
    const lg = z => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = z, t = z + 5.5; t -= (z + 0.5) * Math.log(t); let s = 1.000000000190015; for (const v of c) s += v / ++y; return -t + Math.log(2.5066282746310005 * s / z); };
    if (xx < a + 1) { let sum = 1 / a, term = sum; for (let n = 1; n < 500; n++) { term *= xx / (a + n); sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-12) break; } return 1 - sum * Math.exp(-xx + a * Math.log(xx) - lg(a)); }
    let b = xx + 1 - a, c = 1e30, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-30) d = 1e-30; c = b + an / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-12) break; }
    return Math.exp(-xx + a * Math.log(xx) - lg(a)) * h;
  }

  // ─── Tail risk: VaR / ES ─────────────────────────────────────────────────
  function moments(x) {
    const m = mean(x), s = std(x), n = x.length; let m3 = 0, m4 = 0;
    for (const v of x) { const z = (v - m) / (s || 1); m3 += z ** 3; m4 += z ** 4; }
    return { mean: m, std: s, skew: m3 / n, kurt: m4 / n }; // kurt = raw (normal = 3)
  }
  // Generalized Pareto fit to threshold excesses by probability-weighted moments (Hosking & Wallis 1987).
  function fitGPD(excess) {
    const y = [...excess].sort((a, b) => a - b), n = y.length; if (n < 8) return null;
    const a0 = mean(y); let a1 = 0; for (let i = 0; i < n; i++) a1 += y[i] * (n - 1 - i) / (n - 1); a1 /= n;
    const d = a0 - 2 * a1; if (Math.abs(d) < 1e-14) return null;
    return { xi: 2 - a0 / d, beta: (2 * a0 * a1) / d };
  }
  // VaR/ES are returned as positive loss fractions. p = confidence (e.g. 0.99).
  function varES(r, p = 0.95, method = 'hist') {
    const x = r.filter(v => v != null && isFinite(v)), n = x.length; if (n < 20) return null;
    const q = 1 - p, mo = moments(x);
    if (method === 'normal') { const z = normInv(q), phi = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI); return { VaR: -(mo.mean + mo.std * z), ES: -(mo.mean - mo.std * phi / q) }; }
    if (method === 'cf') {
      // Cornish-Fisher expansion of the quantile; ES by averaging the adjusted quantile over the tail.
      const cf = u => { const z = normInv(u), S = mo.skew, K = mo.kurt - 3; return z + (z * z - 1) * S / 6 + (z ** 3 - 3 * z) * K / 24 - (2 * z ** 3 - 5 * z) * S * S / 36; };
      const m = 200; let es = 0; for (let i = 0; i < m; i++) es += mo.mean + mo.std * cf(q * (i + 0.5) / m); es /= m;
      return { VaR: -(mo.mean + mo.std * cf(q)), ES: -es };
    }
    const s = [...x].sort((a, b) => a - b);
    if (method === 'evt') {
      const losses = s.map(v => -v), k = Math.max(15, Math.floor(0.1 * n)), u = losses[k], exc = losses.slice(0, k).map(v => v - u).filter(v => v >= 0);
      const g = fitGPD(exc); if (!g || g.xi >= 0.95) return varES(r, p, 'hist');
      const ratio = (n / exc.length) * q, VaR = Math.abs(g.xi) < 1e-6 ? u - g.beta * Math.log(ratio) : u + (g.beta / g.xi) * (ratio ** -g.xi - 1);
      return { VaR, ES: (VaR + g.beta - g.xi * u) / (1 - g.xi), xi: g.xi, beta: g.beta, u, nExc: exc.length };
    }
    const k = Math.max(1, Math.ceil(q * n));
    return { VaR: -s[k - 1], ES: -mean(s.slice(0, k)) };
  }
  // Filtered historical simulation / GARCH VaR: scale standardized residuals by the next-step vol forecast.
  function garchVaR(fit, p = 0.99) {
    const z = [...fit.std].sort((a, b) => a - b), q = 1 - p, k = Math.max(1, Math.floor(q * z.length));
    return { VaR: -(fit.mu + fit.next * z[Math.max(0, k - 1)]), ES: -(fit.mu + fit.next * mean(z.slice(0, k))) };
  }
  // Kupiec (1995) proportion-of-failures test and Christoffersen (1998) independence test.
  function kupiec(hits, p) {
    const n = hits.length, x = hits.reduce((s, v) => s + v, 0), q = 1 - p, ph = x / n; if (!n) return null;
    const l = (pp, k) => (pp <= 0 || pp >= 1 ? (k === 0 || (pp >= 1 && k === n) ? 0 : -1e9) : (n - x) * Math.log(1 - pp) + x * Math.log(pp));
    const lr = x === 0 ? -2 * n * Math.log(1 - q) : -2 * (l(q) - l(ph));
    return { n, x, rate: ph, expected: q, lr, p: chi2sf(Math.max(0, lr), 1) };
  }
  function christoffersen(hits) {
    let n00 = 0, n01 = 0, n10 = 0, n11 = 0;
    for (let i = 1; i < hits.length; i++) { const a = hits[i - 1], b = hits[i]; if (a === 0 && b === 0) n00++; else if (a === 0) n01++; else if (b === 0) n10++; else n11++; }
    const pi01 = n00 + n01 ? n01 / (n00 + n01) : 0, pi11 = n10 + n11 ? n11 / (n10 + n11) : 0, pi = (n01 + n11) / Math.max(1, n00 + n01 + n10 + n11);
    const L = (pp, a, b) => (pp <= 0 || pp >= 1 ? 0 : a * Math.log(1 - pp) + b * Math.log(pp));
    const lr = -2 * (L(pi, n00 + n10, n01 + n11) - (L(pi01, n00, n01) + L(pi11, n10, n11)));
    return { lr: Math.max(0, lr), p: chi2sf(Math.max(0, lr), 1), n11 };
  }
  // Expanding/rolling out-of-sample VaR backtest of a method. Returns the exceptions and test p-values.
  function backtestVaR(r, { p = 0.95, method = 'hist', window = 156, refit = 4 } = {}) {
    const hits = [], var_ = [], idx = []; let fit = null;
    for (let t = window; t < r.length; t++) {
      let v;
      if (method === 'garch') {
        if (!fit || (t - window) % (refit * 4) === 0) fit = fitGARCH(r.slice(t - window, t));
        if (!fit) continue;
        // Update the filtered state through t−1 without refitting parameters.
        const e = r.slice(t - window, t).map(x => (x - fit.mu) * 100), V = fit.uncondVar * 10000, run = garchRun(e, V, fit.alpha, fit.beta, fit.gamma);
        const nx = run.om + (fit.alpha + (e[e.length - 1] < 0 ? fit.gamma : 0)) * e[e.length - 1] ** 2 + fit.beta * run.s2[run.s2.length - 1];
        v = -(fit.mu + normInv(1 - p) * Math.sqrt(nx) / 100);
      } else { const o = varES(r.slice(t - window, t), p, method); if (!o) continue; v = o.VaR; }
      var_.push(v); hits.push(r[t] < -v ? 1 : 0); idx.push(t);
    }
    return { hits, var: var_, idx, kupiec: kupiec(hits, p), indep: christoffersen(hits) };
  }

  // ─── Strategy validation ─────────────────────────────────────────────────
  // Non-annualized Sharpe of a return series with its higher moments.
  function sharpeStats(r, rfPer = 0) {
    const x = r.map(v => v - rfPer), mo = moments(x), sr = mo.std ? mo.mean / mo.std : 0;
    return { sr, n: x.length, skew: mo.skew, kurt: mo.kurt, srAnn: sr * Math.sqrt(W) };
  }
  // Probabilistic Sharpe Ratio (Bailey & López de Prado 2012): P(true SR > benchmark) given
  // sample length, skew and kurtosis. sr / srBench are per-period (non-annualized).
  function psr(sr, n, skew, kurt, srBench = 0) {
    const den = Math.sqrt(Math.max(1e-12, 1 - skew * sr + ((kurt - 1) / 4) * sr * sr));
    return normCdf(((sr - srBench) * Math.sqrt(n - 1)) / den);
  }
  // Expected maximum Sharpe among N independent zero-skill trials with SR variance v (per-period).
  function expectedMaxSR(N, v) { return N <= 1 ? 0 : Math.sqrt(v) * ((1 - EULER) * normInv(1 - 1 / N) + EULER * normInv(1 - 1 / (N * Math.E))); }
  // Deflated Sharpe Ratio: PSR against the SR one would expect to find by luck after N trials.
  function dsr(sr, n, skew, kurt, trials, srVar) { return psr(sr, n, skew, kurt, expectedMaxSR(trials, srVar)); }
  // Minimum track-record length (periods) for SR to beat srBench at confidence `conf`.
  function minTRL(sr, skew, kurt, srBench = 0, conf = 0.95) {
    if (sr <= srBench) return Infinity;
    const z = normInv(conf); return 1 + (1 - skew * sr + ((kurt - 1) / 4) * sr * sr) * (z / (sr - srBench)) ** 2;
  }
  // Stationary bootstrap (Politis & Romano 1994): geometric block lengths, mean block `blk`.
  function stationaryBootstrap(r, stat, { B = 1000, blk = 8, seed = 7 } = {}) {
    const n = r.length, rnd = mulberry32(seed), out = [];
    for (let b = 0; b < B; b++) {
      const s = new Array(n); let i = Math.floor(rnd() * n);
      for (let t = 0; t < n; t++) { s[t] = r[i]; i = rnd() < 1 / blk ? Math.floor(rnd() * n) : (i + 1) % n; }
      out.push(stat(s));
    }
    out.sort((a, b) => a - b);
    const q = u => out[Math.min(B - 1, Math.max(0, Math.floor(u * B)))];
    return { dist: out, lo: q(0.025), med: q(0.5), hi: q(0.975), mean: mean(out) };
  }

  // ─── Market structure: eigen / PCA / random-matrix denoising ─────────────
  // Cyclic Jacobi eigenvalue algorithm for symmetric matrices. Returns eigenvalues descending + eigenvectors (columns).
  function eigSym(A0) {
    const n = A0.length, A = A0.map(r => r.slice()), V = QL.eye(n);
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2;
      if (off < 1e-22) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const kp = A[k][p], kq = A[k][q]; A[k][p] = c * kp - s * kq; A[k][q] = s * kp + c * kq; }
        for (let k = 0; k < n; k++) { const pk = A[p][k], qk = A[q][k]; A[p][k] = c * pk - s * qk; A[q][k] = s * pk + c * qk; }
        for (let k = 0; k < n; k++) { const kp = V[k][p], kq = V[k][q]; V[k][p] = c * kp - s * kq; V[k][q] = s * kp + c * kq; }
      }
    }
    const o = A.map((_, i) => i).sort((a, b) => A[b][b] - A[a][a]);
    return { values: o.map(i => A[i][i]), vectors: o.map(i => V.map(r => r[i])) }; // vectors[k] = k-th eigenvector
  }
  // PCA of the correlation matrix of an assets × time return matrix.
  function pca(R) {
    const C = QL.corrFromCov(QL.covMatrix(R)), e = eigSym(C), tot = e.values.reduce((s, v) => s + v, 0);
    return { corr: C, values: e.values, vectors: e.vectors, explained: e.values.map(v => v / tot), n: R.length, T: R[0].length };
  }
  // Marchenko-Pastur upper edge λ+ = σ²(1+√q)², q = N/T, for a pure-noise correlation matrix (σ² = 1).
  const mpEdge = (N, T) => (1 + Math.sqrt(N / T)) ** 2;
  // Constant-residual-eigenvalue denoising (Laloux et al. 1999; López de Prado 2020): eigenvalues inside
  // the noise band are replaced by their mean (trace preserved), then the matrix is rescaled to unit diagonal.
  function denoiseCorr(R) {
    const p = pca(R), N = R.length, T = R[0].length, lp = mpEdge(N, T);
    const nSig = p.values.filter(v => v > lp).length, rest = p.values.slice(nSig), fill = rest.length ? mean(rest) : 0;
    const vals = p.values.map((v, i) => (i < nSig ? v : fill)), C = QL.zeros(N, N);
    for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) C[i][j] += vals[k] * p.vectors[k][i] * p.vectors[k][j];
    const d = C.map((r, i) => Math.sqrt(r[i] || 1));
    return { corr: C.map((r, i) => r.map((v, j) => v / (d[i] * d[j]))), raw: p.corr, lambdaPlus: lp, nSignal: nSig, values: p.values, noiseShare: rest.reduce((s, v) => s + v, 0) / N };
  }
  // Absorption ratio (Kritzman, Li, Page & Rigobon 2011): variance share absorbed by the top-k eigenvectors.
  function absorptionRatio(R, k) { const p = pca(R); return p.values.slice(0, k).reduce((s, v) => s + v, 0) / p.values.reduce((s, v) => s + v, 0); }

  // ─── Kalman filter: time-varying alpha & beta ────────────────────────────
  // y_t = α_t + β_t·x_t + ε_t,  [α,β]_t = [α,β]_{t−1} + w_t  (random walk states).
  // delta is the state-drift signal-to-noise ratio: per-step variance of β is delta·Ve/Var(x) (α: 10× smaller),
  // so it is scale-free for returns. Ve is the observation-noise variance (default: OLS residual variance).
  function kalmanBeta(y, x, { delta = 2e-3, Ve = null } = {}) {
    const n = y.length, ok = y.map((v, i) => v != null && x[i] != null);
    const ols = QL.ols(y.filter((_, i) => ok[i]), x.filter((_, i) => ok[i]).map(v => [1, v]));
    let th = [ols.b[0], ols.b[1]], P = [[1e-2, 0], [0, 1e-2]];
    // Observation noise: median residual variance of local 26-point regressions, so slow beta drift
    // doesn't inflate it the way a single full-sample OLS would.
    const yy = y.filter((_, i) => ok[i]), xx = x.filter((_, i) => ok[i]), loc = [];
    for (let a = 0; a + 26 <= yy.length; a += 13) loc.push(QL.ols(yy.slice(a, a + 26), xx.slice(a, a + 26).map(v => [1, v])).s2);
    loc.sort((p, q) => p - q);
    const ve = Ve ?? Math.max(1e-10, loc.length ? loc[Math.floor(loc.length / 2)] : ols.s2), vx = Math.max(1e-12, variance(x.filter((_, i) => ok[i]))), qb = (delta * ve) / vx, qa = 0.1 * delta * ve;
    const alpha = [], beta = [], innov = [], sd = [], z = [];
    for (let t = 0; t < n; t++) {
      P = [[P[0][0] + qa, P[0][1]], [P[1][0], P[1][1] + qb]];
      if (!ok[t]) { alpha.push(th[0]); beta.push(th[1]); innov.push(null); sd.push(null); z.push(null); continue; }
      const h = [1, x[t]], Ph = [P[0][0] * h[0] + P[0][1] * h[1], P[1][0] * h[0] + P[1][1] * h[1]];
      const S = h[0] * Ph[0] + h[1] * Ph[1] + ve, e = y[t] - (th[0] * h[0] + th[1] * h[1]), K = [Ph[0] / S, Ph[1] / S];
      th = [th[0] + K[0] * e, th[1] + K[1] * e];
      P = [[P[0][0] - K[0] * Ph[0], P[0][1] - K[0] * Ph[1]], [P[1][0] - K[1] * Ph[0], P[1][1] - K[1] * Ph[1]]];
      alpha.push(th[0]); beta.push(th[1]); innov.push(e); sd.push(Math.sqrt(S)); z.push(e / Math.sqrt(S));
    }
    return { alpha, beta, innov, sd, z, staticBeta: ols.b[1], staticAlpha: ols.b[0], ve };
  }
  Object.assign(QL, {
    nelderMead, fitGARCH, ljungBox, chi2sf, moments, fitGPD, varES, garchVaR, kupiec, christoffersen, backtestVaR,
    sharpeStats, psr, expectedMaxSR, dsr, minTRL, stationaryBootstrap, eigSym, pca, mpEdge, denoiseCorr, absorptionRatio, kalmanBeta,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = QL;
})(typeof window !== 'undefined' ? window : globalThis);
