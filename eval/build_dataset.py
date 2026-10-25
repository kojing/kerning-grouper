"""Per-pair dataset for the 12 Latin fonts: tool features, v0.5.1 value, pro value, height-zone gap profile."""
import sys, os, json, numpy as np
from multiprocessing import Pool
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer.fontio import FontData
from kg_trainer import core, pipeline
LAT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
HS = np.round(np.arange(-0.3, 1.31, 0.05), 3)   # heights as a fraction of cap height
def nm(f): return os.path.basename(f)[:-4].replace('[', '').replace(']', '').replace(',', '')
def one(f):
    fname = nm(f)
    fd = FontData(f); k = 1000 / fd.upm; kern = fd.kerning()
    items, _ = pipeline.build_items(fd, LAT)
    s = dict(core.KERN_DEFAULTS)
    prepared, ys = core.prepare(items, s['minimum'])
    targets, refs, _ = core.targets_from_references(prepared, s['references'], s['spacing'])
    by = {chr(g['unicodes'][0]): g for g in items}
    cap = by['H']['y2']; xh = by['x']['y2']
    ys = np.array(ys)
    idx = [int(np.argmin(np.abs(ys - h * cap))) for h in HS]
    # reference gap profile: median over reference pairs of right(A)+left(B) at each height
    rows = []
    for ga in items:
        a = prepared[ga['id']]
        for gb in items:
            b = prepared[gb['id']]
            ft = core.pair_features(a, b, targets)
            ours = core.ideal_value(ft, s)
            gap = [(a['right'][i] + b['left'][i]) if a['right'][i] is not None and b['left'][i] is not None else None for i in idx]
            ra = [a['right'][i] for i in idx]; lb = [b['left'][i] for i in idx]
            rows.append(dict(font=fname, a=chr(ga['unicodes'][0]), b=chr(gb['unicodes'][0]), kind=ft['kind'], pro=kern.get((ga['id'], gb['id']), 0) * k,
                             ours=ours, optical=ft['optical'], mechanical=ft['mechanical'], per=ft['per_scale'], safe=ft['safe'], fgap=ft['gap'],
                             banded=core.banded_value(ft, dict(optical=60, keepSpacing=True)), tgap=targets[ft['kind']]['gap'],
                             gap=gap, ra=ra, lb=lb, cap=cap, xh=xh, advA=ga['advance'], advB=gb['advance']))
    return rows
if __name__ == '__main__':
    f = sys.argv[1]
    os.makedirs('ds', exist_ok=True)
    json.dump(one(f), open(f'ds/{nm(f)}.json', 'w'))
    print('done', nm(f))
