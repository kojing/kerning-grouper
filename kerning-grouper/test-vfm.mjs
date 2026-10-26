// FontLab VFM export: structure, glyph names (own names and FontLab's code-point names), reference VFM handling.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import opentype from 'opentype.js';
import {createEngine} from './src/engine.js';
import {defaults} from './src/core.js';
import {generateKerning,resolveKerning,kernDefaults} from './src/kerning.js';
import {fontlabName} from './src/fontlab-names.js';
import {glyphNamer,buildVfm,parseVfm,defaultMaster,hasOwnNames} from './src/vfm.js';

// FontLab's names for glyphs without names of their own (checked against a real FontLab export of a CID font).
assert.equal(fontlabName(0x41),'A');assert.equal(fontlabName(0x3B6),'zeta');assert.equal(fontlabName(0x201D),'quotedblright');
assert.equal(fontlabName(0xB2),'twosuperior');assert.equal(fontlabName(0xB5),'uni00B5');assert.equal(fontlabName(0x2500),'uni2500');assert.equal(fontlabName(0xFB01),'fi');
assert.equal(fontlabName(0x3042),'uni3042');assert.equal(fontlabName(0x20B9F),'u20B9F');assert.equal(fontlabName(0),'uni0000');

const bytes=fs.readFileSync('samples/KGJapaneseTest-Regular.ttf');const font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const glyphs=[...'AVToaのカ、「」'].map(ch=>{const g=font.charToGlyph(ch);return{id:g.index,name:g.name,unicodes:g.unicodes,advance:g.advanceWidth,commands:g.path.commands,bounds:g.getBoundingBox()};});
const result=await createEngine()({glyphs,upm:font.unitsPerEm,fontKey:'vfm',params:defaults,fixed:{left:[],right:[]}},()=>{},()=>false);
const settings={...kernDefaults,references:'HH OO のの カカ'.split(' ').filter(t=>[...t].every(c=>font.charToGlyph(c).index)).join(' ')||'AA'};
const raw=await generateKerning({...result,settings}),res=resolveKerning(raw,settings);
const upm=font.unitsPerEm,id=ch=>font.charToGlyph(ch).index;

// Without a reference: dataType, one master, pairs in font units as strings, zeros left out.
const own=hasOwnNames(font),n=glyphNamer(font),master=defaultMaster(font);
const out=buildVfm({pairs:res.pairs,upm,name:n.name,master});const v=JSON.parse(out.text);
assert.deepEqual(Object.keys(v),['dataType','masters','upm']);assert.equal(v.dataType,'com.fontlab.metrics');assert.equal(v.upm,upm);assert.deepEqual(Object.keys(v.masters),[master]);
const pairs=v.masters[master].pairs;let count=0;
for(const p of res.pairs){const fu=Math.round(p.value*upm/1000),a=n.name(p.a),b=n.name(p.b);if(fu){assert.equal(pairs[a][b],String(fu));count++;}else assert.ok(!pairs[a]||pairs[a][b]===undefined,'zero pairs are left out');}
assert.equal(out.count,count);assert.ok(count>0);
assert.deepEqual(Object.keys(pairs),[...Object.keys(pairs)].sort(),'first glyphs sorted');assert.ok(out.text.startsWith('{\n    "dataType"'),'4-space JSON like FontLab');
if(own)assert.equal(n.name(id('A')),font.charToGlyph('A').name);

// A CID-keyed font (no glyph names): names come from the lowest code point.
const cid={tables:{cff:{topDict:{ros:['Adobe','Japan1',6]}}},names:{typographicSubfamily:{en:'M'}},glyphs:{get:i=>({name:'gid'+i,unicodes:i===1?[0xA0,0x20]:i===2?[0x3042]:[],advanceWidth:500,getBoundingBox:()=>({x1:0,x2:400,y1:0,y2:700})})}};
assert.equal(hasOwnNames(cid),false);assert.equal(defaultMaster(cid),'M');const cn=glyphNamer(cid);assert.equal(cn.name(1),'space');assert.equal(cn.name(2),'uni3042');

