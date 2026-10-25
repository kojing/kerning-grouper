import json, sys, numpy as np, random
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
import glob
D = [r for p in sorted(glob.glob('ds/*.json')) for r in json.load(open(p))]
KINDS = ['UU', 'UL', 'LU', 'LL']
def tool_feats(r):
    per = r['per']
    return [r['ours'], r['banded'], r['optical'], r['mechanical'], *per, r['safe'] if r['safe'] is not None else -500, r['fgap'] or 0, r['tgap'],
            *[1.0 if r['kind'] == k else 0.0 for k in KINDS]]
def zone_feats(r):
    g = [x - r['tgap'] if x is not None else 400 for x in r['gap']]
    m = [0.0 if x is not None else 1.0 for x in r['gap']]
    ra = [x if x is not None else 400 for x in r['ra']]; lb = [x if x is not None else 400 for x in r['lb']]
    gg = np.array(g)
    return g + m + ra + lb + [gg.min(), np.sort(gg)[:5].mean(), r['xh'] / r['cap'], r['advA'], r['advB']]
fonts = sorted(set(r['font'] for r in D))
K = [r for r in D if abs(r['pro']) >= 20 and abs(r['ours']) >= 10]   # both the pro and the tool kern this pair
y = np.array([r['pro'] for r in K]); F = np.array([r['font'] for r in K])
Xt = np.array([tool_feats(r) for r in K]); Xz = np.hstack([Xt, np.array([zone_feats(r) for r in K])])
ours = np.array([r['ours'] for r in K])
def lofo(make, X):
    pred = np.zeros(len(y))
    for f in fonts:
        te = F == f; tr = ~te
        m = make(); m.fit(X[tr], y[tr]); pred[te] = m.predict(X[te])
    return pred
def rep(name, p):
    e = np.abs(p - y)
    per = [np.abs(p[F == f] - y[F == f]).mean() for f in fonts]
    print(f"{name:42s} MAE {e.mean():5.1f}  <=28 {(e<=28).mean():4.0%}  >56 {(e>56).mean():4.0%}  bias {(p-y).mean():+5.1f}  worst-font {max(per):5.1f}")
    return p
rep('v0.5.1 そのまま', ours)
kd = np.array([r['kind'] for r in K])
const = np.zeros(len(y))
for f in fonts:
    for k in KINDS:
        m = (F == f) & (kd == k); t = (F != f) & (kd == k)
        if m.any(): const[m] = np.median(y[t])
rep('参考：形を見ない定数（種類別の中央値）', const)
cal = lofo(lambda: Ridge(alpha=1.0), np.c_[ours, *[(np.array([r['kind'] for r in K]) == k) * ours for k in KINDS], *[(np.array([r['kind'] for r in K]) == k) * 1.0 for k in KINDS]])
rep('A 倍率・ずれの補正（種類別、線形）', cal)
rr = lofo(lambda: make_pipeline(StandardScaler(), Ridge(alpha=10)), Xt); rep('B リッジ（今の特徴量）', rr)
gb = lofo(lambda: HistGradientBoostingRegressor(max_iter=400, learning_rate=.05, max_leaf_nodes=31, l2_regularization=1.0, random_state=0), Xt); rep('C 勾配ブースティング（今の特徴量）', gb)
rz = lofo(lambda: make_pipeline(StandardScaler(), Ridge(alpha=30)), Xz); rep('D リッジ（＋高さ別の空き）', rz)
gz = lofo(lambda: HistGradientBoostingRegressor(max_iter=600, learning_rate=.05, max_leaf_nodes=31, l2_regularization=1.0, random_state=0), Xz); best = rep('E 勾配ブースティング（＋高さ別の空き）', gz)
# per-font style from a few hand-set pairs of the held-out font (affine correction a*pred+b fitted on n pairs)
for n in (5, 10, 30):
    errs = []
    for seed in range(20):
        rnd = random.Random(seed); p = gz.copy()
        for f in fonts:
            idx = np.where(F == f)[0]; pick = rnd.sample(list(idx), min(n, len(idx)))
            A = np.c_[gz[pick], np.ones(len(pick))]
            coef = np.linalg.lstsq(A.T @ A + np.diag([5.0, 0.0]) * 0 + np.eye(2) * 1e-6, A.T @ y[pick], rcond=None)[0] if n >= 10 else np.array([1.0, np.mean(y[pick] - gz[pick])])
            rest = np.setdiff1d(idx, pick); p[rest] = np.c_[gz[rest], np.ones(len(rest))] @ coef
            errs.append(np.abs(p[rest] - y[rest]))
        pass
    e = np.concatenate(errs); print(f"{'F E＋手本 '+str(n)+' ペアで書体の詰め具合を合わせる':42s} MAE {e.mean():5.1f}  <=28 {(e<=28).mean():4.0%}  >56 {(e>56).mean():4.0%}")
# pro-to-pro reference on the same pairs
pairs = {}
for r in D: pairs.setdefault(r['a'] + r['b'], {})[r['font']] = r['pro']
oth = np.array([np.median([v for f2, v in pairs[r['a'] + r['b']].items() if f2 != r['font']]) for r in K])
rep('参考：他のプロ11書体の中央値', oth)
json.dump(dict(pairs=[(r['font'], r['a'] + r['b']) for r in K], y=y.tolist(), ours=ours.tolist(), gz=gz.tolist()), open('kerned_preds.json', 'w'))
