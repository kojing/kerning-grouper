"""Evaluation and training against professional kerning, across one or more fonts.

Stage A  settings fit : pro ≈ clamp(m + β(o − m) + s_kind)   (β = optical blend, s = spacing per pair kind)
Stage B  residual     : the remaining difference, ridge regression on the measured features
Grouping             : how well the current grouping metric reproduces the pros' kerning classes
"""
import math, random, time
import numpy as np
from . import core

KINDS = ['UU', 'LL', 'UL', 'LU', 'other']
SCRIPTS = ['latin-latin', 'latin-ja', 'ja-latin', 'ja-ja']
FEATURES = ['o_minus_m', 'optical', 'mechanical', 'scale24', 'scale60', 'scale120', 'gap', 'safe', 'has_safe',
            'abs_optical', 'banded', 'inside_band'] + ['kind_' + k for k in KINDS] + ['script_' + s for s in SCRIPTS]
LAST = {}                  # held-out predictions of the last train() call, for offline analysis
TOL, BIG = 28, 56          # 18px at 1000 UPM: half a pixel / one pixel
IMPLICIT_ZERO_WEIGHT = 0.3  # a pair the pro never covered is weaker evidence than an explicit value


def feature_vector(r):
    f = r['f']
    gap = f['gap'] if f['gap'] is not None else 0.0
    safe = f['safe'] if f['safe'] is not None else 0.0
    v = [f['optical'] - f['mechanical'], f['optical'], f['mechanical'], *f['per_scale'], gap / 10, safe, 1.0 if f['safe'] is not None else 0.0,
         abs(f['optical'])]
    banded = core.banded_value(f, dict(optical=60, keepSpacing=True))
    v += [banded, 1.0 if banded == 0 else 0.0]
    v += [1.0 if r['kind'] == k else 0.0 for k in KINDS]
    v += [1.0 if r['script'] == s else 0.0 for s in SCRIPTS]
    return v


def metrics(pred, truth, weight=None):
    pred, truth = np.asarray(pred, float), np.asarray(truth, float)
    if not len(pred):
        return dict(n=0)
    w = np.ones_like(pred) if weight is None else np.asarray(weight, float)
    err = np.abs(pred - truth)
    return dict(n=int(len(pred)), mae=float(np.average(err, weights=w)), within=float(np.average(err <= TOL, weights=w)),
                over=int(np.sum(err > BIG)), bias=float(np.average(pred - truth, weights=w)))


def usable(r):
    return not r['digits'] and r['f']['has_optical']


def weights(rows, balance=True):
    """Per-pair weight. With several fonts each font gets the same total weight, so one big font does not drown the others."""
    w = np.array([1.0 if r['covered'] or r['pro'] != 0 else IMPLICIT_ZERO_WEIGHT for r in rows])
    fonts = [r.get('font') for r in rows]
    names = set(fonts)
    if balance and len(names) > 1:
        tot = {f: 0.0 for f in names}
        for f, x in zip(fonts, w):
            tot[f] += x
        mean = sum(tot.values()) / len(tot)
        w = np.array([x * mean / tot[f] for f, x in zip(fonts, w)])
    return w


