import sys, collections, itertools, unicodedata
src = open('study_groups.py').read().split("results = collections")[0]
exec(src)
# v2 rules: side-specific bases for ligatures / letters without decomposition, more classic groups, narrow-letter accents
SIDE = {'Æ': ('A', 'E'), 'Œ': ('O', 'E'), 'æ': ('a', 'e'), 'œ': ('o', 'e'), 'Ð': ('D', 'D'), 'ð': ('ð', 'ð'), 'Þ': ('I', 'Þ'), 'þ': ('b', 'p'),
        'ŋ': ('n', 'n'), 'Ŋ': ('N', 'Ŋ'), 'Ŀ': ('L', 'Ŀ'), 'ŀ': ('l', 'ŀ'), 'Ə': ('O', 'O'), 'ə': ('ə', 'e'), 'ĸ': ('k', 'k'), 'Ø': ('O', 'O'), 'ø': ('o', 'o'),
        'Ł': ('Ł', 'L'), 'ł': ('ł', 'l'), 'Đ': ('Đ', 'D'), 'đ': ('d', 'đ'), 'Ħ': ('Ħ', 'Ħ'), 'ħ': ('ħ', 'h'), 'ı': ('i', 'i'), 'ȷ': ('j', 'j')}
def base2(ch, side):
    i = 0 if side == 'left' else 1
    if ch in SIDE: return SIDE[ch][i]
    d = unicodedata.normalize('NFD', ch)
    if len(d) > 1 and d[0] != ch:
        return base2(d[0], side) if not d[0].isascii() else d[0]
    return ch
NARROW = set('iIlj')
def protrudes2(ch, side):
    if protrudes(ch, side): return True
    d = unicodedata.normalize('NFD', ch)
    return len(d) > 1 and d[0] in NARROW and any(unicodedata.combining(c) and unicodedata.name(c, '').split()[-1] not in ('BELOW', 'OGONEK', 'CEDILLA') for c in d[1:])
L2b = {'left': L2['left'] + [set('vwy'), set('VW')], 'right': L2['right'] + [set('vwy'), set('VW')]}
def conv2(chars, side, narrow=True, extra=True, sidemap=True):
    key = {}
    for ch in chars:
        b = base2(ch, side) if sidemap else base(ch)
        k = b
        for n, s in enumerate((L2b if extra else L2)[side]):
            if b in s: k = f'L2-{n}'
        if (protrudes2 if narrow else protrudes)(ch, side): k = 'own-' + ch
        key.setdefault(k, []).append(ch)
    return list(key.values())
res = collections.defaultdict(collections.Counter)
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
        variants = {'v1 お作法（今の表）': conv_groups(chars, side, True, True),
                    '＋左右別の元の字（合字・特殊字）': conv2(chars, side, narrow=False, extra=False),
                    '＋狭い字のアクセントは別': conv2(chars, side, narrow=True, extra=False),
                    '＋定番に v w y': conv2(chars, side)}
        for name, groups in variants.items():
            lab = {c: i for i, g in enumerate(groups) for c in g}
            tp = fp = fn = 0
            for a, b in itertools.combinations(sorted(sig), 2):
                p = lab[a] == lab[b]; t = sig[a] == sig[b]; tp += p and t; fp += p and not t; fn += (not p) and t
            r = res[(side, name)]; r['tp'] += tp; r['fp'] += fp; r['fn'] += fn
            r['g'] += len(set(lab[c] for c in sig)); r['pro'] += len(set(sig.values()))
for (side, name), r in res.items():
    pr = r['tp'] / (r['tp'] + r['fp']); rc = r['tp'] / (r['tp'] + r['fn'])
    print(f"{side:5s} {name:22s} 適合 {pr:.1%} 再現 {rc:.1%} F1 {2*pr*rc/(pr+rc):.3f}  グループ数/プロ（カーニングする字だけ） {r['g']/r['pro']:.2f}")
