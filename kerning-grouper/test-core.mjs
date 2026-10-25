import assert from 'node:assert/strict';
import {flatten,scanline,profile,compare,cluster,defaults,estimate} from './src/core.js';
import {createEngine} from './src/engine.js';
import {rulesOf} from './src/unicode-rules.js';
import opentype from 'opentype.js';
import fs from 'node:fs';
const rect=(x,y,w,h)=>[{type:'M',x,y},{type:'L',x:x+w,y},{type:'L',x:x+w,y:y+h},{type:'L',x,y:y+h},{type:'Z'}];
const seg=flatten(rect(20,0,400,700));assert.deepEqual(scanline(seg,350),[20,420]);assert.equal(scanline(seg,700),null);
const cancelled=[...seg,...seg.map(([a,b,c,d])=>[c,d,a,b])];assert.equal(scanline(cancelled,350),null,'nonzero winding cancellation');
const ys=[20,100,200,350,500,650],g1={id:1,segments:seg,advance:500},g2={id:2,segments:seg,advance:520};g1.profile=profile(g1,ys);g2.profile=profile(g2,ys);assert.equal(compare(g1.profile.right,g2.profile.right).bearing,20);assert.equal(compare(g1.profile.right,g2.profile.right).shape,0);assert.equal((await cluster([g1,g2],'right',defaults)).length,2);
assert.equal(compare([null,null],[null,null]).shape,Infinity);
const mk=(id,shift)=>({id,profile:{left:[0,0,0,0].map(x=>x+shift)}});const trio=[mk(1,0),mk(2,6),mk(3,12)];const a=await cluster(trio,'left',defaults),b=await cluster([...trio].reverse(),'left',defaults);assert.deepEqual(a,b);assert.equal(a.length,2,'complete-link prevents chaining');
assert.equal((await cluster(trio,'left',defaults,{fixed:[[1,3]]})).length,2,'locked group preserved');
let stopped=false;try{await cluster(trio,'left',defaults,{signal:()=>true});}catch{stopped=true;}assert.ok(stopped);
const bytes=fs.readFileSync(process.env.TEST_FONT || 'samples/KGJapaneseTest-Regular.ttf');const font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));const glyphs=[];for(let c=33;c<127;c++){const g=font.charToGlyph(String.fromCharCode(c));glyphs.push({id:g.index,name:g.name,advance:g.advanceWidth,commands:g.path.commands,bounds:g.getBoundingBox()});}
const analyze=createEngine();const result=await analyze({glyphs,upm:font.unitsPerEm,fontKey:'test',params:defaults,fixed:{left:[],right:[]}},()=>{},()=>false);for(const side of ['left','right']){assert.equal(result.groups[side].flat().length,glyphs.length);for(const group of result.groups[side])for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){const p=result.items.find(g=>g.id===group[i]).profile[side],q=result.items.find(g=>g.id===group[j]).profile[side],d=compare(p,q);for(const key of ['shape','bearing','local','missing'])assert.ok(d[key]<=defaults[key],side+' '+key);}}
{const r=ch=>rulesOf([ch.codePointAt(0)]);const cases={A:['upper'],z:['lower'],'7':['digit'],'!':['punct'],'é':['latin'],'Ω':['greekcyr'],'Ж':['greekcyr'],'—':['symbols'],'あ':['hira'],'ゝ':['hira'],'カ':['kata'],'ー':['kata'],'・':['kata'],'ｶ':['kata'],'。':['jpunct'],'「':['jpunct'],'々':['jpunct'],'！':['jpunct'],'Ａ':['fullwidth'],'１':['fullwidth'],'漢':['han']};
for(const [ch,want] of Object.entries(cases))assert.deepEqual(r(ch),want,'unicode rule for '+ch);}
console.log(JSON.stringify({tests:'passed',realFont:(process.env.TEST_FONT||'samples/KGJapaneseTest-Regular.ttf').split('/').pop(),glyphs:glyphs.length,left:result.groups.left.length,right:result.groups.right.length,estimate:estimate(result.items,result.groups)},null,2));