# ---- stage A ----
def fit_settings(rows, limit=None, keep_spacing=None):
    """Optical share β, per-kind spacing offsets and whether the reference band fits the pros better.
    With the band, β is searched on a grid (the band makes the value non-linear in β); without it a
    weighted least-squares fit is used. keep_spacing=None tries both and keeps the better one."""
    rows = [r for r in rows if usable(r)]
    w = weights(rows)
    if limit is None:
        limit = float(np.percentile(np.abs([r['pro'] for r in rows]), 99.5)) if rows else 240.0
        limit = max(40.0, min(1000.0, limit))
    y = np.array([r['pro'] for r in rows], float)
    kinds = np.array([KINDS.index(r['kind']) for r in rows])
    best = None
    modes = [True, False] if keep_spacing is None else [keep_spacing]
    for keep, beta in [(k, b) for k in modes for b in (range(0, 101, 5) if k else [None])]:
        if beta is None:
            X = np.zeros((len(rows), 1 + len(KINDS)))
            for i, r in enumerate(rows):
                X[i, 0] = r['f']['optical'] - r['f']['mechanical']
                X[i, 1 + kinds[i]] = 1.0
            yy = y - np.array([r['f']['mechanical'] for r in rows])
            sw = np.sqrt(w)[:, None]
            present = X[:, 1:].sum(0) > 0
            cols = [0] + [1 + i for i in range(len(KINDS)) if present[i]]
            coef, *_ = np.linalg.lstsq(X[:, cols] * sw, yy * sw[:, 0], rcond=None)
            b = float(min(1.0, max(0.0, coef[0]))) * 100
        else:
            b = float(beta)
        st = dict(optical=b, keepSpacing=keep)
        base = np.array([core.banded_value(r['f'], st) for r in rows])
        offsets = {}
        for i, k in enumerate(KINDS):
            m = kinds == i
            offsets[k] = float(np.average(y[m] - base[m], weights=w[m])) if m.any() else 0.0
        fit = dict(optical=round(b, 2), kindOffsets=offsets, limit=round(limit), keepSpacing=keep)
        pred = np.array([predict_settings(r, fit) for r in rows])
        score = float(np.average(np.abs(pred - y), weights=w))
        if best is None or score < best[0]:
            best = (score, fit)
    return best[1]


def predict_settings(r, fit):
    f = r['f']
    if r['digits']:
        return 0.0
    if not f['has_optical']:
        base = 0.0
    else:
        base = core.banded_value(f, dict(optical=fit['optical'], keepSpacing=fit.get('keepSpacing', False))) + fit['kindOffsets'].get(r['kind'], 0.0)
    base = max(-fit['limit'], min(fit['limit'], base))
    safe = f['safe'] if f['safe'] is not None else -math.inf
    return max(safe, base)


# ---- stage B ----
def fit_ridge(X, y, w, lam):
    mu = np.average(X, axis=0, weights=w)
    sd = np.sqrt(np.average((X - mu) ** 2, axis=0, weights=w))
    sd[sd < 1e-9] = 1.0
    Z = (X - mu) / sd
    sw = np.sqrt(w)
    A = (Z * sw[:, None])
    bias = float(np.average(y, weights=w))
    coef = np.linalg.solve(A.T @ A + lam * np.eye(Z.shape[1]), A.T @ ((y - bias) * sw))
    return dict(mean=mu.tolist(), std=sd.tolist(), weights=coef.tolist(), bias=bias, lam=lam)


def apply_ridge(m, X):
    Z = (np.asarray(X) - np.asarray(m['mean'])) / np.asarray(m['std'])
    return Z @ np.asarray(m['weights']) + m['bias']


def folds(rows, k=5, seed=7):
    """Leave one font out when there are several fonts; otherwise group by the first glyph."""
    fonts = sorted(set(r['font'] for r in rows))
    if len(fonts) >= 2:
        return [[i for i, r in enumerate(rows) if r['font'] == f] for f in fonts], 'leave-one-font-out'
    firsts = sorted(set(r['a'] for r in rows))
    random.Random(seed).shuffle(firsts)
    bucket = {a: i % k for i, a in enumerate(firsts)}
    out = [[] for _ in range(k)]
    for i, r in enumerate(rows):
        out[bucket[r['a']]].append(i)
    return out, f'{k}-fold（先頭の字でグループ分け）'


