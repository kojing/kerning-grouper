"""Learned correction of kerning values for Latin letter pairs (ported 1:1 in kerning.js).

The tool decides WHICH pairs to kern; this model decides HOW MUCH, from the measured shapes.
Trained on professional fonts with gradient boosted trees, exported as plain JSON so the
web tool can evaluate it without any library. Inputs are computed with fixed base settings
(not the user's sliders) so the model always sees what it was trained on.
"""
import json, math
import numpy as np
from . import core

VALUE_FEATURE_VERSION = 2
BASE = dict(optical=60, limit=100, keepSpacing=True)        # settings the model's inputs are computed with
HEIGHTS = [round(-0.3 + 0.05 * i, 2) for i in range(33)]    # fractions of the cap height, -0.30 … 1.30
KINDS = ['UU', 'UL', 'LU', 'LL']
FAR = 400.0                                                 # stand-in for "no ink at this height"
MIN_TOOL = 10                                               # pairs the tool itself barely kerns are left alone


def metrics_from_items(cap_segments, x_segments, os2_cap=None, os2_x=None):
    """Cap height and x-height (1000 UPM) from the flattened H and x, else OS/2, else 700/500."""
    def top(seg):
        return max(max(s[1], s[3]) for s in seg) if seg else None
    cap = top(cap_segments) or (os2_cap if os2_cap and os2_cap > 0 else 700.0)
    xh = top(x_segments) or (os2_x if os2_x and os2_x > 0 else 500.0)
    return dict(cap=float(cap), xh=float(xh))


def zone_index(ys, cap):
    """Index into the kerning grid nearest to each sampled height (first one on ties)."""
    out = []
    for h in HEIGHTS:
        t = h * cap
        best, bi = math.inf, 0
        for i, y in enumerate(ys):
            d = abs(y - t)
            if d < best:
                best, bi = d, i
        out.append(bi)
    return out


def applies(kind, digits, f):
    return kind in KINDS and not digits and f['has_optical']


def features(a, b, f, idx, met):
    """116 numbers: tool quantities (14), gap by height (33), gap summary (3), A's right and B's left side by height (66)."""
    s = {**core.KERN_DEFAULTS, **BASE}
    banded = core.banded_value(f, s)
    ours = core.ideal_value(f, s)
    t = f['target_gap']
    v = [ours, banded, f['optical'], f['mechanical'], *f['per_scale'], f['safe'] if f['safe'] is not None else -500.0,
         f['gap'] if f['gap'] is not None else 0.0, t] + [1.0 if f['kind'] == k else 0.0 for k in KINDS]
    gaps = []
    for i in idx:
        ra, lb = a['right'][i], b['left'][i]
        gaps.append(ra + lb - t if ra is not None and lb is not None else FAR)
    srt = sorted(gaps)
    v += gaps + [srt[0], sum(srt[:5]) / 5, met['xh'] / met['cap']]
    v += [a['right'][i] if a['right'][i] is not None else FAR for i in idx]
    v += [b['left'][i] if b['left'][i] is not None else FAR for i in idx]
    return [quantize(x) for x in v]


def quantize(x):
    """Snap to 1/1024 so float noise (summation order between Python and JS) never lands on a tree threshold."""
    return math.floor(x * 1024 + 0.5) / 1024


def tool_value(f):
    return core.ideal_value(f, {**core.KERN_DEFAULTS, **BASE})


# ---- trees ----
def export_sklearn(model, meta=None):
    """HistGradientBoostingRegressor → {'base', 'trees': [[feature, threshold, left, right, value, leaf] per node]}."""
    trees = []
    for it in model._predictors:
        nodes = it[0].nodes
        trees.append([[int(n['feature_idx']), float(n['num_threshold']), int(n['left']), int(n['right']),
                       round(float(n['value']), 6), int(n['is_leaf'])] for n in nodes])
    return dict(format='kerning-grouper-value-model', version=1, featureVersion=VALUE_FEATURE_VERSION, coreVersion=core.CORE_VERSION,
                base=float(model._baseline_prediction.ravel()[0]), learningRate=1.0, nFeatures=int(model.n_features_in_),
                trees=trees, meta=meta or {})


def predict(m, x):
    """Same walk as kerning.js predictValue: x <= threshold goes left. Leaf values already include the learning rate."""
    s = m['base']
    for tree in m['trees']:
        i = 0
        while True:
            n = tree[i]
            if n[5]:
                s += n[4]
                break
            i = n[2] if x[n[0]] <= n[1] else n[3]
    return s


def value(m, a, b, f, idx, met, limit=BASE['limit']):
    """Final learned value for one pair: the user's limit, then the tool's safety rule (never closer than 'safe')."""
    p = predict(m, features(a, b, f, idx, met))
    p = max(-limit, min(limit, p))
    safe = f['safe'] if f['safe'] is not None else -math.inf
    return core.round_js(max(safe, p))


def fit(X, y, iters=100, leaves=15, rate=0.1, seed=0):
    from sklearn.ensemble import HistGradientBoostingRegressor
    return HistGradientBoostingRegressor(max_iter=iters, learning_rate=rate, max_leaf_nodes=leaves, l2_regularization=1.0, random_state=seed).fit(X, y)
