"""Build a test font with known kerning (class pairs, glyph exceptions, extension lookup, palt)."""
import io
from fontTools.ttLib import TTFont
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString

FEA = '''
@L1 = [uni306E uni30AB];
@R1 = [uni306E uni30ED];
lookup KERN1 useExtension {
  pos uni306E uni306D -77;
  pos @L1 @R1 -40;
  pos H O -30;
} KERN1;
lookup KERN2 { pos A V -80; } KERN2;
feature kern { lookup KERN1; lookup KERN2; } kern;
feature palt { pos uni306E <-60 0 -120 0>; } palt;
'''


def build(src, scale=1):
    f = TTFont(src)
    for t in ('GPOS', 'kern'):
        if t in f:
            del f[t]
    addOpenTypeFeaturesFromString(f, FEA)
    out = io.BytesIO()
    f.save(out)
    return out.getvalue()
