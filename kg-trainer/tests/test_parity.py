"""The Python core must reproduce the JavaScript core on the bundled font."""
import json, os, subprocess, sys, unittest
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, '..'))
from kg_trainer.fontio import FontData
from kg_trainer import pipeline, core, valuemodel as vm
from kg_trainer.build_value_model import font_metrics
JS = os.environ.get('KG_JS_ROOT', os.path.abspath(os.path.join(HERE, '..', '..', 'kerning-grouper')))
FONT = os.path.join(JS, 'samples', 'KGJapaneseTest-Regular.ttf')
CHARS = 'HOnoAVTWaeyのカロねー「」、。ぁっ'
REFS = 'HH OO nn のの カカ'


def load_js_model():
    """The model the web tool ships (src/kern-model.js is 'export default {json};')."""
    txt = open(os.path.join(JS, 'src', 'kern-model.js'), encoding='utf-8').read()
    return json.loads(txt[txt.index('export default ') + 15:].rstrip().rstrip(';'))


@unittest.skipUnless(os.path.exists(os.path.join(JS, 'src', 'kerning.js')), 'JS sources not found')
class Parity(unittest.TestCase):
    def test_pairs_match_js(self):
        self.check({})

    def test_old_settings_without_band_match_js(self):
        self.check({'optical': 85, 'limit': 240, 'threshold': 5, 'keepSpacing': False, 'learned': False})

    @unittest.skipUnless(os.path.exists(os.environ.get('KG_PARITY_FONT', '')), 'set KG_PARITY_FONT to a Latin font to also check a real font')
    def test_learned_values_on_a_real_font(self):
        self.check({}, font=os.environ['KG_PARITY_FONT'], chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', refs=core.KERN_DEFAULTS['references'])

    def check(self, extra, font=FONT, chars=CHARS, refs=REFS):
        out = subprocess.run(['node', os.path.join(HERE, 'parity_js.mjs'), JS, font, chars, refs, json.dumps(extra)], capture_output=True, text=True, check=True).stdout
        js = json.loads(out)
        fd = FontData(font)
        items, missing = pipeline.build_items(fd, chars)
        self.assertEqual(missing, [])
        for g in items:
            self.assertEqual(len(g['segments']), js['segments'][str(g['id'])], g['name'])
        rows, info = pipeline.pair_table(fd, items, {'references': refs, **extra})
        py = {(r['a'], r['b']): r for r in rows}
        worst = 0
        met = font_metrics(fd)
        for k in ('cap', 'xh'):
            self.assertAlmostEqual(met[k], js['metrics'][k], places=6)
        learned = extra.get('learned', True)
        model = load_js_model()
        s = {**core.KERN_DEFAULTS, 'references': refs, **extra}
        prepared, ys = core.prepare(items, s['minimum'])
        idx = vm.zone_index(ys, met['cap'])
        used = 0
        for p in js['pairs']:
            r = py[(p['a'], p['b'])]
            want = r['ours']
            if learned and vm.applies(r['kind'], r['digits'], r['f']) and abs(r['ours']) >= vm.MIN_TOOL:
                want = vm.value(model, prepared[p['a']], prepared[p['b']], r['f'], idx, met, s['limit'])
                used += 1
                self.assertTrue(p['learned'], (p['a'], p['b']))
                self.assertEqual(p['toolValue'], r['ours'])
            self.assertEqual(want, p['ideal'], (p['a'], p['b'], r['ours']))
            self.assertEqual(r['f']['safe'], p['safe'])
            for x, y in zip(r['f']['before'], p['before']):
                if x is None or y is None:
                    self.assertEqual(x, y)
                else:
                    worst = max(worst, abs(x - y))
        self.assertLess(worst, 1e-6)
        if learned:
            self.assertGreater(used, 0)


if __name__ == '__main__':
    unittest.main()
