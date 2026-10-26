import sys, collections, itertools
exec(open('study_groups.py').read().split("results = collections")[0].replace("fonts = [l.strip() for l in open('fonts_classes.txt') if l.strip()]","fonts=[l.strip() for l in open('fonts_classes.txt') if l.strip()]"))
tot = collections.Counter(); merges = {'right': collections.Counter(), 'left': collections.Counter()}; splits = {'right': collections.Counter(), 'left': collections.Counter()}
for f in fonts:
    fd = FontData(f); kern = fd.kerning()
    cps = sorted(u for u in fd.cmap if (0x41 <= u <= 0x5A or 0x61 <= u <= 0x7A or 0xC0 <= u <= 0x24F) and chr(u).isalpha())
    gid = {}; chars = []
    for u in cps:
        g = fd.cmap[u]
        if g in gid.values(): continue
        gid[chr(u)] = g; chars.append(chr(u))
    rows, cols = collections.defaultdict(list), collections.defaultdict(list)
    for (a, b), v in kern.items():
        if v: rows[a].append((b, v)); cols[b].append((a, v))
    for side, tab in (('right', rows), ('left', cols)):
        sig = {c: tuple(sorted(tab[gid[c]])) for c in chars if tab.get(gid[c])}
        conv = {c: i for i, g in enumerate(conv_groups(chars, side, True, True)) for c in g}
        tot[side + ' glyphs'] += len(chars); tot[side + ' kerned glyphs'] += len(sig)
        tot[side + ' conv groups (all glyphs)'] += len(set(conv.values()))
        tot[side + ' conv groups (kerned only)'] += len(set(conv[c] for c in sig))
        tot[side + ' pro groups'] += len(set(sig.values()))
        # pro merges across different base letters that the convention keeps apart
        bypro = collections.defaultdict(list)
        for c, s in sig.items(): bypro[s].append(c)
        for g in bypro.values():
            bases = sorted(set(base(c) for c in g))
            for a, b in itertools.combinations(bases, 2):
                ca = [c for c in g if base(c) == a][0]; cb = [c for c in g if base(c) == b][0]
                if conv[ca] != conv[cb]: merges[side][a + b] += 1
        # convention merges that the pro keeps apart (same base, different pro group)
        for c in sig:
            b = base(c)
            if b != c and b in sig and sig[b] != sig[c] and conv[b] == conv[c]: splits[side][b] += 1
for side in ('right', 'left'):
    print(side, {k.split(' ', 1)[1]: v for k, v in tot.items() if k.startswith(side)})
    print('  pros merge (letters the convention keeps apart):', ', '.join(f'{k}×{v}' for k, v in merges[side].most_common(25)))
    print('  pros split from base (accented kept apart by pros):', ', '.join(f'{k}×{v}' for k, v in splits[side].most_common(12)))
