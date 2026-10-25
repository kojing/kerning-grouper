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
