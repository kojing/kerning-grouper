"""A training session: several fonts, one character set, one set of base settings."""
import datetime, json, threading
from fontTools.pens.svgPathPen import SVGPathPen
from . import core, pipeline, model
from .fontio import FontData

PRESETS = {
    'kana': 'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわをんゔァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヲンヴヵヶー',
    'latin': 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    'digits': '0123456789',
    'punct': '.,:;!?\'"()-',
}


class Project:
    def __init__(self):
        self.fonts = []          # dicts: key, name, data(FontData), license, use
        self.chars = PRESETS['latin']
        self.references = core.KERN_DEFAULTS['references']
        self.minimum = core.KERN_DEFAULTS['minimum']
        self.rows = {}           # font key -> pair rows
        self.items = {}
        self.result = None       # {'model':..., 'evaluation':..., 'grouping':...}
        self.value = None        # learned value model for the web tool
        self.lock = threading.Lock()
        self.progress = dict(label='', value=0.0, busy=False)

    # ---- fonts ----
    def add_font(self, filename, data):
        fd = FontData(filename, data=data, name=filename)
        if any(f['data'].sha1 == fd.sha1 for f in self.fonts):
            raise ValueError('同じフォントは登録済みです。')
        key = f'f{len(self.fonts) + 1}'
        self.fonts.append(dict(key=key, file=filename, data=fd, license='', use=True))
        self._invalidate()
        return key

    def remove_font(self, key):
        self.fonts = [f for f in self.fonts if f['key'] != key]
        self._invalidate()

    def _invalidate(self):
        self.rows, self.items, self.result, self.value = {}, {}, None, None

    def font_info(self, f):
        fd = f['data']
        kern = fd.kerning()
        cls = fd.kern_classes()
        present = sum(1 for ch in set(self.chars) if not ch.isspace() and ord(ch) in fd.cmap)
        return dict(key=f['key'], file=f['file'], family=fd.family, upm=fd.upm, glyphs=len(fd.glyph_order), license=f['license'], use=f['use'],
                    kernPairs=len(kern), classes=dict(first=len(cls['first']), second=len(cls['second'])), palt=len(fd.palt()),
                    variable=fd.is_variable, skipped=sorted(set(fd.skipped)), coverage=present, sha1=fd.sha1[:12])

    def state(self):
        return dict(fonts=[self.font_info(f) for f in self.fonts], chars=self.chars, references=self.references, minimum=self.minimum,
                    presets=PRESETS, progress=self.progress, hasResult=self.result is not None, hasValue=self.value is not None,
                    valueEval=(self.value or {}).get('meta', {}).get('evaluation'),
                    coreVersion=core.CORE_VERSION, featureVersion=core.FEATURE_VERSION)

    # ---- computation ----
    def _set(self, label, value):
        self.progress.update(label=label, value=round(value, 3))

    def compute_rows(self):
        used = [f for f in self.fonts if f['use']]
        if not used:
            raise ValueError('学習元フォントを1つ以上登録して「使う」にしてください。')
        settings = dict(references=self.references, minimum=self.minimum)
        for n, f in enumerate(used):
            if f['key'] in self.rows:
                continue
            items, missing = pipeline.build_items(f['data'], self.chars)
            if len(items) < 2:
                raise ValueError(f'{f["file"]}: 対象の字が2字未満です。')
            rows, info = pipeline.pair_table(f['data'], items, settings,
                                              progress=lambda v, n=n: self._set(f'{f["file"]} のペアを計測', (n + v) / len(used)))
            for r in rows:
                r['font'] = f['key']
            self.rows[f['key']] = rows
            self.items[f['key']] = items
        return [r for f in used for r in self.rows[f['key']]]

    def run(self, with_grouping=True):
        with self.lock:
            self.progress['busy'] = True
            try:
                rows = self.compute_rows()
                self._set('学習', 0)
                mdl, ev = model.train(rows, dict(references=self.references, minimum=self.minimum), progress=lambda v: self._set('学習（交差検証）', v))
                grouping = None
                if with_grouping:
                    used = [f for f in self.fonts if f['use']]
                    self._set('グループの一致を計算', 0)
                    grouping = model.grouping_agreement({f['key']: self.items[f['key']] for f in used}, {f['key']: f['data'].kern_classes() for f in used})
                names = {f['key']: f for f in self.fonts}
                for w in ev['worst']:
                    fd = names[w['font']]['data']
                    w['file'] = names[w['font']]['file']
                    w['pair'] = ''.join(chr(fd.unicodes[g][0]) if fd.unicodes.get(g) else fd.glyph_order[g] for g in (w['a'], w['b']))
                self.result = dict(model=mdl, evaluation=ev, grouping=grouping)
                self._set('完了', 1)
                return self.result
            finally:
                self.progress['busy'] = False

    def value_model(self):
        """The web tool's learned value model (src/kern-model.js) from the fonts set to 'use'."""
        from . import build_value_model as bvm
        used = [f for f in self.fonts if f['use']]
        if not used:
            raise ValueError('学習元フォントを1つ以上「使う」にしてください。')
        with self.lock:
            self.progress.update(busy=True, label='値の補正モデルを学習', value=0)
            try:
                m = bvm.build([(f['file'], f['data']) for f in used], evaluate=len(used) > 1,
                              progress=lambda v: self._set('値の補正モデルを学習', v))
                for t, f in zip(m['meta']['trainingFonts'], used):
                    t['license'] = f['license']
                self.value = m
                self._set('完了', 1)
                return m
            finally:
                self.progress['busy'] = False

    # ---- output ----
    def package(self, name):
        if not self.result:
            raise ValueError('先に学習してください。')
        used = [f for f in self.fonts if f['use']]
        g = self.result['grouping']
        return dict(format='kerning-grouper-model', version=1, name=name or 'model', created=datetime.datetime.now().isoformat(timespec='seconds'),
                    coreVersion=core.CORE_VERSION, featureVersion=core.FEATURE_VERSION, units='1000-UPM normalized',
                    chars=self.chars, trainingFonts=[dict(file=f['file'], family=f['data'].family, sha1=f['data'].sha1, license=f['license'],
                                                          pairs=len(self.rows.get(f['key'], []))) for f in used],
                    grouping=dict(params=g['params'], agreement=g['best'], pairs=g['pairs']) if g and g.get('pairs') else None,
                    kerning=self.result['model'], evaluation={k: v for k, v in self.result['evaluation'].items() if k != 'worst'})

    def pair_svg(self, key, a, b, pro, ours):
        """Two glyphs set with the pro value (filled) and the current model's value (outline)."""
        f = next(x for x in self.fonts if x['key'] == key)
        fd = f['data']
        k = 1000 / fd.upm
        def path(gid):
            pen = SVGPathPen(fd.glyphset)
            fd.glyphset[fd.glyph_order[gid]].draw(pen)
            return pen.getCommands()
        adv = fd.hmtx[fd.glyph_order[a]][0] * k
        def g(gid, x, cls):
            return f'<path class="{cls}" transform="translate({x:.1f} 0) scale({k:.5f})" d="{path(gid)}"/>'
        w = adv + fd.hmtx[fd.glyph_order[b]][0] * k + 40
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -900 {w:.0f} 1150"><g transform="scale(1 -1)">'
                + g(a, 0, 'pro') + g(b, adv + pro, 'pro') + g(b, adv + ours, 'ours') + '</g></svg>')
