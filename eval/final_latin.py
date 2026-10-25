import json, os, sys, numpy as np
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer.fontio import FontData
fonts = [l.strip() for l in open('fonts_latin.txt') if l.strip()]
pro, js, jsb = {}, {}, {}
for f in fonts:
    fd = FontData(f); k = 1000 / fd.upm; kern = fd.kerning(); fn = os.path.basename(f)
    n = fn[:-4].replace('[', '').replace(']', '').replace(',', '')
    for tag, store in (('js', js), ('js-o50t20', jsb)):
        for a, b, fin, *_ in json.load(open(f'{tag}/lat-{n}.json'))['pairs']:
            store[(fn, a, b)] = fin
            pro[(fn, a, b)] = kern.get((a, b), 0) * k
keys = sorted(pro)
# other pros: median of the same character pair in the other fonts
chars = {}
for f in fonts:
    fd = FontData(f); fn = os.path.basename(f)
    for (x, a, b) in [kk for kk in keys if kk[0] == fn]:
        chars[(x, a, b)] = chr(fd.unicodes[a][0]) + chr(fd.unicodes[b][0])
bych = {}
for kk in keys: bych.setdefault(chars[kk], {})[kk[0]] = pro[kk]
others = {kk: float(np.median([v for f, v in bych[chars[kk]].items() if f != kk[0]])) for kk in keys}
lofo = {(r['font'], r['a'], r['b']): r['pred'] for r in json.load(open('lofo_pred.json'))}
T = np.array([pro[k] for k in keys])
def rep(name, P):
    P = np.array(P, float); e = np.abs(P - T); big = np.abs(T) >= 20; zero = np.abs(T) < 5
    r = dict(name=name, mae=e.mean(), within=(e <= 28).mean(), kernedMae=e[big].mean(), kernedWithin=(e[big] <= 28).mean(),
             falseKern=(np.abs(P[zero]) >= 20).mean(), miss=(np.abs(P[big]) < 10).mean(), scale=float(np.polyfit(T[big], P[big], 1)[0]))
    print(f"{name:26s} all MAE {r['mae']:5.1f} ({r['within']:4.0%})  | pro-kerned MAE {r['kernedMae']:5.1f} ({r['kernedWithin']:4.0%}) miss {r['miss']:4.0%} slope {r['scale']:.2f} | false-kern on pro-0 {r['falseKern']:4.0%}")
    return r
res = [rep('Web 版 初期設定', [js[k] for k in keys]), rep('Web 版 光学50%+しきい値20', [jsb[k] for k in keys]),
       rep('学習モデル（1つ抜き）', [lofo.get(k, np.nan) for k in keys]), rep('カーニングなし（全0）', [0] * len(keys)),
       rep('他のプロ11書体の中央値', [others[k] for k in keys])]
print('pairs', len(keys), 'pro-kerned', int((np.abs(T) >= 20).sum()), 'pro-zero', int((np.abs(T) < 5).sum()))
json.dump(res, open('final_latin.json', 'w'), default=float, indent=1)
