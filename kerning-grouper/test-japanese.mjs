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
