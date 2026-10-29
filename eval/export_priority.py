import sys, glob, json, numpy as np
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer import priority as pr
from kg_trainer.build_priority_model import as_module, CHARS
files = sorted(glob.glob('prio/*.npz'))
X = np.vstack([np.load(f)['X'].astype(np.float32) for f in files]); y = np.concatenate([np.abs(np.load(f)['y']) >= pr.LABEL_MIN for f in files])
m = pr.fit(X.astype(np.float64), y)
ev = dict(method='leave-one-font-out (eval/train_priority.py)', auc=0.797, pro=0.112, tool=dict(precision=0.202, recall=0.525, f1=0.291, kerned=0.298),
          p30=dict(precision=0.449, recall=0.410, f1=0.429, kerned=0.104), p40=dict(precision=0.501, recall=0.335, f1=0.401, kerned=0.076), p50=dict(precision=0.545, recall=0.270, f1=0.361, kerned=0.057))
meta = dict(trainingFonts=[f.split('/')[-1][:-4] for f in files], pairs=int(len(y)), kerned=int(y.sum()), labelMin=pr.LABEL_MIN, chars=CHARS, evaluation=ev)
out = pr.export_sklearn(m, meta)
open('/home/claude/kg/kerning-grouper/src/priority-model.js', 'w', encoding='utf-8').write(as_module(out))
print('trees', len(out['trees']), 'base', out['base'], 'features', out['nFeatures'])
