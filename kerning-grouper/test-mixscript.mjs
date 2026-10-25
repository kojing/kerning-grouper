// 和欧の組み合わせ設定（mixScripts）の検証。合成グリフで自己完結し、TEST_MIX_FONT を渡すと実フォントでも確認する。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import opentype from 'opentype.js';
import {createEngine} from './src/engine.js';
import {defaults,scriptOf} from './src/core.js';
import {generateKerning,resolveKerning,kernDefaults} from './src/kerning.js';

assert.equal(scriptOf([0x3042]),'ja');assert.equal(scriptOf([0x30AB]),'ja');assert.equal(scriptOf([0x300C]),'ja');assert.equal(scriptOf([0xFF01]),'ja');assert.equal(scriptOf([0x6F22]),'ja');
assert.equal(scriptOf([0x41]),'latin');assert.equal(scriptOf([0xC0]),'latin');assert.equal(scriptOf([]),'latin');

// Identical rectangles: one Latin, one kana. Their outlines match, so only the script setting can keep them apart.
const rect=(x,w)=>[{type:'M',x,y:0},{type:'L',x:x+w,y:0},{type:'L',x:x+w,y:700},{type:'L',x,y:700},{type:'Z'}];
const glyph=(id,u,x=60,w=380,adv=500)=>({id,name:'g'+id,unicodes:[u],advance:adv,commands:rect(x,w),bounds:{x1:x,y1:0,x2:x+w,y2:700}});
const synthetic=[glyph(1,0x48),glyph(2,0x30ED),glyph(3,0x4F,80,340),glyph(4,0x306E,80,340)];
const run=async(glyphs,mixScripts,upm=1000)=>createEngine()({glyphs,upm,fontKey:'mix-'+mixScripts,params:{...defaults,mixScripts},fixed:{left:[],right:[]}},()=>{},()=>false);
const pure=groups=>groups.every(ids=>new Set(ids.map(id=>scriptOf(synthetic.find(g=>g.id===id)?.unicodes))).size===1);

const on=await run(synthetic,true),off=await run(synthetic,false);
assert.ok(!pure(on.groups.left)||!pure(on.groups.right),'mixScripts=true keeps v0.4 behaviour: identical shapes merge across scripts');
assert.ok(pure(off.groups.left)&&pure(off.groups.right),'mixScripts=false never puts 和文 and 欧文 in one group');
assert.ok(off.groups.left.length>on.groups.left.length);

const settings={...kernDefaults,references:'HH ロロ'};
const rawOn=await generateKerning({...on,settings,mixScripts:true});
const rawOff=await generateKerning({...off,settings,mixScripts:false});
assert.equal(rawOn.pairs.length,16);assert.equal(rawOn.mixedSkipped,0);
assert.equal(rawOff.pairs.length,8,'only same-script pairs (2×2 + 2×2)');assert.equal(rawOff.mixedSkipped,8);
assert.ok(rawOff.pairs.every(p=>scriptOf(synthetic.find(g=>g.id===p.a).unicodes)===scriptOf(synthetic.find(g=>g.id===p.b).unicodes)));
const out=resolveKerning(rawOff,settings);
assert.ok(out.classes.every(c=>{const a=off.groups.right[c.c1],b=off.groups.left[c.c2];return scriptOf(synthetic.find(g=>g.id===a[0]).unicodes)===scriptOf(synthetic.find(g=>g.id===b[0]).unicodes);}),'no class pair spans 和文×欧文');
// Region rules: separation signatures keep groups apart and pairFilter skips denied region pairs.
{const region={1:'upper',2:'kata',3:'upper',4:'hira'},deny=['upper>kata','kata>upper'];const sig=(id,side)=>{const r=region[id];return side==='right'?(r==='upper'?'10':'01')+(r==='hira'?'h':''):(r==='upper'?'10':'01')+(r==='hira'?'h':'');};
 const sep={right:Object.fromEntries(synthetic.map(g=>[g.id,sig(g.id,'right')])),left:Object.fromEntries(synthetic.map(g=>[g.id,sig(g.id,'left')]))};
 const r=await createEngine()({glyphs:synthetic,upm:1000,fontKey:'sep',params:{...defaults,separation:sep},fixed:{left:[],right:[]}},()=>{},()=>false);
 assert.ok(r.groups.left.every(ids=>new Set(ids.map(id=>sep.left[id])).size===1),'separation signature splits groups');
 const raw=await generateKerning({...r,settings,pairFilter:{region,deny}});assert.equal(raw.mixedSkipped,4,'upper×kata and kata×upper skipped');assert.equal(raw.pairs.length,12);}
const report={synthetic:{on:{left:on.groups.left.length,right:on.groups.right.length,pairs:rawOn.pairs.length},off:{left:off.groups.left.length,right:off.groups.right.length,pairs:rawOff.pairs.length,skipped:rawOff.mixedSkipped}}};

if(process.env.TEST_MIX_FONT){
 const bytes=fs.readFileSync(process.env.TEST_MIX_FONT);const font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 const text='HOnoAVTo-のカロねー「」、。';
 const glyphs=[...new Set(text)].map(ch=>{const g=font.charToGlyph(ch);assert.notEqual(g.index,0,ch);return{id:g.index,name:g.name||'gid'+g.index,unicodes:g.unicodes,advance:g.advanceWidth,commands:g.path.commands,bounds:g.getBoundingBox()};});
 const realScript=id=>scriptOf(glyphs.find(g=>g.id===id).unicodes);
 for(const mix of [true,false]){const r=await run(glyphs,mix,font.unitsPerEm);const strong={...r};
  if(!mix)for(const side of ['left','right'])assert.ok(r.groups[side].every(ids=>new Set(ids.map(realScript)).size===1),'real font: groups stay within one script');
  const raw=await generateKerning({...strong,settings:{...kernDefaults,references:'HH OO nn のの ロロ'},mixScripts:mix});const ja=glyphs.filter(g=>scriptOf(g.unicodes)==='ja').length,la=glyphs.length-ja;
  assert.equal(raw.pairs.length,mix?glyphs.length**2:ja*ja+la*la);assert.equal(raw.mixedSkipped,mix?0:2*ja*la);
  report['font_'+(mix?'on':'off')]={glyphs:glyphs.length,ja,latin:la,left:r.groups.left.length,right:r.groups.right.length,pairs:raw.pairs.length,skipped:raw.mixedSkipped};}
}
console.log('mixScripts tests passed',JSON.stringify(report));
