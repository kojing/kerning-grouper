// node .shape_groups.mjs font.ttf codepoints.json strength out.json → shape-based groups from the web tool's engine
import fs from 'node:fs';import opentype from 'opentype.js';
import {createEngine} from './src/engine.js';import {defaults} from './src/core.js';
const [fontPath,cpPath,strength,out,mode]=process.argv.slice(2);
const b=fs.readFileSync(fontPath);const font=opentype.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
const cps=JSON.parse(fs.readFileSync(cpPath,'utf8'));const seen=new Set(),glyphs=[];
for(const u of cps){const g=font.charToGlyph(String.fromCodePoint(u));if(!g||!g.index||seen.has(g.index)||!g.path.commands.length)continue;seen.add(g.index);glyphs.push({id:g.index,name:g.name,unicodes:g.unicodes,advance:g.advanceWidth,commands:g.path.commands,bounds:g.getBoundingBox()});}
const res=await createEngine()({glyphs,upm:font.unitsPerEm,fontKey:fontPath,params:{...defaults,strength:+strength,convention:process.argv[6]==='conv'},fixed:{left:[],right:[]}},()=>{},()=>false);
fs.writeFileSync(out,JSON.stringify({right:res.groups.right,left:res.groups.left,convention:res.convention}));
