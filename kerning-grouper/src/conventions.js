// "お作法" grouping: how type designers group kerning by convention, checked against the actual outlines.
//   1. A derived letter (accent, dakuten) goes with its base letter: Ä→A, が→か (Unicode NFD), plus a table for
//      letters that do not decompose or whose two sides follow different letters (Œ: left O, right E).
//   2. Latin base letters that share a side by convention form one group (left: H-like straights, O-like rounds…).
//   3. The side a mark sticks out of stays apart (horn, the apostrophe caron of ď ľ ť Ľ, the dakuten's right side).
//   4. Each member is checked against the outline: a derived letter against its base, only at the heights where the
//      base has ink (so a mark above or below does not count); a base letter against the group's lead with a wide
//      tolerance (only clear outliers leave). What fails is handed back to shape grouping.
// Measured on 20 OFL fonts against the designers' own kerning (docs: VALIDATION.md, グループの作り方).
import {compare,score,groupingParams,groupingProfile} from './core.js';

// [left side, right side] base for letters without a usable decomposition (or with sides that differ).
const SIDE={'Æ':['A','E'],'Œ':['O','E'],'æ':['a','e'],'œ':['o','e'],'Ð':['D','D'],'Þ':['I','Þ'],'þ':['b','p'],'ŋ':['n','n'],'Ŋ':['N','Ŋ'],
 'Ŀ':['L','Ŀ'],'ŀ':['l','ŀ'],'Ə':['O','O'],'ə':['ə','e'],'ĸ':['k','k'],'Ø':['O','O'],'ø':['o','o'],'Ł':['Ł','L'],'ł':['ł','l'],'Đ':['Đ','D'],
 'đ':['d','đ'],'ħ':['ħ','h'],'ı':['i','i'],'ȷ':['j','j']};
// Base letters that share a side by convention (left = the glyph's left edge = pair second; right = pair first).
export const CLASSIC={left:['BDEFHIKLMNPR','CGOQ','bhkl','mnpr','cdeoq','vwy','VW'],right:['HIMN','DOQ','hmn','bop','vwy','VW']};
const RIGHT_CARON=new Set([...'ďľťĽ']);
// Letters that designers keep in a group of their own on that side (alone in ≥85% of 20 OFL fonts' kerning):
// f's crossbar, t, the diagonals A V-like X Y, S s … Their accented forms stay with them.
export const SOLO={left:'AJSTUXYZafjstuxz',right:'ABCEFGLPRSTXYZcfkrstxz'};
const SIDES=s=>s==='left'?0:1;

// The base letter a glyph follows on one side (itself when none).
export function baseOf(ch,side){if(SIDE[ch])return SIDE[ch][SIDES(side)];const d=ch.normalize('NFD');if(d.length>1&&d[0]!==ch){const b=[...d][0];return /[\x00-\x7f]/.test(b)?b:baseOf(b,side);}return ch;}
// Why a glyph stays apart on this side, or ''.
export function protrudes(ch,side){if(side!=='right')return'';const d=[...ch.normalize('NFD')];if(d.includes('̛'))return'horn';if(RIGHT_CARON.has(ch))return'caron';if(d.includes('゙')||d.includes('゚'))return'dakuten';return'';}
// Separation tag on one side: Latin capitals and small letters never share a group (designers almost never mix
// them: 4 of 204 groups), and SOLO letters keep a group of their own. '' for anything else (kana, symbols…).
export function separationTag(ch,side){if(!ch)return'';const b=baseOf(ch,side);if(!/^[A-Za-z]$/.test(b))return'';return(b===b.toUpperCase()?'|U':'|L')+(SOLO[side].includes(b)?'|solo-'+b:'');}
// Convention key on one side: the classic group, else the base letter; '' when the glyph stays apart.
export function conventionKey(ch,side){if(protrudes(ch,side))return'';const b=baseOf(ch,side);const k=CLASSIC[side].findIndex(s=>s.includes(b));return k>=0?'classic-'+k:'base-'+b;}

const charOf=g=>{const u=(g.unicodes||[]).filter(u=>u>32).sort((a,b)=>a-b)[0];return u===undefined?null:String.fromCodePoint(u);};
const scaled=(p,k)=>groupingParams({...p,shape:p.shape*k,bearing:p.bearing*k,local:p.local*k,missing:Math.min(1,p.missing*k)});

