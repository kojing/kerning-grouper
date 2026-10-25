// Japanese character classes used by the tsume (字詰め) and punctuation (約物) rules.
// Punctuation classes follow JLREQ: opening brackets (cl-01), closing brackets (cl-02),
// middle dots (cl-05), full stops (cl-06), commas (cl-07).
const set=s=>new Set([...s].map(c=>c.codePointAt(0)));
const OPEN=set('「『（〔［｛〈《【〘〖〝｟‘“'),CLOSE=set('」』）〕］｝〉》】〙〗〞〟｠’”'),COMMA=set('、，'),PERIOD=set('。．'),MIDDLE=set('・：；');
const SMALL=set('ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿｧｨｩｪｫｯｬｭｮ');
const han=/^\p{Script=Han}$/u;
export const PUNCT=['open','close','comma','period','middle'];
export const jaLabels={open:'始め括弧類',close:'終わり括弧類',comma:'読点類',period:'句点類',middle:'中点類',small:'小書き仮名',choon:'長音',hira:'ひらがな',kata:'カタカナ',han:'漢字'};
// Class of a code point, or null for anything the rules leave alone (Latin, digits, symbols).
export function jaClass(u){if(u==null)return null;if(OPEN.has(u))return'open';if(CLOSE.has(u))return'close';if(COMMA.has(u))return'comma';if(PERIOD.has(u))return'period';if(MIDDLE.has(u))return'middle';if(SMALL.has(u))return'small';if(u===0x30FC||u===0xFF70)return'choon';if(u>=0x3041&&u<=0x309F)return'hira';if((u>=0x30A0&&u<=0x30FF)||(u>=0x31F0&&u<=0x31FF)||(u>=0xFF66&&u<=0xFF9F))return'kata';if(u===0x3005||han.test(String.fromCodePoint(u)))return'han';return null;}
// A glyph's class. Quotes and other shared marks count as Japanese punctuation only when set full-width.
export function glyphJaClass(g,advance){const c=jaClass(g.unicodes?.[0]);if(!c)return null;if(PUNCT.includes(c)&&advance<900)return null;return c;}
// Space kept between a punctuation mark's open side and its neighbour (1000 UPM), by policy.
// tsume: modern tight setting (Adobe ツメ組み style) with adjustable kept spaces; beta: JLREQ solid setting, marks keep a full em.
export const tsumeKeeps={keepPeriod:500,keepComma:250,keepBracket:0,keepMiddle:250};
export function punctKeep(a,b,policy,keeps=tsumeKeeps){const pa=PUNCT.includes(a),pb=PUNCT.includes(b),k=policy==='tsume'?{...tsumeKeeps,...keeps}:{keepPeriod:500,keepComma:500,keepBracket:500,keepMiddle:250};
 if(pa&&pb){if(a==='middle'||b==='middle')return k.keepMiddle;if((a==='close'||a==='comma'||a==='period')&&b==='open')return 500;return 0;}
 if(pa)return a==='period'?k.keepPeriod:a==='comma'?k.keepComma:a==='close'?k.keepBracket:a==='middle'?k.keepMiddle:0;
 if(pb)return b==='open'?k.keepBracket:b==='middle'?k.keepMiddle:0;return null;}
