// Pair table shared by grouping and kerning.
// Rows = first glyph of a pair (right-outline groups), columns = second glyph (left-outline groups).
// Two granularities over the same data: one cell per group pair (class kerning) or one cell per glyph
// pair (final values incl. exceptions), with group boundaries drawn. Virtualised canvas; original outlines.
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const C={bg:'#ffffff',cell:'#ffffff',cellAlt:'#ffffff',line:'#ffffff',groupLine:'#d9dde3',head:'#ffffff',headLine:'#d9dde3',text:'#5b616d',strong:'#1d2129',glyph:'#1d2129',sel:'#0e7a6b',selBand:'rgba(14,122,107,.12)',hover:'rgba(14,122,107,.07)',warn:'#9a5b00',ghost:'rgba(96,104,118,.75)',shiftNeg:'rgb(222,120,80)',shiftPos:'rgb(90,140,224)',cross:'#eceef1',crossLine:'#ffffff',crossGlyph:'#d9dde3',neg:[214,92,46],pos:[47,111,214]};
export const gridColors=C;
const heat=(v,scale=1)=>{if(!v)return null;const t=Math.min(1,Math.abs(v)/120),[r,g,b]=v<0?C.neg:C.pos;return`rgba(${r},${g},${b},${((.14+.56*t)*scale).toFixed(3)})`;};
const signed=v=>(v>0?'+':'')+v;
const REASON={'digit-protection':'数字保護','manual':'手動ペア','no-optical-overlap':'光学評価不可','optical-exception':'光学的な個別例外','collision-exception':'接触回避の個別例外'};

