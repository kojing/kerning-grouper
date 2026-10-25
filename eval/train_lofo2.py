import sys, json, pickle
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer.project import Project, PRESETS
from kg_trainer import model
p = Project(); p.chars = PRESETS['latin']
for f in [l.strip() for l in open('fonts_latin.txt') if l.strip()]:
    p.add_font(f.split('/')[-1], open(f, 'rb').read())
p.run(with_grouping=False)
rows = model.LAST['rows']
out = [dict(font=p.fonts[int(r['font'][1:]) - 1]['file'], a=r['a'], b=r['b'], pro=r['pro'], ours=r['ours'], pred=float(x), kind=r['kind'])
       for r, x in zip(rows, model.LAST['pred'])]
json.dump(out, open('lofo_pred.json', 'w'))
print(len(out))
