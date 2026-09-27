/* Quant library — pure functions, no DOM. Loaded by index.html (window.QL) and by
 * the Node unit tests (module.exports). Weekly data throughout: annualize with 52.
 *
 * Contents
 *   Linear algebra ........ matrix ops, Gauss-Jordan inverse, OLS with t-stats
 *   Statistics ............ mean/std/cov, simple-returns helpers, drawdown
 *   Regimes ............... Gaussian hidden Markov model (Baum-Welch + Viterbi)
 *   Cointegration ......... ADF test, Engle-Granger pairs, half-life
 *   Portfolio construction  simplex projection, long-only mean-variance frontier,
 *                           equal-risk-contribution, HRP, Black-Litterman
 *   Portfolio risk ........ component VaR / MCTR, diversification ratio
 *   Factors ............... long-short factor returns, factor regression + attribution
 *   Relative rotation ..... RRG-style RS-Ratio / RS-Momentum
 *   Walk-forward backtest . causal indicators, strategy engine with costs
 */
(function (root) {
  'use strict';
  const W = 52; // weeks per year

  // ─── Linear algebra ──────────────────────────────────────────────────────
  const zeros = (n, m) => Array.from({ length: n }, () => new Array(m).fill(0));
  const eye = n => { const I = zeros(n, n); for (let i = 0; i < n; i++) I[i][i] = 1; return I; };
  const T = A => A[0].map((_, j) => A.map(r => r[j]));
  function mul(A, B) {
    const n = A.length, m = B[0].length, k = B.length, C = zeros(n, m);
    for (let i = 0; i < n; i++) for (let p = 0; p < k; p++) { const a = A[i][p]; if (a) for (let j = 0; j < m; j++) C[i][j] += a * B[p][j]; }
    return C;
  }
  const mv = (A, v) => A.map(r => r.reduce((s, x, j) => s + x * v[j], 0));
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const add = (A, B) => A.map((r, i) => r.map((x, j) => x + B[i][j]));
  const scale = (A, c) => A.map(r => r.map(x => x * c));

  // Gauss-Jordan with partial pivoting; ridge-regularizes near-singular input.
  function inv(A) {
    const n = A.length, M = A.map((r, i) => [...r, ...eye(n)[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) return inv(add(A, scale(eye(n), 1e-8 + 1e-6 * Math.abs(A[c][c] || 1))));
      [M[c], M[p]] = [M[p], M[c]];
      const d = M[c][c];
      for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
    }
    return M.map(r => r.slice(n));
  }

  // OLS y = Xb + e. X rows are observations (include a 1 column for an intercept).
  function ols(y, X) {
    const n = y.length, k = X[0].length;
    const Xt = T(X), XtXi = inv(mul(Xt, X));
    const b = mv(XtXi, mv(Xt, y));
    const fit = X.map(r => dot(r, b)), resid = y.map((v, i) => v - fit[i]);
    const ym = mean(y), sst = y.reduce((s, v) => s + (v - ym) ** 2, 0), sse = resid.reduce((s, v) => s + v * v, 0);
    const s2 = sse / Math.max(1, n - k);
    const se = XtXi.map((r, i) => Math.sqrt(Math.max(0, r[i] * s2)));
    return { b, se, t: b.map((v, i) => (se[i] ? v / se[i] : 0)), resid, r2: sst ? 1 - sse / sst : 0, s2, n, k };
  }

  // ─── Statistics ──────────────────────────────────────────────────────────
  const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const variance = a => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1); };
  const std = a => Math.sqrt(variance(a));
  const rets = p => { const r = []; for (let i = 1; i < p.length; i++) r.push(p[i] / p[i - 1] - 1); return r; };
  function covMatrix(R) { // R: assets × time
    const n = R.length, t = R[0].length, m = R.map(mean), C = zeros(n, n);
    for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
      let s = 0; for (let k = 0; k < t; k++) s += (R[i][k] - m[i]) * (R[j][k] - m[j]);
      C[i][j] = C[j][i] = s / Math.max(1, t - 1);
    }
    return C;
  }
  // Ledoit-Wolf-style shrinkage toward a constant-correlation target; stabilizes
  // optimizers when assets outnumber effective observations.
  function shrinkCov(C, delta = 0.2) {
    const n = C.length, sd = C.map((r, i) => Math.sqrt(r[i]));
    let rs = 0, cnt = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { rs += C[i][j] / (sd[i] * sd[j] || 1); cnt++; }
    const rbar = cnt ? rs / cnt : 0;
    return C.map((r, i) => r.map((v, j) => (1 - delta) * v + delta * (i === j ? v : rbar * sd[i] * sd[j])));
  }
  const corrFromCov = C => C.map((r, i) => r.map((v, j) => v / Math.sqrt(C[i][i] * C[j][j] || 1)));
  function maxDrawdown(equity) { let pk = equity[0], dd = 0; for (const v of equity) { if (v > pk) pk = v; dd = Math.min(dd, v / pk - 1); } return dd; }
  function perfStats(r, rf = 0.045) {
    if (!r.length) return { cagr: 0, vol: 0, sharpe: 0, maxDD: 0, hit: 0, total: 0 };
    let eq = 1; const curve = [1]; for (const x of r) { eq *= 1 + x; curve.push(eq); }
    const yrs = r.length / W, cagr = eq > 0 ? eq ** (1 / yrs) - 1 : -1, vol = std(r) * Math.sqrt(W);
    const dn = Math.sqrt(r.filter(x => x < 0).reduce((s, x) => s + x * x, 0) / r.length) * Math.sqrt(W);
    return { cagr, vol, sharpe: vol ? (mean(r) * W - rf) / vol : 0, sortino: dn ? (mean(r) * W - rf) / dn : 0,
      maxDD: maxDrawdown(curve), hit: r.filter(x => x > 0).length / r.length, total: eq - 1, curve };
  }
  function normInv(p) { // Acklam
    if (p <= 0) return -8; if (p >= 1) return 8;
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const pl = 0.02425; let q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p <= 1 - pl) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  // ─── Regimes: Gaussian HMM ───────────────────────────────────────────────
  // States are returned sorted by volatility (0 = calmest). Scaled forward-backward,
  // variance floor, deterministic quantile initialization (reproducible output).
  function fitHMM(x, K = 2, iters = 150, tol = 1e-7) {
    const n = x.length;
    if (n < K * 10) return null;
    const sorted = [...x].sort((a, b) => a - b), gv = variance(x), floor = gv * 0.01;
    let mu = Array.from({ length: K }, (_, k) => sorted[Math.floor(((k + 0.5) / K) * (n - 1))]);
    let s2 = new Array(K).fill(gv);
    let A = zeros(K, K).map((r, i) => r.map((_, j) => (i === j ? 0.9 : 0.1 / (K - 1))));
    let pi = new Array(K).fill(1 / K), prevLL = -Infinity, gamma, ll = 0;
    const pdf = (v, m, s) => Math.exp(-((v - m) ** 2) / (2 * s)) / Math.sqrt(2 * Math.PI * s) + 1e-300;
    for (let it = 0; it < iters; it++) {
      const B = x.map(v => mu.map((m, k) => pdf(v, m, s2[k])));
      const alpha = zeros(n, K), beta = zeros(n, K), c = new Array(n).fill(0);
      for (let k = 0; k < K; k++) alpha[0][k] = pi[k] * B[0][k];
      c[0] = alpha[0].reduce((s, v) => s + v, 0); alpha[0] = alpha[0].map(v => v / c[0]);
      for (let t = 1; t < n; t++) {
        for (let j = 0; j < K; j++) { let s = 0; for (let i = 0; i < K; i++) s += alpha[t - 1][i] * A[i][j]; alpha[t][j] = s * B[t][j]; }
        c[t] = alpha[t].reduce((s, v) => s + v, 0) || 1e-300; alpha[t] = alpha[t].map(v => v / c[t]);
      }
      beta[n - 1].fill(1);
      for (let t = n - 2; t >= 0; t--) for (let i = 0; i < K; i++) {
        let s = 0; for (let j = 0; j < K; j++) s += A[i][j] * B[t + 1][j] * beta[t + 1][j]; beta[t][i] = s / c[t + 1];
      }
      gamma = alpha.map((r, t) => { const g = r.map((v, k) => v * beta[t][k]); const z = g.reduce((s, v) => s + v, 0) || 1; return g.map(v => v / z); });
      const xi = zeros(K, K);
      for (let t = 0; t < n - 1; t++) {
        let z = 0; const m = zeros(K, K);
        for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) { m[i][j] = alpha[t][i] * A[i][j] * B[t + 1][j] * beta[t + 1][j]; z += m[i][j]; }
        for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) xi[i][j] += m[i][j] / (z || 1);
      }
      pi = gamma[0].slice();
      A = xi.map(r => { const z = r.reduce((s, v) => s + v, 0) || 1; return r.map(v => v / z); });
      for (let k = 0; k < K; k++) {
        const g = gamma.map(r => r[k]), gs = g.reduce((s, v) => s + v, 0) || 1e-12;
        mu[k] = g.reduce((s, v, t) => s + v * x[t], 0) / gs;
        s2[k] = Math.max(floor, g.reduce((s, v, t) => s + v * (x[t] - mu[k]) ** 2, 0) / gs);
      }
      ll = c.reduce((s, v) => s + Math.log(v), 0);
      if (Math.abs(ll - prevLL) < tol * Math.abs(ll)) break;
      prevLL = ll;
    }
    // Viterbi (log space)
    const logA = A.map(r => r.map(v => Math.log(v + 1e-300)));
    const lp = (v, k) => -((v - mu[k]) ** 2) / (2 * s2[k]) - 0.5 * Math.log(2 * Math.PI * s2[k]);
    let delta = mu.map((_, k) => Math.log(pi[k] + 1e-300) + lp(x[0], k)); const psi = [];
    for (let t = 1; t < n; t++) {
      const nd = [], np = [];
      for (let j = 0; j < K; j++) { let best = -Infinity, bi = 0; for (let i = 0; i < K; i++) { const v = delta[i] + logA[i][j]; if (v > best) { best = v; bi = i; } } nd.push(best + lp(x[t], j)); np.push(bi); }
      delta = nd; psi.push(np);
    }
    const path = new Array(n); path[n - 1] = delta.indexOf(Math.max(...delta));
    for (let t = n - 2; t >= 0; t--) path[t] = psi[t][path[t + 1]];
    // Sort states by volatility so state 0 is always the calmest.
    const order = s2.map((v, k) => k).sort((a, b) => s2[a] - s2[b]), rank = []; order.forEach((k, r) => (rank[k] = r));
    return {
      K, ll, mu: order.map(k => mu[k]), sigma: order.map(k => Math.sqrt(s2[k])),
      A: order.map(i => order.map(j => A[i][j])), pi: order.map(k => pi[k]),
      gamma: gamma.map(r => order.map(k => r[k])), path: path.map(k => rank[k]),
      // Expected duration (weeks) of each state = 1 / (1 - p_ii)
      duration: order.map(k => 1 / Math.max(1e-6, 1 - A[k][k])),
    };
  }

  // ─── Cointegration ───────────────────────────────────────────────────────
  // Augmented Dickey-Fuller. trend 'c' = with constant, 'n' = none. Returns the
  // t-stat on y_{t-1}. Matches statsmodels adfuller(maxlag=lags, autolag=None).
  function adf(y, lags = 1, trend = 'c') {
    const dy = []; for (let i = 1; i < y.length; i++) dy.push(y[i] - y[i - 1]);
    const Y = [], X = [];
    for (let t = lags; t < dy.length; t++) {
      const row = trend === 'c' ? [1, y[t]] : [y[t]]; for (let l = 1; l <= lags; l++) row.push(dy[t - l]);
      Y.push(dy[t]); X.push(row);
    }
    if (Y.length < 20) return { t: 0, gamma: 0 };
    const r = ols(Y, X), k = trend === 'c' ? 1 : 0;
    return { t: r.t[k], gamma: r.b[k] };
  }
  // MacKinnon (1994, 2010) approximate p-values for unit-root / Engle-Granger tests,
  // regression with constant; N = number of variables (1 = ADF, 2 = two-series
  // cointegration). Same response-surface coefficients as statsmodels.mackinnonp.
  const MK = {
    max: [2.74, 0.92, 0.55, 0.61, 0.79, 1], min: [-18.83, -18.86, -23.48, -28.07, -25.96, -23.27], star: [-1.61, -2.62, -3.13, -3.47, -3.78, -3.93],
    small: [[2.1659, 1.4412, 0.038269], [2.92, 1.5012, 0.039796], [3.4699, 1.4856, 0.03164], [3.9673, 1.4777, 0.026315], [4.5509, 1.5338, 0.029545], [5.1399, 1.6036, 0.034445]],
    large: [[1.7339, 0.93202, -0.12745, -0.010368], [2.1945, 0.64695, -0.29198, -0.042377], [2.5893, 0.45168, -0.65437, -0.0979], [3.0387, 0.45452, -0.65486, -0.08811], [3.5049, 0.52727, -0.57266, -0.069276], [3.9536, 0.50773, -0.72506, -0.095338]],
  };
  function normCdf(x) { // Abramowitz-Stegun 7.1.26 via erf, |err| < 1.5e-7
    const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z);
    const e = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return x >= 0 ? 0.5 * (1 + e) : 0.5 * (1 - e);
  }
  function mackinnonp(tstat, N = 1) {
    const i = N - 1;
    if (tstat > MK.max[i]) return 1;
    if (tstat < MK.min[i]) return 0;
    const c = tstat <= MK.star[i] ? MK.small[i] : MK.large[i];
    return normCdf(c.reduce((s, v, k) => s + v * tstat ** k, 0));
  }
  // Benjamini-Hochberg: q-values controlling the false discovery rate across m tests.
  function benjaminiHochberg(p) {
    const m = p.length, order = p.map((v, i) => i).sort((a, b) => p[a] - p[b]), q = new Array(m);
    let run = 1;
    for (let k = m - 1; k >= 0; k--) { const i = order[k]; run = Math.min(run, (p[i] * m) / (k + 1)); q[i] = run; }
    return q;
  }
  // Engle-Granger critical values for 2-variable cointegration (MacKinnon 2010, constant).
  const EG_CRIT = { 1: -3.90, 5: -3.34, 10: -3.04 };
  // Engle-Granger two-step (y on x with constant; ADF without constant on the residual,
  // p-value from MacKinnon N=2) — equivalent to statsmodels coint(y, x, maxlag=1, autolag=None).
  function cointegration(pa, pb) {
    const la = pa.map(Math.log), lb = pb.map(Math.log);
    const reg = ols(la, lb.map(v => [1, v]));
    const hedge = reg.b[1], spread = la.map((v, i) => v - hedge * lb[i] - reg.b[0]);
    const test = adf(spread, 1, 'n');
    const hl = halfLife(spread), m = mean(spread), s = std(spread);
    const pval = mackinnonp(test.t, 2);
    let rho = 0; { const ra = rets(pa), rb = rets(pb), ma = mean(ra), mb = mean(rb); let c = 0, va = 0, vb = 0; for (let i = 0; i < ra.length; i++) { c += (ra[i] - ma) * (rb[i] - mb); va += (ra[i] - ma) ** 2; vb += (rb[i] - mb) ** 2; } rho = c / Math.sqrt(va * vb || 1); }
    return { hedge, alpha: reg.b[0], adfT: test.t, pval, halfLife: hl, z: s ? (spread[spread.length - 1] - m) / s : 0, spread, mean: m, sd: s, corr: rho };
  }
  function halfLife(s) {
    const y = [], X = [];
    for (let i = 1; i < s.length; i++) { y.push(s[i] - s[i - 1]); X.push([1, s[i - 1]]); }
    const lam = ols(y, X).b[1];
    return lam < 0 ? -Math.log(2) / Math.log(1 + lam) : Infinity;
  }

  // ─── Portfolio construction ──────────────────────────────────────────────
  // Euclidean projection onto {w >= 0, sum w = 1} (Duchi et al. 2008).
  function projectSimplex(v) {
    const u = [...v].sort((a, b) => b - a); let css = 0, rho = 0, theta = 0;
    for (let i = 0; i < u.length; i++) { css += u[i]; const t = (css - 1) / (i + 1); if (u[i] - t > 0) { rho = i; theta = t; } }
    return v.map(x => Math.max(0, x - theta));
  }
  // Long-only mean-variance: maximize mu'w - (lambda/2) w'Cw on the simplex (projected gradient).
  function meanVariance(mu, C, lambda, iters = 600, w0) {
    const n = mu.length; let w = w0 ? w0.slice() : new Array(n).fill(1 / n);
    const L = lambda * Math.max(...C.map(r => r.reduce((s, x) => s + Math.abs(x), 0))) || 1;
    const step = 1 / L;
    for (let it = 0; it < iters; it++) {
      const Cw = mv(C, w), g = mu.map((m, i) => m - lambda * Cw[i]);
      const nw = projectSimplex(w.map((x, i) => x + step * g[i]));
      let d = 0; for (let i = 0; i < n; i++) d += Math.abs(nw[i] - w[i]); w = nw;
      if (d < 1e-10) break;
    }
    return w;
  }
  function portStats(w, mu, C, rf = 0.045) {
    const r = dot(w, mu), v = Math.sqrt(Math.max(0, dot(w, mv(C, w))));
    return { ret: r, vol: v, sharpe: v ? (r - rf) / v : 0 };
  }
  // Exact long-only efficient frontier by sweeping risk aversion; returns frontier + max-Sharpe + min-var.
  function efficientFrontier(mu, C, rf = 0.045) {
    const pts = []; let w = null;
    const lambdas = [1e4, 3000, 1000, 400, 200, 100, 60, 40, 25, 16, 10, 7, 5, 3.5, 2.5, 1.8, 1.2, 0.8, 0.5, 0.3, 0.15, 0.05];
    for (const lam of lambdas) { w = meanVariance(mu, C, lam, 800, w); pts.push({ lam, w: w.slice(), ...portStats(w, mu, C, rf) }); }
    const minVar = pts.reduce((a, b) => (b.vol < a.vol ? b : a));
    let maxSharpe = pts.reduce((a, b) => (b.sharpe > a.sharpe ? b : a));
    // Refine tangency: golden-section on log(lambda) around the best grid point.
    const idx = pts.indexOf(maxSharpe), lo = Math.log(lambdas[Math.min(idx + 1, lambdas.length - 1)]), hi = Math.log(lambdas[Math.max(idx - 1, 0)]);
    let a = lo, b = hi; const f = x => { const ww = meanVariance(mu, C, Math.exp(x), 800, maxSharpe.w); return { ww, s: portStats(ww, mu, C, rf) }; };
    for (let k = 0; k < 18; k++) { const m1 = a + (b - a) * 0.382, m2 = a + (b - a) * 0.618; if (f(m1).s.sharpe > f(m2).s.sharpe) b = m2; else a = m1; }
    const best = f((a + b) / 2); if (best.s.sharpe > maxSharpe.sharpe) maxSharpe = { w: best.ww, ...best.s };
    return { frontier: pts.sort((x, y) => x.vol - y.vol), maxSharpe, minVar };
  }
  // Equal risk contribution (true risk parity), multiplicative fixed-point iterations.
  function riskParity(C, budget, iters = 1000) {
    const n = C.length, b = budget || new Array(n).fill(1 / n);
    let w = C.map((r, i) => 1 / Math.sqrt(r[i] || 1e-12)); let z = w.reduce((s, x) => s + x, 0); w = w.map(x => x / z);
    for (let it = 0; it < iters; it++) {
      const Cw = mv(C, w), s2 = dot(w, Cw); let maxErr = 0;
      const nw = w.map((x, i) => { const rc = (x * Cw[i]) / s2; maxErr = Math.max(maxErr, Math.abs(rc - b[i])); return x * Math.sqrt(b[i] / Math.max(rc, 1e-12)); });
      z = nw.reduce((s, x) => s + x, 0); w = nw.map(x => x / z);
      if (maxErr < 1e-8) break;
    }
    return w;
  }
  // Hierarchical Risk Parity (Lopez de Prado 2016): single-linkage tree, quasi-diagonalize, recursive bisection.
  function hrp(C) {
    const n = C.length, R = corrFromCov(C);
    const D = R.map(r => r.map(v => Math.sqrt(Math.max(0, 0.5 * (1 - v)))));
    // Distance between distance-vectors (as in the paper), then single linkage.
    const DD = zeros(n, n);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { let s = 0; for (let k = 0; k < n; k++) s += (D[i][k] - D[j][k]) ** 2; DD[i][j] = DD[j][i] = Math.sqrt(s); }
    let clusters = Array.from({ length: n }, (_, i) => ({ items: [i], left: null, right: null }));
    const dist = (a, b) => { let m = Infinity; for (const i of a.items) for (const j of b.items) m = Math.min(m, DD[i][j]); return m; };
    while (clusters.length > 1) {
      let bi = 0, bj = 1, bd = Infinity;
      for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) { const d = dist(clusters[i], clusters[j]); if (d < bd) { bd = d; bi = i; bj = j; } }
      const merged = { items: [...clusters[bi].items, ...clusters[bj].items], left: clusters[bi], right: clusters[bj] };
      clusters = clusters.filter((_, k) => k !== bi && k !== bj); clusters.push(merged);
    }
    const order = []; (function walk(c) { if (!c.left) order.push(c.items[0]); else { walk(c.left); walk(c.right); } })(clusters[0]);
    const clusterVar = idx => { const iv = idx.map(i => 1 / C[i][i]); const z = iv.reduce((s, x) => s + x, 0); const w = iv.map(x => x / z); let v = 0; for (let a = 0; a < idx.length; a++) for (let b = 0; b < idx.length; b++) v += w[a] * w[b] * C[idx[a]][idx[b]]; return v; };
    const w = new Array(n).fill(1); const stack = [order];
    while (stack.length) {
      const items = stack.pop(); if (items.length < 2) continue;
      const h = Math.floor(items.length / 2), L = items.slice(0, h), Rr = items.slice(h);
      const vL = clusterVar(L), vR = clusterVar(Rr), a = 1 - vL / (vL + vR);
      L.forEach(i => (w[i] *= a)); Rr.forEach(i => (w[i] *= 1 - a)); stack.push(L, Rr);
    }
    return { w, order };
  }
  // Black-Litterman posterior expected returns. views: [{ i, q (annual abs. return), conf (0..1) }]
  function blackLitterman(C, wMkt, views, { delta = 2.5, tau = 0.05, rf = 0 } = {}) {
    const n = C.length, pi = mv(C, wMkt).map(v => delta * v + rf);
    if (!views.length) return { pi, mu: pi.slice() };
    const P = views.map(v => { const r = new Array(n).fill(0); r[v.i] = 1; return r; });
    const Q = views.map(v => v.q);
    const tC = scale(C, tau);
    // Idzorek-style confidence: Omega_kk = tau * P_k C P_k' * (1 - c) / c
    const Om = zeros(views.length, views.length);
    views.forEach((v, k) => { const c = Math.min(0.99, Math.max(0.01, v.conf)); Om[k][k] = tau * C[v.i][v.i] * (1 - c) / c; });
    const tCi = inv(tC), Omi = inv(Om), Pt = T(P);
    const Mi = inv(add(tCi, mul(mul(Pt, Omi), P)));
    const rhs = mv(tCi, pi).map((v, i) => v + mv(mul(Pt, Omi), Q)[i]);
    return { pi, mu: mv(Mi, rhs) };
  }

  // ─── Portfolio risk ──────────────────────────────────────────────────────
  // Parametric (Gaussian) risk decomposition; C is the per-period covariance.
  function riskDecomposition(w, C, conf = 0.95) {
    const Cw = mv(C, w), s = Math.sqrt(Math.max(0, dot(w, Cw))), z = -normInv(1 - conf);
    const mctr = Cw.map(v => (s ? v / s : 0)), cctr = w.map((x, i) => x * mctr[i]);
    const indiv = C.map((r, i) => Math.sqrt(r[i]));
    return { sigma: s, VaR: z * s, mctr, cctr, pct: cctr.map(v => (s ? v / s : 0)), compVaR: cctr.map(v => v * z),
      divRatio: s ? dot(w, indiv) / s : 1 };
  }

  // ─── Factors ─────────────────────────────────────────────────────────────
  // Long-short (top minus bottom quantile, equal-weight) factor return series.
  // signal(i, t) uses only information up to t; the return earned is t -> t+1.
  function longShortFactor(R, signal, { q = 1 / 3, minN = 9 } = {}) {
    const n = R.length, len = R[0].length, out = new Array(len).fill(null);
    for (let t = 0; t < len - 1; t++) {
      const s = [];
      for (let i = 0; i < n; i++) { const v = signal(i, t); if (v != null && isFinite(v) && R[i][t + 1] != null) s.push([v, R[i][t + 1]]); }
      if (s.length < minN) continue;
      s.sort((a, b) => b[0] - a[0]); const k = Math.max(1, Math.floor(s.length * q));
      out[t + 1] = mean(s.slice(0, k).map(x => x[1])) - mean(s.slice(-k).map(x => x[1]));
    }
    return out;
  }
  // Regress an asset on factor returns; risk attribution Var = b'Sf b + s_e^2.
  function factorRegression(r, F, names) {
    const idx = []; for (let t = 0; t < r.length; t++) if (r[t] != null && F.every(f => f[t] != null)) idx.push(t);
    if (idx.length < 30) return null;
    const y = idx.map(t => r[t]), X = idx.map(t => [1, ...F.map(f => f[t])]);
    const reg = ols(y, X), beta = reg.b.slice(1), Fm = F.map(f => idx.map(t => f[t]));
    const Sf = covMatrix(Fm), Sb = mv(Sf, beta), sysVar = dot(beta, Sb), resVar = variance(reg.resid), tot = sysVar + resVar;
    return { names, alpha: reg.b[0] * W, alphaT: reg.t[0], beta, t: reg.t.slice(1), r2: reg.r2, n: idx.length,
      contrib: beta.map((b, k) => (tot ? (b * Sb[k]) / tot : 0)), idio: tot ? resVar / tot : 0, idioVol: Math.sqrt(resVar * W) };
  }
  // Cross-sectional z-scores winsorized at ±3.
  function zscores(vals) {
    const v = vals.filter(x => x != null && isFinite(x)), m = mean(v), s = std(v) || 1;
    return vals.map(x => (x == null || !isFinite(x) ? null : Math.max(-3, Math.min(3, (x - m) / s))));
  }

  // Rank-based normal scores: robust to outliers (e.g. +1,190% EPS growth off a low base).
  function rankZ(vals) {
    const idx = vals.map((v, i) => i).filter(i => vals[i] != null && isFinite(vals[i]));
    const n = idx.length, out = vals.map(() => null);
    if (n < 3) return out;
    idx.sort((a, b) => vals[a] - vals[b]);
    let k = 0;
    while (k < n) { // average ranks for ties
      let j = k; while (j + 1 < n && vals[idx[j + 1]] === vals[idx[k]]) j++;
      const r = (k + j) / 2 + 1; for (let m = k; m <= j; m++) out[idx[m]] = normInv((r - 0.5) / n);
      k = j + 1;
    }
    return out;
  }
  // Quality score in the spirit of Asness, Frazzini & Pedersen, "Quality Minus Junk":
  // quality = profitability + growth + safety, each the average rank-z of its inputs,
  // re-standardized. Rows: { roe, roa, grossMargin, opMargin, fcfMargin, revGrowth,
  // epsGrowth, debtToEquity, currentRatio, beta, vol }.
  const QUALITY_PILLARS = {
    profitability: [['roe', 1], ['roa', 1], ['grossMargin', 1], ['opMargin', 1], ['fcfMargin', 1]],
    growth: [['revGrowth', 1], ['epsGrowth', 1]],
    safety: [['debtToEquity', -1], ['currentRatio', 1], ['beta', -1], ['vol', -1]],
  };
  function qualityScores(rows) {
    const comp = {};
    Object.values(QUALITY_PILLARS).flat().forEach(([k, sgn]) => { comp[k] = rankZ(rows.map(r => (r[k] == null ? null : sgn * r[k]))); });
    const pill = {};
    for (const [p, ks] of Object.entries(QUALITY_PILLARS)) {
      const minN = p === 'profitability' ? 2 : 1;
      const raw = rows.map((_, i) => { const v = ks.map(([k]) => comp[k][i]).filter(x => x != null); return v.length >= minN ? mean(v) : null; });
      pill[p] = rankZ(raw);
    }
    const total = Object.values(QUALITY_PILLARS).flat().length;
    const q = rows.map((_, i) => { if (pill.profitability[i] == null) return null; const v = ['profitability', 'growth', 'safety'].map(p => pill[p][i]).filter(x => x != null); return mean(v); });
    const qz = rankZ(q);
    return rows.map((_, i) => ({ profitability: pill.profitability[i], growth: pill.growth[i], safety: pill.safety[i], quality: qz[i],
      coverage: Object.values(QUALITY_PILLARS).flat().filter(([k]) => rows[i][k] != null).length / total }));
  }

  // ─── Relative rotation (RRG-style) ───────────────────────────────────────
  // Open reconstruction of the JdK RS-Ratio / RS-Momentum (the exact formula is
  // proprietary): RS = 100·P/B; RS-Ratio = 100 + rolling z-score of RS; RS-Momentum =
  // 100 + rolling z-score of the rate of change of RS-Ratio (so momentum leads the
  // ratio and trajectories rotate clockwise). Light EMA smoothing tames weekly noise.
  function rrgSeries(prices, bench, { window = 14, smooth = 3 } = {}) {
    const len = Math.min(prices.length, bench.length), p = prices.slice(-len), b = bench.slice(-len);
    const rs = p.map((v, i) => (100 * v) / b[i]);
    const z = (a, i, w) => { const x = a.slice(i - w + 1, i + 1); if (x.length < w || x.some(v => v == null)) return null; const m = mean(x), sd = Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / w); return sd ? (a[i] - m) / sd : 0; };
    const ema = a => { const k = 2 / (smooth + 1); let e = null; return a.map(v => (v == null ? null : (e = e == null ? v : v * k + e * (1 - k)))); };
    const ratio = ema(rs.map((_, i) => { const v = z(rs, i, window); return v == null ? null : 100 + v; }));
    const roc = ratio.map((v, i) => (i && v != null && ratio[i - 1] != null ? 100 * (v / ratio[i - 1] - 1) : null));
    const mom = ema(roc.map((_, i) => { const v = z(roc, i, window); return v == null ? null : 100 + v; }));
    return { ratio, mom };
  }
  function rrg(prices, bench, opts = {}) {
    const tail = opts.tail || 8, { ratio, mom } = rrgSeries(prices, bench, opts), pts = [];
    for (let i = ratio.length - tail; i < ratio.length; i++) if (i >= 0 && ratio[i] != null && mom[i] != null) pts.push({ x: ratio[i], y: mom[i] });
    return pts;
  }
  // Direction of travel (degrees, 0 = east/right, 90 = north) and distance from centre.
  function rrgHeading(pts) {
    if (pts.length < 2) return { heading: null, dist: null };
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    return { heading: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, dist: Math.hypot(b.x - 100, b.y - 100) };
  }

  // ─── Causal indicators for the backtester ───────────────────────────────
  function emaSeries(p, k) { const a = 2 / (k + 1), out = [p[0]]; for (let i = 1; i < p.length; i++) out.push(p[i] * a + out[i - 1] * (1 - a)); return out; }
  function rsiSeries(p, k = 14) { // Wilder smoothing
    const out = new Array(p.length).fill(null); let g = 0, l = 0;
    for (let i = 1; i < p.length; i++) {
      const d = p[i] - p[i - 1], up = Math.max(0, d), dn = Math.max(0, -d);
      if (i <= k) { g += up; l += dn; if (i === k) { g /= k; l /= k; out[i] = l ? 100 - 100 / (1 + g / l) : 100; } }
      else { g = (g * (k - 1) + up) / k; l = (l * (k - 1) + dn) / k; out[i] = l ? 100 - 100 / (1 + g / l) : 100; }
    }
    return out;
  }
  function smaSeries(p, k) { const out = new Array(p.length).fill(null); let s = 0; for (let i = 0; i < p.length; i++) { s += p[i]; if (i >= k) s -= p[i - k]; if (i >= k - 1) out[i] = s / k; } return out; }

  // Position series (0/1) for a single-asset rule; pos[t] is decided at close t, earns r[t+1].
  const STRATEGIES = {
    rsi: { label: 'RSI mean reversion', grid: [[25, 65], [30, 70], [35, 75], [30, 60]],
      describe: g => `buy RSI<${g[0]}, sell RSI>${g[1]}`,
      positions(p, [lo, hi]) { const r = rsiSeries(p, 14), pos = []; let s = 0; for (let t = 0; t < p.length; t++) { if (r[t] != null) { if (s === 0 && r[t] < lo) s = 1; else if (s === 1 && r[t] > hi) s = 0; } pos.push(s); } return pos; } },
    macd: { label: 'MACD crossover', grid: [[12, 26], [8, 21], [5, 35], [19, 39]],
      describe: g => `EMA ${g[0]}/${g[1]}, signal 9`,
      positions(p, [f, s]) { const ef = emaSeries(p, f), es = emaSeries(p, s), m = ef.map((v, i) => v - es[i]); const sig = emaSeries(m, 9); return m.map((v, i) => (i >= s ? (v > sig[i] ? 1 : 0) : 0)); } },
    trend: { label: 'Trend (price > SMA)', grid: [[10], [20], [30], [40]],
      describe: g => `SMA ${g[0]}w`,
      positions(p, [k]) { const m = smaSeries(p, k); return p.map((v, i) => (m[i] != null && v > m[i] ? 1 : 0)); } },
    dualmom: { label: 'Absolute momentum', grid: [[13], [26], [39], [52]],
      describe: g => `${g[0]}w return > 0`,
      positions(p, [k]) { return p.map((v, i) => (i >= k && v > p[i - k] ? 1 : 0)); } },
  };
  // Net returns of a position series with proportional costs (bps per unit turnover).
  function strategyReturns(p, pos, costBps) {
    const out = [], c = costBps / 1e4;
    for (let t = 1; t < p.length; t++) { const r = p[t] / p[t - 1] - 1, prev = pos[t - 2] ?? 0, cur = pos[t - 1]; out.push(cur * r - Math.abs(cur - prev) * c); }
    return out; // out[t-1] = return over t-1 -> t
  }
  // Walk-forward: choose the grid point with best in-sample Sharpe on each training
  // window, apply it out-of-sample to the next test window, roll forward.
  function walkForward(p, strat, { train = 104, test = 26, costBps = 10 } = {}) {
    const S = STRATEGIES[strat]; if (!S || p.length < train + test + 10) return null;
    const allPos = S.grid.map(g => S.positions(p, g)), allRet = allPos.map(pos => strategyReturns(p, pos, costBps));
    const oos = [], chosen = [], posOOS = [];
    for (let start = train; start + 1 < p.length; start += test) {
      const end = Math.min(start + test, p.length - 1);
      let best = 0, bestS = -Infinity;
      allRet.forEach((r, gi) => { const s = perfStats(r.slice(start - train, start)).sharpe; if (s > bestS) { bestS = s; best = gi; } });
      chosen.push({ from: start, to: end, grid: S.grid[best] });
      for (let t = start; t < end; t++) { oos.push(allRet[best][t]); posOOS.push(allPos[best][t]); }
    }
    let turns = 0; for (let i = 1; i < posOOS.length; i++) turns += Math.abs(posOOS[i] - posOOS[i - 1]);
    const bh = rets(p).slice(train, train + oos.length);
    return { oos, bh, start: train, chosen, stats: perfStats(oos), bhStats: perfStats(bh),
      turnover: (turns / Math.max(1, oos.length)) * W, exposure: mean(posOOS) };
  }
  // Cross-sectional momentum rotation across a panel (assets × time closes, nulls allowed).
  function momentumRotation(P, { look = 26, skip = 4, top = 8, every = 4, costBps = 10 } = {}) {
    const n = P.length, len = P[0].length, out = [], c = costBps / 1e4; let w = new Array(n).fill(0), turnSum = 0, rebals = 0;
    for (let t = look + skip; t < len - 1; t++) {
      if ((t - look - skip) % every === 0) {
        const sc = []; for (let i = 0; i < n; i++) { const a = P[i][t - skip], b = P[i][t - skip - look]; if (a != null && b != null && P[i][t + 1] != null) sc.push([i, a / b - 1]); }
        sc.sort((x, y) => y[1] - x[1]); const pick = sc.slice(0, top).map(x => x[0]); const nw = new Array(n).fill(0); pick.forEach(i => (nw[i] = 1 / pick.length));
        const turn = nw.reduce((s, x, i) => s + Math.abs(x - w[i]), 0); turnSum += turn; rebals++; w = nw; out.push(-turn * c);
      } else out.push(0);
      let r = 0; for (let i = 0; i < n; i++) if (w[i] && P[i][t] != null && P[i][t + 1] != null) r += w[i] * (P[i][t + 1] / P[i][t] - 1);
      out[out.length - 1] += r;
      // drift weights with returns
      const g = w.map((x, i) => (x && P[i][t] ? x * (P[i][t + 1] / P[i][t]) : 0)); const z = g.reduce((s, x) => s + x, 0); if (z) w = g.map(x => x / z);
    }
    return { rets: out, start: look + skip, stats: perfStats(out), turnover: rebals ? (turnSum / out.length) * W : 0 };
  }

  // ─── Seeded PRNG (reproducible simulations) ────────────────────────────
  function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const quantile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];

  // ─── Event study (earnings) ─────────────────────────────────────────────
  // Market-model event study on weekly returns. r, m: aligned weekly returns (r[t] =
  // return into week t). events: [{ t0, ...meta }] — t0 = index of the week containing
  // the announcement. Abnormal return AR = r − (α + β·m), with α, β estimated on
  // [t0 − gap − est, t0 − gap). Returns per-event AR/CAR paths over [−pre, +post].
  // Other event weeks (and the week after) are excluded from every estimation window,
  // otherwise earlier earnings jumps inflate the "normal" return and bias pre-event CAR.
  function eventStudy(r, m, events, { pre = 4, post = 8, est = 52, gap = 6, minEst = 26 } = {}) {
    const out = [], excluded = new Set(); events.forEach(e => { excluded.add(e.t0); excluded.add(e.t0 + 1); });
    for (const ev of events) {
      const t0 = ev.t0, lo = t0 - gap - est, hi = t0 - gap;
      if (lo < 1 || t0 + post >= r.length || t0 - pre < 1) continue;
      const idx = []; for (let t = lo; t < hi; t++) if (r[t] != null && m[t] != null && !excluded.has(t)) idx.push(t);
      if (idx.length < minEst) continue;
      const reg = ols(idx.map(t => r[t]), idx.map(t => [1, m[t]]));
      const sigma = Math.sqrt(reg.s2);
      const ar = [];
      let ok = true;
      for (let k = -pre; k <= post; k++) { const t = t0 + k; if (r[t] == null || m[t] == null) { ok = false; break; } ar.push(r[t] - reg.b[0] - reg.b[1] * m[t]); }
      if (!ok) continue;
      let c = 0; const car = ar.map(v => (c += v));
      out.push({ ...ev, alpha: reg.b[0], beta: reg.b[1], sigma, ar, car, ar0: ar[pre] });
    }
    const n = out.length, L = pre + post + 1;
    const meanPath = key => Array.from({ length: L }, (_, k) => mean(out.map(e => e[key][k])));
    const sePath = key => Array.from({ length: L }, (_, k) => (n > 1 ? std(out.map(e => e[key][k])) / Math.sqrt(n) : 0));
    const absAr0 = n ? mean(out.map(e => Math.abs(e.ar0))) : null, sig = n ? mean(out.map(e => e.sigma)) : null;
    return {
      events: out, n, pre, post, meanAR: n ? meanPath('ar') : [], meanCAR: n ? meanPath('car') : [], seCAR: n ? sePath('car') : [],
      absAr0, sigma: sig,
      // Earnings-week move relative to a typical week: E|X| = σ·√(2/π) for a normal week.
      moveMultiple: n && sig ? absAr0 / (sig * Math.sqrt(2 / Math.PI)) : null,
    };
  }
  // Index of the weekly bar (dated Monday) that absorbs an announcement on `day`
  // (YYYY-MM-DD). Friday/weekend releases are priced in the following week.
  function eventWeekIndex(weekDates, day) {
    const d = new Date(day + 'T00:00:00Z'), wd = d.getUTCDay();
    if (wd === 5 || wd === 6 || wd === 0) d.setUTCDate(d.getUTCDate() + ((8 - wd) % 7 || 7));
    const iso = d.toISOString().slice(0, 10);
    let lo = 0, hi = weekDates.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (weekDates[mid] <= iso) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    if (ans < 0) return -1;
    const gapDays = (Date.parse(iso) - Date.parse(weekDates[ans])) / 86400000;
    return gapDays < 7 ? ans : -1;
  }

  // ─── Regime-switching drawdown forecast ─────────────────────────────────
  // Simulates future weekly returns by walking the fitted HMM's transition matrix
  // (starting from the current state probabilities) and bootstrapping historical
  // returns from the matching regime. Captures volatility clustering and fat tails
  // that an i.i.d. Gaussian simulation misses.
  // drift: 'hist' keeps the sample's average return; 'zero' removes it (the usual choice
  // for risk forecasts, so a strong past decade doesn't flatter the outlook).
  function simulateDrawdowns(r, { weeks = 52, paths = 4000, K = 2, seed = 7, regime = true, drift = 'hist' } = {}) {
    let x = r.filter(v => v != null && isFinite(v)); if (x.length < 60) return null;
    if (drift === 'zero') { const m0 = mean(x); x = x.map(v => v - m0); }
    const h = fitHMM(x, K); if (!h) return null;
    const pools = Array.from({ length: K }, (_, k) => x.filter((_, t) => h.path[t] === k));
    if (pools.some(p => p.length < 5)) regime = false;
    const rnd = mulberry32(seed), pick = a => a[Math.floor(rnd() * a.length)];
    const eqQ = Array.from({ length: weeks + 1 }, () => []), mdd = [], term = [];
    const g0 = h.gamma[h.gamma.length - 1];
    for (let p = 0; p < paths; p++) {
      let s = 0; { let u = rnd(), c = 0; for (let k = 0; k < K; k++) { c += g0[k]; if (u <= c) { s = k; break; } s = k; } }
      let eq = 1, pk = 1, dd = 0; eqQ[0].push(1);
      for (let w = 1; w <= weeks; w++) {
        if (regime) { const u = rnd(); let c = 0; for (let k = 0; k < K; k++) { c += h.A[s][k]; if (u <= c) { s = k; break; } } }
        eq *= 1 + (regime ? pick(pools[s]) : pick(x));
        if (eq > pk) pk = eq; dd = Math.min(dd, eq / pk - 1); eqQ[w].push(eq);
      }
      mdd.push(dd); term.push(eq - 1);
    }
    const sd = [...mdd].sort((a, b) => a - b), st = [...term].sort((a, b) => a - b);
    const fan = eqQ.map(v => { v.sort((a, b) => a - b); return { p5: quantile(v, 0.05), p25: quantile(v, 0.25), p50: quantile(v, 0.5), p75: quantile(v, 0.75), p95: quantile(v, 0.95) }; });
    return { hmm: h, fan, maxDD: { p5: quantile(sd, 0.05), p25: quantile(sd, 0.25), p50: quantile(sd, 0.5), p75: quantile(sd, 0.75), mean: mean(mdd) },
      terminal: { p5: quantile(st, 0.05), p50: quantile(st, 0.5), p95: quantile(st, 0.95) },
      prob: t => mdd.filter(v => v <= -t).length / mdd.length, mdd, paths, weeks, regime };
  }

  // ─── Correlation dynamics ────────────────────────────────────────────────
  // Average pairwise correlation among assets, rolling window and EWMA (RiskMetrics).
  function avgCorr(C) { let s = 0, n = 0; for (let i = 0; i < C.length; i++) for (let j = i + 1; j < C.length; j++) { s += C[i][j]; n++; } return n ? s / n : null; }
  function rollingAvgCorr(R, window = 26) {
    const T = R[0].length, out = new Array(T).fill(null);
    for (let t = window; t < T; t++) {
      const cols = R.map(r => r.slice(t - window + 1, t + 1)).filter(r => r.every(v => v != null));
      if (cols.length >= 3) out[t] = avgCorr(corrFromCov(covMatrix(cols)));
    }
    return out;
  }
  function ewmaAvgCorr(R, lambda = 0.94, warm = 26) {
    const n = R.length, T = R[0].length, S = zeros(n, n), out = new Array(T).fill(null);
    for (let t = 1; t < T; t++) {
      if (R.some(r => r[t] == null)) continue;
      for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { const v = lambda * S[i][j] + (1 - lambda) * R[i][t] * R[j][t]; S[i][j] = S[j][i] = v; }
      if (t >= warm) out[t] = avgCorr(corrFromCov(S));
    }
    return out;
  }

  // ─── Performance attribution ────────────────────────────────────────────
  // One-period Brinson-Fachler by group. wp, wb: asset weights; r: asset returns;
  // group: group label per asset. Effects sum exactly to Rp − Rb.
  function brinson(wp, wb, r, group) {
    const G = [...new Set(group)], Rp = dot(wp, r), Rb = dot(wb, r);
    const rows = G.map(g => {
      const ix = group.map((x, i) => (x === g ? i : -1)).filter(i => i >= 0);
      const wpG = ix.reduce((s, i) => s + wp[i], 0), wbG = ix.reduce((s, i) => s + wb[i], 0);
      const rpG = wpG ? ix.reduce((s, i) => s + wp[i] * r[i], 0) / wpG : null, rbG = wbG ? ix.reduce((s, i) => s + wb[i] * r[i], 0) / wbG : null;
      const rb = rbG ?? Rb, rp = rpG ?? rb;
      return { g, wp: wpG, wb: wbG, rp: rpG, rb: rbG, alloc: (wpG - wbG) * (rb - Rb), select: wbG * (rp - rb), inter: (wpG - wbG) * (rp - rb) };
    });
    return { Rp, Rb, rows };
  }
  // Carino (1999) smoothing: link per-period additive effects so they sum to the
  // compounded excess return over the whole horizon.
  function carinoLink(rp, rb, effects) {
    const k = (x, y) => (Math.abs(x - y) < 1e-12 ? 1 / (1 + x) : (Math.log(1 + x) - Math.log(1 + y)) / (x - y));
    const Rp = rp.reduce((e, x) => e * (1 + x), 1) - 1, Rb = rb.reduce((e, x) => e * (1 + x), 1) - 1, K = k(Rp, Rb);
    const K2 = effects[0].map(() => 0);
    effects.forEach((row, t) => { const kt = k(rp[t], rb[t]); row.forEach((v, j) => (K2[j] += (v * kt) / K)); });
    return { Rp, Rb, excess: Rp - Rb, linked: K2 };
  }

  // ─── Volatility targeting ────────────────────────────────────────────────
  // Causal EWMA volatility forecast (annualized): out[t] uses returns up to t.
  function ewmaVolSeries(r, lambda = 0.94, warm = 20) {
    let v = null, n = 0; const out = new Array(r.length).fill(null);
    for (let t = 0; t < r.length; t++) {
      if (r[t] == null) { out[t] = v != null && n >= warm ? Math.sqrt(v * W) : null; continue; }
      v = v == null ? r[t] * r[t] : lambda * v + (1 - lambda) * r[t] * r[t]; n++;
      out[t] = n >= warm ? Math.sqrt(v * W) : null;
    }
    return out;
  }
  // Volatility-managed returns (Moreira & Muir 2017): exposure_t = target / σ̂_{t−1}, capped.
  function volManaged(r, { target = 0.2, lambda = 0.94, maxLev = 1.5 } = {}) {
    const sig = ewmaVolSeries(r, lambda), out = [], lev = [];
    for (let t = 1; t < r.length; t++) {
      if (sig[t - 1] == null || r[t] == null) continue;
      const L = Math.min(maxLev, target / sig[t - 1]); lev.push(L); out.push(L * r[t]);
    }
    return { rets: out, lev, start: r.length - out.length };
  }

  // Spearman rank correlation (average ranks for ties) — the information coefficient.
  function spearman(a, b) {
    const idx = a.map((_, i) => i).filter(i => a[i] != null && b[i] != null && isFinite(a[i]) && isFinite(b[i]));
    if (idx.length < 5) return null;
    const rank = v => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]), r = new Array(v.length); let k = 0; while (k < o.length) { let j = k; while (j + 1 < o.length && o[j + 1][0] === o[k][0]) j++; for (let m = k; m <= j; m++) r[o[m][1]] = (k + j) / 2 + 1; k = j + 1; } return r; };
    const ra = rank(idx.map(i => a[i])), rb = rank(idx.map(i => b[i])), ma = mean(ra), mb = mean(rb);
    let c = 0, va = 0, vb = 0; for (let i = 0; i < ra.length; i++) { c += (ra[i] - ma) * (rb[i] - mb); va += (ra[i] - ma) ** 2; vb += (rb[i] - mb) ** 2; }
    return c / Math.sqrt(va * vb || 1);
  }

  const QL = {
    zeros, eye, T, mul, mv, dot, inv, ols, mean, variance, std, rets, covMatrix, shrinkCov, corrFromCov, maxDrawdown, perfStats, normInv,
    fitHMM, adf, EG_CRIT, mackinnonp, benjaminiHochberg, normCdf, cointegration, halfLife,
    projectSimplex, meanVariance, portStats, efficientFrontier, riskParity, hrp, blackLitterman, riskDecomposition,
    longShortFactor, factorRegression, zscores, rankZ, qualityScores, QUALITY_PILLARS, rrg, rrgSeries, rrgHeading,
    emaSeries, rsiSeries, smaSeries, STRATEGIES, strategyReturns, walkForward, momentumRotation,
    mulberry32, eventStudy, eventWeekIndex, simulateDrawdowns, avgCorr, rollingAvgCorr, ewmaAvgCorr, brinson, carinoLink, ewmaVolSeries, volManaged, spearman,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = QL; else root.QL = QL;
})(typeof window !== 'undefined' ? window : globalThis);
