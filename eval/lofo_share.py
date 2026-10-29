import sys, glob, numpy as np
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer import priority as pr
files=sorted(glob.glob('prio/*.npz'));D=[np.load(f) for f in files];names=[f.split('/')[-1][:-4] for f in files]
def prf(pred,y):
    tp=(pred&y).sum();p=tp/max(1,pred.sum());r=tp/max(1,y.sum());return 2*p*r/max(1e-9,p+r)
res={k:[] for k in ['p30','s10','s15','s20','tool']}
for i in range(len(D)):
    Xtr=np.vstack([d['X'] for j,d in enumerate(D) if j!=i]);ytr=np.concatenate([np.abs(d['y'])>=10 for j,d in enumerate(D) if j!=i])
    p=pr.fit(Xtr,ytr).predict_proba(D[i]['X'])[:,1];y=np.abs(D[i]['y'])>=10;x0=np.abs(D[i]['X'][:,0])>=20
    res['p30'].append(prf(p>=.3,y));res['tool'].append(prf(x0,y))
    for s in (10,15,20):res[f's{s}'].append(prf(p>=np.quantile(p,1-s/100),y))
    print(names[i][:20].ljust(20),' '.join(f'{k} {v[-1]:.2f}' for k,v in res.items()),f'pro {y.mean()*100:.0f}%',flush=True)
print('MEAN',' '.join(f'{k} {np.mean(v):.3f}' for k,v in res.items()))
