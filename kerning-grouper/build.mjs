import {build} from 'esbuild';
import fs from 'node:fs';
const worker=await build({entryPoints:['src/worker.js'],bundle:true,write:false,format:'iife',minify:true,target:'es2020'});
const kernWorker=await build({entryPoints:['src/kern-worker.js'],bundle:true,write:false,format:'iife',minify:true,target:'es2020'});
await build({entryPoints:['src/app.js'],bundle:true,outfile:'kerning-grouper.js',format:'iife',minify:true,target:'es2020',legalComments:'eof',define:{__WORKER_SOURCE__:JSON.stringify(worker.outputFiles[0].text),__KERN_WORKER_SOURCE__:JSON.stringify(kernWorker.outputFiles[0].text)}});
const licenses=['opentype.js','tiny-inflate','string.prototype.codepointat'].map(n=>{const base='node_modules/'+n;const name=fs.readdirSync(base).find(f=>/^license/i.test(f));return n+'\n'+(name?fs.readFileSync(base+'/'+name,'utf8'):'See dependency package');});licenses.push('GlyphsInfo (GlyphData.xml; src/fontlab-friendly.js is derived from it) https://github.com/schriftgestalt/GlyphsInfo\n'+fs.readFileSync('licenses/GlyphsInfo-LICENSE.txt','utf8'));fs.writeFileSync('THIRD-PARTY-LICENSES.txt',licenses.join('\n\n------------------\n\n'));
