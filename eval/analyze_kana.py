import sys, json, numpy as np
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer.fontio import FontData
F = {'NotoSansJPwght': '/tmp/gf/ofl/notosansjp/NotoSansJP[wght].ttf', 'IBMPlexSansJP-Regular': '/tmp/gf/ofl/ibmplexsansjp/IBMPlexSansJP-Regular.ttf'}
def m(P, T):
    P, T = np.array(P, float), np.array(T, float); e = np.abs(P - T)
    big = np.abs(T) >= 20
    return f"MAE {e.mean():5.1f} <=28 {(e<=28).mean():4.0%} >56 {(e>56).mean():4.0%} bias {(P-T).mean():+6.1f} r {np.corrcoef(P,T)[0,1] if P.std() and T.std() else float('nan'):.2f} | pro-kerned(|v|>=20) n={big.sum()} MAE {e[big].mean() if big.any() else float('nan'):5.1f}"
out = {}
for n, path in F.items():
    fd = FontData(path); k = 1000 / fd.upm; kern = fd.kerning(); palt = fd.palt()
    def sp(a, b):  # spacing change between a and b from palt
        pa = palt.get(a, (0, 0)); pb = palt.get(b, (0, 0))
        return ((pa[1] - pa[0]) + pb[0]) * k
    off = json.load(open(f'js-kana/off-{n}.json')); ts = json.load(open(f'js-kana/tsume-{n}.json'))
    tsmap = {(a, b): v for a, b, v, *_ in ts['pairs']}
    K = [kern.get((a, b), 0) * k for a, b, *_ in off['pairs']]
    PK = [sp(a, b) + kern.get((a, b), 0) * k for a, b, *_ in off['pairs']]
    O = [v for a, b, v, *_ in off['pairs']]; Tz = [tsmap[(a, b)] for a, b, *_ in off['pairs']]
    print(f"{n}: palt glyphs {len(palt)}, kana kern nonzero {sum(1 for x in K if x)} / {len(K)}, groups {off['groups']}")
    print('  kern only     vs tool(tsume off):', m(O, K))
    print('  kern only     vs zero           :', m([0]*len(K), K))
    print('  palt+kern     vs tool(tsume on) :', m(Tz, PK))
    print('  palt+kern     vs tool(tsume off):', m(O, PK))
    print('  palt+kern     vs palt only      :', m([sp(a, b) for a, b, *_ in off['pairs']], PK))
    print('  mean palt+kern', round(np.mean(PK), 1), ' mean tool tsume', round(np.mean(Tz), 1), ' mean tool off', round(np.mean(O), 1))
    # a few pairs
    cm = {fd.cmap[ord(c)]: c for c in 'あいうくしのへりトリニロカつっ'}
    sel = [(a, b) for a, b, *_ in off['pairs'] if a in cm and b in cm][:0]
    for s in ['くの', 'のく', 'いう', 'トリ', 'ニロ', 'しあ', 'つっ', 'りく', 'ロロ', 'のの']:
        a, b = fd.cmap[ord(s[0])], fd.cmap[ord(s[1])]
        i = next(i for i, p in enumerate(off['pairs']) if p[0] == a and p[1] == b)
        print(f"    {s}: pro palt+kern {PK[i]:+5.0f} (kern {K[i]:+4.0f}) | tool tsume {Tz[i]:+5.0f} | tool off {O[i]:+5.0f}")
