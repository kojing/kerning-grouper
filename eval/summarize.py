import json, os, sys, numpy as np
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer.fontio import FontData
fonts = [l.strip() for l in open('fonts_latin.txt') if l.strip()]
cache = 'pro_cache.json'
if os.path.exists(cache): pro = {tuple(k.split('|')): v for k, v in json.load(open(cache)).items()}
else:
    pro = {}
    for f in fonts:
        fd = FontData(f); k = 1000 / fd.upm; kern = fd.kerning(); fn = os.path.basename(f)[:-4].replace('[', '').replace(']', '').replace(',', '')
        for a in fd.cmap.values(): pass
        pro[fn] = {f'{a}:{b}': v * k for (a, b), v in kern.items()}
    json.dump({k: v for k, v in pro.items()}, open(cache, 'w')) if False else None
def summary(dirname):
    P, T = [], []
    for f in fonts:
        n = os.path.basename(f)[:-4].replace('[', '').replace(']', '').replace(',', '')
        for a, b, fin, *_ in json.load(open(f'{dirname}/lat-{n}.json'))['pairs']:
            P.append(fin); T.append(pro[n].get(f'{a}:{b}', 0))
    P, T = np.array(P, float), np.array(T, float); e = np.abs(P - T); big = np.abs(T) >= 20; zero = np.abs(T) < 5
    return dict(mae=e.mean(), within=(e <= 28).mean(), kernedMae=e[big].mean(), kernedWithin=(e[big] <= 28).mean(), falseKern=(np.abs(P[zero]) >= 20).mean(),
                miss=(np.abs(P[big]) < 10).mean(), kerned=(np.abs(P) >= 5).mean(), bias=(P - T)[big].mean())
for d in sys.argv[1:]:
    r = summary(d)
    print(f"{d:22s} all {r['mae']:5.1f} ({r['within']:4.0%}) | kerned-by-pro {r['kernedMae']:5.1f} ({r['kernedWithin']:4.0%}) bias {r['bias']:+5.1f} miss {r['miss']:4.0%} | false-kern {r['falseKern']:4.0%} | tool kerns {r['kerned']:4.0%}")