export function mountGrid(host,getContext,hooks={}){
 host.innerHTML=`<div class="grid-tools">
  <div class="seg" role="group" aria-label="表の単位"><button type="button" data-gunit="group" class="on" aria-pressed="true">グループ単位</button><button type="button" data-gunit="glyph" aria-pressed="false">グリフ単位</button></div>
  <label class="grid-size">セル <input data-gsize type="range" min="14" max="96" step="2" value="56" aria-label="セルの大きさ"></label>
  <label><input type="checkbox" data-gonly> カーニングの表示のみ</label>
  <label>並び <select data-gsort aria-label="並び順"><option value="index">グループ順</option><option value="size">グリフ数の多い順</option><option value="abs">補正量の大きい順</option></select></label>
  <input data-gfilter placeholder="文字で絞る（AV＝行と列の両方が一致、A V＝どちらかが一致）" aria-label="表を文字で絞り込む">
 </div>
 <div class="grid-legend" data-glegend></div>
 <div class="grid-wrap"><div class="grid-scroll hidden" data-gscroll tabindex="0" role="grid" aria-label="ペアの表。矢印キーでセルを移動、見出しのクリックでグループを選択"><div class="grid-inner" data-ginner><canvas class="grid-canvas" data-gcanvas></canvas></div></div><div class="grid-tip hidden" data-gtip></div><div class="grid-empty" data-gempty>グループを作成すると、先頭グループ×後ろグループの表がここに出ます。</div></div>`;
 const $=s=>host.querySelector(s),$$=s=>[...host.querySelectorAll(s)];
 const scroll=$('[data-gscroll]'),inner=$('[data-ginner]'),canvas=$('[data-gcanvas]'),tip=$('[data-gtip]'),detailBox=hooks.detailHost||document.createElement('div');
 let unit='group',filtering=false,anyMode=false,nHitR=0,nHitC=0,rows=[],cols=[],S=56,RW=96,HH=78,hover=null,sel=null,rowScript=[],colScript=[],anyCross=false;
 let zeroR=new Set(),zeroL=new Set(),classMap=new Map(),excMap=new Map(),pairMap=new Map(),lastResolved=null,lastResult=null,frame=0,subHit=null;
 const cache={font:null,map:new Map()};
 const ctxData=()=>getContext();
 function glyph(id){const {font}=ctxData();if(cache.font!==font){cache.font=font;cache.map.clear();}let g=cache.map.get(id);if(!g){const gl=font.glyphs.get(id),p=new Path2D();for(const c of gl.path.commands){if(c.type==='M')p.moveTo(c.x,c.y);else if(c.type==='L')p.lineTo(c.x,c.y);else if(c.type==='C')p.bezierCurveTo(c.x1,c.y1,c.x2,c.y2,c.x,c.y);else if(c.type==='Q')p.quadraticCurveTo(c.x1,c.y1,c.x,c.y);else if(c.type==='Z')p.closePath();}g={path:p,adv:gl.advanceWidth||0};cache.map.set(id,g);}return g;}
 function metrics(){const {font}=ctxData(),upm=font.unitsPerEm;let asc=font.ascender,desc=font.descender;if(!Number.isFinite(asc)||asc<=0)asc=upm*.88;if(!Number.isFinite(desc)||desc>=0)desc=-upm*.12;return{upm,asc,desc};}
 // Scale and anchor come from the unkerned layout, so kerning visibly moves glyphs instead of being
 // absorbed by re-fitting. With overlay, the before position is drawn as an outline and the shift as a bar.
 function drawGlyphs(ctx,ids,kerns,x,y,w,h,color,overlay=false){const {asc,desc}=metrics(),gs=ids.map(glyph);const plain=gs.reduce((s,g)=>s+g.adv,0),shift=kerns.reduce((s,k)=>s+(k||0),0);const s=Math.min(h/(asc-desc),w/Math.max(1,plain,plain+shift));const x0=x+(w-Math.max(plain,plain+shift)*s)/2,base=y+(h-(asc-desc)*s)/2+asc*s;
  const before=[],after=[];let pb=0,pa=0;gs.forEach((g,i)=>{before.push(pb);after.push(pa);pb+=g.adv;pa+=g.adv+(kerns[i]||0);});
  const moved=overlay&&kerns.some(k=>k);
  if(moved){ctx.strokeStyle=C.ghost;gs.forEach((g,i)=>{if(before[i]===after[i])return;ctx.save();ctx.translate(x0+before[i]*s,base);ctx.scale(s,-s);ctx.lineWidth=1/s;ctx.stroke(g.path);ctx.restore();});}
  ctx.fillStyle=color;gs.forEach((g,i)=>{ctx.save();ctx.translate(x0+after[i]*s,base);ctx.scale(s,-s);ctx.fill(g.path);ctx.restore();});
  if(moved){const by=Math.min(y+h-3,base+Math.max(2,-desc*s*.35));gs.forEach((g,i)=>{const d=after[i]-before[i];if(!d)return;const a=x0+before[i]*s,b=x0+after[i]*s;const bx=Math.min(a,b),bw=Math.max(1.5,Math.abs(b-a));ctx.fillStyle=C.bg;ctx.fillRect(bx-1,by-1,bw+2,5);ctx.fillRect(a-1.5,by-4,3,11);ctx.fillStyle=d<0?C.shiftNeg:C.shiftPos;ctx.fillRect(bx,by,bw,3);ctx.fillRect(a-.5,by-3,1,9);});}}
 function rep(ids){const c=ctxData(),items=c.result.items;const withChar=ids.find(id=>items.find(g=>g.id===id)?.unicodes?.length);return withChar??ids[0];}
 function chars(ids,n=8){const c=ctxData();return ids.slice(0,n).map(id=>c.display(id)).join(' ')+(ids.length>n?' …':'');}
 const res=()=>{const c=ctxData();return c.kernOn?c.resolved:null;};
 // Row/column entries: {i, id} where id is null in group mode.
 function prepare(){const c=ctxData();if(!c.result){rows=cols=[];return;}const r=res();
  if(r!==lastResolved||c.result!==lastResult){lastResolved=r;lastResult=c.result;zeroR=r?.zeroGroups?.right||new Set();zeroL=r?.zeroGroups?.left||new Set();classMap=new Map();excMap=new Map();pairMap=new Map();if(r){for(const k of r.classes)classMap.set(k.key,k);for(const p of r.pairs)pairMap.set(p.key,p);for(const p of r.exceptions){const key=p.c1+':'+p.c2;excMap.set(key,(excMap.get(key)||0)+1);}}}
  const g=c.result.groups;rowScript=g.right.map(ids=>rep(ids));colScript=g.left.map(ids=>rep(ids));anyCross=rowScript.some(a=>colScript.some(b=>c.pairDenied(a,b)));
  const q=[...new Set(Array.from($('[data-gfilter]').value).filter(ch=>!/\s/u.test(ch)))];const has=id=>{const it=c.result.items.find(x=>x.id===id);return it&&it.unicodes.some(u=>q.includes(String.fromCodePoint(u)));};
  let ri=g.right.map((_,i)=>i),ci=g.left.map((_,j)=>j);const sort=$('[data-gsort]').value;$('[data-gsort]').querySelector('[value=abs]').disabled=!r;
  if(sort==='size'){ri.sort((a,b)=>g.right[b].length-g.right[a].length||a-b);ci.sort((a,b)=>g.left[b].length-g.left[a].length||a-b);}
  else if(sort==='abs'&&r){const rs=new Map(),cs=new Map();for(const k of r.classes){rs.set(k.c1,Math.max(rs.get(k.c1)||0,Math.abs(k.value)));cs.set(k.c2,Math.max(cs.get(k.c2)||0,Math.abs(k.value)));}ri.sort((a,b)=>(rs.get(b)||0)-(rs.get(a)||0)||a-b);ci.sort((a,b)=>(cs.get(b)||0)-(cs.get(a)||0)||a-b);}
  // Filter = a cell is shown when its row OR its column matches. Matching rows/columns move to the front,
  // so the table reads as: both match (top-left), row matches (top band), column matches (left band).
  if(unit==='group'){rows=ri.map(i=>({i,id:null,hit:q.length>0&&g.right[i].some(has)}));cols=ci.map(j=>({i:j,id:null,hit:q.length>0&&g.left[j].some(has)}));}
  else{rows=ri.flatMap(i=>g.right[i].map(id=>({i,id,hit:q.length>0&&has(id)})));cols=ci.flatMap(j=>g.left[j].map(id=>({i:j,id,hit:q.length>0&&has(id)})));}
  filtering=q.length>0;anyMode=q.length===1||/\s/u.test($('[data-gfilter]').value.trim());if(filtering){if(anyMode){const front=a=>[...a.filter(x=>x.hit),...a.filter(x=>!x.hit)];rows=front(rows);cols=front(cols);}else{rows=rows.filter(x=>x.hit);cols=cols.filter(x=>x.hit);}}nHitR=rows.filter(x=>x.hit).length;nHitC=cols.filter(x=>x.hit).length;
  if(filtering&&(anyMode?!nHitR&&!nHitC:!nHitR||!nHitC)){rows=[];cols=[];}
  S=+$('[data-gsize]').value;const big=S>=28;RW=big?Math.max(92,S+44):58;HH=big?S+26:40;
  inner.style.width=(RW+cols.length*S)+'px';inner.style.height=(HH+rows.length*S)+'px';}
 function legend(){const c=ctxData(),gen=!!c.resolved,r=res();$('[data-gonly]').disabled=!gen;const cross='<span class="key"><i class="cross"></i>カーニングしない領域の組み合わせ</span>';
  const un=unit==='group'?'グループ':'グリフ';$('[data-glegend]').innerHTML=!c.result?'':''+(filtering?`<span class="${nHitR||nHitC?'':'warning'}">絞り込み：一致した行 ${nHitR}・列 ${nHitC}（${anyMode?'OR：どちらかが一致する組を表示':'AND：行と列の両方が一致する組だけを表示'}）</span>`:'')+(r?(!$('[data-gonly]').checked?`<span class="key"><i style="background:${heat(-120)}"></i>詰める（負）</span><span class="key"><i style="background:${heat(120)}"></i>開ける（正）</span>`:'<span class="muted">カーニングの表示のみ（色・補正前・値を非表示）</span>')+`<span class="key">${unit==='group'?'<i class="dot"></i>個別例外を含む':'<i class="ring"></i>個別例外'}</span>${anyCross?cross:''}${zeroR.size||zeroL.size?`<span class="key"><i class="cross"></i>カーニングに含まれない（全ペア0）：先頭 ${zeroR.size}・後ろ ${zeroL.size} グループ</span>`:''}`:`<span class="muted">${gen?'':'カーニング未生成のため、補正なしの字間を表示しています。'}</span>${anyCross?cross:''}`)+(c.stale?'<span class="stale">条件変更あり · 表示は前回結果</span>':'');}
 function cellValue(row,col){const r=res(),key=row.i+':'+col.i;if(unit==='group'){const cl=classMap.get(key);return{v:cl?.value||0,ex:excMap.get(key)||0,exception:false};}const p=pairMap.get(row.id+':'+col.id);return{v:p?.value||0,ex:0,exception:!!p?.isException,warning:!!p?.warning};}
 // A cell is outside the kerning when its region pair is not kerned (領域ごとの組み合わせ), or its row/column group was dropped as all-zero.
 function offReason(ri,ci){const c=ctxData();if(c.pairDenied(rowScript[ri],colScript[ci]))return 'cross';if(zeroR.has(ri)||zeroL.has(ci))return 'zero';return '';}
 function headSelected(sideName,i){const gs=ctxData().groupSel;return gs&&gs.side===sideName&&gs.indices.has(i);}
 function draw(){cancelAnimationFrame(frame);frame=0;const c=ctxData();$('[data-gempty]').classList.toggle('hidden',!!c.result);scroll.classList.toggle('hidden',!c.result);if(!c.result)return;
  const vw=scroll.clientWidth,vh=scroll.clientHeight,dpr=Math.min(2,window.devicePixelRatio||1);if(!vw||!vh)return;
  if(canvas.width!==Math.round(vw*dpr)||canvas.height!==Math.round(vh*dpr)){canvas.width=Math.round(vw*dpr);canvas.height=Math.round(vh*dpr);canvas.style.width=vw+'px';canvas.style.height=vh+'px';}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle=C.bg;ctx.fillRect(0,0,vw,vh);
  const sl=scroll.scrollLeft,st=scroll.scrollTop,g=c.result.groups,r=res(),upm=c.font.unitsPerEm,only=$('[data-gonly]').checked;
  const ca=Math.max(0,Math.floor(sl/S)),cb=Math.min(cols.length,Math.ceil((sl+vw-RW)/S)+1),ra=Math.max(0,Math.floor(st/S)),rb=Math.min(rows.length,Math.ceil((st+vh-HH)/S)+1);
  const idsOf=(row,col)=>unit==='group'?[rep(g.right[row.i]),rep(g.left[col.i])]:[row.id,col.id];
  ctx.save();ctx.beginPath();ctx.rect(RW,HH,vw-RW,vh-HH);ctx.clip();
  for(let y0=ra;y0<rb;y0++)for(let k=ca;k<cb;k++){const row=rows[y0],col=cols[k],x=RW+k*S-sl,y=HH+y0*S-st;if(filtering&&!row.hit&&!col.hit){ctx.fillStyle=C.bg;ctx.fillRect(x,y,S,S);continue;}
   ctx.fillStyle=(y0+k)%2?C.cellAlt:C.cell;ctx.fillRect(x,y,S,S);
   if(offReason(row.i,col.i)){ctx.fillStyle=C.cross;ctx.fillRect(x,y,S,S);ctx.strokeStyle=C.crossLine;ctx.lineWidth=1;ctx.beginPath();for(let t=-S;t<S;t+=8){ctx.moveTo(x+Math.max(0,t),y+Math.max(0,-t));ctx.lineTo(x+Math.min(S,t+S),y+Math.min(S,S-t));}ctx.stroke();if(S>=28)drawGlyphs(ctx,idsOf(row,col),[0],x+4,y+3,S-8,S-6,C.crossGlyph);ctx.strokeStyle=C.line;ctx.strokeRect(x+.5,y+.5,S,S);continue;}
   const {v,ex,exception}=cellValue(row,col),h=r&&!only?heat(v,S>=28?.7:1):null;if(h){ctx.fillStyle=h;ctx.fillRect(x,y,S,S);}
   if(S>=28){const ghost=!only,showV=ghost,label=S>=44&&r&&showV;drawGlyphs(ctx,idsOf(row,col),[r?v*upm/1000:0],x+4,y+3,S-8,S-(S>=44&&r?17:6),C.glyph,!!r&&ghost);if(label&&v){ctx.fillStyle=C.strong;ctx.font='600 10px ui-monospace,monospace';ctx.textAlign='right';ctx.fillText(signed(v),x+S-4,y+S-4);}}
   if(ex){ctx.fillStyle=C.warn;ctx.beginPath();ctx.arc(x+S-5,y+5,S>=28?3.2:2,0,Math.PI*2);ctx.fill();if(S>=56){ctx.font='9px ui-monospace,monospace';ctx.textAlign='right';ctx.fillText(ex,x+S-11,y+9);}}
   ctx.strokeStyle=exception?C.warn:C.line;ctx.lineWidth=exception?2:1;ctx.strokeRect(x+(exception?1:.5),y+(exception?1:.5),S-(exception?2:0),S-(exception?2:0));}
  if(unit==='glyph'){ctx.strokeStyle=C.groupLine;ctx.lineWidth=1.5;ctx.beginPath();for(let y0=Math.max(1,ra);y0<rb;y0++)if(rows[y0].i!==rows[y0-1].i){const y=HH+y0*S-st;ctx.moveTo(RW,y);ctx.lineTo(vw,y);}for(let k=Math.max(1,ca);k<cb;k++)if(cols[k].i!==cols[k-1].i){const x=RW+k*S-sl;ctx.moveTo(x,HH);ctx.lineTo(x,vh);}ctx.stroke();}
  if(filtering){ctx.strokeStyle=C.sel;ctx.globalAlpha=.6;ctx.lineWidth=1.5;ctx.beginPath();if(nHitR&&nHitR<rows.length){const y=HH+nHitR*S-st;ctx.moveTo(RW,y);ctx.lineTo(vw,y);}if(nHitC&&nHitC<cols.length){const x=RW+nHitC*S-sl;ctx.moveTo(x,HH);ctx.lineTo(x,vh);}ctx.stroke();ctx.globalAlpha=1;}
  if(hover){ctx.fillStyle=C.hover;if(hover.r>=0)ctx.fillRect(RW,HH+hover.r*S-st,vw,S);if(hover.k>=0)ctx.fillRect(RW+hover.k*S-sl,HH,S,vh);}
  const sr=selIndex();if(sr){ctx.strokeStyle=C.sel;ctx.lineWidth=2;for(const y0 of sr.rows)for(const k of sr.cols)ctx.strokeRect(RW+k*S-sl+1,HH+y0*S-st+1,S-2,S-2);}
  ctx.restore();
  ctx.fillStyle=C.head;ctx.fillRect(0,0,vw,HH);ctx.fillRect(0,0,RW,vh);ctx.strokeStyle=C.headLine;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,HH+.5);ctx.lineTo(vw,HH+.5);ctx.moveTo(RW+.5,0);ctx.lineTo(RW+.5,vh);ctx.stroke();
  const big=S>=28,every=big?1:Math.ceil(26/S);
  ctx.save();ctx.beginPath();ctx.rect(RW,0,vw-RW,HH);ctx.clip();
  for(let k=ca;k<cb;k++){const col=cols[k],x=RW+k*S-sl,picked=headSelected('left',col.i),on=picked||(sel&&sel.j===col.i&&(unit==='group'||sel.b==null||sel.b===col.id))||(hover&&hover.k===k);if(picked){ctx.fillStyle=C.selBand;ctx.fillRect(x,0,S,HH);}else if(on){ctx.fillStyle='rgba(14,122,107,.07)';ctx.fillRect(x,0,S,HH);}
   const first=unit==='glyph'&&(k===0||cols[k-1].i!==col.i);
   const zc=zeroL.has(col.i);if(big){drawGlyphs(ctx,[unit==='group'?rep(g.left[col.i]):col.id],[],x+4,4,S-8,S-4,on?C.sel:zc?C.crossGlyph:C.strong);ctx.fillStyle=on?C.sel:zc?C.crossGlyph:C.text;ctx.font='10px ui-monospace,monospace';ctx.textAlign='center';if(unit==='group')ctx.fillText(zc?'除外':`L${col.i}·${g.left[col.i].length}`,x+S/2,HH-7);else if(first)ctx.fillText('L'+col.i,x+S/2,HH-7);}
   else if(k%every===0||first){ctx.fillStyle=on?C.sel:C.text;ctx.font='9px ui-monospace,monospace';ctx.textAlign='left';ctx.save();ctx.translate(x+S/2+3,HH-5);ctx.rotate(-Math.PI/2);ctx.fillText('L'+col.i,0,0);ctx.restore();}
   if(unit==='glyph'&&first&&k>0){ctx.strokeStyle=C.groupLine;ctx.beginPath();ctx.moveTo(x+.5,0);ctx.lineTo(x+.5,HH);ctx.stroke();}}
  ctx.restore();ctx.save();ctx.beginPath();ctx.rect(0,HH,RW,vh-HH);ctx.clip();
  for(let y0=ra;y0<rb;y0++){const row=rows[y0],y=HH+y0*S-st,picked=headSelected('right',row.i),on=picked||(sel&&sel.i===row.i&&(unit==='group'||sel.a==null||sel.a===row.id))||(hover&&hover.r===y0);if(picked){ctx.fillStyle=C.selBand;ctx.fillRect(0,y,RW,S);}else if(on){ctx.fillStyle='rgba(14,122,107,.07)';ctx.fillRect(0,y,RW,S);}
   const first=unit==='glyph'&&(y0===0||rows[y0-1].i!==row.i);
   const zr=zeroR.has(row.i);if(big){drawGlyphs(ctx,[unit==='group'?rep(g.right[row.i]):row.id],[],RW-S-2,y+4,S-8,S-8,on?C.sel:zr?C.crossGlyph:C.strong);ctx.fillStyle=on?C.sel:zr?C.crossGlyph:C.text;ctx.font='10px ui-monospace,monospace';ctx.textAlign='left';if(unit==='group'){ctx.fillText('R'+row.i,8,y+S/2-2);ctx.fillText(zr?'除外':'×'+g.right[row.i].length,8,y+S/2+11);}else if(first)ctx.fillText('R'+row.i,8,y+S/2+3);}
   else if(y0%every===0||first){ctx.fillStyle=on?C.sel:C.text;ctx.font='9px ui-monospace,monospace';ctx.textAlign='left';ctx.fillText('R'+row.i,8,y+S/2+3);}
   if(unit==='glyph'&&first&&y0>0){ctx.strokeStyle=C.groupLine;ctx.beginPath();ctx.moveTo(0,y+.5);ctx.lineTo(RW,y+.5);ctx.stroke();}}
  ctx.restore();ctx.fillStyle=C.text;ctx.font='10px system-ui,sans-serif';ctx.textAlign='left';if(big){ctx.fillText('先頭 ↓',8,HH-22);ctx.fillText('後ろ →',8,HH-8);}else ctx.fillText('R↓ L→',6,HH-8);}
 function selIndex(){if(!sel)return null;const rs=[],cs=[];rows.forEach((row,y0)=>{if(row.i===sel.i&&(unit==='group'||sel.a==null||row.id===sel.a))rs.push(y0);});cols.forEach((col,k)=>{if(col.i===sel.j&&(unit==='group'||sel.b==null||col.id===sel.b))cs.push(k);});if(unit==='glyph'&&sel.a==null)rs.splice(1);if(unit==='glyph'&&sel.b==null)cs.splice(1);return rs.length&&cs.length?{rows:rs,cols:cs}:null;}
 function schedule(){if(!frame)frame=requestAnimationFrame(draw);}
 function blank(h){return filtering&&h.r>=0&&h.k>=0&&!rows[h.r].hit&&!cols[h.k].hit;}
 function hit(e){const rect=scroll.getBoundingClientRect(),mx=e.clientX-rect.left,my=e.clientY-rect.top;const k=mx<RW?-1:Math.floor((mx-RW+scroll.scrollLeft)/S),r=my<HH?-1:Math.floor((my-HH+scroll.scrollTop)/S);return{mx,my,k:k<cols.length?k:-2,r:r<rows.length?r:-2};}
 function tipFor(h){const c=ctxData(),g=c.result.groups;if(h.r<0&&h.k>=0){const col=cols[h.k];return`<strong>L${col.i}（後ろ側・左輪郭）</strong><div>${esc(chars(g.left[col.i],16))}</div><small>クリックでグループを選択（Ctrl・⌘・Shiftで追加）</small>`;}if(h.k<0&&h.r>=0){const row=rows[h.r];return`<strong>R${row.i}（先頭側・右輪郭）</strong><div>${esc(chars(g.right[row.i],16))}</div><small>クリックでグループを選択（Ctrl・⌘・Shiftで追加）</small>`;}
  const row=rows[h.r],col=cols[h.k],key=row.i+':'+col.i,cl=classMap.get(key),off=offReason(row.i,col.i),cross=!!off;
  if(unit==='group'){const ex=excMap.get(key)||0;return`<strong>R${row.i} × L${col.i}</strong><div>先頭 ${esc(chars(g.right[row.i]))}</div><div>後ろ ${esc(chars(g.left[col.i]))}</div>${off==='cross'?'<div class="muted">カーニングに含まれない：カーニングしない領域の組み合わせ</div>':off==='zero'?'<div class="muted">カーニングに含まれない：全ペア0のグループ</div>':''}${cl?`<div>クラス値 <b>${signed(cl.value)}</b>${cl.manual?'（手動）':''}${cl.saturated?'（上限に張り付くため0）':''} · ${cl.count}ペア${ex?` · 例外 ${ex}`:''}</div>`:''}<small>クリックで値と中身を表示</small>`;}
  const p=pairMap.get(row.id+':'+col.id);return`<strong>${esc(c.display(row.id))} → ${esc(c.display(col.id))}</strong><div class="muted">R${row.i} × L${col.i}</div>${off==='cross'?'<div class="muted">カーニングに含まれない：カーニングしない領域の組み合わせ</div>':off==='zero'?'<div class="muted">カーニングに含まれない：全ペア0のグループ</div>':''}${p?`<div>最終値 <b>${signed(p.value)}</b> · クラス共通値 ${signed(p.classValue)}</div>${p.isException?`<div class="warning">個別例外：${esc(REASON[p.reason]||'')}</div>`:''}`:''}<small>クリックで値と調整を表示</small>`;}
 scroll.addEventListener('scroll',()=>{tip.classList.add('hidden');schedule();},{passive:true});
 scroll.addEventListener('mousemove',e=>{if(!ctxData().result)return;const h=hit(e),valid=(h.r>=0||h.k>=0)&&h.r!==-2&&h.k!==-2&&!(h.r<0&&h.k<0)&&!blank(h);const changed=!hover||hover.r!==h.r||hover.k!==h.k;hover=valid?{r:h.r,k:h.k}:null;if(!valid){tip.classList.add('hidden');}else{if(changed)tip.innerHTML=tipFor(h);tip.classList.remove('hidden');const w=scroll.clientWidth,tw=tip.offsetWidth;tip.style.left=Math.max(4,Math.min(w-tw-4,h.mx+14))+'px';tip.style.top=(h.my+18)+'px';}if(changed)schedule();});
 scroll.addEventListener('mouseleave',()=>{hover=null;tip.classList.add('hidden');schedule();});
 scroll.addEventListener('click',e=>{if(!ctxData().result)return;const h=hit(e),add=e.ctrlKey||e.metaKey||e.shiftKey;if(h.r===-2||h.k===-2||(h.r<0&&h.k<0)||blank(h))return;if(h.r<0){hooks.groupSelected?.('left',cols[h.k].i,add);schedule();return;}if(h.k<0){hooks.groupSelected?.('right',rows[h.r].i,add);schedule();return;}const row=rows[h.r],col=cols[h.k];select(row.i,col.i,row.id,col.id,true);});
 scroll.addEventListener('keydown',e=>{if(!ctxData().result||!rows.length||!cols.length)return;const d={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key];if(!d)return;e.preventDefault();const sr=selIndex();let r=sr?sr.rows[0]:-1,k=sr?sr.cols[0]:-1;if(r<0||k<0){r=0;k=0;}else{r=Math.max(0,Math.min(rows.length-1,r+d[0]));k=Math.max(0,Math.min(cols.length-1,k+d[1]));}select(rows[r].i,cols[k].i,rows[r].id,cols[k].id,true,true);});
 function reveal(){const sr=selIndex();if(!sr)return;const x=sr.cols[0]*S,y=sr.rows[0]*S,vw=scroll.clientWidth-RW,vh=scroll.clientHeight-HH;if(x<scroll.scrollLeft)scroll.scrollLeft=x;else if(x+S>scroll.scrollLeft+vw)scroll.scrollLeft=x+S-vw;if(y<scroll.scrollTop)scroll.scrollTop=y;else if(y+S>scroll.scrollTop+vh)scroll.scrollTop=y+S-vh;}
 function select(i,j,a=null,b=null,notify=false,scrollTo=false){sel={i,j,a:a??null,b:b??null};if(scrollTo)reveal();schedule();detail();if(notify)hooks.cellSelected?.(i,j,sel.a,sel.b);}
 // Class block: all member pairs of the selected group pair, shared by both granularities.
 function detail(){const c=ctxData(),box=detailBox;subHit=null;if(!c.result||!sel||!c.result.groups.right[sel.i]||!c.result.groups.left[sel.j]){box.innerHTML='';return;}
  const g=c.result.groups,as=g.right[sel.i],bs=g.left[sel.j],key=sel.i+':'+sel.j,r=res(),cl=classMap.get(key),ex=excMap.get(key)||0,MAX=24,ra=as.slice(0,MAX),cb=bs.slice(0,MAX),off=offReason(sel.i,sel.j),cross=!!off;
  box.innerHTML=`<div class="grid-detail-head"><div><strong>R${sel.i} × L${sel.j}</strong> <span class="muted">${as.length} × ${bs.length} = ${as.length*bs.length} ペア</span></div><div class="row">${off?`<span class="muted">カーニングに含まれない（${off==='cross'?'カーニングしない領域の組み合わせ':'全ペア0のグループ'}）</span>`:cl?`<span>クラス値 <b>${signed(cl.value)}</b>${cl.manual?'（手動）':''}</span>${ex?`<span class="warning">例外 ${ex}</span>`:''}`:`<span class="muted">${c.resolved?'生成値を非表示中':'カーニング未生成'}</span>`}</div></div>${as.length>MAX||bs.length>MAX?`<small>表示は先頭${MAX}×${MAX}まで。</small>`:''}<div class="grid-sub"><canvas data-gsub aria-label="クラス内の全ペア。クリックでペアを選択"></canvas></div><small>クラス内の全ペア。黄色枠＝個別例外、緑枠＝選択中。クリックでペアを選択。</small>`;
  const sub=box.querySelector('[data-gsub]'),cs=50,rw=46,hh=46,dpr=Math.min(2,window.devicePixelRatio||1),w=rw+cb.length*cs,h=hh+ra.length*cs;sub.width=w*dpr;sub.height=h*dpr;sub.style.width=w+'px';sub.style.height=h+'px';const ctx=sub.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle=C.bg;ctx.fillRect(0,0,w,h);ctx.fillStyle=C.head;ctx.fillRect(0,0,w,hh);ctx.fillRect(0,0,rw,h);const upm=c.font.unitsPerEm;
  cb.forEach((b,k)=>drawGlyphs(ctx,[b],[],rw+k*cs+6,6,cs-12,hh-12,sel.b===b?C.sel:C.strong));ra.forEach((a,y0)=>drawGlyphs(ctx,[a],[],6,hh+y0*cs+6,rw-12,cs-12,sel.a===a?C.sel:C.strong));
  ra.forEach((a,y0)=>cb.forEach((b,k)=>{const x=rw+k*cs,y=hh+y0*cs,p=pairMap.get(a+':'+b),v=r?(p?.value||0):0;ctx.fillStyle=(y0+k)%2?C.cellAlt:C.cell;ctx.fillRect(x,y,cs,cs);const hc=heat(v,.7);if(hc){ctx.fillStyle=hc;ctx.fillRect(x,y,cs,cs);}drawGlyphs(ctx,[a,b],[v*upm/1000],x+4,y+3,cs-8,cs-17,cross?C.crossGlyph:C.glyph,!!r&&!cross&&!$('[data-gonly]').checked);if(r&&v&&!$('[data-gonly]').checked){ctx.fillStyle=C.strong;ctx.font='600 10px ui-monospace,monospace';ctx.textAlign='right';ctx.fillText(signed(v),x+cs-4,y+cs-4);}const picked=sel.a===a&&sel.b===b,exc=!!p?.isException;ctx.strokeStyle=picked?C.sel:exc?C.warn:C.line;ctx.lineWidth=picked||exc?2:1;const o=picked||exc?1:.5,d=picked||exc?2:0;ctx.strokeRect(x+o,y+o,cs-d,cs-d);}));
  subHit={cs,rw,hh,ra,cb};sub.onclick=e=>{const rect=sub.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,k=Math.floor((x-rw)/cs),y0=Math.floor((y-hh)/cs);if(k<0||y0<0||k>=cb.length||y0>=ra.length)return;select(sel.i,sel.j,ra[y0],cb[k],true,true);};}
 $$('[data-gunit]').forEach(b=>b.onclick=()=>{unit=b.dataset.gunit;$$('[data-gunit]').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b);});if(unit==='glyph'&&+$('[data-gsize]').value<40)$('[data-gsize]').value=56;render();});
 for(const s of ['[data-gsize]','[data-gonly]','[data-gsort]'])$(s).addEventListener(s==='[data-gsize]'?'input':'change',render);
 $('[data-gfilter]').addEventListener('input',render);
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(schedule).observe(scroll);
 function render(){const c=ctxData();if(c.result&&sel&&(!c.result.groups.right[sel.i]||!c.result.groups.left[sel.j]||(sel.a!=null&&!c.result.groups.right[sel.i].includes(sel.a))||(sel.b!=null&&!c.result.groups.left[sel.j].includes(sel.b))))sel=null;if(!c.result){sel=null;hover=null;}prepare();legend();draw();detail();}
 return{render,select:(i,j,a,b,quiet)=>select(i,j,a,b,false,!quiet),selection:()=>sel,unit:()=>unit,setUnit(u){$(`[data-gunit=${u}]`)?.click();},reset(){sel=null;hover=null;scroll.scrollLeft=scroll.scrollTop=0;$('[data-gfilter]').value='';}};
}
