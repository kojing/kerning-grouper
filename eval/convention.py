import sys, unicodedata, collections, os
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer.fontio import FontData
fonts = [l.strip() for l in open('fonts_latin.txt') if l.strip()] + [l.strip() for l in open('fonts_test.txt') if l.strip()]
tot = collections.Counter(); same = collections.Counter(); bymark = collections.defaultdict(collections.Counter); fontsw = 0
for f in fonts:
    fd = FontData(f); cls = fd.kern_classes()
    if not cls['first'] and not cls['second']: continue
    fontsw += 1
    side = {}
    for s in ('first', 'second'):
        m = {}
        for i, c in enumerate(cls[s]):
            for g in c: m.setdefault(g, i)
        side[s] = m
    for u, g in fd.cmap.items():
        ch = chr(u); d = unicodedata.normalize('NFD', ch)
        if len(d) < 2 or not d[0].isalpha() or d[0] == ch or not ('LATIN' in unicodedata.name(ch, '')): continue
        bg = fd.cmap.get(ord(d[0]))
        if bg is None: continue
        mark = unicodedata.name(d[1], '?').replace('COMBINING ', '')
        for s in ('first', 'second'):
            if g in side[s] or bg in side[s]:
                tot[s] += 1; ok = side[s].get(g) is not None and side[s].get(g) == side[s].get(bg)
                same[s] += ok; bymark[(s, mark)]['n'] += 1; bymark[(s, mark)]['ok'] += ok
print('fonts with classes', fontsw)
for s in ('first', 'second'): print(f'{s}: accented glyph in the same class as its base letter {same[s]}/{tot[s]} = {same[s]/tot[s]:.0%}')
rows = sorted(((k, v['ok'] / v['n'], v['n']) for k, v in bymark.items() if v['n'] >= 20), key=lambda x: x[1])
print('lowest by mark:'); [print(f'  {k[0]:6s} {k[1]:20s} {r:.0%} (n={n})') for k, r, n in rows[:10]]
print('highest:'); [print(f'  {k[0]:6s} {k[1]:20s} {r:.0%} (n={n})') for k, r, n in rows[-5:]]
