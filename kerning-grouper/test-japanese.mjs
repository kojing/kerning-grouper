import assert from 'node:assert/strict';
import fs from 'node:fs';
import opentype from 'opentype.js';
import {createEngine} from './src/engine.js';
import {defaults,estimate} from './src/core.js';
import {generateKerning,resolveKerning,kernDefaults,opticalError} from './src/kerning.js';
import {japaneseSample,japaneseReferences} from './src/japanese.js';
const bytes=fs.readFileSync('samples/KGJapaneseTest-Regular.ttf');const font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const glyphs=[...japaneseSample].map(ch=>{const g=font.charToGlyph(ch);assert.notEqual(g.index,0,ch);return {id:g.index,name:g.name,unicodes:g.unicodes,advance:g.advanceWidth,commands:g.path.commands,bounds:g.getBoundingBox()};});
const start=performance.now();const result=await createEngine()({glyphs,upm:font.unitsPerEm,fontKey:'jp',params:defaults,fixed:{left:[],right:[]}},()=>{},()=>false);
const settings={...kernDefaults,exceptions:true,zeroSaturated:false,references:japaneseReferences};const raw=await generateKerning({...result,settings});const out=resolveKerning(raw,settings);
assert.equal(out.pairs.length,glyphs.length**2);assert.equal(raw.skipped.length,0);assert.ok(out.pairs.every(p=>Number.isFinite(p.value)&&(p.safe===null||p.value>=p.safe)));
const samples=['のの','ねね','カカ','ロロ','カー','「の','の」','。、'].map(text=>{const a=font.charToGlyph(text[0]).index,b=font.charToGlyph(text[1]).index;const p=out.pairs.find(p=>p.a===a&&p.b===b);return {text,value:p.value,safe:p.safe,warning:p.warning};});
const e=estimate(result.items,result.groups);const exceptionBytes=4*out.exceptions.length+6*new Set(out.exceptions.map(p=>p.a)).size+(out.exceptions.length?26:0);
const report={font:'Noto Sans JP / Regular 400 / renamed static subset',glyphs:glyphs.length,pairs:out.pairs.length,groups:{first:result.groups.right.length,second:result.groups.left.length},classPairs:out.nonzero,exceptions:out.exceptions.length,warnings:out.warnings,estimatedBytes:e.total+exceptionBytes,modelRmsBefore:opticalError(out.pairs,false),modelRmsAfter:opticalError(out.pairs,true),seconds:Math.round((performance.now()-start)/1000),samples};
fs.writeFileSync('samples/validation.json',JSON.stringify(report,null,2));{const off=resolveKerning(raw,{...settings,exceptions:false});const eb=off.exceptions.length?4*off.exceptions.length+6*new Set(off.exceptions.map(p=>p.a)).size+26:0;const e2=estimate(result.items,result.groups);console.log('default (no automatic exceptions):',JSON.stringify({exceptions:off.exceptions.length,raisedClasses:off.raisedClasses,estimatedBytes:e2.matrix+e2.overhead+eb}));assert.ok(off.pairs.every(p=>p.protected||p.safe===null||p.value>=p.safe));}
console.log(report);
// kana priority: same-script kana pairs are judged (ranked by how much they tighten), hiragana↔katakana pairs get 0
{const id=c=>font.charToGlyph(c).index,P=(x,y)=>raw.pairs.find(p=>p.a===id(x)&&p.b===id(y));
 assert.ok(P('の','の').jprio>=0.5&&P('カ','カ').jprio>=0.5,'same script judged');assert.equal(P('の','カ').jprio,0,'across scripts: 0');
 assert.ok(raw.pairs.filter(p=>p.rule).every(p=>p.jprio===undefined||p.jprio===null),'punctuation pairs keep their rules');
 const off=resolveKerning(raw,{...settings,jaPriority:0}),on=resolveKerning(raw,settings);assert.ok(on.nonzeroGlyphPairs<off.nonzeroGlyphPairs,'the share drops kana pairs');
 const kn=on.pairs.filter(p=>p.jprio!=null&&p.jprio>=0),kept=kn.filter(p=>!p.lowPriority).length;assert.ok(kept>=kn.length*.16&&kept<kn.length*.35,'about the share is kept: '+kept+'/'+kn.length);
 assert.ok(on.pairs.filter(p=>p.jprio===0&&!p.lowPriority).length===0||on.pairs.filter(p=>p.jprio===0).every(p=>p.lowPriority||p.value===0||p.safe>0),'cross-script pairs are not kerned');
 console.log('kana priority ok',{judged:kn.length,kept,nonzero:[off.nonzeroGlyphPairs,on.nonzeroGlyphPairs]});}
// 基準からの間隔調整 shifts the pairs judged against the reference band too (it used to cancel out with the band)
{const s2={...settings,spacing:-30},r2=await generateKerning({...result,settings:s2});const id=c=>font.charToGlyph(c).index,P=(raw,x,y)=>raw.pairs.find(p=>p.a===id(x)&&p.b===id(y));
 assert.ok(P(r2,'の','の').ideal<=P(raw,'の','の').ideal-20,'spacing −30 tightens the reference pair');const mean=r=>r.pairs.filter(p=>!p.rule).reduce((t,p)=>t+p.ideal,0)/r.pairs.length;assert.ok(mean(r2)<mean(raw)-15,'and the pairs overall');console.log('spacing ok');}
// 和文の詰める強さ scales kana pairs only; pairs after a small kana are not kept by the kana share
{const id=c=>font.charToGlyph(c).index,P=(raw,x,y)=>raw.pairs.find(p=>p.a===id(x)&&p.b===id(y));const full=await generateKerning({...result,settings:{...settings,jaStrength:100,tsume:false,limit:1000}}),half=await generateKerning({...result,settings:{...settings,jaStrength:50,tsume:false,limit:1000}});
 const q=full.pairs.find(p=>p.jprio>0&&p.ideal<-40&&(p.safe==null||p.ideal>p.safe+5));if(q){const h=half.pairs.find(p=>p.a===q.a&&p.b===q.b);assert.ok(Math.abs(h.ideal-q.ideal/2)<=2||h.ideal===Math.ceil(h.safe),'kana values are scaled: '+q.ideal+' → '+h.ideal);}
 const sm=P(full,'っ','た')||P(full,'ゃ','く');if(sm)assert.equal(sm.jprio,0,'after a small kana: not kept by the share');console.log('kana strength ok');}
