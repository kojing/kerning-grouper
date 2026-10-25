import json, glob, numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
D = [r for p in sorted(glob.glob('ds/*.json')) for r in json.load(open(p))]
K = [r for r in D if abs(r['pro']) >= 20 and abs(r['ours']) >= 10]
KINDS = ['UU', 'UL', 'LU', 'LL']
y = np.array([r['pro'] for r in K]); F = np.array([r['font'] for r in K]); fonts = sorted(set(F))
def base(r): return [r['ours'], r['banded'], r['optical'], r['mechanical'], *r['per'], r['safe'] if r['safe'] is not None else -500, r['fgap'] or 0, r['tgap'], *[1.0 if r['kind'] == k else 0.0 for k in KINDS]]
def gz(r): g = [x - r['tgap'] if x is not None else 400 for x in r['gap']]; return g
def stats(r): g = np.array(gz(r)); return [g.min(), np.sort(g)[:5].mean(), r['xh'] / r['cap']]
def side(r): return [x if x is not None else 400 for x in r['ra']] + [x if x is not None else 400 for x in r['lb']]
sets = {'tool only': lambda r: base(r), 'tool+gaps': lambda r: base(r) + gz(r), 'tool+gaps+stats': lambda r: base(r) + gz(r) + stats(r),
        'tool+gaps+stats+sides': lambda r: base(r) + gz(r) + stats(r) + side(r), 'gaps+stats only': lambda r: [r['ours']] + gz(r) + stats(r) + [1.0 if r['kind'] == k else 0.0 for k in KINDS]}
for name, fn in sets.items():
    X = np.array([fn(r) for r in K]); p = np.zeros(len(y))
    for f in fonts:
        te = F == f; m = HistGradientBoostingRegressor(max_iter=100, learning_rate=.1, max_leaf_nodes=15, l2_regularization=1.0, random_state=0).fit(X[~te], y[~te]); p[te] = m.predict(X[te])
    e = np.abs(p - y); print(f"{name:24s} n_feat {X.shape[1]:3d} MAE {e.mean():.1f} <=28 {(e<=28).mean():.0%} >56 {(e>56).mean():.1%}")
