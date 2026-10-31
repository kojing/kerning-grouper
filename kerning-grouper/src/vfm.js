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

// The .vfm text. pairs: [{a, b, value}] final glyph-pair values in 1000-UPM units.
// classes (optional): {first: [[ids]], second: [[ids]], values: Map("i:j" → class value, 1000 UPM)} — the export
// classes. With classes the file is written the way FontLab 8 writes class kerning (seen in a FontLab export):
//   masters.<M>.kerningClasses: [{"1st": true, "name", "names": [glyph names]}, {"2nd": true, …}, {"1st": true, "2nd": true, …}]
//   masters.<M>.pairs: {"@first class" | glyph: {"@second class" | glyph: "value"}}
// One-glyph classes are written as the glyph. A glyph pair whose value differs from its class pair (exceptions,
// including 0) is written glyph to glyph, which FontLab applies over the class pair. A glyph set used on both sides
// becomes one class with both flags. Without classes every non-zero glyph pair is written (classes flattened).
// With a reference .vfm, that file is the base (metrics, other masters kept). Its kerning that involves any glyph
// outside targets is kept: classes without target glyphs stay as they are with their pairs; pairs that need a class
// containing a target glyph are written out glyph by glyph for the non-target glyphs (that class is replaced).
// className: template for class names — {kind} what the class holds (kindOf(ids): UC, lc, Grk, Fig, Hira, Kata,
// JPunct, Sym, Mix…), {lead} its first glyph's name, {side} 1st (pair first: the glyphs' right side) / 2nd (pair
// second: their left side) / both, {n} running number, {count} glyph count. Spaces become _, names are made unique.
// metrics: per-glyph metrics written into metrics.<glyph>.layers.<master> (FontLab: File > Import > Metrics).
export function buildVfm({pairs,upm,name,master,reference=null,targets=null,classes=null,className='{kind}_{lead}_{side}',kindOf=()=>'',metrics=null}){const out={},k=upm/1000,fu=v=>Math.round(v*k);let count=0,keptOutside=0,classPairs=0,exceptionPairs=0;
 const T=new Set(targets?[...targets].map(name):pairs.flatMap(p=>[name(p.a),name(p.b)]));const set=(a,b,v)=>{(out[a]||(out[a]={}))[b]=String(v);};
 let keptDefs=[],refDefsRaw=null;
 if(reference&&targets){const v=reference.data,m=v.masters?.[master]||{},defs=classDefs(v,master),byName=new Map(defs.map(c=>[c.name,c])),raw=m.pairs||{};
  const at=Object.entries(raw).some(([a,row])=>a.startsWith('@')||Object.keys(row||{}).some(b=>b.startsWith('@')));
  const cls=nm=>at?(nm.startsWith('@')?byName.get(nm.slice(1)):undefined):(byName.has(nm)&&!T.has(nm)&&!(v.metrics||{})[nm]?byName.get(nm):undefined);
  const dropped=new Set(defs.filter(c=>c.names.some(n=>T.has(n))).map(c=>c.name));refDefsRaw=Array.isArray(m.kerningClasses)?m.kerningClasses:null;
  keptDefs=(refDefsRaw||[]).filter(c=>c&&!dropped.has(String(c.name)));
  const touches=nm=>{const c=cls(nm);return c?dropped.has(c.name):T.has(nm);};const flat=new Map();
  for(const [a,row]of Object.entries(raw))for(const [b,val]of Object.entries(row||{})){if(!touches(a)&&!touches(b)){set(a,b,val);keptOutside++;continue;}
   const A=cls(a),B=cls(b),lvl=(A?0:1)+(B?0:1);for(const x of A?A.names:[a])for(const y of B?B.names:[b]){if(T.has(x)&&T.has(y))continue;const key=x+'\t'+y,o=flat.get(key);if(!o||lvl>=o.l)flat.set(key,{l:lvl,v:val});}}
  for(const [key,{v}]of flat){const [x,y]=key.split('\t');set(x,y,v);keptOutside++;}}
 let defsOut=null;
 if(classes){const used=new Set(keptDefs.map(c=>String(c.name))),uniq=n=>{let x=n,i=2;while(used.has(x))x=n+'_'+i++;used.add(x);return x;};
  const sig=ids=>ids.map(name).sort().join('\u0001'),bySig=new Map(),defs=[],ref1=[],ref2=[];
  const def=(ids,side)=>{if(ids.length<2)return name(ids[0]);const s=sig(ids);let d=bySig.get(s);if(!d){d={name:null,names:ids.map(name),'1st':false,'2nd':false,lead:name(ids[0]),kind:kindOf(ids)};bySig.set(s,d);defs.push(d);}d[side]=true;return d;};
  classes.first.forEach((ids,i)=>ref1[i]=def(ids,'1st'));classes.second.forEach((ids,j)=>ref2[j]=def(ids,'2nd'));
  defs.forEach((d,i)=>{const side=d['1st']&&d['2nd']?'both':d['1st']?'1st':'2nd';let x=String(className||'{kind}_{lead}_{side}').replace(/\{kind\}/g,d.kind||'').replace(/\{lead\}/g,d.lead).replace(/\{side\}/g,side).replace(/\{n\}/g,String(i+1)).replace(/\{count\}/g,String(d.names.length)).replace(/\s+/g,'_').replace(/^[_.-]+|[_.-]+$/g,'').replace(/([_.-])[_.-]+/g,'$1');d.name=uniq(x||d.lead);});
  const key=r=>typeof r==='string'?r:'@'+r.name;
  const ci=new Map(),cj=new Map();classes.first.forEach((ids,i)=>ids.forEach(id=>ci.set(id,i)));classes.second.forEach((ids,j)=>ids.forEach(id=>cj.set(id,j)));
  for(const [kk,v]of classes.values){const x=fu(v);if(!x)continue;const [i,j]=kk.split(':').map(Number);if(ref1[i]===undefined||ref2[j]===undefined)continue;set(key(ref1[i]),key(ref2[j]),x);classPairs++;}
  for(const p of pairs){const i=ci.get(p.a),j=cj.get(p.b),cv=i!==undefined&&j!==undefined?fu(classes.values.get(i+':'+j)||0):0,x=fu(p.value);if(x===cv)continue;
   // a one-glyph class pair is already this glyph pair
   const a=name(p.a),b=name(p.b);set(a,b,x);exceptionPairs++;}
  defsOut=[...keptDefs,...defs.map(d=>{const o={};if(d['1st'])o['1st']=true;if(d['2nd'])o['2nd']=true;o.name=d.name;o.names=d.names;return o;})];count=classPairs+exceptionPairs;}
 else for(const p of pairs){const x=fu(p.value);if(!x)continue;set(name(p.a),name(p.b),x);count++;}
 const sorted={};for(const a of Object.keys(out).sort(byCode)){const row={};for(const b of Object.keys(out[a]).sort(byCode))row[b]=out[a][b];sorted[a]=row;}
 let v;if(reference){v=JSON.parse(JSON.stringify(reference.data));const m={...(v.masters[master]||{})};if(defsOut)m.kerningClasses=defsOut;else if(refDefsRaw)m.kerningClasses=keptDefs;m.pairs=sorted;
  // keep FontLab's key order: kerningClasses before pairs
  const o={};if(m.kerningClasses)o.kerningClasses=m.kerningClasses;for(const [kk,val]of Object.entries(m))if(kk!=='kerningClasses'&&kk!=='pairs')o[kk]=val;o.pairs=sorted;v.masters[master]=o;}
 else v={dataType:'com.fontlab.metrics',masters:{[master]:defsOut?{kerningClasses:defsOut,pairs:sorted}:{pairs:sorted}},upm};
 // metrics: {glyph name: {lsb, rsb, width, xmin, xmax, ymin, ymax}} for this master (文字間隔: sidebearings changed after kerning)
 let metricCount=0;if(metrics){const M=v.metrics||(v.metrics={});for(const [nm,val]of Object.entries(metrics)){const g=M[nm]||(M[nm]={});const L=g.layers||(g.layers={});L[master]=val;metricCount++;}}
 return{metricCount,text:JSON.stringify(v,null,4)+'\n',count,keptOutside,classPairs,exceptionPairs,classCount:defsOut?defsOut.length-keptDefs.length:0,firsts:Object.keys(sorted).length};}
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

