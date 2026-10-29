"""Per font: priority features (136) for every pair of ASCII printable + common quotes/dashes, the pro value, the tool value."""
import sys, os, json, numpy as np
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer.fontio import FontData
from kg_trainer import core, pipeline, valuemodel as vm, priority as pr
from kg_trainer.build_value_model import font_metrics
CHARS = ''.join(chr(c) for c in range(0x21, 0x7f)) + '‘’“”‚„–—…«»‹›¡¿·'
def nm(f): return os.path.basename(f)[:-4].replace('[', '').replace(']', '').replace(',', '')
f = sys.argv[1]; fd = FontData(f); k = 1000 / fd.upm; kern = fd.kerning()
items, _ = pipeline.build_items(fd, CHARS)
s = dict(core.KERN_DEFAULTS); prepared, ys = core.prepare(items, s['minimum'])
targets, _, _ = core.targets_from_references(prepared, s['references'], s['spacing'])
met = font_metrics(fd); idx = vm.zone_index(ys, met['cap'])
X, y, meta = [], [], []
for ga in items:
    a = prepared[ga['id']]
    for gb in items:
        b = prepared[gb['id']]
        ft = core.pair_features(a, b, targets)
        X.append(pr.features(a, b, ft, idx, met)); pro = kern.get((ga['id'], gb['id']), 0) * k; y.append(pro)
        meta.append(chr(ga['unicodes'][0]) + chr(gb['unicodes'][0]))
np.savez_compressed(f'/home/claude/eval/prio/{nm(f)}.npz', X=np.array(X, dtype=np.float64), y=np.array(y), pairs=np.array(meta))
print('done', nm(f), len(items), len(X))
