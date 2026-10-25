"""Learned value model: the exported trees predict exactly like scikit-learn, and quantized features are stable."""
import os, sys, unittest
import numpy as np
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, '..'))
from kg_trainer import valuemodel as vm


class ValueModel(unittest.TestCase):
    def test_export_matches_sklearn(self):
        rnd = np.random.default_rng(3)
        X = rnd.normal(0, 50, (600, 116)); y = X[:, 0] * .4 - 20 + rnd.normal(0, 3, 600)
        X = np.array([[vm.quantize(v) for v in row] for row in X])
        sk = vm.fit(X, y)
        m = vm.export_sklearn(sk)
        mine = np.array([vm.predict(m, x) for x in X[:100]])
        self.assertLess(np.max(np.abs(mine - sk.predict(X[:100]))), 1e-4)

    def test_quantize(self):
        self.assertEqual(vm.quantize(1.0), 1.0)
        self.assertEqual(vm.quantize(-54.0922872235391), vm.quantize(-54.092287223539095))
        self.assertEqual(len(vm.HEIGHTS), 33)


if __name__ == '__main__':
    unittest.main()
