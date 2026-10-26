// FontLab 8 metrics file (.vfm, JSON, dataType "com.fontlab.metrics").
// Structure (from a real FontLab export):
//   { "dataType": "com.fontlab.metrics",
//     "masters": { "<master name>": { "pairs": { "<first glyph>": { "<second glyph>": "<value>" } } } },
//     "metrics": { "<glyph>": { "layers": { "<master name>": { lsb, rsb, width, xmin, xmax, ymin, ymax } } } },   (optional here)
//     "upm": 1000 }
// Values are strings in font units. Kerning is written as glyph pairs (classes flattened), which is what
// FontLab itself writes for a CID-keyed font. Glyph names are FontLab's: the font's own names when it has
// them, otherwise the name FontLab derives from the lowest code point (fontlab-names.js).
import {fontlabName} from './fontlab-names.js';

// Does the font carry real glyph names that FontLab keeps (named CFF charset, TrueType post format 2)?
export function hasOwnNames(font){const cff=font.tables?.cff;if(cff){return !cff.topDict?.ros;}return font.tables?.post?.version===2;}

// Default master name: typographic subfamily (nameID 17), else subfamily (nameID 2), else "Regular".
export function defaultMaster(font){const n=font.names||{},pick=k=>n[k]&&(n[k].en||Object.values(n[k])[0]);return pick('typographicSubfamily')||pick('preferredSubfamily')||pick('fontSubfamily')||'Regular';}

// Read a .vfm the user exported from FontLab (the file the kerning goes back into).
export function parseVfm(text){let v;try{v=JSON.parse(text);}catch{throw Error('VFM（JSON）として読めません。');}if(!v||v.dataType!=='com.fontlab.metrics'||typeof v.masters!=='object'||!v.masters)throw Error('FontLab のメトリクスファイル（dataType: com.fontlab.metrics）ではありません。');const masters=Object.keys(v.masters);if(!masters.length)throw Error('VFM にマスターがありません。');return{data:v,masters,names:new Set(Object.keys(v.metrics||{})),upm:v.upm};}

// glyph id → FontLab glyph name. With a reference VFM, a computed name missing from it is looked up by
// metrics (advance width and bounding box, unique match) before giving up.
export function glyphNamer(font,reference=null,master=null){const own=hasOwnNames(font),cache=new Map(),stats={own,computed:0,byMetrics:0,missing:[]};
 let bySig=null;const sigOf=(w,b)=>[w,b.x1,b.x2,b.y1,b.y2].map(Math.round).join(',');
 const fromMetrics=g=>{if(!reference?.data?.metrics)return null;if(!bySig){bySig=new Map();for(const [nm,v]of Object.entries(reference.data.metrics)){const L=v?.layers?.[master]||Object.values(v?.layers||{})[0];if(!L)continue;const s=[L.width,L.xmin??0,L.xmax??0,L.ymin??0,L.ymax??0].join(',');bySig.set(s,bySig.has(s)?null:nm);}}const b=g.getBoundingBox?g.getBoundingBox():{x1:0,x2:0,y1:0,y2:0};return bySig.get(sigOf(g.advanceWidth,b))||null;};
 const name=id=>{if(cache.has(id))return cache.get(id);const g=font.glyphs.get(id);let nm=own&&g.name?g.name:null;if(!nm){const us=[...(g.unicodes||[])].sort((a,b)=>a-b);nm=us.length?fontlabName(us[0]):(g.name||'gid'+id);stats.computed++;}
  if(reference&&reference.names.size&&!reference.names.has(nm)){const alt=fromMetrics(g);if(alt){nm=alt;stats.byMetrics++;}else stats.missing.push(nm);}
  cache.set(id,nm);return nm;};
 return{name,stats};}

// The .vfm text. pairs: [{a, b, value}] in 1000-UPM units (value 0 is skipped). With a reference VFM the
// file is that VFM with this master's kerning replaced (metrics and other masters kept as they are).
// targets: glyph ids the tool worked on. With a reference, its pairs that involve any other glyph (glyphs the tool
// cannot target, e.g. alternates without a code point) are kept as they are; only pairs among targets are replaced.
export function buildVfm({pairs,upm,name,master,reference=null,targets=null}){const out={};let count=0,keptOutside=0;
 if(reference&&targets){const T=new Set([...targets].map(name)),old=reference.data.masters?.[master]?.pairs||{};for(const [a,row]of Object.entries(old))for(const [b,val]of Object.entries(row||{})){if(T.has(a)&&T.has(b))continue;(out[a]||(out[a]={}))[b]=String(val);keptOutside++;}}
 for(const p of pairs){const fu=Math.round(p.value*upm/1000);if(!fu)continue;const a=name(p.a),b=name(p.b);(out[a]||(out[a]={}))[b]=String(fu);count++;}
 const sorted={};for(const a of Object.keys(out).sort(byCode)){const row={};for(const b of Object.keys(out[a]).sort(byCode))row[b]=out[a][b];sorted[a]=row;}
 let v;if(reference){v=JSON.parse(JSON.stringify(reference.data));v.masters[master]={...(v.masters[master]||{}),pairs:sorted};}
 else v={dataType:'com.fontlab.metrics',masters:{[master]:{pairs:sorted}},upm};
 return{text:JSON.stringify(v,null,4)+'\n',count,keptOutside,firsts:Object.keys(sorted).length};}
const byCode=(x,y)=>x<y?-1:x>y?1:0;

