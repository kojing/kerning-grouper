"""Compare grouping methods against professional fonts (Latin letters incl. accented)."""
import sys, os, json, subprocess, unicodedata, itertools, collections
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer.fontio import FontData
from kg_trainer import core, pipeline
KG = '/home/claude/kg/kerning-grouper'
fonts = [l.strip() for l in open('fonts_classes.txt') if l.strip()]
os.makedirs('sg', exist_ok=True)
NOBASE = {'ø': 'o', 'Ø': 'O', 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ħ': 'h', 'Ħ': 'H', 'ŧ': 't', 'Ŧ': 'T', 'ı': 'i', 'ȷ': 'j', 'ƚ': 'l', 'ɨ': 'i', 'ƀ': 'b', 'Ƀ': 'B', 'ǥ': 'g', 'Ǥ': 'G'}
def base(ch):
    if ch in NOBASE: return NOBASE[ch]
    d = unicodedata.normalize('NFD', ch)
    return d[0] if len(d) > 1 and d[0].isalpha() and d[0].isascii() else ch
def marks(ch): return [unicodedata.name(c, '') for c in unicodedata.normalize('NFD', ch)[1:]]
# side-specific exceptions: the mark sticks out on that side of the letter
def protrudes(ch, side):  # side: 'right' (pair first) / 'left' (pair second)
    m = marks(ch)
    if side == 'right':
        if any('HORN' in x for x in m): return True
        if ch in 'ďľťĽ': return True          # caron drawn as an apostrophe on the right
    return False
# classic base-letter groups (same outline on that side), from type-design practice
L2 = {'left': [set('BDEFHIKLMNPR'), set('CGOQ'), set('bhkl'), set('mnpr'), set('cdeoq')],
      'right': [set('HIMN'), set('DOQ'), set('hmn'), set('bop')]}
def conv_groups(chars, side, level2, exceptions):
    key = {}
    for ch in chars:
        b = base(ch)
        k = b
        if level2:
            for i, s in enumerate(L2[side]):
                if b in s: k = f'L2-{i}'
        if exceptions and protrudes(ch, side): k = 'own-' + ch
        key.setdefault(k, []).append(ch)
    return list(key.values())
def pairs_metrics(pred, truth, universe):
    """pred/truth: dict glyph->group label; pairs among universe."""
    u = sorted(universe); tp = fp = fn = 0
    for a, b in itertools.combinations(u, 2):
        p = pred[a] == pred[b]; t = truth[a] == truth[b]
        tp += p and t; fp += p and not t; fn += (not p) and t
    pr = tp / (tp + fp) if tp + fp else 1.0; rc = tp / (tp + fn) if tp + fn else 1.0
    return pr, rc, (2 * pr * rc / (pr + rc) if pr + rc else 0), tp, fp, fn
results = collections.defaultdict(lambda: collections.Counter()); groupcount = collections.defaultdict(list); valerr = collections.defaultdict(lambda: collections.Counter())
import statistics
for f in fonts:
    name = f.split('/')[-1]
    fd = FontData(f); kern = fd.kerning()
    cps = sorted(u for u in fd.cmap if (0x41 <= u <= 0x5A or 0x61 <= u <= 0x7A or 0xC0 <= u <= 0x24F) and chr(u).isalpha())
    gid = {}; chars = []
    for u in cps:
        g = fd.cmap[u]
        if g in gid.values(): continue
        gid[chr(u)] = g; chars.append(chr(u))
    # truth: behavioural groups (identical non-zero rows / columns over the whole font)
    rows, cols = collections.defaultdict(list), collections.defaultdict(list)
    for (a, b), v in kern.items():
        if v: rows[a].append((b, v)); cols[b].append((a, v))
    truth = {}
    for side, tab in (('right', rows), ('left', cols)):
        sig = {}
        for ch in chars:
            r = tab.get(gid[ch])
            if r: sig[ch] = tuple(sorted(r))
        truth[side] = sig
    # shape groups from the web tool's engine
    json.dump(cps, open('sg/cps.json', 'w'))
    shape = {}
    for st in (0, 40):
        out = f'sg/{name}-{st}.json'
        if not os.path.exists(out):
            subprocess.run(['node', '.shape_groups.mjs', f, os.path.abspath('sg/cps.json'), str(st), os.path.abspath(out)], cwd=KG, check=True)
        g = json.load(open(out)); inv = {v: k for k, v in gid.items()}
        shape[st] = {side: {inv[i]: n for n, grp in enumerate(g[side]) for i in grp if i in inv} for side in ('right', 'left')}
    # python profiles for the hybrid shape check
    items, _ = pipeline.build_items(fd, ''.join(chars))
    ys = core.grouping_grid(items, 6)
    prof = {chr(it['unicodes'][0]) if it['unicodes'] else None: core.profile(it['segments'], it['advance'], ys) for it in items}
    byid = {it['id']: it for it in items}
    def prof_of(ch):
        it = byid.get(gid[ch]); return core.profile(it['segments'], it['advance'], ys) if it else None
    P = {}
    def gp(ch, side, params):
        k = (ch, side, params['strength'])
        if k not in P:
            pr = prof_of(ch); P[k] = core.grouping_profile(pr[1 if side == 'right' else 0], params)
        return P[k]
    def gp_crop(ch, ref, side, params):
        """ch's profile with the heights where ref has no ink removed (ignores marks above/below the base letter)."""
        k = (ch, ref, side, 'crop')
        if k not in P:
            pc, pr = prof_of(ch), prof_of(ref); i = 1 if side == 'right' else 0
            cropped = [v if r is not None else None for v, r in zip(pc[i], pr[i])]
            P[k] = core.grouping_profile(cropped, params)
        return P[k]
    def hybrid(side, scale, crop=True, l2=True, check_bases=True, base_scale=None):
        p0 = {**core.DEFAULTS, 'strength': 0, 'step': 6}
        mk = lambda sc: core.grouping_params({**p0, **{k: core.DEFAULTS[k] * sc for k in ('shape', 'bearing', 'local')}, 'missing': min(1, core.DEFAULTS['missing'] * sc)})
        prm = mk(scale); prmb = mk(base_scale or scale)
        out = []
        for grp in conv_groups(chars, side, l2, True):
            bases = [c for c in grp if base(c) == c]
            lead = bases[0] if bases else grp[0]
            keep, rest = [], []
            for c in grp:
                b = base(c)
                if c == lead: keep.append(c); continue
                if b != c and b in gid:      # accented: compare with its own base, marks ignored
                    ok = core.score(core.compare(gp_crop(c, b, side, p0) if crop else gp(c, side, p0), gp(b, side, p0)), prm) <= 1
                    ok = ok and (b == lead or b in keep or core.score(core.compare(gp(b, side, p0), gp(lead, side, p0)), prm) <= 1)
                elif not check_bases: ok = True
                else:                         # another base letter of a classic group: compare with the lead
                    ok = core.score(core.compare(gp(c, side, p0), gp(lead, side, p0)), prmb) <= 1
                (keep if ok else rest).append(c)
            out.append(keep); out += [[c] for c in rest]
        return out
    methods = {}
    for side in ('right', 'left'):
        lab = lambda groups: {c: i for i, g in enumerate(groups) for c in g}
        methods[('形（強さ0）', side)] = shape[0][side]
        methods[('形（強さ40）', side)] = shape[40][side]
        methods[('お作法：元の字のみ', side)] = lab(conv_groups(chars, side, False, False))
        methods[('お作法：元の字＋左右の例外', side)] = lab(conv_groups(chars, side, False, True))
        methods[('お作法：＋定番の元字グループ', side)] = lab(conv_groups(chars, side, True, True))
        methods[('定番＋アクセントだけ形で確認（×2）', side)] = lab(hybrid(side, 2, check_bases=False))
        for bs in (4, 6, 10):
            methods[(f'いいとこ取り（アクセント×2・元の字×{bs}）', side)] = lab(hybrid(side, 2, base_scale=bs))
    # value reproduction: each class pair takes the median pro value of its member pairs (all Latin pairs)
    k1000 = 1000 / fd.upm
    allp = {(a, b): kern.get((gid[a], gid[b]), 0) * k1000 for a in chars for b in chars}
    mnames = sorted(set(m for m, _ in methods))
    for m in mnames:
        R, L = methods[(m, 'right')], methods[(m, 'left')]
        rl = {c: R.get(c, 'x' + c) for c in chars}; ll = {c: L.get(c, 'x' + c) for c in chars}
        buckets = collections.defaultdict(list)
        for (a, b), v in allp.items(): buckets[(rl[a], ll[b])].append(v)
        med = {k: statistics.median(v) for k, v in buckets.items()}
        e = valerr[m]
        for (a, b), v in allp.items():
            d = abs(v - med[(rl[a], ll[b])]); e['n'] += 1; e['sum'] += d; e['over28'] += d > 28
            if abs(v) >= 20: e['kn'] += 1; e['ksum'] += d
        e['cells'] += (len(set(rl.values())) + 1) * (len(set(ll.values())) + 1)
        e['cellsPro'] += (len(set(truth['right'].values())) + 1) * (len(set(truth['left'].values())) + 1)
    for (m, side), pred in methods.items():
        uni = [c for c in truth[side] if c in pred]
        tl = {}; tlab = {}
        for c in uni: tlab.setdefault(truth[side][c], len(tlab)); tl[c] = tlab[truth[side][c]]
        pr, rc, f1, tp, fp, fn = pairs_metrics(pred, tl, uni)
        r = results[(m, side)]; r['tp'] += tp; r['fp'] += fp; r['fn'] += fn
        groupcount[(m, side)].append(len(set(pred[c] for c in uni)) / max(1, len(set(tl.values()))))
    print(name, 'chars', len(chars), 'truth groups R/L', len(set(truth['right'].values())), len(set(truth['left'].values())), flush=True)
summary = {}
print()
for (m, side), r in sorted(results.items(), key=lambda x: (x[0][1], x[0][0])):
    pr = r['tp'] / (r['tp'] + r['fp']); rc = r['tp'] / (r['tp'] + r['fn']); f1 = 2 * pr * rc / (pr + rc)
    gc = sum(groupcount[(m, side)]) / len(groupcount[(m, side)])
    summary[f'{m}|{side}'] = dict(precision=pr, recall=rc, f1=f1, groupRatio=gc)
    print(f"{side:5s} {m:26s} 適合 {pr:5.1%} 再現 {rc:5.1%} F1 {f1:.3f} グループ数/プロ {gc:.2f}")
print()
for m, e in sorted(valerr.items(), key=lambda x: x[1]['sum'] / x[1]['n']):
    print(f"{m:28s} 値の再現 MAE {e['sum']/e['n']:5.2f}  28超 {e['over28']/e['n']:.2%}  プロが詰めるペアの誤差 {e['ksum']/e['kn']:5.1f}  表の大きさ/プロ {e['cells']/e['cellsPro']:.2f}")
    summary['value|' + m] = dict(mae=e['sum']/e['n'], over28=e['over28']/e['n'], kernedMae=e['ksum']/e['kn'], cellsRatio=e['cells']/e['cellsPro'])
json.dump(summary, open('group_study.json', 'w'), ensure_ascii=False, indent=1)
