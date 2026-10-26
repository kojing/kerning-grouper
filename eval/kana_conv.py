import sys, unicodedata, collections, itertools
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer.fontio import FontData
for f in ['/tmp/gf/ofl/ibmplexsansjp/IBMPlexSansJP-Regular.ttf', '/tmp/gf/ofl/notosansjp/NotoSansJP[wght].ttf']:
    fd = FontData(f); kern = fd.kerning()
    chars = [chr(u) for u in range(0x3041, 0x30FF) if u in fd.cmap]
    gid = {c: fd.cmap[ord(c)] for c in chars}
    rows, cols = collections.defaultdict(list), collections.defaultdict(list)
    for (a, b), v in kern.items():
        if v: rows[a].append((b, v)); cols[b].append((a, v))
    def base(c):
        d = unicodedata.normalize('NFD', c); return d[0] if len(d) > 1 else c
    for side, tab in (('right', rows), ('left', cols)):
        sig = {c: tuple(sorted(tab[gid[c]])) for c in chars if tab.get(gid[c])}
        for label, keyf in (('元の字（濁点を同じに）', lambda c: base(c)), ('元の字＋濁点・半濁点は右側だけ別', lambda c: (c if side == 'right' and base(c) != c else base(c)))):
            tp = fp = fn = 0
            for a, b in itertools.combinations(sorted(sig), 2):
                p = keyf(a) == keyf(b); t = sig[a] == sig[b]
                tp += p and t; fp += p and not t; fn += (not p) and t
            pr = tp / (tp + fp) if tp + fp else float('nan'); rc = tp / (tp + fn) if tp + fn else float('nan')
            # how often a voiced kana shares the group of its base (per side)
            pairs = [(c, base(c)) for c in sig if base(c) != c and base(c) in sig]
            share = sum(sig[c] == sig[b] for c, b in pairs) / len(pairs) if pairs else float('nan')
            print(f"{f.split('/')[-1][:22]:22s} {side:5s} {label:22s} kerned kana {len(sig):3d} 適合 {pr:.0%} 再現 {rc:.0%}  濁音が元の字と同じ {share:.0%} (n={len(pairs)})")
