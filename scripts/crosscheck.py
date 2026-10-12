"""
Independent re-implementation of the key numbers using numpy/scipy/pandas (NOT the TypeScript code).
Writes tests/fixtures/python_reference.json; tests/crosscheck.test.ts then asserts the TypeScript
engine reproduces every number. Run:  python3 scripts/crosscheck.py
"""
import json, numpy as np, pandas as pd
from scipy.stats import norm
from scipy.optimize import minimize

df = pd.read_csv('src/data/prices.csv', parse_dates=['Date']).set_index('Date')
A = ['SUZLON','RALLIS','DEEPAKNTR','KEI','RADICO','ESCORTS','ASTRAMICRO','FINCABLES','GRANULES','CENTURYPLY']
B = ['TCS','RELIANCE','HDFCBANK','HINDUNILVR','ITC','BHARTIARTL','SUNPHARMA','POWERGRID','NTPC','M&M']
W = {
  'full': ('2008-01-01','2026-03-30'), 'reference': ('2021-03-30','2026-03-30'),
  'crisis': ('2020-02-20','2020-04-30'), 'calm': ('2016-03-01','2016-10-31'),
}
out = {}
for pid, names in (('A', A), ('B', B)):
    w = np.full(len(names), 1/len(names))
    for wid, (s, e) in W.items():
        px = df.loc[s:e, names]
        r = px.pct_change().dropna()
        rp = r.values @ w
        res = {}
        res['n'] = int(len(rp))
        res['mean_daily'] = float(rp.mean())
        res['sd_daily'] = float(rp.std(ddof=1))
        res['sigma_annual'] = float(rp.std(ddof=1)*np.sqrt(252))
        for c in (0.95, 0.99):
            q = np.quantile(rp, 1-c)               # linear interpolation = type 7
            res[f'hist_var_{int(c*100)}'] = float(max(0, -q))
            res[f'hist_es_{int(c*100)}'] = float(max(0, -rp[rp <= q].mean()))
            z = norm.ppf(1-c)
            res[f'param_var_{int(c*100)}'] = float(max(0, -(rp.mean() + z*rp.std(ddof=1))))
        wealth = np.concatenate([[1], np.cumprod(1+rp)])
        res['mdd'] = float(-(wealth/np.maximum.accumulate(wealth)-1).min())
        cov = np.cov(r.values.T, ddof=1)
        res['port_var_wcw'] = float(w @ cov @ w)
        corr = np.corrcoef(r.values.T)
        res['avg_corr'] = float((corr.sum()-len(names))/(len(names)*(len(names)-1)))
        out[f'{pid}/{wid}'] = res

# optimiser cross-check with SLSQP (independent algorithm), reference-period target
for pid, names in (('A', A), ('B', B)):
    w0 = np.full(len(names), 1/len(names))
    for wid in ('reference','crisis','calm'):
        s, e = W[wid]
        r = df.loc[s:e, names].pct_change().dropna()
        mu = r.mean().values*252; cov = np.cov(r.values.T, ddof=1)*252
        sr, er = W['reference']
        rr = df.loc[sr:er, names].pct_change().dropna()
        target = float((rr.values @ w0).mean()*252)
        cons = ({'type':'eq','fun':lambda x: x.sum()-1},{'type':'eq','fun':lambda x: x@mu-target})
        feasible = mu.min() <= target <= mu.max()
        rec = {'target': target, 'feasible': bool(feasible), 'mu_min': float(mu.min()), 'mu_max': float(mu.max())}
        if feasible:
            best = None
            for seed in range(6):
                x0 = np.random.default_rng(seed).dirichlet(np.ones(len(names)))
                res = minimize(lambda x: x@cov@x, x0, jac=lambda x: 2*cov@x, bounds=[(0,1)]*len(names),
                               constraints=cons, method='SLSQP', options={'ftol':1e-14,'maxiter':1000})
                if res.success and abs(res.x@mu-target) < 1e-8 and (best is None or res.fun < best.fun): best = res
            rec['variance'] = float(best.fun) if best is not None else None
        out[f'opt/{pid}/{wid}'] = rec
# capped optimiser (max 25% per stock) and Sharpe at rf = 6.5%
for pid, names in (('A', A), ('B', B)):
    w0 = np.full(len(names), 1/len(names))
    sr, er = W['reference']
    rr = df.loc[sr:er, names].pct_change().dropna()
    target = float((rr.values @ w0).mean()*252)
    for wid in ('reference','calm','crisis'):
        s_, e_ = W[wid]
        r = df.loc[s_:e_, names].pct_change().dropna()
        mu = r.mean().values*252; cov = np.cov(r.values.T, ddof=1)*252
        cons = ({'type':'eq','fun':lambda x: x.sum()-1},{'type':'eq','fun':lambda x: x@mu-target})
        best = None
        for seed in range(8):
            x0 = np.random.default_rng(seed).dirichlet(np.ones(len(names)))
            res = minimize(lambda x: x@cov@x, x0, jac=lambda x: 2*cov@x, bounds=[(0,0.25)]*len(names),
                           constraints=cons, method='SLSQP', options={'ftol':1e-14,'maxiter':1000})
            if res.success and abs(res.x@mu-target) < 1e-8 and (best is None or res.fun < best.fun): best = res
        out[f'optcap/{pid}/{wid}'] = {'target': target, 'variance': float(best.fun) if best is not None else None}
for pid, names in (('A', A), ('B', B)):
    w = np.full(len(names), 1/len(names))
    for wid, (s_, e_) in W.items():
        rp = df.loc[s_:e_, names].pct_change().dropna().values @ w
        out[f'{pid}/{wid}']['sharpe_6p5'] = float((rp.mean()*252 - 0.065)/(rp.std(ddof=1)*np.sqrt(252)))
        r = df.loc[s_:e_, names].pct_change().dropna().values
        cov = np.cov(r.T, ddof=1)
        out[f'{pid}/{wid}']['risk_contrib'] = [float(x) for x in (w*(cov@w))/(w@cov@w)]
json.dump(out, open('tests/fixtures/python_reference.json','w'), indent=1)
print('wrote', len(out), 'records')
for k in ('A/crisis','B/crisis','opt/A/reference','opt/A/crisis','opt/B/crisis'): print(k, out[k])
