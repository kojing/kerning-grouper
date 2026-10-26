import sys, os, json, subprocess, collections, itertools
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer.fontio import FontData
KG = '/home/claude/kg/kerning-grouper'
fonts = [l.strip() for l in open('fonts_classes.txt') if l.strip()]
os.makedirs('sg2', exist_ok=True)
tag = sys.argv[1] if len(sys.argv) > 1 else 'v1'
modes = [('形のみ（強さ0）', '0', 'shape'), ('お作法＋形（強さ0）', '0', 'conv'), ('お作法＋形（強さ40）', '40', 'conv')]
res = collections.defaultdict(collections.Counter)
for f in fonts:
    name = f.split('/')[-1]; fd = FontData(f); kern = fd.kerning()
    cps = sorted(u for u in fd.cmap if (0x41 <= u <= 0x5A or 0x61 <= u <= 0x7A or 0xC0 <= u <= 0x24F) and chr(u).isalpha())
    json.dump(cps, open('sg2/cps.json', 'w'))
    gid = {}; chars = []
    for u in cps:
        g = fd.cmap[u]
        if g in gid.values(): continue
        gid[chr(u)] = g; chars.append(chr(u))
    inv = {v: k for k, v in gid.items()}
    rows, cols = collections.defaultdict(list), collections.defaultdict(list)
    for (a, b), v in kern.items():
        if v: rows[a].append((b, v)); cols[b].append((a, v))
    k1000 = 1000 / fd.upm
    for label, st, mode in modes:
        out = f'sg2/{tag}-{name}-{st}-{mode}.json'
        if not os.path.exists(out):
            subprocess.run(['node', '.shape_groups.mjs', f, os.path.abspath('sg2/cps.json'), st, os.path.abspath(out), mode], cwd=KG, check=True)
        g = json.load(open(out))
        labs = {}
        for side, tab in (('right', rows), ('left', cols)):
            sig = {c: tuple(sorted(tab[gid[c]])) for c in chars if tab.get(gid[c])}
            lab = {inv[i]: n for n, grp in enumerate(g[side]) for i in grp if i in inv}; labs[side] = lab
            tp = fp = fn = 0
            for a, b in itertools.combinations(sorted(c for c in sig if c in lab), 2):
                p = lab[a] == lab[b]; t = sig[a] == sig[b]; tp += p and t; fp += p and not t; fn += (not p) and t
            r = res[(label, side)]; r['tp'] += tp; r['fp'] += fp; r['fn'] += fn
            r['g'] += len(set(lab[c] for c in sig if c in lab)); r['pro'] += len(set(sig.values())); r['gall'] += len(g[side])
        # value loss: class pairs take the median pro value
        import statistics
        b = collections.defaultdict(list); allp = {}
        for a in chars:
            for c in chars:
                if a in labs['right'] and c in labs['left']:
                    v = kern.get((gid[a], gid[c]), 0) * k1000; allp[(a, c)] = v; b[(labs['right'][a], labs['left'][c])].append(v)
        med = {k: statistics.median(v) for k, v in b.items()}
        r = res[(label, 'value')]
        for (a, c), v in allp.items():
            if abs(v) >= 20: r['kn'] += 1; r['ks'] += abs(v - med[(labs['right'][a], labs['left'][c])])
for label, _, _ in modes:
    line = []
    for side in ('left', 'right'):
        r = res[(label, side)]; pr = r['tp'] / (r['tp'] + r['fp']); rc = r['tp'] / (r['tp'] + r['fn'])
        line.append(f"{side}: 適合 {pr:.1%} 再現 {rc:.1%} F1 {2*pr*rc/(pr+rc):.3f} グループ/プロ {r['g']/r['pro']:.2f} 全字のグループ {r['gall']}")
    v = res[(label, 'value')]
    print(f"{label:16s} | " + ' | '.join(line) + f" | 値のずれ {v['ks']/v['kn']:.1f}")
