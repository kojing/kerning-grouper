// Runs the Web tool's own engine on a font: default grouping + default kerning (and per-glyph classes).
import fs from 'node:fs';
const root='/home/claude/kg/kerning-grouper';
const opentype=(await import(root+'/node_modules/opentype.js/dist/opentype.module.js')).default;
const {createEngine}=await import(root+'/src/engine.js');
const {defaults}=await import(root+'/src/core.js');
const {generateKerning,resolveKerning,kernDefaults}=await import(root+'/src/kerning.js');
const {glyphJaClass,PUNCT}=await import(root+'/src/jlreq.js');
const [fontPath,chars,extraJson,out]=process.argv.slice(2);
const extra=JSON.parse(extraJson||'{}');
const bytes=fs.readFileSync(fontPath);
const font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const seen=new Set(),glyphs=[];
for(const ch of chars){if(/\s/.test(ch))continue;const g=font.charToGlyph(ch);if(!g||g.index===0||seen.has(g.index))continue;seen.add(g.index);glyphs.push({id:g.index,name:g.name,unicodes:g.unicodes,advance:g.advanceWidth,commands:g.path.commands,bounds:g.getBoundingBox()});}
const sig=Object.fromEntries(glyphs.map(g=>{const c=glyphJaClass(g,g.advance*1000/font.unitsPerEm);return[g.id,PUNCT.includes(c)?'|'+c:''];}));
const hasP=Object.values(sig).some(Boolean);
const t0=Date.now();
const grouped=await createEngine()({glyphs,upm:font.unitsPerEm,fontKey:fontPath,params:{...defaults,...(extra.group||{}),separation:hasP?{right:sig,left:sig}:null},fixed:{left:[],right:[]}},()=>{},()=>false);
const settings={...kernDefaults,...(extra.kern||{})};
const raw=await generateKerning({...grouped,settings});
const res=resolveKerning(raw,settings);
const single={...grouped,groups:{right:grouped.items.map(g=>[g.id]),left:grouped.items.map(g=>[g.id])}};
const raw1=await generateKerning({...single,settings});
const res1=resolveKerning(raw1,settings);
const pairs=raw.pairs.map(p=>{const k=p.a+':'+p.b;return[p.a,p.b,res.map[k]??0,res1.map[k]??0,Math.round(p.ideal)];});
fs.writeFileSync(out,JSON.stringify({font:fontPath,glyphs:glyphs.length,groups:{right:grouped.groups.right.length,left:grouped.groups.left.length},classPairs:res.classes.filter(c=>c.value).length,exceptions:res.exceptions.length,seconds:(Date.now()-t0)/1000,pairs}));
console.log(fontPath.split('/').pop(),glyphs.length,'glyphs',grouped.groups.right.length,'x',grouped.groups.left.length,'groups',(Date.now()-t0)/1000+'s');