// items: engine items (id, unicodes, profile.{left,right}); taken: ids already in fixed groups; sep: separation signatures.
// → {groups:[[ids]] (≥2 members), removed:[{id, base, reason:'shape'|'horn'|'caron'|'dakuten'}]}
export function conventionGroups(items,side,params,{taken=new Set(),sep=null,derivedScale=2,baseScale=6}={}){
 const byKey=new Map(),removed=[],byChar=new Map();
 for(const g of items){const ch=charOf(g);if(ch&&!byChar.has(ch))byChar.set(ch,g);}
 for(const g of items){if(taken.has(g.id))continue;const ch=charOf(g);if(!ch||!/\p{L}/u.test(ch))continue;const why=protrudes(ch,side);if(why){if(baseOf(ch,side)!==ch)removed.push({id:g.id,base:baseOf(ch,side),reason:why});continue;}
  const key=conventionKey(ch,side)+'|'+(sep?.[g.id]??'');(byKey.get(key)||byKey.set(key,[]).get(key)).push(g);}
 const prof=new Map(),P=g=>{if(!prof.has(g.id))prof.set(g.id,groupingProfile(g.profile[side],params));return prof.get(g.id);};
 // Only the heights where the base letter has ink are compared. For kana the dakuten sits at the upper right and can
 // peek out on the left where a base stroke ends (the voiced form is often redrawn slightly), so a few rows that
 // differ by more than 100 units (≤15% of the rows) are dropped as the mark, not the letter.
 const cropped=(g,ref)=>{const a=g.profile[side],r=ref.profile[side];let rows=a.map((v,i)=>r[i]===null?null:v);
  if(/[\u3040-\u30ff]/.test(charOf(g)||'')){const shared=rows.filter((v,i)=>v!==null&&r[i]!==null).length,far=rows.map((v,i)=>v!==null&&r[i]!==null&&Math.abs(v-r[i])>100);if(far.filter(Boolean).length<=shared*.15)rows=rows.map((v,i)=>far[i]?null:v);}
  return groupingProfile(rows,params);};
 const pd=scaled(params,derivedScale),pb=scaled(params,baseScale);
 const groups=[];
 for(const [key,members]of byKey){if(members.length<2)continue;
  const cls=key.startsWith('classic-')?CLASSIC[side][+key.split('|')[0].slice(8)]:'';
  const bases=members.filter(g=>baseOf(charOf(g),side)===charOf(g)).sort((a,b)=>(cls.indexOf(charOf(a))+1||99)-(cls.indexOf(charOf(b))+1||99));
  const lead=bases[0]||members[0],keep=new Set([lead.id]),out=new Set(),sub=new Map();
  // base letters: only clear outliers leave
  for(const g of bases)if(g!==lead&&score(compare(P(g),P(lead)),pb)>1){out.add(g.id);removed.push({id:g.id,base:charOf(lead),reason:'shape'});}
  for(const g of members){if(g===lead||out.has(g.id))continue;const ch=charOf(g),b=baseOf(ch,side);
   if(b===ch){keep.add(g.id);continue;}
   const ref=byChar.get(b)&&!taken.has(byChar.get(b).id)?byChar.get(b):lead;
   // a derived letter follows its base: it leaves when the outline differs where the base has ink
   // kana voiced forms are often redrawn a little (strokes shifted to make room for the mark): designers still group
   // them with the base on the left, so they get the wide tolerance of base letters
   const kana=/[\u3040-\u30ff]/.test(ch);
   if(score(compare(cropped(g,ref),P(ref)),kana?pb:pd)<=1){if(out.has(ref.id))(sub.get(ref.id)||sub.set(ref.id,[ref.id]).get(ref.id)).push(g.id);else keep.add(g.id);}
   else{out.add(g.id);removed.push({id:g.id,base:b,reason:'shape'});}}
  if(keep.size>1)groups.push([...keep]);
  // a base letter that left the classic group still keeps its own accented letters
  for(const ids of sub.values())if(ids.length>1)groups.push(ids);}
 return{groups,removed};}
