"""Read glyphs and professional kerning from OTF/TTF with fontTools.

What is read: outlines, advances, cmap, the GPOS 'kern' feature (pair adjustment format 1 and 2,
also inside extension lookups), the legacy 'kern' table when GPOS has no kerning, 'palt'
(single adjustment), and the class definitions of class-based pair subtables.
Values are returned in font units; callers normalize to 1000 UPM.
"""
import hashlib
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen


class CommandPen(BasePen):
    """Collects the same command list opentype.js produces (M L C Q Z)."""

    def __init__(self, glyphset):
        super().__init__(glyphset)
        self.commands = []

    def _moveTo(self, p):
        self.commands.append(('M', p[0], p[1]))

    def _lineTo(self, p):
        self.commands.append(('L', p[0], p[1]))

    def _curveToOne(self, p1, p2, p3):
        self.commands.append(('C', p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]))

    def _qCurveToOne(self, p1, p2):
        self.commands.append(('Q', p1[0], p1[1], p2[0], p2[1]))

    def _closePath(self):
        self.commands.append(('Z',))

    def _endPath(self):
        pass


class FontData:
    def __init__(self, path, data=None, name=None):
        if data is None:
            with open(path, 'rb') as fh:
                data = fh.read()
        raw = data
        self.sha1 = hashlib.sha1(raw).hexdigest()
        import io
        self.font = TTFont(io.BytesIO(raw), lazy=False)
        self.name = name or path
        self.upm = self.font['head'].unitsPerEm
        self.glyph_order = self.font.getGlyphOrder()
        self.gid = {n: i for i, n in enumerate(self.glyph_order)}
        cmap = self.font.getBestCmap() or {}
        self.cmap = {u: self.gid[n] for u, n in cmap.items() if n in self.gid}
        self.unicodes = {}
        for u in sorted(self.cmap):
            self.unicodes.setdefault(self.cmap[u], []).append(u)
        self.glyphset = self.font.getGlyphSet()
        self.hmtx = self.font['hmtx'].metrics
        n = self.font['name']
        fam = n.getDebugName(4) or n.getDebugName(1) or name
        self.family = fam
        self.is_variable = 'fvar' in self.font
        self.skipped = []
        self._kern = None
        self._classes = None
        self._palt = None
        self.kern_covered = set()

    def glyph(self, gid):
        gname = self.glyph_order[gid]
        pen = CommandPen(self.glyphset)
        self.glyphset[gname].draw(pen)
        bp = BoundsPen(self.glyphset)
        self.glyphset[gname].draw(bp)
        b = bp.bounds or (0, 0, 0, 0)
        return dict(id=gid, name=gname, unicodes=self.unicodes.get(gid, []), advance=self.hmtx[gname][0],
                    commands=pen.commands, y1=b[1], y2=b[3])

    # ---- GPOS helpers ----
    def _lookups(self, tag):
        if 'GPOS' not in self.font:
            return []
        gpos = self.font['GPOS'].table
        if not gpos.FeatureList or not gpos.LookupList:
            return []
        idx = set()
        for rec in gpos.FeatureList.FeatureRecord:
            if rec.FeatureTag == tag:
                idx.update(rec.Feature.LookupListIndex)
        return [(i, gpos.LookupList.Lookup[i]) for i in sorted(idx)]

    @staticmethod
    def _subtables(lookup):
        for st in lookup.SubTable:
            t = lookup.LookupType
            if t == 9:
                t = st.ExtensionLookupType
                st = st.ExtSubTable
            yield t, st

    def kerning(self):
        """{(first_gid, second_gid): xAdvance} as a shaper would apply it (lookups add, first matching subtable wins)."""
        if self._kern is not None:
            return self._kern
        total = {}
        found = False
        for li, lookup in self._lookups('kern'):
            seen = set()
            for t, st in self._subtables(lookup):
                if t != 2:
                    self.skipped.append(f'lookup {li}: type {t}')
                    continue
                found = True
                cov = [self.gid[g] for g in st.Coverage.glyphs]
                if st.Format == 1:
                    for fi, first in enumerate(cov):
                        for rec in st.PairSet[fi].PairValueRecord:
                            key = (first, self.gid[rec.SecondGlyph])
                            if key in seen:
                                continue
                            seen.add(key)
                            v = getattr(rec.Value1, 'XAdvance', 0) if rec.Value1 else 0
                            total[key] = total.get(key, 0) + (v or 0)
                elif st.Format == 2:
                    c1 = st.ClassDef1.classDefs if st.ClassDef1 else {}
                    c2 = st.ClassDef2.classDefs if st.ClassDef2 else {}
                    by2 = {}
                    for g, c in c2.items():
                        by2.setdefault(c, []).append(self.gid[g])
                    all2 = set(range(len(self.glyph_order)))
                    in2 = set(self.gid[g] for g in c2)
                    by2[0] = list(all2 - in2)
                    for first in cov:
                        k1 = c1.get(self.glyph_order[first], 0)
                        row = st.Class1Record[k1].Class2Record
                        for k2, rec in enumerate(row):
                            v = getattr(rec.Value1, 'XAdvance', 0) if rec.Value1 else 0
                            for second in by2.get(k2, []):
                                key = (first, second)
                                if key in seen:
                                    continue
                                seen.add(key)
                                total[key] = total.get(key, 0) + (v or 0)
        if not found and 'kern' in self.font:
            for sub in self.font['kern'].kernTables:
                if getattr(sub, 'format', 0) != 0:
                    continue
                for (a, b), v in sub.kernTable.items():
                    if a in self.gid and b in self.gid:
                        key = (self.gid[a], self.gid[b])
                        total[key] = total.get(key, 0) + v
        self._kern = {k: v for k, v in total.items() if v}
        self.kern_covered = set(total) | set(self._kern)
        return self._kern

    def kern_classes(self):
        """Class definitions of class-based subtables: {'first': [[gid..]..], 'second': [[gid..]..]}."""
        if self._classes is not None:
            return self._classes
        first, second = [], []
        for li, lookup in self._lookups('kern'):
            for t, st in self._subtables(lookup):
                if t != 2 or st.Format != 2:
                    continue
                cov = set(self.gid[g] for g in st.Coverage.glyphs)
                g1 = {}
                for g, c in (st.ClassDef1.classDefs if st.ClassDef1 else {}).items():
                    if self.gid[g] in cov:
                        g1.setdefault(c, []).append(self.gid[g])
                rest = cov - set(x for v in g1.values() for x in v)
                if rest:
                    g1.setdefault(0, []).extend(rest)
                first.extend(sorted(v) for v in g1.values())
                g2 = {}
                for g, c in (st.ClassDef2.classDefs if st.ClassDef2 else {}).items():
                    g2.setdefault(c, []).append(self.gid[g])
                second.extend(sorted(v) for c, v in g2.items() if c)
        self._classes = dict(first=first, second=second)
        return self._classes

    def palt(self):
        """{gid: (xPlacement, xAdvance)} from the 'palt' feature."""
        if self._palt is not None:
            return self._palt
        out = {}
        for li, lookup in self._lookups('palt'):
            for t, st in self._subtables(lookup):
                if t != 1:
                    continue
                cov = [self.gid[g] for g in st.Coverage.glyphs]
                for i, g in enumerate(cov):
                    v = st.Value if st.Format == 1 else st.Value[i]
                    if g not in out:
                        out[g] = (getattr(v, 'XPlacement', 0) or 0, getattr(v, 'XAdvance', 0) or 0)
        self._palt = out
        return out
