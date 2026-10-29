"""Kerning priority: how likely a type designer is to kern a pair at all (ported 1:1 in kerning.js).

The value model says HOW MUCH; this says WHETHER. Trained on professional fonts: a pair is "kerned" when the font
has a value of at least LABEL_MIN (1000 UPM) for it. Inputs are the value model's 116 numbers (measured with fixed
base settings) plus what each glyph is (capital, small letter, digit, quote, sentence punctuation, dash, bracket,
slash, other symbol, anything else), so punctuation and digits are covered too.
"""
import unicodedata
from . import valuemodel as vm

PRIORITY_FEATURE_VERSION = 1
LABEL_MIN = 10
CATS = ['U', 'L', 'D', 'Q', 'S', 'H', 'B', 'Y', 'M', 'X']
QUOTES = set('\'"‘’‚‛“”„‟‹›«»')
SENTENCE = set('.,:;!?¡¿…·')
DASHES = set('-‐‑‒–—―')
BRACKETS = set('()[]{}')
SLASHES = set('/\\|')


def glyph_cat(unicodes):
    """One of CATS for the glyph's first code point (kerning.js glyphCat)."""
    if not unicodes:
        return 'X'
    c = chr(unicodes[0])
    if c in QUOTES:
        return 'Q'
    if c in SENTENCE:
        return 'S'
    if c in DASHES:
        return 'H'
    if c in BRACKETS:
        return 'B'
    if c in SLASHES:
        return 'Y'
    cat = unicodedata.category(c)
    name = unicodedata.name(c, '')
    if 0xFF00 <= unicodes[0] <= 0xFFEF:
        return 'X'
    if cat in ('Lu', 'Lt') and name.startswith(('LATIN ', 'GREEK ', 'CYRILLIC ')):
        return 'U'
    if cat == 'Ll' and name.startswith(('LATIN ', 'GREEK ', 'CYRILLIC ')):
        return 'L'
    if cat == 'Nd' and unicodes[0] < 128:
        return 'D'
    if cat[0] in 'PS':
        return 'M'
    return 'X'


def features(a, b, f, idx, met):
    """136 numbers: the value model's 116, then one-hot categories of A (10) and B (10)."""
    ca, cb = glyph_cat(a['unicodes']), glyph_cat(b['unicodes'])
    return vm.features(a, b, f, idx, met) + [1.0 if ca == c else 0.0 for c in CATS] + [1.0 if cb == c else 0.0 for c in CATS]


def fit(X, y, iters=150, leaves=15, rate=0.1, seed=0):
    from sklearn.ensemble import HistGradientBoostingClassifier
    return HistGradientBoostingClassifier(max_iter=iters, learning_rate=rate, max_leaf_nodes=leaves, l2_regularization=1.0, random_state=seed).fit(X, y)


def export_sklearn(model, meta=None):
    """Classifier → same tree format as the value model; the sum is log-odds (link: logistic)."""
    m = vm.export_sklearn(model, meta)
    m.update(format='kerning-grouper-priority-model', featureVersion=PRIORITY_FEATURE_VERSION, link='logistic')
    return m


def probability(m, x):
    import math
    return 1 / (1 + math.exp(-vm.predict(m, x)))