// With a reference VFM: its master and metrics are kept, only that master's pairs are replaced; unknown names are matched by metrics.
const ref=parseVfm(JSON.stringify({dataType:'com.fontlab.metrics',masters:{Bold:{pairs:{X:{Y:'-5'}},extra:1},Light:{pairs:{X:{Y:'-9'}}}},metrics:{space:{layers:{Bold:{width:500}}},renamed:{layers:{Bold:{lsb:0,rsb:100,width:500,xmin:0,xmax:400,ymin:0,ymax:700}}}},upm:1000}));
assert.deepEqual(ref.masters,['Bold','Light']);
const rn=glyphNamer(cid,ref,'Bold');assert.equal(rn.name(1),'space');assert.equal(rn.name(2),'renamed','matched by width and bounds');
const ro=JSON.parse(buildVfm({pairs:[{a:1,b:2,value:-40}],upm:1000,name:rn.name,master:'Bold',reference:ref}).text);
assert.deepEqual(ro.masters.Bold,{pairs:{space:{renamed:'-40'}},extra:1});assert.deepEqual(ro.masters.Light.pairs,{X:{Y:'-9'}});assert.ok(ro.metrics.renamed);
assert.throws(()=>parseVfm('{"dataType":"x"}'));assert.throws(()=>parseVfm('nope'));
console.log('VFM tests passed',JSON.stringify({ownNames:own,master,pairs:out.count}));

