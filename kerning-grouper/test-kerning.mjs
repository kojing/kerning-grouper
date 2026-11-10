import assert from 'node:assert/strict';
import fs from 'node:fs';
import opentype from 'opentype.js';
import {flatten} from './src/core.js';
import {createEngine} from './src/engine.js';
import {generateKerning,resolveKerning,kernDefaults,opticalError,pairKind} from './src/kerning.js';
// Accented and extended Latin letters kern as capitals / small letters (not as 'other', which takes the kana references).
{const k=s=>pairKind({unicodes:[s.codePointAt(0)]},{unicodes:[s.codePointAt(1)]});assert.equal(k('ÀB'),'UU');assert.equal(k('Aŋ'),'UL');assert.equal(k('øØ'),'LU');assert.equal(k('ＡB'),'other','fullwidth forms stay other');assert.equal(k('Aあ'),'other');assert.equal(k('ΑΥ'),'UU','Greek capitals');assert.equal(k('Τα'),'UL');assert.equal(k('жД'),'LU','Cyrillic');assert.equal(k('A“'),'other','symbols stay other');}
import {estimate} from './src/core.js';
import {defaults} from './src/core.js';
const bytes=fs.readFileSync(process.env.TEST_FONT||'samples/KGJapaneseTest-Regular.ttf');const font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const glyphs=[];for(const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'){const g=font.charToGlyph(ch);glyphs.push({id:g.index,name:g.name,unicodes:g.unicodes,advance:g.advanceWidth,commands:g.path.commands,bounds:g.getBoundingBox()});}
const analyze=createEngine();const result=await analyze({glyphs,upm:font.unitsPerEm,fontKey:'kern',params:defaults,fixed:{left:[],right:[]}},()=>{},()=>false);
const raw=await generateKerning({...result,settings:kernDefaults},()=>{},()=>false),out=resolveKerning(raw,kernDefaults);assert.equal(out.pairs.length,62**2);assert.ok(out.pairs.every(p=>Number.isFinite(p.value)));assert.ok(out.pairs.every(p=>p.protected||p.safe===null||p.value>=p.safe));assert.ok(out.pairs.filter(p=>p.protected).every(p=>p.value===0));assert.equal(out.protectedCount,100);assert.ok(opticalError(out.pairs,true)<opticalError(out.pairs,false),'optical residual should improve on sample');
// priority: every Latin/digit pair is judged (0–1); the setting is the share of judged pairs kept (most likely first)
{assert.ok(raw.pairs.every(p=>p.priority===null||(p.priority>=0&&p.priority<=1)));assert.ok(raw.pairs.filter(p=>p.priority!==null).length>3000,'letters and digits are judged');
 const keepAll=resolveKerning(raw,{...kernDefaults,priority:100});assert.equal(keepAll.lowPriority,0,'100% keeps everything');
 const off=resolveKerning(raw,{...kernDefaults,priority:0});assert.equal(off.lowPriority,0);const def=resolveKerning(raw,kernDefaults);assert.ok(def.lowPriority>0&&def.nonzeroGlyphPairs<off.nonzeroGlyphPairs,'the default 15% drops unlikely pairs');
 const judged=raw.pairs.filter(p=>p.priority!==null).length,kept=judged-def.lowPriority;assert.ok(kept>=judged*.15&&kept<judged*.3,'about the share is kept (whole class pairs): '+kept+'/'+judged);
 const few=resolveKerning(raw,{...kernDefaults,priority:1});assert.ok(few.lowPriority>def.lowPriority);
 const av=raw.pairs.find(p=>p.a===font.charToGlyph('A').index&&p.b===font.charToGlyph('V').index),hh=raw.pairs.find(p=>p.a===font.charToGlyph('H').index&&p.b===font.charToGlyph('H').index);assert.ok(av.priority>hh.priority,'AV is more likely kerned than HH');}
const sample=['AV','To','WA','HH','OO','nn','oo','01'].map(chars=>{const a=font.charToGlyph(chars[0]).index,b=font.charToGlyph(chars[1]).index,p=out.pairs.find(p=>p.a===a&&p.b===b);return{pair:chars,value:p.value,gap:p.gap,safe:p.safe,residual:p.residual};});
const target=out.pairs.find(p=>!p.protected&&p.safe!==null);const manual=resolveKerning(raw,kernDefaults,{}, {[target.key]:-1000});assert.ok(manual.map[target.key]>=target.safe,'manual pair must respect safety');
const forced=resolveKerning(raw,{...kernDefaults,threshold:50,tolerance:80},{[target.c1+':'+target.c2]:-999});assert.ok(forced.pairs.every(p=>p.protected||p.safe===null||p.value>=p.safe),'unsafe class produces exceptions');
// A required zero exception must survive thresholding and protectDigits.
const fixture={pairs:[{a:1,b:1,c1:0,c2:0,ideal:0,safe:null,gap:80,opticalBefore:[80,80,80],opticalTarget:[80,80,80],protected:true,confidence:true,warning:''},{a:2,b:2,c1:0,c2:0,ideal:-40,safe:-50,gap:100,opticalBefore:[100,100,100],opticalTarget:[60,60,60],protected:false,confidence:true,warning:''}]};const z=resolveKerning(fixture,kernDefaults,{'0:0':-40});assert.ok(z.exceptions.some(p=>p.a===1&&p.value===0));
// Same minimum gap, but broad triangular whitespace: optical estimate should tighten more.
function shape(id,char,points,advance=500){const commands=points.map(([x,y],i)=>({type:i?'L':'M',x,y})).concat({type:'Z'});return{id,name:char,unicodes:[char.codePointAt(0)],advance,commands,segments:flatten(commands)};}
const h=shape(1,'H',[[50,0],[450,0],[450,700],[50,700]]),v=shape(2,'V',[[50,700],[450,700],[250,0]]);const demo={items:[h,v],groups:{right:[[1],[2]],left:[[1],[2]]}};const mech=await generateKerning({...demo,settings:{...kernDefaults,references:'HH',optical:0,minimum:5,threshold:0}},()=>{},()=>false);const opt=await generateKerning({...demo,settings:{...kernDefaults,references:'HH',optical:100,minimum:5,threshold:0}},()=>{},()=>false);const mv=mech.pairs.find(p=>p.a===1&&p.b===2),ov=opt.pairs.find(p=>p.a===1&&p.b===2);assert.ok(ov.ideal<mv.ideal-10,'optical whitespace must differ from minimum gap alone');
let cancelled=false;try{await generateKerning({...result,settings:kernDefaults},()=>{},()=>true);}catch(e){cancelled=e.message==='中止';}assert.ok(cancelled);
{const off=resolveKerning(raw,kernDefaults),on=resolveKerning(raw,{...kernDefaults,exceptions:true});
assert.equal(kernDefaults.exceptions,false,'automatic exceptions are off by default');
assert.ok(off.exceptions.every(p=>['digit-protection','manual','collision-exception'].includes(p.reason)),'default creates no optical exceptions');
assert.ok(off.pairs.every(p=>p.protected||p.safe===null||p.value>=p.safe),'class values still avoid collisions');
assert.ok(off.exceptions.length<=on.exceptions.length);assert.ok(off.classes.filter(c=>c.raised).length===off.raisedClasses);
const m=off.pairs.find(p=>!p.protected&&p.safe!==null);const withManual=resolveKerning(raw,kernDefaults,{},{[m.key]:Math.ceil(m.safe)+30});assert.equal(withManual.pairs.find(p=>p.key===m.key).value,Math.ceil(m.safe)+30,'manual pair values still apply');}
{// All-zero groups (after the small-value threshold) leave the class table.
const mk=(a,b,c1,c2,ideal)=>({a,b,c1,c2,ideal,safe:null,gap:80,opticalBefore:[80,80,80],opticalTarget:[80,80,80],protected:false,confidence:true,warning:''});
const zraw={pairs:[mk(1,1,0,0,-40),mk(1,2,0,1,-3),mk(2,1,1,0,2),mk(2,2,1,1,-4)]};const zr=resolveKerning(zraw,kernDefaults);
assert.deepEqual([...zr.zeroGroups.right],[1],'first-side group whose pairs all fall under the threshold');assert.deepEqual([...zr.zeroGroups.left],[1],'second-side group likewise');
const gs={right:[[1],[2]],left:[[1],[2]]},items=[{id:1},{id:2}],full=estimate(items,gs),cut=estimate(items,gs,zr.zeroGroups);
assert.equal(full.c1,3);assert.equal(cut.c1,2);assert.equal(cut.c2,2);assert.ok(cut.total<full.total);assert.deepEqual(estimate(items,gs,{right:new Set(),left:new Set()}).total,full.total,'no exclusion keeps the v0.4 estimate');
const keep=resolveKerning(zraw,kernDefaults,{},{'2:2':-30});assert.equal(keep.zeroGroups.right.size,0,'a nonzero manual pair keeps its group');}
{// Saturated classes (every pair at the automatic limit) become 0 only when the option is on.
const mk=(a,b,c1,c2,ideal,warning)=>({a,b,c1,c2,ideal,safe:-900,gap:80,opticalBefore:[80,80,80],opticalTarget:[80,80,80],protected:false,confidence:true,warning});
const sraw={pairs:[mk(1,1,0,0,-240,'limited'),mk(1,2,0,1,-240,'limited'),mk(2,1,1,0,-30,''),mk(2,2,1,1,-240,'limited')]};
const keepAtLimit=resolveKerning(sraw,kernDefaults);assert.equal(kernDefaults.zeroSaturated,false);assert.equal(keepAtLimit.classes.find(c=>c.key==='0:0').value,-240,'default keeps moving at the limit');
const zeroed=resolveKerning(sraw,{...kernDefaults,zeroSaturated:true});assert.equal(zeroed.saturatedClasses,3);assert.equal(zeroed.classes.find(c=>c.key==='1:0').value,-30);assert.deepEqual([...zeroed.zeroGroups.right],[0]);}
{// Reference band: pairs as spaced as the reference pairs keep the font's spacing (v0.5.1).
const id=ch=>font.charToGlyph(ch).index,val=(o,s)=>o.map[id(s[0])+':'+id(s[1])];
for(const s of kernDefaults.references.split(' '))assert.equal(raw.pairs.find(p=>p.a===id(s[0])&&p.b===id(s[1])).ideal,0,'reference pair '+s+' stays 0');
for(const t of Object.values(raw.targets))assert.ok(t.band[0]<=0&&t.band[1]>=0,'the band contains the target');
const offS={...kernDefaults,keepSpacing:false,learned:false},rawOff=await generateKerning({...result,settings:offS}),outOff=resolveKerning(rawOff,offS),onS={...kernDefaults,learned:false},rawOn=await generateKerning({...result,settings:onS}),outOn=resolveKerning(rawOn,onS);
assert.ok(outOn.nonzero<outOff.nonzero,'the band leaves more pairs at 0');
assert.ok(Math.abs(val(out,'AV'))>0&&val(out,'AV')<0,'AV is still kerned');
assert.ok(rawOn.pairs.every(p=>{const q=rawOff.pairs.find(x=>x.a===p.a&&x.b===p.b);return p.protected||p.safe!==null&&p.ideal===Math.round(p.safe)||Math.abs(p.ideal)<=Math.abs(q.ideal)+1;}),'the band never makes a value larger');
assert.equal(kernDefaults.optical,60);assert.equal(kernDefaults.limit,1000,'no hard cap');assert.deepEqual([kernDefaults.knee,kernDefaults.slope,kernDefaults.jaStrength,kernDefaults.bay],[40,40,85,100]);assert.equal(kernDefaults.threshold,20);assert.equal(kernDefaults.keepSpacing,true);}
{// Learned value model (v0.5.2): Latin letter pairs the tool kerns get their size from the model; nothing else changes.
// 欧文と和文を同じ基準で詰める (default since v0.6.3) turns it off; the model is checked with it off.
assert.equal(kernDefaults.unifyScripts,true);assert.equal(raw.pairs.filter(p=>p.learned).length,0,'no learned values when unified');
const rawLm=await generateKerning({...result,settings:{...kernDefaults,unifyScripts:false}},()=>{},()=>false);const learnedPairs=rawLm.pairs.filter(p=>p.learned);assert.ok(learnedPairs.length>50,'the model is used on Latin pairs');
assert.ok(learnedPairs.every(p=>/^(UU|UL|LU|LL)$/.test(p.kind)&&!p.protected&&Math.abs(p.toolValue)>=10),'only Latin letter pairs the tool kerns');
assert.ok(rawLm.pairs.every(p=>p.safe===null||p.protected||p.ideal>=p.safe),'learned values keep the minimum gap');
const offL={...kernDefaults,unifyScripts:false,learned:false},rawL=await generateKerning({...result,settings:offL});
assert.ok(rawL.pairs.every(p=>!p.learned));for(const p of learnedPairs){const q=rawL.pairs.find(x=>x.a===p.a&&x.b===p.b);assert.equal(q.ideal,p.toolValue);}
assert.ok(rawLm.pairs.filter(p=>!p.learned).every(p=>rawL.pairs.find(x=>x.a===p.a&&x.b===p.b).ideal===p.ideal),'pairs outside the model are unchanged');}
console.log(JSON.stringify({tests:'passed',pairs:out.pairs.length,classPairs:out.nonzero,exceptions:out.exceptions.length,errorBefore:opticalError(out.pairs,false),errorAfter:opticalError(out.pairs,true),mechanicalTriangle:mv.ideal,opticalTriangle:ov.ideal,sample},null,2));
// easing of large values and enclosed bays (v0.6.5)
{const {easeLarge,bayFill}=await import('./src/kerning.js');assert.equal(easeLarge(-30,40,40),-30);assert.equal(easeLarge(-140,40,40),-80);assert.equal(easeLarge(90,40,40),60);
 assert.deepEqual(bayFill([10,40,60,40,10],100,40),[10,10,10,10,10],'an enclosed bay is filled');assert.deepEqual(bayFill([10,10,200,200,200],100,40),[10,10,200,200,200],'an overhang open at one end is not');assert.deepEqual(bayFill([10,20,30,40],100,40),[10,20,30,40],'a diagonal is not');console.log('ease and bay ok');}
