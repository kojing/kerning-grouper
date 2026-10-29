import sys, glob, json, numpy as np
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer import priority as pr
from sklearn.metrics import roc_auc_score
files = sorted(glob.glob('prio/*.npz')); D = [np.load(f) for f in files]; names = [f.split('/')[-1][:-4] for f in files]
LAB = 10
def grp(p):
    a, b = p[0], p[1]
    c = lambda ch: 'A' if ch.isalpha() else 'D' if ch.isdigit() else 'P'
    return c(a) + c(b)
def prf(pred, y):
    tp = (pred & y).sum(); p = tp / max(1, pred.sum()); r = tp / max(1, y.sum()); return p, r, 2 * p * r / max(1e-9, p + r)
rows = {}
allp, ally, allb, allg, allx0 = [], [], [], [], []
for i in range(len(D)):
    Xtr = np.vstack([d['X'] for j, d in enumerate(D) if j != i]); ytr = np.concatenate([np.abs(d['y']) >= LAB for j, d in enumerate(D) if j != i])
    m = pr.fit(Xtr, ytr); p = m.predict_proba(D[i]['X'])[:, 1]; y = np.abs(D[i]['y']) >= LAB
    x0 = D[i]['X'][:, 0]; base = np.abs(x0) >= 20
    allp.append(p); ally.append(y); allx0.append(x0); allg += [grp(q) for q in D[i]['pairs']]
    auc = roc_auc_score(y, p) if 0 < y.sum() < len(y) else float('nan')
    print(f'{names[i]:28s} kerned {y.mean()*100:5.1f}%  AUC {auc:.3f}  base F1 {prf(base,y)[2]:.3f}  p≥.5 F1 {prf(p>=.5,y)[2]:.3f}', flush=True)
p = np.concatenate(allp); y = np.concatenate(ally); x0 = np.concatenate(allx0); g = np.array(allg)
print('ALL AUC', round(roc_auc_score(y, p), 3))
for name, pred in [('tool |v|>=20', np.abs(x0) >= 20)] + [(f'p>={t}', p >= t) for t in (.3, .4, .5, .6)] + [(f'p>={t} & |v|>=20', (p >= t) & (np.abs(x0) >= 20)) for t in (.3, .5)]:
    P, R, F = prf(pred, y); line = f'{name:18s} kerned {pred.mean()*100:5.1f}% P {P:.3f} R {R:.3f} F1 {F:.3f} |'
    for gg in ['AA', 'AP', 'PA', 'PP', 'AD', 'DA', 'DD', 'DP', 'PD']:
        s = g == gg; line += f' {gg} {prf(pred[s], y[s])[2]:.2f}/{pred[s].mean()*100:.0f}%'
    print(line)
print('pro kerned share by group:', {gg: round(float(y[g == gg].mean() * 100), 1) for gg in ['AA', 'AP', 'PA', 'PP', 'AD', 'DA', 'DD', 'DP', 'PD']})