def train(rows, base_settings, lams=(1.0, 10.0, 100.0, 1000.0), progress=None):
    """rows: pair rows from every training font (each with r['font']). Returns the model and its evaluation."""
    t0 = time.time()
    rows = [r for r in rows if usable(r)]
    w = weights(rows)
    truth = [r['pro'] for r in rows]
    X = np.array([feature_vector(r) for r in rows])
    fold_idx, method = folds(rows)
    default_pred = [r['ours'] for r in rows]
    a_pred = np.zeros(len(rows))
    b_pred = np.zeros(len(rows))
    best = None
    # choose λ by cross-validation, then report held-out predictions of both stages
    for lam in lams:
        tmp = np.zeros(len(rows))
        for hold in fold_idx:
            hs = set(hold)
            tr = [i for i in range(len(rows)) if i not in hs]
            if not tr:
                continue
            fit = fit_settings([rows[i] for i in tr])
            base_tr = np.array([predict_settings(rows[i], fit) for i in tr])
            m = fit_ridge(X[tr], np.array([truth[i] for i in tr]) - base_tr, w[tr], lam)
            base_h = np.array([predict_settings(rows[i], fit) for i in hold])
            tmp[hold] = base_h + apply_ridge(m, X[hold])
            a_pred[hold] = base_h
        score = metrics(tmp, truth, w)['mae']
        if best is None or score < best[0]:
            best = (score, lam, tmp.copy())
        if progress:
            progress(lams.index(lam) / len(lams))
    lam = best[1]
    b_pred = best[2]
    LAST.update(rows=rows, pred=b_pred.copy(), settings_pred=a_pred.copy())
    # final model on everything
    fit = fit_settings(rows)
    base = np.array([predict_settings(r, fit) for r in rows])
    resid = fit_ridge(X, np.array(truth) - base, w, lam)
    # uncertainty: expected absolute error from the same features (held-out residuals)
    abs_err = np.abs(b_pred - np.array(truth))
    unc = fit_ridge(X, abs_err, w, lam)
    by_kind = {}
    for k in KINDS:
        idx = [i for i, r in enumerate(rows) if r['kind'] == k]
        if idx:
            by_kind[k] = dict(default=metrics([default_pred[i] for i in idx], [truth[i] for i in idx], w[idx]),
                              model=metrics(b_pred[idx], [truth[i] for i in idx], w[idx]))
    by_font = {}
    for f in sorted(set(r['font'] for r in rows)):
        idx = [i for i, r in enumerate(rows) if r['font'] == f]
        by_font[f] = dict(default=metrics([default_pred[i] for i in idx], [truth[i] for i in idx], w[idx]),
                          model=metrics(b_pred[idx], [truth[i] for i in idx], w[idx]))
    curve = learning_curve(rows, X, truth, w, lam) if method == 'leave-one-font-out' else None
    worst = sorted(range(len(rows)), key=lambda i: -abs(b_pred[i] - truth[i]))[:40]
    evaluation = dict(method=method, pairs=len(rows), seconds=round(time.time() - t0, 2),
                      default=metrics(default_pred, truth, w), settings=metrics(a_pred, truth, w), model=metrics(b_pred, truth, w),
                      byKind=by_kind, byFont=by_font, curve=curve,
                      worst=[dict(font=rows[i]['font'], a=rows[i]['a'], b=rows[i]['b'], pro=round(truth[i]), default=rows[i]['ours'],
                                  model=round(float(b_pred[i]))) for i in worst])
    model = dict(settings=dict(optical=fit['optical'], limit=fit['limit'], keepSpacing=fit['keepSpacing'], references=base_settings.get('references'),
                               minimum=base_settings.get('minimum', core.KERN_DEFAULTS['minimum'])),
                 kindOffsets=fit['kindOffsets'], residual=dict(features=FEATURES, **resid), uncertainty=dict(features=FEATURES, **unc))
    return model, evaluation


def _fit_predict(rows, X, truth, w, lam, tr, hold):
    fit = fit_settings([rows[i] for i in tr])
    base_tr = np.array([predict_settings(rows[i], fit) for i in tr])
    m = fit_ridge(X[tr], np.array([truth[i] for i in tr]) - base_tr, w[tr], lam)
    return np.array([predict_settings(rows[i], fit) for i in hold]) + apply_ridge(m, X[hold])


