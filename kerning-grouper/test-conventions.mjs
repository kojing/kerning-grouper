// お作法 grouping: rules, the outline check, and the engine with the bundled font.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import opentype from 'opentype.js';
import {baseOf,protrudes,conventionKey,conventionGroups} from './src/conventions.js';
import {createEngine} from './src/engine.js';
import {defaults} from './src/core.js';
import {japaneseSample} from './src/japanese.js';

// rules
assert.equal(baseOf('Ä','left'),'A');assert.equal(baseOf('ǽ','right'),'e');assert.equal(baseOf('Œ','left'),'O');assert.equal(baseOf('Œ','right'),'E');assert.equal(baseOf('þ','left'),'b');assert.equal(baseOf('が','left'),'か');assert.equal(baseOf('ヴ','right'),'ウ');assert.equal(baseOf('ぁ','left'),'ぁ','small kana are their own letters');
assert.equal(protrudes('ơ','right'),'horn');assert.equal(protrudes('ơ','left'),'');assert.equal(protrudes('ď','right'),'caron');assert.equal(protrudes('č','right'),'');assert.equal(protrudes('が','right'),'dakuten');assert.equal(protrudes('が','left'),'');
assert.equal(conventionKey('H','left'),conventionKey('N','left'),'H and N share the left side');assert.notEqual(conventionKey('H','right'),conventionKey('O','right'));assert.equal(conventionKey('Ö','left'),conventionKey('C','left'));assert.equal(conventionKey('ď','right'),'');

// outline check with synthetic profiles (left side = pair second)
const col=(v,top=10)=>Array.from({length:20},(_,i)=>i<top?v:null);
const it=(id,ch,left,right=left)=>({id,unicodes:[ch.codePointAt(0)],profile:{left,right}});
const withMark=(base,markAt,v)=>base.map((x,i)=>i===markAt?v:x);
const A=col(10),items=[it(1,'A',A),it(2,'Ä',withMark(A,15,-40)),it(3,'Á',A.map(v=>v===null?null:v+60)),it(4,'H',col(50)),it(5,'N',col(50)),it(6,'K',col(50).map((v,i)=>v===null?null:i<5?50:300)),it(7,'B',col(50))];
const p={...defaults,step:6};const r=conventionGroups(items,'left',p);
const groupOf=id=>r.groups.find(g=>g.includes(id));
assert.ok(groupOf(1)?.includes(2),'Ä joins A: the mark above A is not compared');
assert.ok(!groupOf(1)?.includes(3),'Á leaves A: its outline differs where A has ink');assert.ok(r.removed.some(x=>x.id===3&&x.reason==='shape'));
assert.ok(groupOf(4)?.includes(5)&&groupOf(4)?.includes(7),'H N B share the classic straight group');
assert.ok(!groupOf(4)?.includes(6),'a clear outlier (K) leaves the classic group');
// glyphs already in fixed groups and separation signatures are respected
const r2=conventionGroups(items,'left',p,{taken:new Set([5])});assert.ok(!r2.groups.flat().includes(5));
const r3=conventionGroups(items,'left',p,{sep:{4:'a',5:'b',7:'a'}});assert.ok(!r3.groups.some(g=>g.includes(4)&&g.includes(5)),'different separation signatures never share a group');

// engine with the bundled font: kana with dakuten share the left group of their base, not the right
const bytes=fs.readFileSync('samples/KGJapaneseTest-Regular.ttf');const font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const glyphs=[...new Set(japaneseSample+'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')].map(ch=>font.charToGlyph(ch)).filter(g=>g.index).map(g=>({id:g.index,name:g.name,unicodes:g.unicodes,advance:g.advanceWidth,commands:g.path.commands,bounds:g.getBoundingBox()}));
const run=async convention=>createEngine()({glyphs,upm:font.unitsPerEm,fontKey:'conv'+convention,params:{...defaults,convention},fixed:{left:[],right:[]}},()=>{},()=>false);
const on=await run(true),off=await run(false),id=ch=>font.charToGlyph(ch).index,same=(res,sd,a,b)=>res.groups[sd].some(g=>g.includes(id(a))&&g.includes(id(b)));
assert.ok(same(on,'left','か','が'),'が follows か on the left');assert.ok(!same(on,'right','か','が'),'the dakuten side stays apart');
assert.ok(on.convention.right.removed.some(x=>x.reason==='dakuten'));
assert.ok(on.groups.left.length<off.groups.left.length&&on.groups.right.length<=off.groups.right.length,'fewer groups by convention');
assert.equal(off.convention,null);
{// convention groups are closed: shape grouping never adds to them, even when strength 40 smooths the outlines
 const lat=glyphs.filter(g=>/^[A-Za-z]$/.test(String.fromCodePoint(g.unicodes[0])));
 const s40=await createEngine()({glyphs:lat,upm:font.unitsPerEm,fontKey:'s40',params:{...defaults,convention:true,strength:40},fixed:{left:[],right:[]}},()=>{},()=>false);
 for(const sd of ['left','right']){const conv=s40.convention[sd].groups;for(const cg of conv){const g=s40.groups[sd].find(x=>x.includes(cg[0]));assert.deepEqual([...g].sort((a,b)=>a-b),[...cg].sort((a,b)=>a-b),'a convention group stays exactly as made');}}
 const fl=s40.groups.left.find(g=>g.includes(id('f')));assert.ok(![...'RHbhkl'].some(c=>fl.includes(id(c))),'f does not join the straight-stem groups');}
console.log('Convention tests passed',JSON.stringify({off:[off.groups.right.length,off.groups.left.length],on:[on.groups.right.length,on.groups.left.length],convGroups:[on.convention.right.groups.length,on.convention.left.groups.length]}));