// ---- reading a .vfm back: pairs, inferred groups, explicit classes (accepted shapes), kept values, fixed absorb ----
{const {readVfm,groupKey}=await import('./src/vfm.js');const {resolveKerning}=await import('./src/kerning.js');const {cluster}=await import('./src/core.js');
 // flattened pairs: A/À kern identically → one first-side group; O/Ó identically as seconds
 const mk=(names)=>({tables:{cff:{topDict:{}}},glyphs:{length:names.length,get:i=>({name:names[i],unicodes:[],advanceWidth:500,getBoundingBox:()=>({x1:0,x2:400,y1:0,y2:700})})}});
 const f=mk(['A','Agrave','O','Oacute','V','T']);
 const flat=parseVfm(JSON.stringify({dataType:'com.fontlab.metrics',masters:{M:{pairs:{A:{O:'-20',Oacute:'-20',V:'-60'},Agrave:{O:'-20',Oacute:'-20',V:'-60'},T:{O:'-50',Oacute:'-50'},missing:{O:'-5'}}}},upm:1000}));
 const r=readVfm(flat,'M',f);assert.equal(r.source,'inferred');assert.equal(r.pairs.get('0:2'),-20);assert.equal(r.pairs.size,8);assert.deepEqual(r.unmapped,['missing']);
 assert.ok(r.groups.right.some(g=>groupKey(g)==='0,1'),'A and Agrave share a first-side group');assert.ok(r.groups.left.some(g=>groupKey(g)==='2,3'),'O and Oacute share a second-side group');
 // explicit classes (one of the accepted shapes): class pair + glyph exception
 const cls=parseVfm(JSON.stringify({dataType:'com.fontlab.metrics',masters:{M:{pairs:{'@A':{'@O':'-30'},A:{O:'-10'}},kerningClasses:[{name:'A',names:['A','Agrave'],'1st':true},{name:'O',names:['O','Oacute'],'2nd':true}]}},upm:2000}));
 const rc=readVfm(cls,'M',f);assert.equal(rc.source,'classes');assert.equal(rc.pairs.get('1:3'),-15,'class value, converted to 1000 UPM');assert.equal(rc.pairs.get('0:2'),-5,'glyph exception wins');assert.deepEqual(rc.groups.right,[[0,1],[2],[3]],'kerned glyphs never on the first side stay alone there (the .vfm leaves them at 0)');assert.deepEqual(rc.groups.left,[[2,3],[0],[1]]);
 // classes written out glyph by glyph, with one exception inside the class: still one class
 {const {inferGroups}=await import('./src/vfm.js');const rows=new Map(),cols=new Map(),put=(a,b,v)=>{(rows.get(a)||rows.set(a,new Map()).get(a)).set(b,v);(cols.get(b)||cols.set(b,new Map()).get(b)).set(a,v);};
  for(const a of [0,1,2])for(let b=10;b<20;b++)put(a,b,-b*5);put(1,19,-60);for(let b=10;b<20;b++)put(3,b,-10);
  const g=inferGroups(rows,cols);assert.ok(g.right.some(x=>groupKey(x)==='0,1,2'),'an exception cell does not split the class');assert.ok(g.right.some(x=>groupKey(x)==='3'));}
 // FontLab names of unencoded glyphs: "_<CID>" and "<base>.<feature>" (GSUB), checked against the metrics in the .vfm
 {const {nameIndex}=await import('./src/vfm.js');const gl=[{u:[],w:1000},{u:[65],w:600},{u:[],w:620},{u:[],w:900}];
  const font={tables:{cff:{topDict:{ros:['Adobe','Japan1',6]}},gsub:{features:[{tag:'ital',feature:{lookupListIndexes:[0]}}],lookups:[{lookupType:1,subtables:[{substFormat:2,coverage:{format:1,glyphs:[1]},substitute:[2]}]}]}},kgCids:Uint32Array.from([0,34,9354,9402]),
   glyphs:{length:4,get:i=>({name:'',unicodes:gl[i].u,advanceWidth:gl[i].w,getBoundingBox:()=>({x1:0,x2:gl[i].w-50,y1:0,y2:700})})}};
  const L=w=>({layers:{M:{width:w,xmin:0,xmax:w-50,ymin:0,ymax:700}}});const ref=parseVfm(JSON.stringify({dataType:'com.fontlab.metrics',masters:{M:{pairs:{}}},metrics:{A:L(600),'A.ital':L(620),_9402:L(900),'A.vrt2':L(600)},upm:1000}));
  const look=nameIndex(font,ref,'M');assert.equal(look('A'),1);assert.equal(look('A.ital'),2,'A.ital = A through the ital feature');assert.equal(look('_9402'),3,'_9402 = CID 9402');assert.equal(look('A.vrt2'),1,'no such substitution: falls back to the metrics (unique match)');}
 // kept values: no threshold, no collision raise; manual still wins
 const raw2={pairs:[{a:0,b:2,c1:0,c2:0,ideal:-80,safe:-5,protected:false,confidence:true,opticalBefore:[null],opticalTarget:[null]},{a:1,b:2,c1:0,c2:0,ideal:-80,safe:-5,protected:false,confidence:true,opticalBefore:[null],opticalTarget:[null]}]};
 const kr=resolveKerning(raw2,kernDefaults,{},{},{classes:{'0:0':-3},pairs:{'1:2':-40}});assert.equal(kr.map['0:2'],-3);assert.equal(kr.map['1:2'],-40);assert.equal(kr.pairs[1].reason,'vfm');
 const km=resolveKerning(raw2,kernDefaults,{},{'0:2':-2},{classes:{'0:0':-3},pairs:{}});assert.equal(km.map['0:2'],-2,'manual wins over kept');
 // fixed groups absorb unfixed look-alikes but never merge with each other
 const prof=[1,1,1].map(()=>({right:[10,10,10],left:[10,10,10]}));const items=[0,1,2,3].map(id=>({id,unicodes:[65],profile:{right:[10,10,10,10],left:[10,10,10,10]}}));
 const p0={...defaults,step:6};const plain=await cluster(items,'right',p0,{fixed:[[0],[1]]});assert.equal(plain.length,3,'without absorb: two locked groups + the rest');
 const abs=await cluster(items,'right',{...p0,absorbFixed:true},{fixed:[[0],[1]]});assert.equal(abs.length,2,'with absorb the identical glyphs join a fixed group');assert.ok(abs.every(g=>!(g.includes(0)&&g.includes(1))),'fixed groups stay apart');}
console.log('VFM read tests passed');
