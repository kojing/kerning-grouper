import json, sys, itertools, collections
def truth(sets, present):
    sig = collections.defaultdict(list)
    for i, s in enumerate(sets):
        for g in s:
            if g in present: sig[g].append(i)
    by = collections.defaultdict(list)
    for g, s in sig.items(): by[tuple(s)].append(g)
    for g in present:
        if g not in sig: by[('solo', g)].append(g)
    return list(by.values())
def pairs_of(groups):
    out = set()
    for g in groups:
        for a, b in itertools.combinations(sorted(g), 2): out.add((a, b))
    return out
def f1(pred, true):
    P, T = pairs_of(pred), pairs_of(true)
    tp = len(P & T); p = tp / len(P) if P else 1; r = tp / len(T) if T else 1
    return p, r, 2 * p * r / (p + r) if p + r else 0
def exact(rows):
    by = collections.defaultdict(list)
    for g, r in rows.items(): by[tuple(sorted(r.items()))].append(g)
    return list(by.values())
def compress(rows, colgroups):
    """row → {colgroup index: most common value over the group's members (0 when absent)}"""
    gi = {c: i for i, g in enumerate(colgroups) for c in g}
    out = {}
    for g, r in rows.items():
        acc = collections.defaultdict(collections.Counter)
        for c, v in r.items(): acc[gi[c]][v] += 1
        vec = {}
        for i, cnt in acc.items():
            n = len(colgroups[i]); zero = n - sum(cnt.values())
            v, k = cnt.most_common(1)[0]
            if k >= zero: vec[i] = v
        out[g] = vec
    return out
def tolerant(rows, cols, iters=3, tol=0, minlen=4, frac=0.1):
    R, C = exact(rows), exact(cols)
    for _ in range(iters):
        R = merge(compress(rows, C), tol, minlen, frac)
        C = merge(compress(cols, R), tol, minlen, frac)
    return R, C
def diff(a, b):
    return sum(1 for k in set(a) | set(b) if a.get(k) != b.get(k))
def merge(vecs, tol, minlen, frac):
    by = collections.defaultdict(list)
    for g, v in vecs.items(): by[tuple(sorted(v.items()))].append(g)
    groups = [(dict(k), m) for k, m in by.items()]
    if not tol: return [m for _, m in groups]
    groups.sort(key=lambda x: -len(x[1]))
    out = []
    for v, m in groups:
        for o in out:
            ov = o[0]; n = max(len(v), len(ov))
            if n >= minlen and diff(v, ov) <= min(tol, frac * n):
                o[1].extend(m); break
        else: out.append((v, list(m)))
    return [m for _, m in out]
if __name__ == '__main__':
    tol = int(sys.argv[1]); frac = float(sys.argv[2]); minlen = int(sys.argv[3]); iters = int(sys.argv[4])
    res = []
    for i in range(20):
        d = json.load(open(f'f{i}.json'))
        rows, cols = collections.defaultdict(dict), collections.defaultdict(dict)
        for a, b, v in d['pairs']: rows[a][b] = v; cols[b][a] = v
        if iters == 0: R, C = exact(rows), exact(cols)
        else: R, C = tolerant(rows, cols, iters, tol, minlen, frac)
        fr = f1(R, truth(d['first'], set(rows))); fc = f1(C, truth(d['second'], set(cols)))
        res.append((fr, fc))
        print(i, 'R p%.3f r%.3f f%.3f' % fr, 'L p%.3f r%.3f f%.3f' % fc, flush=True)
    import statistics as st
    print('mean F1 R %.3f L %.3f  P %.3f/%.3f R %.3f/%.3f' % (st.mean(x[0][2] for x in res), st.mean(x[1][2] for x in res), st.mean(x[0][0] for x in res), st.mean(x[1][0] for x in res), st.mean(x[0][1] for x in res), st.mean(x[1][1] for x in res)))
