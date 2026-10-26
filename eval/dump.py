"""Dump flattened kerning + true class defs for each font (for testing class inference from a flattened .vfm)."""
import sys, json
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer.fontio import FontData
for i, p in enumerate(l.strip() for l in open('/home/claude/eval/fonts_classes.txt') if l.strip()):
    f = FontData(p)
    k = f.kerning(); c = f.kern_classes()
    json.dump(dict(font=p, pairs=[[a, b, v] for (a, b), v in k.items()], first=c['first'], second=c['second']), open(f'/home/claude/eval/infer/f{i}.json', 'w'))
    print(i, p.split('/')[-1], len(k), len(c['first']), len(c['second']))
