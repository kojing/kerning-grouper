import {flatten,profile,cluster} from './core.js';
import {conventionGroups} from './conventions.js';
export function createEngine(){let geometry=new Map(),distances=new Map(),lastKey='';return async function analyze(data,progress,signal){const {glyphs,params,fixed,fontKey,upm}=data;const key=fontKey+':'+params.step;if(key!==lastKey){geometry.clear();distances.clear();lastKey=key;}
 const ymin=Math.min(...glyphs.map(g=>g.bounds.y1))*1000/upm,ymax=Math.max(...glyphs.map(g=>g.bounds.y2))*1000/upm;
 // Whole-em aligned scanline grid. Cache comparisons only when this shared grid stays identical.
 const low=Math.floor(ymin/params.step)*params.step,high=Math.ceil(ymax/params.step)*params.step;
 const gridKey=key+':'+low+':'+high;if(geometry.gridKey!==gridKey){geometry.clear();distances.clear();geometry.gridKey=gridKey;}
 const ys=[];for(let y=low+params.step*.5;y<high;y+=params.step)ys.push(y);
 if(ys.length>10000)throw Error('輪郭の縦範囲が大きすぎます。フォントを確認してください。');
 const items=[];for(let i=0;i<glyphs.length;i++){if(signal())throw Error('中止');const g=glyphs[i];let parsed=geometry.get(g.id);if(!parsed){const segments=flatten(g.commands,1000/upm,Math.min(.35,params.step/8));parsed={...g,segments,advance:g.advance*1000/upm};parsed.profile=profile(parsed,ys);geometry.set(g.id,parsed);}items.push(parsed);if(i%8===0){progress('輪郭解析',i/glyphs.length*.35);await new Promise(r=>setTimeout(r,0));}}
 // params.convention: groups by convention (conventions.js) become fixed groups that may still take in look-alikes;
 // the user's / imported fixed groups come first and keep their own absorb setting.
 const groups={},convention={};for(const [i,side] of ['left','right'].entries()){const own=fixed[side]||[];let fx=own,fa=own.map(()=>params.absorbFixed===true);
  if(params.convention){const c=conventionGroups(items,side,params,{taken:new Set(own.flat()),sep:params.separation?.[side]});convention[side]={groups:c.groups.map(g=>[...g].sort((a,b)=>a-b)),removed:c.removed};fx=[...own,...c.groups];fa=[...fa,...c.groups.map(()=>true)];}
  groups[side]=await cluster(items,side,{...params,absorbFixed:false},{fixed:fx,fixedAbsorb:fa,cache:distances,signal,progress:p=>progress(side==='left'?'左輪郭を分類':'右輪郭を分類',.35+i*.325+p*.325)});}
 return{items,ys,groups,convention:params.convention?convention:null};};}
