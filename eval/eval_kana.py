import sys, os, json, subprocess, collections, itertools
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer.fontio import FontData
KG = '/home/claude/kg/kerning-grouper'
for f in ['/tmp/gf/ofl/ibmplexsansjp/IBMPlexSansJP-Regular.ttf', '/tmp/gf/ofl/notosansjp/NotoSansJP[wght].ttf']:
    fd = FontData(f); kern = fd.kerning(); name = f.split('/')[-1]
    cps = [u for u in range(0x3041, 0x30FF) if u in fd.cmap]; json.dump(cps, open('sg2/kcps.json', 'w'))
    gid = {chr(u): fd.cmap[u] for u in cps}; inv = {v: k for k, v in gid.items()}
    rows, cols = collections.defaultdict(list), collections.defaultdict(list)
    for (a, b), v in kern.items():
        if v: rows[a].append((b, v)); cols[b].append((a, v))
    for mode in ('shape', 'conv'):
        out = f'sg2/kana-{name}-{mode}.json'
        subprocess.run(['node', '.shape_groups.mjs', f, os.path.abspath('sg2/kcps.json'), '0', os.path.abspath(out), mode], cwd=KG, check=True)
        g = json.load(open(out)); line = []
        for side, tab in (('left', cols), ('right', rows)):
            sig = {c: tuple(sorted(tab[gid[c]])) for c in gid if tab.get(gid[c])}
            lab = {inv[i]: n for n, grp in enumerate(g[side]) for i in grp if i in inv}
            tp = fp = fn = 0
            for a, b in itertools.combinations(sorted(c for c in sig if c in lab), 2):
                p = lab[a] == lab[b]; t = sig[a] == sig[b]; tp += p and t; fp += p and not t; fn += (not p) and t
            pr = tp / (tp + fp) if tp + fp else float('nan'); rc = tp / (tp + fn) if tp + fn else float('nan')
            line.append(f"{side}: 適合 {pr:.0%} 再現 {rc:.0%} グループ {len(g[side])}")
        print(f"{name[:22]:22s} {mode:5s} " + ' | '.join(line))
