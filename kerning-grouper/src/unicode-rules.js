// Target-glyph rules based on Unicode General Category, Script and block ranges.
// A glyph matches a rule when any of its code points does. Rules may overlap; the target is their union
// minus the user's excluded characters.
const re=p=>new RegExp(`^\\p{${p}}$`,'u');
const is=p=>{const r=re(p);return u=>r.test(String.fromCodePoint(u));};
const Lu=is('Lu'),Ll=is('Ll'),L=is('L'),Nd=is('Nd'),P=is('P'),S=is('S');
const latin=is('Script=Latin'),greek=is('Script=Greek'),cyrillic=is('Script=Cyrillic'),han=is('Script=Han'),hiragana=is('Script=Hiragana'),katakana=is('Script=Katakana');
const inRange=(u,a,b)=>u>=a&&u<=b;
export const unicodeRules=[
 {id:'upper',short:'大文字',group:'欧文',label:'英大文字 A–Z',rule:'基本ラテン（U+0000–007F）· Lu',test:u=>u<128&&Lu(u),default:true},
 {id:'lower',short:'小文字',group:'欧文',label:'英小文字 a–z',rule:'基本ラテン · Ll',test:u=>u<128&&Ll(u),default:true},
 {id:'digit',short:'数字',group:'欧文',label:'数字 0–9',rule:'基本ラテン · Nd',test:u=>u<128&&Nd(u),default:true},
 {id:'punct',short:'ASCII記号',group:'欧文',label:'ASCII 記号・句読点',rule:'基本ラテン · P / S',test:u=>u<128&&(P(u)||S(u))},
 {id:'latin',short:'ラテン拡張',group:'欧文',label:'ラテン文字（拡張・アクセント付き）',rule:'Script=Latin · L · U+0080 以降（全角を除く）',test:u=>u>=128&&!inRange(u,0xFF00,0xFFEF)&&latin(u)&&L(u)},
 {id:'greek',short:'ギリシャ',group:'欧文',label:'ギリシャ文字',rule:'Script=Greek · L',test:u=>greek(u)&&L(u)},
 {id:'cyrillic',short:'キリル',group:'欧文',label:'キリル文字',rule:'Script=Cyrillic · L',test:u=>cyrillic(u)&&L(u)},
 {id:'symbols',short:'欧文記号',group:'欧文',label:'その他の記号・句読点',rule:'P / S · U+0080–U+2FFF',test:u=>inRange(u,0x80,0x2FFF)&&(P(u)||S(u))},
 {id:'hira',short:'ひらがな',group:'和文',label:'ひらがな',rule:'Script=Hiragana ＋ U+3040–309F',test:u=>hiragana(u)||inRange(u,0x3040,0x309F)},
 {id:'kata',short:'カタカナ',group:'和文',label:'カタカナ（長音・中黒を含む）',rule:'Script=Katakana ＋ U+30A0–30FF・31F0–31FF・半角 FF66–FF9F',test:u=>katakana(u)||inRange(u,0x30A0,0x30FF)||inRange(u,0x31F0,0x31FF)||inRange(u,0xFF66,0xFF9F)},
 {id:'jpunct',short:'和文約物',group:'和文',label:'和文の約物',rule:'U+3000–303F ＋ 全角・半角形の P / S',test:u=>inRange(u,0x3000,0x303F)||(inRange(u,0xFF00,0xFFEF)&&(P(u)||S(u)))},
 {id:'fullwidth',short:'全角英数',group:'和文',label:'全角英数',rule:'U+FF10–FF19・FF21–FF3A・FF41–FF5A',test:u=>inRange(u,0xFF10,0xFF19)||inRange(u,0xFF21,0xFF3A)||inRange(u,0xFF41,0xFF5A)},
 {id:'han',short:'漢字',group:'和文',label:'漢字',rule:'Script=Han',test:u=>han(u)&&!inRange(u,0x3000,0x303F),never:true},
];
// Kanji are never grouped or kerned (full-width boxes by design): the rule only names them.
export const isKanji=u=>han(u)&&!inRange(u,0x3000,0x303F);
export const japanesePreset=['hira','kata','jpunct'];
// Returns the ids of rules a glyph matches (by any of its code points).
export function rulesOf(unicodes){const out=[];for(const r of unicodeRules)if((unicodes||[]).some(u=>r.test(u)))out.push(r.id);return out;}
// Default for a region pair: kern within the same writing system (欧文×欧文, 和文×和文), not across.
export function defaultAllowed(a,b){const ga=unicodeRules.find(r=>r.id===a)?.group,gb=unicodeRules.find(r=>r.id===b)?.group;return ga===gb;}

// Short kind of a kerning class for its name: UC / lc (Latin capitals / small letters, accented too), Grk / grk,
// Cyr / cyr, Fig (digits), Punct (ASCII punctuation and symbols), Sym (other symbols), Hira, Kata, JPunct (Japanese
// punctuation), FW (fullwidth Latin and digits); Mix when the members are of different kinds.
export function kindOf(u){if(u==null)return'';const fw=inRange(u,0xFF10,0xFF19)||inRange(u,0xFF21,0xFF3A)||inRange(u,0xFF41,0xFF5A);if(fw)return'FW';
 if(latin(u)&&L(u))return Lu(u)?'UC':'lc';if(greek(u)&&L(u))return Lu(u)?'Grk':'grk';if(cyrillic(u)&&L(u))return Lu(u)?'Cyr':'cyr';if(u<128&&Nd(u))return'Fig';
 if(hiragana(u)||inRange(u,0x3040,0x309F))return'Hira';if(katakana(u)||inRange(u,0x30A0,0x30FF)||inRange(u,0x31F0,0x31FF)||inRange(u,0xFF66,0xFF9F))return'Kata';
 if(inRange(u,0x3000,0x303F)||(inRange(u,0xFF00,0xFFEF)&&(P(u)||S(u))))return'JPunct';if(u<128&&(P(u)||S(u)))return'Punct';if(P(u)||S(u))return'Sym';return'Other';}
export function classKind(codepoints){const k=new Set(codepoints.map(kindOf).filter(Boolean));return k.size===1?[...k][0]:k.size?'Mix':'';}
