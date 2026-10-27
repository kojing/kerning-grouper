// Export classes merged by their kerning, and the value step.
import assert from 'node:assert/strict';
import {resolveKerning,mergeClasses,kernDefaults} from './src/kerning.js';
// 8 first groups × 8 second groups, one glyph each. Rows 0–3 kern alike (within 4), row 4 too except one column (-120);
// rows 5–7 differ.
const row=i=>j=>i<4?-40-(i%2)*4+(j===3?-30:0):i===4?(j===2?-120:-40+(j===3?-30:0)):(i-4)*30*(j%2?1:-1);
const pairs=[];for(let i=0;i<8;i++)for(let j=0;j<8;j++){const v=row(i)(j);pairs.push({a:i,b:10+j,c1:i,c2:j,ideal:v,safe:-500,confidence:true,protected:false,opticalBefore:[100],opticalTarget:[100]});}
const raw={pairs},st={...kernDefaults,merge:5};
const pre=resolveKerning(raw,st);const m=mergeClasses(pre,{tolerance:5});
assert.ok(m.classes.right<8,'similar rows become one class');assert.equal(m.right.get(0),m.right.get(1),'rows 0 and 1 (4 apart) merged');
const res=resolveKerning(raw,st,{},{},null,m);let mx=0;for(const p of res.pairs)mx=Math.max(mx,Math.abs(p.value-pre.map[p.key]));assert.ok(mx<=5,'no value moves more than the tolerance');
if(m.right.get(4)===m.right.get(0)){const e=res.pairs.find(p=>p.a===4&&p.b===12);assert.equal(e.value,-120,'the odd value stays as an exception');assert.equal(e.reason,'merge-exception');}
assert.equal(mergeClasses(pre,{tolerance:0}).classes,null,'0 = off');
// locked groups stay apart
{const l=mergeClasses(pre,{tolerance:5,locked:{right:new Set([0]),left:new Set()}});for(let i=1;i<8;i++)assert.notEqual(l.right.get(i),0);}
// classes[] still lists every group pair, with the merged value
assert.equal(res.classes.length,pre.classes.length);
// value step: class values on the grid
{const r10=resolveKerning(raw,{...kernDefaults,step:10});assert.ok(r10.classes.every(c=>c.value%10===0));const r1=resolveKerning(raw,kernDefaults);assert.ok(r1.classes.some(c=>c.value%10!==0));}
console.log('Merge tests passed',JSON.stringify(m.classes));
