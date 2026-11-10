// Computes reference values with the JavaScript core, for tests/test_parity.py.
import fs from 'node:fs';
const root=process.argv[2],fontPath=process.argv[3],chars=process.argv[4],refs=process.argv[5],extra=JSON.parse(process.argv[6]||'{}');
const opentype=(await import(root+'/node_modules/opentype.js/dist/opentype.module.js').catch(()=>import(root+'/node_modules/opentype.js/src/opentype.js'))).default;
const {flatten}=await import(root+'/src/core.js');const {generateKerning,kernDefaults,fontMetrics}=await import(root+'/src/kerning.js');
const bytes=fs.readFileSync(fontPath);const font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));const upm=font.unitsPerEm;
const items=[...new Set(chars)].map(ch=>{const g=font.charToGlyph(ch);return{id:g.index,name:g.name,unicodes:g.unicodes,advance:g.advanceWidth*1000/upm,segments:flatten(g.path.commands,1000/upm,.35)};});
const seg=ch=>{const g=font.charToGlyph(ch);return g&&g.index?flatten(g.path.commands,1000/upm,.35):null;};const os2=font.tables.os2||{};const metrics=fontMetrics(seg('H'),seg('x'),(os2.sCapHeight||0)*1000/upm,(os2.sxHeight||0)*1000/upm);
const groups={right:items.map(g=>[g.id]),left:items.map(g=>[g.id])};
const raw=await generateKerning({items,groups,metrics,settings:{...kernDefaults,unifyScripts:false,jaStrength:100,...extra,references:refs}});
console.log(JSON.stringify({segments:Object.fromEntries(items.map(g=>[g.id,g.segments.length])),metrics,pairs:raw.pairs.map(p=>({a:p.a,b:p.b,ideal:p.ideal,learned:p.learned,toolValue:p.toolValue,priority:p.priority,safe:p.safe,gap:p.gap,before:p.opticalBefore,target:p.opticalTarget}))}));