// gid → CID of a CID-keyed CFF font, from the charset in the font bytes (opentype.js does not keep CIDs); null otherwise.
export function cidMap(buffer,font){try{const ros=font.tables?.cff?.topDict?.ros;if(!ros)return null;const v=new DataView(buffer);let cff=-1;for(let i=0;i<v.getUint16(4);i++){const o=12+i*16;if(String.fromCharCode(v.getUint8(o),v.getUint8(o+1),v.getUint8(o+2),v.getUint8(o+3))==='CFF ')cff=v.getUint32(o+8);}
 if(cff<0)return null;const n=font.glyphs.length,out=new Uint32Array(n);let p=cff+font.tables.cff.topDict.charset;const fmt=v.getUint8(p++);let g=1;
 if(fmt===0){for(;g<n;g++,p+=2)out[g]=v.getUint16(p);}else if(fmt===1||fmt===2){while(g<n){const first=v.getUint16(p),left=fmt===1?v.getUint8(p+2):v.getUint16(p+2);p+=fmt===1?3:4;for(let k=0;k<=left&&g<n;k++)out[g++]=first+k;}}else return null;return out;}catch{return null;}}

// Glyph reached from gid by a GSUB feature (single substitution, or alternate n, 1-based), or undefined.
function gsubStep(font,gid,tag,n=1){const gs=font.tables?.gsub;if(!gs)return undefined;const idx=[...new Set(gs.features.filter(f=>f.tag===tag).flatMap(f=>f.feature.lookupListIndexes))];
 const cov=(c,g)=>{if(c.format===1){const i=c.glyphs.indexOf(g);return i;}for(const r of c.ranges)if(g>=r.start&&g<=r.end)return r.index+g-r.start;return -1;};
 for(const li of idx){const L=gs.lookups[li];for(let st of L.subtables){let type=L.lookupType;if(type===7){type=st.lookupType;st=st.extension;}if(!st?.coverage)continue;const i=cov(st.coverage,gid);if(i<0)continue;
  if(type===1&&n===1)return st.substFormat===1?(gid+st.deltaGlyphId)&0xffff:st.substitute[i];
  if(type===3){const a=st.alternateSets[i];if(a&&a[n-1]!==undefined)return a[n-1];}}}
 return undefined;}