// ---- reading kerning and groups back from a .vfm ----
// Class names (FontLab writes them with a leading "@" in other formats). The exact .vfm class layout has not
// been seen in a real file yet, so several plausible shapes are accepted and the UI says the groups were "read"
// only when definitions were found; otherwise groups are inferred from identical kerning rows/columns.
function classDefs(v,master){const out=[];const m=v.masters?.[master]||{};
 for(const src of [v.kerningClasses,v.classes,v.groups,m.kerningClasses,m.classes,m.groups]){if(!src)continue;
  const list=Array.isArray(src)?src:Object.entries(src).map(([name,names])=>Array.isArray(names)?{name,names}:{name,...names});
  for(const c of list){if(!c||typeof c!=='object')continue;const names=c.names||c.glyphs||c.members||c.list;if(!c.name||!Array.isArray(names))continue;
   const s=String(c.side??c.type??'').toLowerCase(),first=c['1st']??c._1st??c.first??c.left??(/1st|first|left|kern1/.test(s+c.name)?true:undefined),second=c['2nd']??c._2nd??c.second??c.right??(/2nd|second|right|kern2/.test(s+c.name)?true:undefined);
   out.push({name:String(c.name),names:names.map(String),first:first===undefined&&second===undefined?null:!!first,second:first===undefined&&second===undefined?null:!!second});}}
 return out;}

// Map glyph names of a .vfm to glyph ids of the loaded font: FontLab's name for each glyph, then (for names
// that do not match) the advance width + bounding box recorded in the .vfm.
export function nameIndex(font,ref,master){const n=glyphNamer(font),idOf=new Map();for(let i=0;i<font.glyphs.length;i++){const nm=n.name(i);if(!idOf.has(nm))idOf.set(nm,i);}
 const metrics=ref.data.metrics||{};let bySig=null;
 const lookup=nm=>{if(idOf.has(nm))return idOf.get(nm);const L=metrics[nm]?.layers?.[master]||Object.values(metrics[nm]?.layers||{})[0];if(!L)return undefined;
  if(!bySig){bySig=new Map();for(let i=0;i<font.glyphs.length;i++){const g=font.glyphs.get(i),b=g.getBoundingBox();const s=[g.advanceWidth,b.x1,b.x2,b.y1,b.y2].map(Math.round).join(',');bySig.set(s,bySig.has(s)?-1:i);}}
  const id=bySig.get([L.width,L.xmin??0,L.xmax??0,L.ymin??0,L.ymax??0].join(','));return id>=0?id:undefined;};
 return lookup;}

// → { pairs: Map("a:b" → value in 1000 UPM), groups: {right:[[ids]], left:[[ids]]} (right = pair first),
//     source: 'classes'|'inferred', ids: Set of kerned glyph ids, unmapped: [names], classCount }
export function readVfm(ref,master,font){const v=ref.data,upm=v.upm||font.unitsPerEm,lookup=nameIndex(font,ref,master),k=1000/upm,unmapped=new Set();
 const id=nm=>{const i=lookup(nm);if(i===undefined)unmapped.add(nm);return i;};
 const defs=classDefs(v,master),byName=new Map(defs.map(c=>[c.name,c]));
 const raw=v.masters?.[master]?.pairs||{},pairs=new Map(),ids=new Set();
 // A class is referenced as "@name" when the file uses that convention; otherwise by a plain name that is a class and not a glyph.
 const atMode=Object.entries(raw).some(([a,row])=>a.startsWith('@')||Object.keys(row||{}).some(b=>b.startsWith('@')));
 const classOf=nm=>atMode?(nm.startsWith('@')?byName.get(nm.slice(1)):undefined):(byName.has(nm)&&lookup(nm)===undefined?byName.get(nm):undefined);
 const expand=nm=>{const c=classOf(nm);return c?c.names:[nm];};
 const used={first:new Set(),second:new Set()};
 for(const [a,row]of Object.entries(raw)){if(!row||typeof row!=='object')continue;if(classOf(a))used.first.add(classOf(a).name);
  for(const [b,val]of Object.entries(row)){const x=Number(val);if(!Number.isFinite(x))continue;if(classOf(b))used.second.add(classOf(b).name);
   for(const an of expand(a))for(const bn of expand(b)){const ia=id(an),ib=id(bn);if(ia===undefined||ib===undefined)continue;const key=ia+':'+ib;
    // glyph–glyph values override class values (written as exceptions)
    const specific=!classOf(a)&&!classOf(b);if(!pairs.has(key)||specific)pairs.set(key,x*k);ids.add(ia);ids.add(ib);}}}
 let groups,source;
 if(defs.length){source='classes';const side=s=>{const out=[],seen=new Set();for(const c of defs){const isSide=c[s]===null?used[s].has(c.name):c[s];if(!isSide)continue;const g=c.names.map(id).filter(i=>i!==undefined&&!seen.has(i));g.forEach(i=>seen.add(i));if(g.length)out.push(g);}return out;};groups={right:side('first'),left:side('second')};}
 else{source='inferred';const rows=new Map(),cols=new Map();for(const [key,val]of pairs){const [a,b]=key.split(':').map(Number);if(!val)continue;(rows.get(a)||rows.set(a,[]).get(a)).push(b+'='+val);(cols.get(b)||cols.set(b,[]).get(b)).push(a+'='+val);}
  const group=m=>{const by=new Map();for(const [g,list]of m){const sig=list.sort().join('|');(by.get(sig)||by.set(sig,[]).get(sig)).push(g);}return[...by.values()].map(x=>x.sort((p,q)=>p-q));};
  groups={right:group(rows),left:group(cols)};}
 return{pairs,groups,source,ids,unmapped:[...unmapped],classCount:defs.length,upm};}

// Group-set key, for "is this group the same as one in the .vfm"
export const groupKey=ids=>[...ids].sort((a,b)=>a-b).join(',');
