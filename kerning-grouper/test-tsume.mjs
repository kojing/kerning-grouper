// 字詰め（tsume）と約物の規則（punct）を kern に含める機能の検証。同梱サンプル（かな・約物）で確かめる。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import opentype from 'opentype.js';
import {createEngine} from './src/engine.js';
import {defaults} from './src/core.js';
import {generateKerning,resolveKerning,kernDefaults,validateKernSettings,applyPunctKeeps} from './src/kerning.js';
import {japaneseSample,japaneseReferences} from './src/japanese.js';
import {jaClass,glyphJaClass,punctKeep} from './src/jlreq.js';

assert.equal(jaClass(0x300C),'open');assert.equal(jaClass(0x300D),'close');assert.equal(jaClass(0x3001),'comma');assert.equal(jaClass(0x3002),'period');assert.equal(jaClass(0x30FB),'middle');
assert.equal(jaClass(0x3083),'small');assert.equal(jaClass(0x30FC),'choon');assert.equal(jaClass(0x3042),'hira');assert.equal(jaClass(0x30A2),'kata');assert.equal(jaClass(0x6F22),'han');assert.equal(jaClass(0x41),null);
assert.equal(glyphJaClass({unicodes:[0x201C]},500),null,'a proportional quote is not Japanese punctuation');
assert.equal(punctKeep('close','open','tsume',false),500);assert.equal(punctKeep('close','comma','tsume',false),0);assert.equal(punctKeep('comma',null,'tsume',false),250);assert.equal(punctKeep('comma',null,'beta',false),500);assert.equal(punctKeep('close',null,'tsume',{keepBracket:250}),250);assert.equal(punctKeep(null,null,'tsume',false),null);
assert.throws(()=>validateKernSettings({punct:'x'}));assert.throws(()=>validateKernSettings({tsumeAmount:900}));
assert.equal(kernDefaults.tsume,false);assert.equal(kernDefaults.punct,'off');

const bytes=fs.readFileSync('samples/KGJapaneseTest-Regular.ttf');const font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const glyphs=[...japaneseSample].map(ch=>{const g=font.charToGlyph(ch);return {id:g.index,name:g.name,unicodes:g.unicodes,advance:g.advanceWidth,commands:g.path.commands,bounds:g.getBoundingBox()};});
// Same separation as app.js pairPlan: only punctuation classes are kept apart.
const sig=Object.fromEntries(glyphs.map(g=>{const c=glyphJaClass(g,g.advance*1000/font.unitsPerEm);return[g.id,['open','close','comma','period','middle'].includes(c)?'|'+c:''];}));
const result=await createEngine()({glyphs,upm:font.unitsPerEm,fontKey:'tsume',params:{...defaults,strength:40,separation:{right:sig,left:sig}},fixed:{left:[],right:[]}},()=>{},()=>false);
for(const side of ['right','left'])assert.ok(result.groups[side].every(ids=>new Set(ids.map(id=>sig[id])).size===1),'punctuation classes never share a group');
const id=ch=>font.charToGlyph(ch).index;
const run=async extra=>{const settings={...kernDefaults,references:japaneseReferences,...extra};const raw=await generateKerning({...result,settings});return{raw,out:resolveKerning(raw,settings)};};
const val=(r,s)=>r.out.map[id(s[0])+':'+id(s[1])],part=(r,s)=>r.raw.pairs.find(p=>p.a===id(s[0])&&p.b===id(s[1])).parts;
const off=await run({}),tsume=await run({tsume:true,punct:'tsume'}),beta=await run({tsume:true,punct:'beta'}),quarter=await run({tsume:true,punct:'tsume',keepBracket:250}),noTsume=await run({tsume:true,tsumeAmount:0,punct:'tsume'});
assert.ok(off.raw.pairs.every(p=>!p.rule&&p.parts.tsume===0&&p.parts.punct===0),'options off: nothing changes');
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<=2,`${msg}: ${a} vs ${b}`);
// Punctuation rules: the open half-em sides are removed down to the kept space.
near(val(tsume,'」「'),-500,'」「 keeps a half em');near(val(tsume,'、「'),-500,'、「 keeps a half em');
near(val(tsume,'」、'),-500,'」、 closes up');near(val(tsume,'。」'),-500,'。」 closes up');near(val(tsume,'「『'),-500,'「『 closes up');
near(val(tsume,'、あ')-val(tsume,'。あ'),-250,'tsume: comma keeps a quarter, full stop a half');
near(val(tsume,'あ「')-val(beta,'あ「'),-500,'tsume removes the bracket outer half, beta keeps it');
near(val(quarter,'あ「')-val(tsume,'あ「'),250,'keepBracket 250 keeps a quarter outside brackets');
assert.equal(part(tsume,'あ・').punct,0,'middle dot keeps its quarters');
for(const s of ['」「','、あ','あ「'])assert.ok(tsume.raw.pairs.find(p=>p.a===id(s[0])&&p.b===id(s[1])).rule==='punct');
assert.ok(tsume.out.pairs.every(p=>p.safe===null||p.value>=p.safe),'rules never break the minimum gap');
// Tsume: kana sides tighten on top of the optical correction; the amount scales it.
assert.ok(part(tsume,'くの').tsume<0);near(part(tsume,'くの').tsume-part(noTsume,'くの').tsume,part(tsume,'くの').tsume,'tsumeAmount 0 removes the tsume part');
assert.ok(val(tsume,'のの')<val(off,'のの'),'tsume tightens even the reference pair');
{const ra=tsume.raw.pairs.find(p=>p.a===id('き')&&p.b===id('ゃ')),rb=tsume.raw.pairs.find(p=>p.a===id('ゃ')&&p.b===id('き'));const self=x=>x.parts.tsume;assert.ok(self(ra)<self(rb),'small kana: tighter to the preceding kana than to the next');}
{// Kept spaces are adjustable and recomputed in place.
const wide=await run({tsume:true,punct:'tsume',keepComma:500});near(val(wide,'、あ')-val(tsume,'、あ'),250,'keepComma 500 opens a quarter more');
const re=applyPunctKeeps(tsume.raw,{...tsume.raw.settings,keepComma:500});const reOut=resolveKerning(re,re.settings);near(reOut.map[id('、')+':'+id('あ')],val(wide,'、あ'),'applyPunctKeeps matches a full regeneration');
assert.equal(validateKernSettings({bracketQuarter:true}).keepBracket,250,'old bracketQuarter maps to keepBracket');assert.throws(()=>validateKernSettings({keepMiddle:300}));}
console.log('tsume/punct tests passed',JSON.stringify({groups:[result.groups.right.length,result.groups.left.length],ruleExceptions:tsume.out.exceptions.filter(e=>e.reason==='punct-rule').length,samples:Object.fromEntries(['」「','、あ','。あ','あ「','くの','のの'].map(s=>[s,val(tsume,s)]))}));
