// .vfm with FontLab kerning classes: written from the export classes, read back, every glyph pair as resolved.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import opentype from 'opentype.js';
import {createEngine} from './src/engine.js';
import {defaults} from './src/core.js';
import {generateKerning,resolveKerning,kernDefaults,mergeClasses,exportClasses} from './src/kerning.js';
import {glyphNamer,buildVfm,parseVfm,readVfm} from './src/vfm.js';
const bytes=fs.readFileSync('samples/KGJapaneseTest-Regular.ttf');const font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const glyphs=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,'].map(ch=>{const g=font.charToGlyph(ch);return{id:g.index,name:g.name,unicodes:g.unicodes,advance:g.advanceWidth,commands:g.path.commands,bounds:g.getBoundingBox()};});
const r=await createEngine()({glyphs,upm:font.unitsPerEm,fontKey:'vc',params:{...defaults,convention:true},fixed:{left:[],right:[]}},()=>{},()=>false);
const st={...kernDefaults,merge:10};const raw=await generateKerning({...r,settings:st});const pre=resolveKerning(raw,st);const m=mergeClasses(pre,{tolerance:10});const res=resolveKerning(raw,st,{},{},null,m);res.merge=m;
const lo=id=>Math.min(...(font.glyphs.get(id).unicodes||[1e9]));const cl=exportClasses(res,r.groups,lo);assert.ok(cl.first.some(g=>g.length>1)&&cl.second.some(g=>g.length>1),'there are classes');
const {classKind}=await import('./src/unicode-rules.js');const n=glyphNamer(font),out=buildVfm({pairs:res.pairs,upm:font.unitsPerEm,name:n.name,master:'Regular',targets:r.items.map(g=>g.id),classes:cl,className:kernDefaults.className,kindOf:ids=>classKind(ids.map(lo))}),v=JSON.parse(out.text);
assert.ok(v.masters.Regular.kerningClasses.every(c=>/^(UC|lc|Punct|UC-lc|lc-Punct|UC-Punct|Let|Mix)_[A-Za-z]+_(1st|2nd|both)$/.test(c.name)),'kind_lead_side: '+v.masters.Regular.kerningClasses.map(c=>c.name).join(' '));
// the shape FontLab writes
const M=v.masters.Regular;assert.deepEqual(Object.keys(M),['kerningClasses','pairs']);assert.ok(M.kerningClasses.every(c=>typeof c.name==='string'&&Array.isArray(c.names)&&c.names.length>1&&(c['1st']===true||c['2nd']===true)));
assert.ok(Object.keys(M.pairs).some(a=>a.startsWith('@'))&&Object.values(M.pairs).some(row=>Object.keys(row).some(b=>b.startsWith('@'))),'class pairs written as @name');
assert.equal(new Set(M.kerningClasses.map(c=>c.name)).size,M.kerningClasses.length,'class names are unique');
assert.ok(M.kerningClasses.some(c=>c.names[0]==='A'||c.names[0]==='H'||c.names[0]==='O'),'a class is led by its base letter');
// class names follow the template
{const t=JSON.parse(buildVfm({pairs:res.pairs,upm:font.unitsPerEm,name:n.name,master:'Regular',targets:r.items.map(g=>g.id),classes:cl,className:'KG {side} {n}'}).text).masters.Regular.kerningClasses;
 assert.ok(t.every(c=>/^KG_(1st|2nd|both)_\d+$/.test(c.name)),'template used, spaces → _: '+t.map(c=>c.name).join(' '));assert.equal(new Set(t.map(c=>c.name)).size,t.length);}
// read back: classes, and every glyph pair (0 included) exactly as resolved
const back=readVfm(parseVfm(out.text),'Regular',font);assert.equal(back.source,'classes');
let checked=0;for(const p of res.pairs){const got=back.pairs.get(p.a+':'+p.b)??0;assert.equal(Math.round(got),Math.round(p.value),'pair '+p.a+':'+p.b);checked++;}
assert.ok(out.exceptionPairs>=0&&out.classPairs>0);
// the FontLab sample shape (classes on both sides, class × glyph exception) is read with FontLab's priority
{const f={tables:{cff:{topDict:{}}},glyphs:{length:6,get:i=>({name:['A','B','C','O','Q','H'][i],unicodes:[],advanceWidth:500,getBoundingBox:()=>({x1:0,x2:400,y1:0,y2:700})})}};
 const x=parseVfm(JSON.stringify({dataType:'com.fontlab.metrics',masters:{Regular:{kerningClasses:[{'1st':true,name:'A1',names:['B','C']},{'2nd':true,name:'Q',names:['O','Q']},{'1st':true,'2nd':true,name:'k',names:['A','H']}],pairs:{'@A1':{'@Q':'-81','O':'-20','@k':'-5'},'B':{'@Q':'-30','O':'7'},'O':{'H':'57'}}}},upm:1000}));
 const rr=readVfm(x,'Regular',f),g=(a,b)=>rr.pairs.get(a+':'+b);assert.equal(g(2,4),-81,'class × class');assert.equal(g(2,3),-20,'class × glyph wins over class × class');assert.equal(g(1,4),-30,'glyph × class');assert.equal(g(1,3),7,'glyph × glyph wins');assert.equal(g(3,5),57);assert.equal(g(1,0),-5,'a class with both flags works as a second class');
 assert.ok(rr.groups.right.some(z=>z.join()==='1,2')&&rr.groups.right.some(z=>z.join()==='0,5')&&rr.groups.left.some(z=>z.join()==='3,4')&&rr.groups.left.some(z=>z.join()==='0,5'),'1st / 2nd / both');}
console.log('VFM class tests passed',JSON.stringify({classes:out.classCount,classPairs:out.classPairs,exceptions:out.exceptionPairs,checked}));