// Map glyph names of a .vfm to glyph ids of the loaded font. In order: FontLab's name for each glyph; "_<CID>" (an
// unencoded glyph of a CID-keyed font; the gid itself otherwise); "<base>.<feature>[_<feature>…]" or
// "<base>.<n>.<feature>" (FontLab names an unencoded glyph after the glyph and GSUB feature that reach it); then
// the advance width + bounding box recorded in the .vfm (unique match).
export function nameIndex(font,ref,master){const n=glyphNamer(font),idOf=new Map();for(let i=0;i<font.glyphs.length;i++){const nm=n.name(i);if(!idOf.has(nm))idOf.set(nm,i);}
 const metrics=ref.data.metrics||{};let bySig=null,byCid=null;const memo=new Map();
 const sigOf=i=>{const g=font.glyphs.get(i),b=g.getBoundingBox();return[g.advanceWidth,b.x1,b.x2,b.y1,b.y2].map(Math.round).join(',');};
 const fromCid=c=>{if(!font.kgCids)return c<font.glyphs.length?c:undefined;if(!byCid){byCid=new Map();font.kgCids.forEach((cid,g)=>byCid.set(cid,g));}return byCid.get(c);};
 const fromFeature=nm=>{const d=nm.indexOf('.');if(d<=0)return undefined;const base=resolve(nm.slice(0,d));if(base===undefined)return undefined;let rest=nm.slice(d+1),alt=1;const m=/^(\d+)\.(.+)$/.exec(rest);if(m){alt=+m[1];rest=m[2];}
  let g=base;const tags=rest.split('_');for(let k=0;k<tags.length;k++){g=gsubStep(font,g,tags[k],k===0?alt:1);if(g===undefined)return undefined;}return g;};
 const fromMetrics=nm=>{const L=metrics[nm]?.layers?.[master]||Object.values(metrics[nm]?.layers||{})[0];if(!L)return undefined;
  if(!bySig){bySig=new Map();for(let i=0;i<font.glyphs.length;i++){const s=sigOf(i);bySig.set(s,bySig.has(s)?-1:i);}}
  const id=bySig.get([L.width,L.xmin??0,L.xmax??0,L.ymin??0,L.ymax??0].join(','));return id>=0?id:undefined;};
 const check=(nm,id)=>{if(id===undefined)return undefined;const L=metrics[nm]?.layers?.[master]||Object.values(metrics[nm]?.layers||{})[0];if(!L)return id;const g=font.glyphs.get(id),b=g.getBoundingBox(),near=(x,y)=>y===undefined||Math.abs(x-y)<=1;return near(g.advanceWidth,L.width)&&near(b.x1,L.xmin)&&near(b.x2,L.xmax)&&near(b.y1,L.ymin)&&near(b.y2,L.ymax)?id:undefined;};
 function resolve(nm){if(memo.has(nm))return memo.get(nm);memo.set(nm,undefined);let id=idOf.get(nm);
  if(id===undefined){const c=/^_(\d+)$/.exec(nm);if(c)id=check(nm,fromCid(+c[1]));}
  if(id===undefined)id=check(nm,fromFeature(nm));
  if(id===undefined)id=fromMetrics(nm);
  memo.set(nm,id);return id;}
 return resolve;}

