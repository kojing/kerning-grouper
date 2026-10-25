import sys, json, time
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer.project import Project, PRESETS
p = Project(); p.chars = PRESETS['latin']
for f in [l.strip() for l in open('fonts_latin.txt') if l.strip()]:
    p.add_font(f.split('/')[-1], open(f, 'rb').read())
t = time.time(); r = p.run(); ev = r['evaluation']
print('sec', round(time.time() - t), ev['method'], ev['pairs'])
for k in ('default', 'settings', 'model'):
    m = ev[k]; print(k, round(m['mae'], 1), f"{m['within']:.0%}", m['over'], round(m['bias'], 1))
print('settings', r['model']['settings'], {k: round(v, 1) for k, v in r['model']['kindOffsets'].items()})
for k, f in ev['byFont'].items(): print(k, p.fonts[int(k[1:]) - 1]['file'], round(f['default']['mae'], 1), round(f['model']['mae'], 1), f"{f['model']['within']:.0%}")
print('curve', [(c['fonts'], round(c['mae'], 1)) for c in ev['curve']])
g = r['grouping']; print('grouping', g.get('pairs'), g.get('best'), g.get('params'))
default_row = [x for x in g['table'] if x['strength'] == 0 and x['scale'] == 1]
print('grouping at web default', default_row)
json.dump(dict(evaluation={k: v for k, v in ev.items() if k != 'worst'}, settings=r['model']['settings'], kindOffsets=r['model']['kindOffsets'], grouping=g), open('lofo.json', 'w'), default=float, indent=1)