def learning_curve(rows, X, truth, w, lam, max_sets=6, seed=11):
    """Held-out error by number of training fonts: does adding fonts still help?

    For each held-out font, train on k of the other fonts (a few random picks per k) and test on the held-out one.
    """
    fonts = sorted(set(r['font'] for r in rows))
    if len(fonts) < 2:
        return None
    by = {f: [i for i, r in enumerate(rows) if r['font'] == f] for f in fonts}
    rnd = random.Random(seed)
    out = []
    for k in range(1, len(fonts)):
        maes, withins = [], []
        for hold_f in fonts:
            others = [f for f in fonts if f != hold_f]
            for _ in range(min(max_sets, math.comb(len(others), k))):
                pick = rnd.sample(others, k)
                tr = [i for f in pick for i in by[f]]
                hold = by[hold_f]
                pred = _fit_predict(rows, X, truth, w, lam, tr, hold)
                mt = metrics(pred, [truth[i] for i in hold], w[hold])
                maes.append(mt['mae'])
                withins.append(mt['within'])
        out.append(dict(fonts=k, mae=float(np.mean(maes)), within=float(np.mean(withins)), runs=len(maes)))
    return out


# ---- grouping ----
def grouping_agreement(fonts_items, fonts_classes, step=6, strengths=(0, 20, 40, 80), scales=(0.5, 0.75, 1, 1.5, 2, 3)):
    """Pairwise agreement between the pros' classes and 'score ≤ 1' under scaled thresholds.

    fonts_items: {font: items}; fonts_classes: {font: {'first': [[gid]], 'second': [[gid]]}}.
    first-side classes are compared on the right outline, second-side on the left outline.
    """
    samples = []
    for font, items in fonts_items.items():
        ys = core.grouping_grid(items, step)
        prof = {g['id']: core.profile(g['segments'], g['advance'], ys) for g in items}
        ids = [g['id'] for g in items]
        for side, key in (('right', 'first'), ('left', 'second')):
            cls = {}
            for ci, members in enumerate(fonts_classes[font][key]):
                for gid in members:
                    cls.setdefault(gid, ci)
            have = [i for i in ids if i in cls]
            for x in range(len(have)):
                for y in range(x + 1, len(have)):
                    samples.append((font, side, have[x], have[y], cls[have[x]] == cls[have[y]], prof))
    if not samples:
        return dict(pairs=0)
    best = None
    table = []
    for st in strengths:
        p0 = {**core.DEFAULTS, 'strength': st, 'step': step}
        cache = {}
        dist = []
        for font, side, a, b, same, prof in samples:
            sa = cache.get((font, side, a))
            if sa is None:
                sa = cache[(font, side, a)] = core.grouping_profile(prof[a][1 if side == 'right' else 0], p0)
            sb = cache.get((font, side, b))
            if sb is None:
                sb = cache[(font, side, b)] = core.grouping_profile(prof[b][1 if side == 'right' else 0], p0)
            dist.append((core.compare(sa, sb), same))
        for sc in scales:
            p = core.grouping_params({**p0, **{k: core.DEFAULTS[k] * sc for k in ('shape', 'bearing', 'local')}, 'missing': min(1, core.DEFAULTS['missing'] * sc)})
            tp = fp = fn = tn = 0
            for d, same in dist:
                pred = core.score(d, p) <= 1
                if pred and same: tp += 1
                elif pred and not same: fp += 1
                elif not pred and same: fn += 1
                else: tn += 1
            prec = tp / (tp + fp) if tp + fp else 0
            rec = tp / (tp + fn) if tp + fn else 0
            f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0
            row = dict(strength=st, scale=sc, precision=round(prec, 3), recall=round(rec, 3), f1=round(f1, 3),
                       accuracy=round((tp + tn) / len(dist), 4))
            table.append(row)
            if best is None or f1 > best['f1']:
                best = row
    params = {k: round(core.DEFAULTS[k] * best['scale'], 3) for k in ('shape', 'bearing', 'local')}
    params.update(missing=round(min(1, core.DEFAULTS['missing'] * best['scale']), 4), strength=best['strength'], step=step)
    return dict(pairs=len(samples), best=best, params=params, table=table)