// → { pairs: Map("a:b" → value in 1000 UPM), groups: {right:[[ids]], left:[[ids]]} (right = pair first),
//     source: 'classes'|'inferred', ids: Set of kerned glyph ids, names: Map(id → name in the .vfm), unmapped: [names], classCount }
export function readVfm(ref,master,font){const v=ref.data,upm=v.upm||font.unitsPerEm,lookup=nameIndex(font,ref,master),k=1000/upm,unmapped=new Set();
 const vname=new Map(),id=nm=>{const i=lookup(nm);if(i===undefined)unmapped.add(nm);else if(!vname.has(i))vname.set(i,nm);return i;};
 const defs=classDefs(v,master),byName=new Map(defs.map(c=>[c.name,c]));
 const raw=v.masters?.[master]?.pairs||{},pairs=new Map(),level=new Map(),ids=new Set();
 // A class is referenced as "@name" when the file uses that convention; otherwise by a plain name that is a class and not a glyph.
 const atMode=Object.entries(raw).some(([a,row])=>a.startsWith('@')||Object.keys(row||{}).some(b=>b.startsWith('@')));
 const classOf=nm=>atMode?(nm.startsWith('@')?byName.get(nm.slice(1)):undefined):(byName.has(nm)&&lookup(nm)===undefined?byName.get(nm):undefined);
 const expand=nm=>{const c=classOf(nm);return c?c.names:[nm];};
 const used={first:new Set(),second:new Set()};
 for(const [a,row]of Object.entries(raw)){if(!row||typeof row!=='object')continue;if(classOf(a))used.first.add(classOf(a).name);
  for(const [b,val]of Object.entries(row)){const x=Number(val);if(!Number.isFinite(x))continue;if(classOf(b))used.second.add(classOf(b).name);
   for(const an of expand(a))for(const bn of expand(b)){const ia=id(an),ib=id(bn);if(ia===undefined||ib===undefined)continue;const key=ia+':'+ib;
    // glyph–glyph values override class–glyph ones, which override class–class (FontLab's exceptions)
    const lvl=(classOf(a)?0:1)+(classOf(b)?0:1);if(!pairs.has(key)||lvl>=(level.get(key)??-1)){pairs.set(key,x*k);level.set(key,lvl);}ids.add(ia);ids.add(ib);}}}
 let groups,source;
 if(defs.length){source='classes';const side=s=>{const out=[],seen=new Set();for(const c of defs){const isSide=c[s]===null?used[s].has(c.name):c[s];if(!isSide)continue;const g=c.names.map(id).filter(i=>i!==undefined&&!seen.has(i));g.forEach(i=>seen.add(i));if(g.length)out.push(g);}return out;};groups={right:side('first'),left:side('second')};}
 else{source='inferred';const rows=new Map(),cols=new Map();for(const [key,val]of pairs){const [a,b]=key.split(':').map(Number);if(!val)continue;(rows.get(a)||rows.set(a,new Map()).get(a)).set(b,val);(cols.get(b)||cols.set(b,new Map()).get(b)).set(a,val);}
  groups=inferGroups(rows,cols);}
 // A kerned glyph that never appears on one side is, on that side, a glyph the .vfm leaves at 0: its own group.
 for(const sd of ['right','left']){const seen=new Set(groups[sd].flat());for(const i of [...ids].sort((p,q)=>p-q))if(!seen.has(i))groups[sd].push([i]);}
 return{pairs,groups,source,ids,names:vname,unmapped:[...unmapped],classCount:defs.length,upm};}

