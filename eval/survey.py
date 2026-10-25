import sys, glob, os
sys.path.insert(0, '/home/claude/kg/kg-trainer')
from kg_trainer.fontio import FontData
from kg_trainer.project import PRESETS
fonts = sys.argv[1:]
for p in fonts:
    fd = FontData(p)
    k = fd.kerning()
    def cnt(chars):
        ids = [fd.cmap[ord(c)] for c in chars if ord(c) in fd.cmap]
        s = set(ids)
        nz = sum(1 for (a, b), v in k.items() if a in s and b in s and v)
        return len(ids), nz
    print(f"{os.path.basename(p):38s} upm{fd.upm:5d} var={int(fd.is_variable)} pairs={len(k):7d} latin={cnt(PRESETS['latin'])} kana={cnt(PRESETS['kana'])} skipped={sorted(set(fd.skipped))[:3]}")
