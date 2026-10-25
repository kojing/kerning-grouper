import sys, json, glob, os, statistics as st
import numpy as np
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer.fontio import FontData
from kg_trainer import core
TOL, BIG = 28, 56
def case(u):
    c = chr(u[0]); return 'U' if c.isupper() else 'L'
fonts = [l.strip() for l in open('fonts_latin.txt') if l.strip()]
data = {}
for f in fonts:
    n = os.path.basename(f)[:-4].replace('[', '').replace(']', '').replace(',', '')
    j = json.load(open(f'js/lat-{n}.json'))
    fd = FontData(f); k = 1000 / fd.upm; kern = fd.kerning()
    uni = {g: fd.unicodes.get(g) for g in set(p[0] for p in j['pairs'])}
    rows = []
    for a, b, final, single, ideal in j['pairs']:
        pro = kern.get((a, b), 0) * k
        ch = chr(uni[a][0]) + chr(fd.unicodes[b][0])
        rows.append(dict(pair=ch, kind=case(uni[a]) + case(fd.unicodes[b]), pro=pro, final=final, single=single))
    data[fd.family or n] = dict(rows=rows, groups=j['groups'], classPairs=j['classPairs'], exc=j['exceptions'])
def m(pred, truth):
    p, t = np.array(pred, float), np.array(truth, float); e = np.abs(p - t)
    return dict(mae=e.mean(), within=(e <= TOL).mean(), over=int((e > BIG).sum()), bias=(p - t).mean(),
                r=float(np.corrcoef(p, t)[0, 1]) if p.std() and t.std() else float('nan'))
def detect(pred, truth, th=20):
    tp = sum(1 for p, t in zip(pred, truth) if abs(t) >= th and abs(p) >= th and (p > 0) == (t > 0))
    pp = sum(1 for p in pred if abs(p) >= th); tt = sum(1 for t in truth if abs(t) >= th)
    return tp / pp if pp else 0, tp / tt if tt else 0
# pairs present in every font for the cross-pro ceiling
names = list(data)
pairs = [r['pair'] for r in data[names[0]]['rows']]
pro_tab = {n: {r['pair']: r['pro'] for r in data[n]['rows']} for n in names}
out = []
print(f"{'font':28s} {'groups':>7s} | {'MAE':>5s} {'<=28':>5s} {'>56':>4s} {'bias':>6s} {'r':>5s} | per-glyph MAE | zero MAE | other-pros MAE | prec/rec |kern|>=20")
allf, alls, allt, allz, allo = [], [], [], [], []
for n in names:
    R = data[n]['rows']; t = [r['pro'] for r in R]
    fin = m([r['final'] for r in R], t); sg = m([r['single'] for r in R], t); z = m([0] * len(R), t)
    others = [np.median([pro_tab[o][r['pair']] for o in names if o != n]) for r in R]
    op = m(others, t)
    pr, rc = detect([r['final'] for r in R], t)
    g = data[n]['groups']
    print(f"{n[:28]:28s} {g['right']:3d}x{g['left']:<3d} | {fin['mae']:5.1f} {fin['within']:5.0%} {fin['over']:4d} {fin['bias']:+6.1f} {fin['r']:5.2f} | {sg['mae']:6.1f}        | {z['mae']:6.1f}   | {op['mae']:6.1f}         | {pr:.0%}/{rc:.0%}")
    allf += [r['final'] for r in R]; alls += [r['single'] for r in R]; allt += t; allz += [0]*len(R); allo += others
    out.append(dict(font=n, groups=g, final=fin, single=sg, zero=z, others=op, precision=pr, recall=rc))
A = m(allf, allt); S = m(alls, allt); Z = m(allz, allt); O = m(allo, allt); pr, rc = detect(allf, allt)
print(f"{'ALL':28s} {'':7s} | {A['mae']:5.1f} {A['within']:5.0%} {A['over']:4d} {A['bias']:+6.1f} {A['r']:5.2f} | {S['mae']:6.1f}        | {Z['mae']:6.1f}   | {O['mae']:6.1f}         | {pr:.0%}/{rc:.0%}")
# by kind
print('\nby kind (all fonts): final MAE / within / bias | zero MAE | other-pros MAE')
kinds = {}
for n in names:
    for r, o in zip(data[n]['rows'], [np.median([pro_tab[x][r['pair']] for x in names if x != n]) for r in data[n]['rows']]):
        kinds.setdefault(r['kind'], []).append((r['final'], r['pro'], o))
bykind = {}
for kd, v in sorted(kinds.items()):
    f = m([x[0] for x in v], [x[1] for x in v]); o = m([x[2] for x in v], [x[1] for x in v]); z = m([0]*len(v), [x[1] for x in v])
    bykind[kd] = dict(final=f, others=o, zero=z)
    print(f"  {kd}: {f['mae']:5.1f} {f['within']:5.0%} {f['bias']:+6.1f} | {z['mae']:5.1f} | {o['mae']:5.1f}")
# worst pairs (consistent across fonts)
agg = {}
for n in names:
    for r in data[n]['rows']:
        agg.setdefault(r['pair'], []).append(r['final'] - r['pro'])
worst = sorted(agg.items(), key=lambda kv: -abs(np.mean(kv[1])))[:25]
print('\nmost consistent errors (mean final-pro across fonts):')
print('  ' + '  '.join(f"{p}:{np.mean(v):+.0f}" for p, v in worst))
json.dump(dict(fonts=out, all=dict(final=A, single=S, zero=Z, others=O, precision=pr, recall=rc), byKind=bykind,
               worst=[(p, float(np.mean(v))) for p, v in worst]), open('latin_result.json', 'w'), default=float, indent=1)
