"""Shared core, ported line by line from Kerning Grouper (src/core.js, src/kerning.js).

Geometry is normalized to 1000 UPM, y up. Every function here must give the same numbers as
the JavaScript version: tests/test_parity.py checks that against the JS code on the bundled font.
Bump CORE_VERSION whenever a change alters any computed value; model packages record it.
"""
import math

CORE_VERSION = "0.5.1"
FEATURE_VERSION = 2
DEFAULTS = dict(shape=8, bearing=8, local=24, missing=0.06, step=6, strength=0)
MAX_STRENGTH = 200
SCALES = [dict(x=24, y=18, w=.2), dict(x=60, y=45, w=.5), dict(x=120, y=90, w=.3)]
KERN_DEFAULTS = dict(optical=60, spacing=0, minimum=18, threshold=20, tolerance=18, limit=100,
                     references='HH HO OO nn no oo Hn Ho On Oo', protectDigits=True, keepSpacing=True)
JAPANESE_REFERENCES = 'のの ねね カカ ロロ のカ カの のロ ロの'


def flatten(commands, scale=1.0, tolerance=0.35):
    """commands: list of tuples ('M',x,y) ('L',x,y) ('C',x1,y1,x2,y2,x,y) ('Q',x1,y1,x,y) ('Z',)."""
    out = []
    p = start = None

    def line(a, b):
        if a is not None and (a[0] != b[0] or a[1] != b[1]):
            out.append((a[0], a[1], b[0], b[1]))

    def mid(a, b):
        return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)

    def distance(q, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        h = math.hypot(dx, dy)
        return abs(dy * q[0] - dx * q[1] + b[0] * a[1] - b[1] * a[0]) / h if h else math.hypot(q[0] - a[0], q[1] - a[1])

    def cubic(a, b, c, d, n=0):
        chord = math.hypot(d[0] - a[0], d[1] - a[1])
        poly = math.hypot(b[0] - a[0], b[1] - a[1]) + math.hypot(c[0] - b[0], c[1] - b[1]) + math.hypot(d[0] - c[0], d[1] - c[1])
        if n >= 18 or (max(distance(b, a, d), distance(c, a, d)) <= tolerance and poly - chord <= tolerance * 2):
            line(a, d)
            return
        ab, bc, cd = mid(a, b), mid(b, c), mid(c, d)
        abc, bcd = mid(ab, bc), mid(bc, cd)
        m = mid(abc, bcd)
        cubic(a, ab, abc, m, n + 1)
        cubic(m, bcd, cd, d, n + 1)

    for c in commands:
        t = c[0]
        if t == 'M':
            if p is not None and start is not None:
                line(p, start)
            p = (c[1] * scale, c[2] * scale)
            start = p
        elif t == 'L':
            q = (c[1] * scale, c[2] * scale)
            line(p, q)
            p = q
        elif t == 'C':
            q = (c[5] * scale, c[6] * scale)
            cubic(p, (c[1] * scale, c[2] * scale), (c[3] * scale, c[4] * scale), q)
            p = q
        elif t == 'Q':
            q = (c[3] * scale, c[4] * scale)
            v = (c[1] * scale, c[2] * scale)
            cubic(p, (p[0] + 2 * (v[0] - p[0]) / 3, p[1] + 2 * (v[1] - p[1]) / 3),
                  (q[0] + 2 * (v[0] - q[0]) / 3, q[1] + 2 * (v[1] - q[1]) / 3), q)
            p = q
        elif t == 'Z':
            line(p, start)
            p = start
    if p is not None and start is not None:
        line(p, start)
    return out


def scanline(segments, y):
    hits = []
    for x1, y1, x2, y2 in segments:
        if (y1 <= y < y2) or (y2 <= y < y1):
            hits.append((x1 + (y - y1) * (x2 - x1) / (y2 - y1), 1 if y2 > y1 else -1))
    hits.sort(key=lambda h: h[0])
    winding = 0
    left = right = None
    i = 0
    while i < len(hits):
        x = hits[i][0]
        delta = 0
        while i < len(hits) and abs(hits[i][0] - x) < 1e-7:
            delta += hits[i][1]
            i += 1
        before = winding
        winding += delta
        if before == 0 and winding != 0 and left is None:
            left = x
        if before != 0 and winding == 0:
            right = x
    return (left, right) if left is not None and right is not None and right > left else None


def profile(segments, advance, ys):
    left, right = [], []
    for y in ys:
        span = scanline(segments, y)
        left.append(span[0] if span else None)
        right.append(advance - span[1] if span else None)
    return left, right


# ---- grouping metrics (core.js compare / groupingParams / groupingProfile / score) ----
def compare(a, b):
    delta = []
    union = miss = 0
    for x, y in zip(a, b):
        aa, bb = x is not None, y is not None
        if not aa and not bb:
            continue
        union += 1
        if aa != bb:
            miss += 1
        else:
            delta.append(x - y)
    if len(delta) < 3:
        return dict(shape=math.inf, bearing=math.inf, local=math.inf, missing=1, shared=len(delta))
    s = sorted(delta)
    offset = s[len(s) // 2]
    return dict(shape=math.sqrt(sum((d - offset) ** 2 for d in delta) / len(delta)), bearing=abs(offset),
                local=max(abs(d) for d in delta), missing=miss / union, shared=len(delta))


def grouping_params(p):
    t = max(0, min(MAX_STRENGTH, p.get('strength', 0) or 0)) / 100
    return {**p, 'shape': p['shape'] + 72 * t, 'bearing': p['bearing'] + 48 * t, 'local': p['local'] + 216 * t,
            'missing': min(1, p['missing'] + .34 * t)}


def grouping_profile(edge, p):
    sigma = 48 * max(0, min(MAX_STRENGTH, p.get('strength', 0) or 0)) / 100
    if not sigma:
        return edge
    radius = math.ceil(3 * sigma / p['step'])
    out = []
    n = len(edge)
    for i, v in enumerate(edge):
        if v is None:
            out.append(None)
            continue
        s = w = 0.0
        for k in range(-radius, radius + 1):
            j = i + k
            if j < 0 or j >= n or edge[j] is None:
                continue
            a = math.exp(-.5 * (k * p['step'] / sigma) ** 2)
            s += a * edge[j]
            w += a
        out.append(s / w)
    return out


def score(d, p):
    if d['shared'] < 3:
        return math.inf
    vals = []
    for k in ('shape', 'bearing', 'local', 'missing'):
        vals.append((0 if d[k] == 0 else math.inf) if p[k] == 0 else d[k] / p[k])
    return max(vals)


JA_RANGES = [(0x3000, 0x30FF), (0x31F0, 0x31FF), (0x3200, 0x32FF), (0x3400, 0x4DBF), (0x4E00, 0x9FFF),
             (0xF900, 0xFAFF), (0xFE30, 0xFE4F), (0xFF00, 0xFFEF)]


def script_of(unicodes):
    return 'ja' if any(a <= u <= b for u in (unicodes or []) for a, b in JA_RANGES) else 'latin'


def grouping_grid(items, step):
    """Whole-em aligned scanline grid used for grouping profiles (engine.js)."""
    ymin = min(g['y1'] for g in items)
    ymax = max(g['y2'] for g in items)
    low = math.floor(ymin / step) * step
    high = math.ceil(ymax / step) * step
    ys = []
    y = low + step * .5
    while y < high:
        ys.append(y)
        y += step
    return ys


# ---- optical kerning measurement (kerning.js) ----
def case_type(unicodes):
    u = unicodes[0] if unicodes else None
    if u is None:
        return 'X'
    if 65 <= u <= 90:
        return 'U'
    if 97 <= u <= 122:
        return 'L'
    if 48 <= u <= 57:
        return 'D'
    return 'X'


def pair_kind(a, b):
    x, y = case_type(a), case_type(b)
    return x + y if x in 'UL' and y in 'UL' and x != 'X' and y != 'X' else 'other'


def gaussian_edge(edge, scale, step):
    n = len(edge)
    present = [v for v in edge if v is not None]
    offset = min(present) if present else 0
    radius = math.ceil(3 * scale['y'] / step)
    kernel = [math.exp(-.5 * (k * step / scale['y']) ** 2) for k in range(-radius, radius + 1)]
    ksum = sum(kernel)
    density = [0 if v is None else math.exp(-(v - offset) / scale['x']) for v in edge]
    field, mask = [0.0] * n, [0.0] * n
    for i in range(n):
        f = m = 0.0
        for k in range(-radius, radius + 1):
            j = i + k
            if j < 0 or j >= n or edge[j] is None:
                continue
            w = kernel[k + radius] / ksum
            f += density[j] * w
            m += w
        field[i], mask[i] = f, m
    return dict(field=field, mask=mask, offset=offset)


def expanded_left(edge, minimum, step):
    radius = math.ceil((minimum + step) / step)
    out = []
    n = len(edge)
    for i in range(n):
        v = math.inf
        for k in range(-radius, radius + 1):
            j = i + k
            if j < 0 or j >= n or edge[j] is None:
                continue
            dy = max(0, abs(k * step) - step)
            if dy > minimum:
                continue
            v = min(v, edge[j] - math.sqrt(max(0, minimum * minimum - dy * dy)) - 1)
        out.append(v)
    return out


def measure_pair(a, b):
    optical = []
    for s in range(len(SCALES)):
        af, bf = a['rightFields'][s], b['leftFields'][s]
        total = weight = 0.0
        for i in range(len(af['field'])):
            total += af['field'][i] * bf['field'][i]
            weight += af['mask'][i] * bf['mask'][i]
        optical.append(af['offset'] + bf['offset'] - SCALES[s]['x'] * math.log(total / weight)
                       if weight > 1e-6 and total > 1e-100 else None)
    gap, safe = math.inf, -math.inf
    for i in range(len(a['right'])):
        if a['right'][i] is None:
            continue
        if b['left'][i] is not None:
            gap = min(gap, a['right'][i] + b['left'][i])
        if math.isfinite(b['expanded'][i]):
            safe = max(safe, -a['right'][i] - b['expanded'][i])
    return dict(optical=optical, gap=gap if math.isfinite(gap) else None,
                safe=math.ceil(safe) if math.isfinite(safe) else None)


def kerning_grid(items, step=2):
    low, high = math.inf, -math.inf
    for g in items:
        for s in g['segments']:
            low = min(low, s[1], s[3])
            high = max(high, s[1], s[3])
    low = math.floor((low - 270) / step) * step
    high = math.ceil((high + 270) / step) * step
    ys = []
    y = low + step / 2
    while y < high:
        ys.append(y)
        y += step
    return ys


def prepare(items, minimum, step=2):
    """Optical profiles for every glyph. items: dicts with id, unicodes, advance, segments."""
    ys = kerning_grid(items, step)
    prepared = {}
    for g in items:
        left, right = profile(g['segments'], g['advance'], ys)
        prepared[g['id']] = {**g, 'left': left, 'right': right,
                             'rightFields': [gaussian_edge(right, s, step) for s in SCALES],
                             'leftFields': [gaussian_edge(left, s, step) for s in SCALES],
                             'expanded': expanded_left(left, minimum, step)}
    return prepared, ys


def median(v):
    s = sorted(v)
    if not s:
        return 0
    return (s[(len(s) - 1) >> 1] + s[len(s) >> 1]) / 2


def targets_from_references(prepared, references, spacing=0):
    cmap = {}
    for g in prepared.values():
        for u in g['unicodes'] or []:
            cmap.setdefault(u, g['id'])
    refs, skipped = [], []
    for token in references.split():
        chars = list(token)
        if len(chars) != 2:
            skipped.append(token)
            continue
        ai, bi = cmap.get(ord(chars[0])), cmap.get(ord(chars[1]))
        if ai is None or bi is None:
            skipped.append(token)
            continue
        a, b = prepared[ai], prepared[bi]
        m = measure_pair(a, b)
        if any(v is not None for v in m['optical']):
            refs.append({'text': token, 'kind': pair_kind(a['unicodes'], b['unicodes']), **m})
        else:
            skipped.append(token)
    if not refs:
        raise ValueError('基準ペアが対象に含まれていません。')
    targets = {}
    for kind in ('UU', 'LL', 'UL', 'LU', 'other'):
        own = [r for r in refs if r['kind'] == kind]
        use = own or refs
        opt = []
        for i in range(len(SCALES)):
            v = [r['optical'][i] for r in use if r['optical'][i] is not None]
            opt.append(median(v) + spacing if v else None)
        t = dict(optical=opt, gap=median([r['gap'] for r in use if r['gap'] is not None]) + spacing, fallback=not own)
        # each reference pair measured against the target; the blend is applied later (it depends on the settings)
        t['refs'] = [_optical_mechanical(r, t) for r in use]
        targets[kind] = t
    return targets, refs, skipped


def _optical_mechanical(m, t):
    delta = w = 0.0
    for s in range(len(SCALES)):
        if m['optical'][s] is not None and t['optical'][s] is not None:
            delta += SCALES[s]['w'] * (t['optical'][s] - m['optical'][s])
            w += SCALES[s]['w']
    return (delta / w if w > 0 else 0.0, t['gap'] - m['gap'] if m['gap'] is not None else 0.0, w > 0)


def blend_value(optical, mechanical, has_optical, settings):
    if not has_optical:
        return 0.0
    b = settings['optical'] / 100
    return b * optical + (1 - b) * mechanical


def reference_band(refs, settings):
    """kerning.js targets[kind].band: the spread of the reference pairs around the target."""
    if not settings.get('keepSpacing', True) or not refs:
        return (0.0, 0.0)
    d = [blend_value(o, m, h, settings) for o, m, h in refs]
    return (min(d), max(d))


def pair_features(a, b, targets):
    """The measured quantities the current model turns into a kerning value (all 1000 UPM)."""
    m = measure_pair(a, b)
    kind = pair_kind(a['unicodes'], b['unicodes'])
    t = targets[kind]
    delta = w = 0.0
    per = []
    for s in range(len(SCALES)):
        if m['optical'][s] is not None and t['optical'][s] is not None:
            d = t['optical'][s] - m['optical'][s]
            delta += SCALES[s]['w'] * d
            w += SCALES[s]['w']
            per.append(d)
        else:
            per.append(0.0)
    optical = delta / w if w > 0 else 0.0
    mechanical = t['gap'] - m['gap'] if m['gap'] is not None else 0.0
    return dict(kind=kind, optical=optical, mechanical=mechanical, per_scale=per, has_optical=w > 0,
                safe=m['safe'], gap=m['gap'], before=m['optical'], target=t['optical'], refs=t['refs'], target_gap=t['gap'])


def ideal_value(f, settings, digits=False):
    """kerning.js generateKerning: the per-pair automatic value before class resolution."""
    desired = banded_value(f, settings)
    if digits and settings.get('protectDigits', True):
        return 0
    bounded = max(-settings['limit'], min(settings['limit'], desired))
    safe = f['safe'] if f['safe'] is not None else -math.inf
    return round_js(max(safe, bounded))


def banded_value(f, settings):
    """Blend toward the target, then keep pairs inside the reference band at 0 (before limit and safety)."""
    wanted = blend_value(f['optical'], f['mechanical'], f['has_optical'], settings)
    lo, hi = reference_band(f.get('refs') or [], settings)
    return wanted - lo if wanted < lo else wanted - hi if wanted > hi else 0.0


def round_js(x):
    """Math.round semantics (half up toward +inf)."""
    return math.floor(x + 0.5)
