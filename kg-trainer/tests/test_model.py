"""Training recovers a known relation, and evaluation is held out."""
import os, sys, unittest
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, '..')); sys.path.insert(0, HERE)
from kg_trainer.fontio import FontData
from kg_trainer import pipeline, model, core
import make_kerned
FONT = os.path.abspath(os.path.join(HERE, '..', '..', 'kerning-grouper', 'samples', 'KGJapaneseTest-Regular.ttf'))
CHARS = 'HOnoAVTWaeyrkxのカロねわれ'


class Train(unittest.TestCase):
    def test_learns_a_pro_that_differs_from_the_current_model(self):
        fd = FontData(FONT)
        items, _ = pipeline.build_items(fd, CHARS)
        rows, _ = pipeline.pair_table(fd, items, {'references': 'HH OO nn のの カカ'})
        # A synthetic "pro": a smaller optical share and 20 tighter for lowercase pairs.
        fit_truth = dict(optical=60, kindOffsets={'LL': -20}, limit=300)
        for r in rows:
            r['font'] = 'A' if r['a'] % 2 else 'B'
            r['pro'] = model.predict_settings(r, {**fit_truth, 'kindOffsets': {k: fit_truth['kindOffsets'].get(k, 0) for k in model.KINDS}})
            r['covered'] = True
        m, ev = model.train(rows, {'references': 'HH OO nn のの カカ'})
        self.assertEqual(ev['method'], 'leave-one-font-out')
        self.assertLess(abs(m['settings']['optical'] - 60), 3)
        self.assertLess(abs(m['kindOffsets']['LL'] + 20), 3)
        self.assertLess(ev['model']['mae'], ev['default']['mae'] / 2)
        self.assertEqual(len(m['residual']['weights']), len(model.FEATURES))

    def test_detects_a_pro_that_keeps_the_reference_spacing(self):
        fd = FontData(FONT)
        items, _ = pipeline.build_items(fd, CHARS)
        rows, _ = pipeline.pair_table(fd, items, {'references': 'HH OO nn のの カカ'})
        truth = dict(optical=50, keepSpacing=True, limit=300, kindOffsets={k: 0.0 for k in model.KINDS})
        for r in rows:
            r['pro'] = model.predict_settings(r, truth)
            r['covered'] = True
            r['font'] = 'A'
        fit = model.fit_settings(rows)
        self.assertTrue(fit['keepSpacing'])
        self.assertEqual(fit['optical'], 50)
        self.assertFalse(model.fit_settings(rows, keep_spacing=False)['keepSpacing'])

    def test_grouping_agreement_runs_on_real_classes(self):
        fd = FontData('kerned.ttf', data=make_kerned.build(FONT))
        items, _ = pipeline.build_items(fd, 'のカロね')
        g = model.grouping_agreement({'k': items}, {'k': fd.kern_classes()}, strengths=(0,), scales=(1, 3))
        self.assertGreater(g['pairs'], 0)
        self.assertIn('shape', g['params'])


if __name__ == '__main__':
    unittest.main()
