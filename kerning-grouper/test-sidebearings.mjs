// Side-bearing moves: a group kerned the same against everything moves; pair-specific kerning stays kerning.
import assert from 'node:assert/strict';
import {fitSidebearings,applySidebearings,sidebearingByGlyph,resolveKerning,kernDefaults} from './src/kerning.js';
import {buildVfm,parseVfm} from './src/vfm.js';
// 6 first groups × 6 second groups, one glyph each (ids 0–5 first, 10–15 second)
const pairs=[];const val=(i,j)=>i===0?-60:(i===1&&j===2?-80:0);   // group 0: -60 with everything; 1×2: one real kern
for(let i=0;i<6;i++)for(let j=0;j<6;j++)pairs.push({a:i,b:10+j,c1:i,c2:j,ideal:val(i,j),safe:-300,confidence:true,protected:false,opticalBefore:[100,100,100],opticalTarget:[100,100,100],gap:100,desired:val(i,j)});
const items=[...Array(6)].map((_,i)=>({id:i,unicodes:[0x3042+i],advance:1000,bounds:{x1:100,x2:800}})).concat([...Array(6)].map((_,j)=>({id:10+j,unicodes:[0x3050+j],advance:1000,bounds:{x1:100,x2:900}})));
const raw={pairs};const sb=fitSidebearings(raw,kernDefaults,{items});
assert.equal(sb.right.get(0),-60,'group 0 moves its right side bearing by -60');assert.equal(sb.right.size,1);assert.equal(sb.left.size,0,'nothing else moves');
assert.equal(sb.reason.right.get(0),'zero');assert.equal(sb.before,7);assert.equal(sb.after,1,'only the real kern is left');
const res=resolveKerning(applySidebearings(raw,sb),kernDefaults);const v=(a,b)=>res.map[a+':'+b];
assert.equal(v(0,10),0,'its kerning is gone');assert.equal(v(1,12),-80,'pair-specific kerning stays');assert.equal(v(2,13),0,'pairs that were right stay right');
// floor: the side bearing never goes below 0
{const r2={pairs:pairs.map(q=>q.c1===0?{...q,ideal:-90}:q)};const it2=items.map(g=>g.id===0?{...g,bounds:{x1:100,x2:950}}:g);const s2=fitSidebearings(r2,kernDefaults,{items:it2});assert.ok(!s2.right.has(0)||s2.right.get(0)>=-50,'rsb 50 → at most -50');}
// blocked: digits (protected), punctuation-rule glyphs, fixed groups
{const it3=items.map(g=>g.id===0?{...g,unicodes:[0x31]}:g);assert.equal(fitSidebearings(raw,kernDefaults,{items:it3}).right.size,0,'a digit group keeps its width');
 assert.equal(fitSidebearings(raw,kernDefaults,{items,fixed:{right:new Set([0]),left:new Set()}}).right.size,0,'fixed (kept) groups do not move');
 const r4={pairs:[...pairs,{a:0,b:10,c1:0,c2:0,rule:'punct',pcls:['close',null],ideal:0}]};assert.equal(fitSidebearings(r4,kernDefaults,{items}).right.size,0,'punctuation-rule glyph does not move');}
// per glyph, in font units
const groups={right:[[0],[1],[2],[3],[4],[5]],left:[[10],[11],[12],[13],[14],[15]]};const g=sidebearingByGlyph(sb,groups,2000);assert.deepEqual(g.get(0),{lsb:0,rsb:-120});
// .vfm metrics: with a reference the glyph's entry moves; without one an entry is written from the font
{const font={glyphs:{get:i=>({advanceWidth:1000,getBoundingBox:()=>({x1:100,x2:800,y1:0,y2:700})})}};const name=i=>'g'+i;
 const ref=parseVfm(JSON.stringify({dataType:'com.fontlab.metrics',masters:{M:{pairs:{}}},metrics:{g0:{layers:{M:{lsb:100,rsb:200,width:1000,xmin:100,xmax:800,ymin:0,ymax:700}}},g1:{layers:{M:{lsb:5,rsb:5,width:500,xmin:5,xmax:495,ymin:0,ymax:700}}}},upm:1000}));
 const sbg=new Map([[0,{lsb:-10,rsb:-60}]]);
 const a=JSON.parse(buildVfm({pairs:[],upm:1000,name,master:'M',reference:ref,sidebearings:sbg,font}).text);assert.deepEqual(a.metrics.g0.layers.M,{lsb:90,rsb:140,width:930,xmin:90,xmax:790,ymin:0,ymax:700});assert.deepEqual(a.metrics.g1.layers.M,{lsb:5,rsb:5,width:500,xmin:5,xmax:495,ymin:0,ymax:700},'other glyphs as they were');
 const b=JSON.parse(buildVfm({pairs:[],upm:1000,name,master:'M',sidebearings:sbg,font}).text);assert.deepEqual(Object.keys(b),['dataType','masters','metrics','upm']);assert.deepEqual(b.metrics.g0.layers.M,{lsb:90,rsb:140,width:930,xmax:790,xmin:90,ymax:700,ymin:0});
 const c=JSON.parse(buildVfm({pairs:[],upm:1000,name,master:'M',font}).text);assert.ok(!c.metrics,'no metrics without side-bearing moves');}
console.log('Side-bearing tests passed',JSON.stringify({moved:[...sb.right],before:sb.before,after:sb.after}));