// Kerning classes from flattened pairs (a .vfm without class definitions). Class kerning plus exceptions, written
// out glyph by glyph: glyphs of one class have the same row except for a few exception cells. Rows are compared
// per column group (the value most of the group's members have), so an exception inside a class does not count;
// rows that still differ in at most 3 places (and ≤10% of a row of 8 or more) are joined. Columns likewise, twice.
// Checked on 20 professional fonts (class kerning flattened, compared with the real classes): pairwise F1 0.964 /
// 0.969 (identical rows only: 0.948 / 0.955), precision unchanged.
export function inferGroups(rows,cols,{tol=3,frac=.1,minlen=8,iters=2}={}){
 const sig=m=>[...m].sort((x,y)=>x[0]-y[0]).map(([k,v])=>k+'='+v).join('|');
 const exact=m=>{const by=new Map();for(const [g,r]of m){const s=sig(r);(by.get(s)||by.set(s,[]).get(s)).push(g);}return[...by.values()];};
 const compress=(m,groups)=>{const gi=new Map();groups.forEach((g,i)=>g.forEach(c=>gi.set(c,i)));const out=new Map();
  for(const [g,r]of m){const acc=new Map();for(const [c,v]of r){const i=gi.get(c);const cnt=acc.get(i)||acc.set(i,new Map()).get(i);cnt.set(v,(cnt.get(v)||0)+1);}
   const vec=new Map();for(const [i,cnt]of acc){let best,k=0,sum=0;for(const [v,n]of cnt){sum+=n;if(n>k){k=n;best=v;}}if(k>=groups[i].length-sum)vec.set(i,best);}out.set(g,vec);}return out;};
 const diff=(a,b)=>{let d=0;for(const [k,v]of a)if(b.get(k)!==v)d++;for(const k of b.keys())if(!a.has(k))d++;return d;};
 const merge=vecs=>{const by=new Map();for(const [g,v]of vecs){const s=sig(v);if(!by.has(s))by.set(s,{v,m:[]});by.get(s).m.push(g);}
  const list=[...by.values()].sort((x,y)=>y.m.length-x.m.length),out=[];
  for(const x of list){const o=out.find(o=>{const n=Math.max(x.v.size,o.v.size);return n>=minlen&&diff(x.v,o.v)<=Math.min(tol,frac*n);});if(o)o.m.push(...x.m);else out.push({v:x.v,m:[...x.m]});}
  return out.map(o=>o.m);};
 let R=exact(rows),C=exact(cols);for(let k=0;k<iters;k++){R=merge(compress(rows,C));C=merge(compress(cols,R));}
 const sorted=gs=>gs.map(g=>g.sort((p,q)=>p-q));return{right:sorted(R),left:sorted(C)};}

// Group-set key, for "is this group the same as one in the .vfm"
export const groupKey=ids=>[...ids].sort((a,b)=>a-b).join(',');
