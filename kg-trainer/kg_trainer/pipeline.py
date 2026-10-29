"""From a font to per-pair features, the current model's value and the professional value."""
import math
from . import core


def build_items(fd, chars):
    """Glyph records normalized to 1000 UPM for the characters present in the font."""
    k = 1000 / fd.upm
    items, missing, seen = [], [], set()
    for ch in chars:
        if ch.isspace():
            continue
        gid = fd.cmap.get(ord(ch))
        if gid is None:
            missing.append(ch)
            continue
        if gid in seen:
            continue
        seen.add(gid)
        g = fd.glyph(gid)
        items.append(dict(id=gid, name=g['name'], unicodes=g['unicodes'], advance=g['advance'] * k,
                          segments=core.flatten(g['commands'], k, .35), y1=g['y1'] * k, y2=g['y2'] * k))
    return items, missing


def pair_table(fd, items, settings, progress=None):
    """Every ordered pair: features, current-model value and professional value (1000 UPM)."""
    s = {**core.KERN_DEFAULTS, **settings}
    prepared, ys = core.prepare(items, s['minimum'])
    targets, refs, skipped = core.targets_from_references(prepared, s['references'], s['spacing'])
    by_cp = {}
    for it in items:
        for u in it['unicodes']:
            by_cp.setdefault(u, it['id'])
    ref_pairs = {(by_cp.get(ord(r['text'][0])), by_cp.get(ord(r['text'][1]))) for r in refs}
    kern = fd.kerning() if fd is not None else {}
    k = 1000 / fd.upm if fd is not None else 1
    rows = []
    n = len(items)
    for i, ga in enumerate(items):
        a = prepared[ga['id']]
        for gb in items:
            b = prepared[gb['id']]
            f = core.pair_features(a, b, targets)
            digits = core.case_type(a['unicodes']) == 'D' and core.case_type(b['unicodes']) == 'D'
            # kerning.js: letter pairs (other than the reference pairs) do not use the reference band; whether they
            # are kerned is decided by the priority model, their value by the learned value model
            nb = f['kind'] in ('UU', 'UL', 'LU', 'LL') and not s.get('bandLetters') and (a['id'], b['id']) not in ref_pairs
            ours = core.ideal_value(f, {**s, 'keepSpacing': False} if nb else s, digits)
            pro = kern.get((a['id'], b['id']), 0) * k
            rows.append(dict(a=a['id'], b=b['id'], kind=f['kind'], ours=ours, pro=pro, f=f, digits=digits,
                             covered=(a['id'], b['id']) in getattr(fd, 'kern_covered', ()),
                             script=core.script_of(a['unicodes']) + '-' + core.script_of(b['unicodes'])))
        if progress:
            progress((i + 1) / n)
    return rows, dict(targets=targets, references=[r['text'] for r in refs], skipped=skipped)
