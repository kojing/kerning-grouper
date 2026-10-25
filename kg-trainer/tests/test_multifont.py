"""Several training fonts: leave-one-font-out, balanced weights, per-font metrics and the learning curve."""
import io, os, random, sys, unittest
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, '..'))
from fontTools.ttLib import TTFont
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from kg_trainer.fontio import FontData
from kg_trainer.project import Project
from kg_trainer import pipeline, model
FONT = os.path.abspath(os.path.join(HERE, '..', '..', 'kerning-grouper', 'samples', 'KGJapaneseTest-Regular.ttf'))
CHARS = 'HOnoAVTWaeyrkxのカロねわれ'


def pro_font(rows, fd, shift, seed):
    """A 'pro' font: 60 % optical plus a per-font tightness shift and noise, written as real GPOS pairs."""
    rnd = random.Random(seed)
    k = fd.upm / 1000
    lines = []
    for r in rows:
        f = r['f']
        if not f['has_optical'] or r['digits']:
            continue
        v = round((f['mechanical'] + .6 * (f['optical'] - f['mechanical']) + shift + rnd.uniform(-4, 4)) * k)
        if v:
            lines.append(f"  pos {fd.glyph_order[r['a']]} {fd.glyph_order[r['b']]} {v};")
    t = TTFont(FONT)
    for tag in ('GPOS', 'kern'):
        if tag in t:
            del t[tag]
    t['name'].setName(f'Pro{seed}', 1, 3, 1, 0x409)
    addOpenTypeFeaturesFromString(t, 'feature kern {\n' + '\n'.join(lines) + '\n} kern;')
    out = io.BytesIO(); t.save(out)
    return out.getvalue()


class MultiFont(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fd = FontData(FONT)
        items, _ = pipeline.build_items(fd, CHARS)
        rows, _ = pipeline.pair_table(fd, items, {})
        cls.fonts = [pro_font(rows, fd, s, i) for i, s in enumerate((-10, 0, 10))]

    def test_project_trains_across_fonts(self):
        p = Project()
        p.chars = CHARS
        for i, data in enumerate(self.fonts):
            p.add_font(f'pro{i}.otf', data)
        with self.assertRaises(ValueError):
            p.add_font('dup.otf', self.fonts[0])
        res = p.run()
        ev = res['evaluation']
        self.assertEqual(ev['method'], 'leave-one-font-out')
        self.assertEqual(sorted(ev['byFont']), ['f1', 'f2', 'f3'])
        self.assertLess(ev['model']['mae'], ev['default']['mae'])
        self.assertLess(ev['model']['mae'], 15)
        self.assertAlmostEqual(res['model']['settings']['optical'], 60, delta=6)
        self.assertEqual([c['fonts'] for c in ev['curve']], [1, 2])
        pkg = p.package('multi')
        self.assertEqual(len(pkg['trainingFonts']), 3)
        self.assertNotIn('worst', pkg['evaluation'])
        # turning a font off retrains on the rest
        p.fonts[2]['use'] = False
        p.result = None
        self.assertEqual(sorted(p.run()['evaluation']['byFont']), ['f1', 'f2'])

    def test_balanced_weights(self):
        rows = [dict(font='a', covered=True, pro=1)] * 10 + [dict(font='b', covered=True, pro=1)] * 2
        w = model.weights(rows)
        self.assertAlmostEqual(w[:10].sum(), w[10:].sum())
        self.assertTrue((model.weights(rows, balance=False) == 1).all())


if __name__ == '__main__':
    unittest.main()
