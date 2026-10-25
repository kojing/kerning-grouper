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
export function buildVfm({pairs,upm,name,master,reference=null}){const out={};let count=0;
 for(const p of pairs){const fu=Math.round(p.value*upm/1000);if(!fu)continue;const a=name(p.a),b=name(p.b);(out[a]||(out[a]={}))[b]=String(fu);count++;}
 const sorted={};for(const a of Object.keys(out).sort(byCode)){const row={};for(const b of Object.keys(out[a]).sort(byCode))row[b]=out[a][b];sorted[a]=row;}
 let v;if(reference){v=JSON.parse(JSON.stringify(reference.data));v.masters[master]={...(v.masters[master]||{}),pairs:sorted};}
 else v={dataType:'com.fontlab.metrics',masters:{[master]:{pairs:sorted}},upm};
 return{text:JSON.stringify(v,null,4)+'\n',count,firsts:Object.keys(sorted).length};}
const byCode=(x,y)=>x<y?-1:x>y?1:0;
