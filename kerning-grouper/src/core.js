// Coordinate system: y up; all geometry in 1000-UPM design units.
export const defaults = {shape:8, bearing:8, local:24, missing:0.06, step:6, strength:0};
export function flatten(commands, scale=1, tolerance=0.35) {
  const out=[]; let p=null,start=null;
  const point=c=>({x:c.x*scale,y:c.y*scale});
  const line=(a,b)=>{if(a && (a.x!==b.x||a.y!==b.y))out.push([a.x,a.y,b.x,b.y]);};
  const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const distance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y;return Math.hypot(dx,dy)?Math.abs(dy*p.x-dx*p.y+b.x*a.y-b.y*a.x)/Math.hypot(dx,dy):Math.hypot(p.x-a.x,p.y-a.y);};
  function cubic(a,b,c,d,n=0){const chord=Math.hypot(d.x-a.x,d.y-a.y),poly=Math.hypot(b.x-a.x,b.y-a.y)+Math.hypot(c.x-b.x,c.y-b.y)+Math.hypot(d.x-c.x,d.y-c.y);if(n>=18||(Math.max(distance(b,a,d),distance(c,a,d))<=tolerance&&poly-chord<=tolerance*2)){line(a,d);return;}const ab=mid(a,b),bc=mid(b,c),cd=mid(c,d),abc=mid(ab,bc),bcd=mid(bc,cd),m=mid(abc,bcd);cubic(a,ab,abc,m,n+1);cubic(m,bcd,cd,d,n+1);}
  for(const c of commands){if(c.type==='M'){if(p&&start)line(p,start);p=point(c);start=p;}else if(c.type==='L'){const q=point(c);line(p,q);p=q;}else if(c.type==='C'){const q=point(c);cubic(p,{x:c.x1*scale,y:c.y1*scale},{x:c.x2*scale,y:c.y2*scale},q);p=q;}else if(c.type==='Q'){const q=point(c),v={x:c.x1*scale,y:c.y1*scale};cubic(p,{x:p.x+2*(v.x-p.x)/3,y:p.y+2*(v.y-p.y)/3},{x:q.x+2*(v.x-q.x)/3,y:q.y+2*(v.y-q.y)/3},q);p=q;}else if(c.type==='Z'){line(p,start);p=start;}}
  if(p&&start)line(p,start);return out;
}
export function scanline(segments,y){
  const hits=[];
  for(const [x1,y1,x2,y2] of segments)if((y1<=y&&y<y2)||(y2<=y&&y<y1))hits.push({x:x1+(y-y1)*(x2-x1)/(y2-y1),w:y2>y1?1:-1});
  hits.sort((a,b)=>a.x-b.x);let winding=0,left=null,right=null;
  for(let i=0;i<hits.length;){const x=hits[i].x;let delta=0;while(i<hits.length&&Math.abs(hits[i].x-x)<1e-7)delta+=hits[i++].w;const before=winding;winding+=delta;if(before===0&&winding!==0&&left===null)left=x;if(before!==0&&winding===0)right=x;}
  return left!==null&&right!==null&&right>left?[left,right]:null;
}
export function profile(g,ys){const left=[],right=[];for(const y of ys){const span=scanline(g.segments,y);left.push(span?span[0]:null);right.push(span?g.advance-span[1]:null);}return{left,right};}
export function compare(a,b){const delta=[];let union=0,miss=0;for(let i=0;i<a.length;i++){const aa=a[i]!=null,bb=b[i]!=null;if(!aa&&!bb)continue;union++;if(aa!==bb)miss++;else delta.push(a[i]-b[i]);}if(delta.length<3)return{shape:Infinity,bearing:Infinity,local:Infinity,missing:1,shared:delta.length};const sorted=[...delta].sort((a,b)=>a-b),offset=sorted[Math.floor(sorted.length/2)];return{shape:Math.sqrt(delta.reduce((s,d)=>s+(d-offset)**2,0)/delta.length),bearing:Math.abs(offset),local:Math.max(...delta.map(Math.abs)),missing:miss/union,shared:delta.length};}
// Smooth only the clustering signature. Original geometry remains authoritative
// for rendering, pair generation and collision protection.
export const MAX_STRENGTH=200;
export function groupingParams(p){const t=Math.max(0,Math.min(MAX_STRENGTH,p.strength||0))/100;return {...p,shape:p.shape+72*t,bearing:p.bearing+48*t,local:p.local+216*t,missing:Math.min(1,p.missing+.34*t)};}
export function groupingProfile(edge,p){const sigma=48*Math.max(0,Math.min(MAX_STRENGTH,p.strength||0))/100;if(!sigma)return edge;const radius=Math.ceil(3*sigma/p.step);return edge.map((v,i)=>{if(v===null)return null;let sum=0,w=0;for(let k=-radius;k<=radius;k++){const x=edge[i+k];if(x===undefined||x===null)continue;const a=Math.exp(-.5*(k*p.step/sigma)**2);sum+=a*x;w+=a;}return sum/w;});}
export function score(d,p){if(d.shared<3)return Infinity;return Math.max(...['shape','bearing','local','missing'].map(k=>p[k]===0?(d[k]===0?0:Infinity):d[k]/p[k]));}
const tick=()=>new Promise(r=>setTimeout(r,0));
// 和文 = CJK symbols/punctuation, kana, CJK ideographs, compatibility ideographs, half/fullwidth forms.
// Everything else (including unencoded glyphs) counts as 欧文.
const JA_RANGES=[[0x3000,0x30FF],[0x31F0,0x31FF],[0x3200,0x32FF],[0x3400,0x4DBF],[0x4E00,0x9FFF],[0xF900,0xFAFF],[0xFE30,0xFE4F],[0xFF00,0xFFEF]];
export function scriptOf(unicodes){return (unicodes||[]).some(u=>JA_RANGES.some(([a,b])=>u>=a&&u<=b))?'ja':'latin';}
export async function cluster(items,side,params,{signal=()=>false,progress=()=>{},cache=new Map(),fixed=[],fixedAbsorb=null}={}){
  const sorted=[...items].sort((a,b)=>a.id-b.id), n=sorted.length, index=new Map(sorted.map((g,i)=>[g.id,i]));
  const effective=groupingParams(params),signatures=sorted.map(g=>groupingProfile(g.profile[side],params));
  const matrix=Array.from({length:n},()=>new Float64Array(n));const edges=[];let iterations=0;// params.separation[side][glyphId] = partner signature; glyphs with different signatures never share a group
  // (their class value would leak into region pairs that must stay at 0). mixScripts=false is the 和欧-only case.
  const sep=params.separation?.[side],separate=!!sep||params.mixScripts===false,scripts=separate?sorted.map(g=>sep?String(sep[g.id]??''):scriptOf(g.unicodes)):null;
  for(let i=0;i<n;i++){for(let j=i+1;j<n;j++){const key=(params.strength||0)+':'+params.step+':'+side+':'+sorted[i].id+':'+sorted[j].id;let d=cache.get(key);if(!d){d=compare(signatures[i],signatures[j]);cache.set(key,d);}const s=separate&&scripts[i]!==scripts[j]?Infinity:score(d,effective);matrix[i][j]=matrix[j][i]=s;if(s<=1)edges.push([s,i,j]);if(++iterations%3000===0){if(signal())throw Error('中止');progress(i/n*.65);await tick();}}}
  edges.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
  const parent=Array.from({length:n},(_,i)=>i),groups=new Map(sorted.map((g,i)=>[i,[i]])),locked=new Set();
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const absorbing=new Set();fixed.forEach((f,k)=>{const ids=f.filter(id=>index.has(id)).map(id=>index.get(id));if(!ids.length)return;const first=ids[0];for(const id of ids){parent[id]=first;if(id!==first)groups.delete(id);}groups.set(first,ids);locked.add(first);if(params.absorbFixed===true||fixedAbsorb?.[k])absorbing.add(first);});
  // Absorbing fixed groups (params.absorbFixed, or fixedAbsorb[k] per fixed group) stay apart from each other but may
  // take in unfixed glyphs (complete link: every member within the thresholds). Others never change.
  for(const r of absorbing){const mem=groups.get(r);for(let c=0;c<n;c++){if(mem.includes(c))continue;let d=0;for(const m of mem)d=Math.max(d,matrix[m][c]);matrix[r][c]=matrix[c][r]=d;}}
  let counter=0;
  // Agglomerate using an exact complete-link matrix and a lazy min heap.
  const heap=[];function push(v){heap.push(v);let k=heap.length-1;while(k){let q=(k-1)>>1;if(cmp(heap[q],v)<=0)break;heap[k]=heap[q];k=q;}heap[k]=v;}function cmp(a,b){return a[0]-b[0]||a[1]-b[1]||a[2]-b[2];}function pop(){const first=heap[0],v=heap.pop();if(heap.length){let k=0;while(2*k+1<heap.length){let c=2*k+1;if(c+1<heap.length&&cmp(heap[c+1],heap[c])<0)c++;if(cmp(v,heap[c])<=0)break;heap[k]=heap[c];k=c;}heap[k]=v;}return first;}
  const version=new Uint32Array(n);
  if(absorbing.size){for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){if(!groups.has(i)||!groups.has(j)||(locked.has(i)&&locked.has(j)))continue;if(!absorbing.has(i)&&!absorbing.has(j))continue;if(matrix[i][j]<=1)push([matrix[i][j],i,j,0,0]);}}
  for(const [s,i,j]of edges)if(!locked.has(i)&&!locked.has(j)&&groups.has(i)&&groups.has(j))push([s,i,j,0,0]);
  while(heap.length){const [s,a,b,va,vb]=pop();if(!groups.has(a)||!groups.has(b)||version[a]!==va||version[b]!==vb)continue;groups.get(a).push(...groups.get(b));groups.delete(b);if(locked.has(b)){locked.delete(b);locked.add(a);if(absorbing.delete(b))absorbing.add(a);}version[a]++;for(const c of groups.keys()){if(c===a||(locked.has(c)&&(locked.has(a)||!absorbing.has(c))))continue;const d=Math.max(matrix[a][c],matrix[b][c]);matrix[a][c]=matrix[c][a]=d;if(d<=1)push([d,Math.min(a,c),Math.max(a,c),version[Math.min(a,c)],version[Math.max(a,c)]]);}if(++counter%25===0){if(signal())throw Error('中止');progress(.65+.35*(1-groups.size/Math.max(n,1)));await tick();}}
  if(signal())throw Error('中止');return [...groups.values()].map(ids=>ids.map(i=>sorted[i].id).sort((a,b)=>a-b)).sort((a,b)=>b.length-a.length||a[0]-b[0]);
}
// The kern lookup as FontLab compiles it (FontLab uses the AFDKO feature compiler; checked against makeotf output):
// one lookup, glyph pairs in a PairPos Format 1 subtable, class pairs in one Format 2 subtable, and the Coverage and
// ClassDef tables after both. The first subtable's 16-bit offsets therefore reach across the whole lookup, so without
// Extension lookups the lookup must stay within 65,535 bytes; splitting it into subtables or lookups does not lift that.
//   first/second: export classes (arrays of glyph ids); values: Map 'i:j' → class value; exceptions: [{a,b}] glyph pairs.
// Format 2 keeps only classes used by a nonzero class pair (second side adds class 0). byRegion: {regionOf(id)} also
// returns the size with one Format 2 subtable per kerning region (no zero cross blocks), for comparison.
export function estimateFontLab({first,second,values,exceptions},regionOf=null){
 const cov=ids=>{const s=[...new Set(ids)].sort((a,b)=>a-b);let r=0;for(let i=0;i<s.length;i++)if(!i||s[i]!==s[i-1]+1)r++;return s.length?Math.min(4+2*s.length,4+6*r):0;};
 const cd=m=>{const s=[...m].filter(([,c])=>c).sort((a,b)=>a[0]-b[0]);if(!s.length)return 6;let r=0;for(let i=0;i<s.length;i++)if(!i||s[i][0]!==s[i-1][0]+1||s[i][1]!==s[i-1][1])r++;return Math.min(6+2*(s[s.length-1][0]-s[0][0]+1),4+6*r);};
 const f2=(keep)=>{const uf=new Set(),us=new Set();for(const [k,v]of values){if(!v)continue;const [i,j]=k.split(':').map(Number);if(!keep(i))continue;uf.add(i);us.add(j);}
  if(!uf.size)return{bytes:0,matrix:0,c1:0,c2:0};const fl=[...uf],sl=[...us],m1=new Map(),m2=new Map();fl.forEach((i,n)=>first[i].forEach(g=>m1.set(g,n)));sl.forEach((j,n)=>second[j].forEach(g=>m2.set(g,n+1)));
  const matrix=2*fl.length*(sl.length+1);return{bytes:16+matrix+cov([...m1.keys()])+cd(m1)+cd(m2),matrix,c1:fl.length,c2:sl.length+1};};
 const firsts=new Set(exceptions.map(p=>p.a)),f1=exceptions.length?10+4*firsts.size+4*exceptions.length+cov([...firsts]):0;
 const one=f2(()=>true),head=58,total=head+f1+one.bytes;const out={total,format1:f1,format2:one.bytes,matrix:one.matrix,classes:[one.c1,one.c2],pairs:exceptions.length,limit:65535};
 if(regionOf){const regs=new Set(first.map(l=>regionOf(l[0])));let split=head+f1;for(const r of regs)split+=f2(i=>regionOf(first[i][0])===r).bytes+2;out.split=split;}
 return out;}
// zero: {right:Set,left:Set} of group indices whose every final pair value is 0. Such first-side groups leave the
// Coverage table and second-side groups fold into class 0, so they cost no matrix rows/columns.
export function estimate(glyphs,groups,zero=null){const zr=zero?.right||new Set(),zl=zero?.left||new Set();const keptR=groups.right.filter((_,i)=>!zr.has(i)),keptL=groups.left.filter((_,i)=>!zl.has(i));const c1=keptR.length+1,c2=keptL.length+1;const n1=zero?keptR.reduce((s,g)=>s+g.length,0):glyphs.length,n2=zero?keptL.reduce((s,g)=>s+g.length,0):glyphs.length;const matrix=2*c1*c2,overhead=16+(4+2*n1)+(4+6*n1)+(4+6*n2)+128;return{matrix,overhead,total:matrix+overhead,c1,c2,candidates:keptR.length*keptL.length,excluded:{right:zr.size,left:zl.size}};}
