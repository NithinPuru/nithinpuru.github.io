"""Reference values from statsmodels for the quant-lib unit tests.

Regenerate:  pip install statsmodels numpy && python quant-terminal/tests/gen_fixtures.py
Writes quant-terminal/tests/fixtures/statsmodels.json (committed).
"""
import json
import os

import numpy as np
import statsmodels
from statsmodels.stats.multitest import multipletests
from statsmodels.tsa.stattools import adfuller, coint

rng = np.random.default_rng(20260927)
cases = []
for k in range(8):
    n = 260
    b = 100 * np.exp(np.cumsum(0.03 * rng.standard_normal(n)))
    if k % 2 == 0:  # cointegrated: AR(1) spread with varying persistence
        phi = [0.5, 0.8, 0.9, 0.95][k // 2]
        s = np.zeros(n)
        for t in range(1, n):
            s[t] = phi * s[t - 1] + 0.02 * rng.standard_normal()
        a = b ** (0.8 + 0.1 * k) * np.exp(s)
    else:  # independent random walk
        a = 50 * np.exp(np.cumsum(0.03 * rng.standard_normal(n)))
    t_c, p_c, _ = coint(np.log(a), np.log(b), trend="c", maxlag=1, autolag=None)
    t_a, p_a = adfuller(np.log(a), maxlag=1, autolag=None, regression="c", result_object=False)[:2]
    cases.append({"a": a.round(8).tolist(), "b": b.round(8).tolist(),
                  "coint_t": float(t_c), "coint_p": float(p_c), "adf_t": float(t_a), "adf_p": float(p_a)})

pvals = [0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212, 0.5]
bh = multipletests(pvals, method="fdr_bh")[1].tolist()

out = os.path.join(os.path.dirname(__file__), "fixtures", "statsmodels.json")
with open(out, "w") as f:
    json.dump({"statsmodels": statsmodels.__version__, "cases": cases, "bh": {"p": pvals, "q": bh}}, f)
print(f"wrote {out} (statsmodels {statsmodels.__version__})")
for c in cases:
    print(f"  coint t={c['coint_t']:.4f} p={c['coint_p']:.4f} | adf t={c['adf_t']:.4f} p={c['adf_p']:.4f}")
