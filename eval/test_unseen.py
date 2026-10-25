import json, os, sys, numpy as np
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer.fontio import FontData
fonts = [l.strip() for l in open('fonts_test.txt') if l.strip() and 'Poppins' not in l]
def nm(f): return os.path.basename(f)[:-4].replace('[', '').replace(']', '').replace(',', '')
res = {}
for tag in ('off', 'on'):
    R = []
    for f in fonts:
        fd = FontData(f); k = 1000 / fd.upm; kern = fd.kerning()
        for a, b, fin, *_ in json.load(open(f't/{tag}/lat-{nm(f)}.json'))['pairs']:
            R.append((nm(f), fin, kern.get((a, b), 0) * k))
    res[tag] = R
off, on = res['off'], res['on']
both = [i for i, (f, v, p) in enumerate(off) if abs(p) >= 20 and abs(v) >= 10]
def m(R, idx):
    e = np.array([abs(R[i][1] - R[i][2]) for i in idx]); b = np.array([R[i][1] - R[i][2] for i in idx])
    return f"MAE {e.mean():5.1f}  半px以内 {(e<=28).mean():4.0%}  1px超 {(e>56).mean():4.0%}  偏り {b.mean():+5.1f}"
print(f'未学習の9書体、プロもツールも値を入れているペア n={len(both)}')
print('  学習補正なし', m(off, both)); print('  学習補正あり', m(on, both))
allidx = range(len(off))
print('全ペア'); print('  なし', m(off, allidx)); print('  あり', m(on, allidx))
for f in sorted(set(x[0] for x in off)):
    idx = [i for i in both if off[i][0] == f]
    eo = np.mean([abs(off[i][1] - off[i][2]) for i in idx]); en = np.mean([abs(on[i][1] - on[i][2]) for i in idx])
    print(f'  {f[:22]:22s} n={len(idx):4d}  {eo:5.1f} → {en:5.1f}')
