import os, sys, unittest
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, '..'))
sys.path.insert(0, HERE)
from kg_trainer.fontio import FontData
import make_kerned
FONT = os.path.abspath(os.path.join(HERE, '..', '..', 'kerning-grouper', 'samples', 'KGJapaneseTest-Regular.ttf'))


class ReadKerning(unittest.TestCase):
    def setUp(self):
        self.fd = FontData('kerned.ttf', data=make_kerned.build(FONT))
        self.g = lambda ch: self.fd.cmap[ord(ch)]

    def test_values(self):
        k, g = self.fd.kerning(), self.g
        self.assertEqual(k[(g('の'), g('ね'))], -77, 'glyph exception (format 1, inside an extension lookup)')
        self.assertEqual(k[(g('の'), g('ロ'))], -40, 'class pair')
        self.assertEqual(k[(g('カ'), g('の'))], -40)
        self.assertEqual(k[(g('H'), g('O'))], -30)
        self.assertEqual(k[(g('A'), g('V'))], -80, 'second lookup adds')
        self.assertNotIn((g('ロ'), g('の')), k, 'not a member of the first class')

    def test_classes_and_palt(self):
        c, g = self.fd.kern_classes(), self.g
        self.assertTrue(any(sorted([g('の'), g('カ')]) == grp for grp in c['first']))
        self.assertTrue(any(sorted([g('の'), g('ロ')]) == grp for grp in c['second']))
        self.assertEqual(self.fd.palt()[g('の')], (-60, -120))


if __name__ == '__main__':
    unittest.main()
