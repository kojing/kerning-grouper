// Optional: round trip with your own font and the .vfm FontLab exported from it (not bundled: commercial fonts stay out).
//   VFM_OTF=font.otf VFM_FILE=font.vfm node test-vfm-roundtrip.mjs
// Opens both in the tool, keeps every .vfm group ("すべて引き継ぐ") and only regenerates changed groups, saves, and
// checks that the saved .vfm has exactly the pairs and metrics of the original.
import {chromium} from 'playwright';import c from '@sparticuz/chromium';import fs from 'node:fs';import assert from 'node:assert/strict';
const OTF=process.env.VFM_OTF,VFM=process.env.VFM_FILE;
if(!OTF||!VFM){console.log('VFM round trip skipped (set VFM_OTF and VFM_FILE)');process.exit(0);}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||await c.executablePath(),args:c.args,headless:true});
const page=await browser.newPage({viewport:{width:1450,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.stack));
await page.goto('file://'+process.cwd()+'/standalone.html');const txt=async s=>(await page.locator(s).textContent())||'';
await page.locator('[data-file]').setInputFiles(OTF);await page.waitForFunction(()=>document.querySelector('[data-kerning-grouper]').shadowRoot.querySelector('[data-font]').textContent.includes('UPM'),null,{timeout:300000});
await page.locator('[data-tab=target]').click();await page.locator('[data-vfmfile]').setInputFiles(VFM);
for(let i=0;i<600&&!/カーニング [\d,]+ ペア/.test(await txt('[data-vfminfo]'));i++)await page.waitForTimeout(100);console.log(await txt('[data-vfminfo]'));
await page.locator('[data-tab=group]').click();await page.locator('input[name=kg-vfmgroup][value=keep]').check();
await page.waitForFunction(()=>document.querySelector('[data-kerning-grouper]').shadowRoot.querySelector('.app').dataset.state==='ready',null,{timeout:600000});
for(let i=0;i<1200&&!/引き継いだグループ/.test(await txt('[data-vfmgroupstat]'));i++)await page.waitForTimeout(100);console.log(await txt('[data-vfmgroupstat]'));
await page.locator('[data-tab=kern]').click();await page.locator('[data-kgen]').click();
for(let i=0;i<3000&&!/VFM の値を残す/.test(await txt('[data-kvfmstat]'));i++)await page.waitForTimeout(100);console.log(await txt('[data-kvfmstat]'));
await page.locator('[data-tab=save]').click();const d=page.waitForEvent('download');await page.locator('[data-kexport]').click();const out=(await d).path();
const before=JSON.parse(fs.readFileSync(VFM,'utf8')),afterText=fs.readFileSync(await out,'utf8'),after=JSON.parse(afterText);
// compare what FontLab applies: every glyph pair after classes and exceptions are resolved
const {parseVfm,readVfm}=await import('./src/vfm.js');const opentype=(await import('opentype.js')).default;const fb=fs.readFileSync(OTF),font=opentype.parse(fb.buffer.slice(fb.byteOffset,fb.byteOffset+fb.byteLength));
const {cidMap}=await import('./src/vfm.js');font.kgCids=cidMap(fb.buffer.slice(fb.byteOffset,fb.byteOffset+fb.byteLength),font);
const m=Object.keys(before.masters)[0],A=readVfm(parseVfm(fs.readFileSync(VFM,'utf8')),m,font).pairs,B=readVfm(parseVfm(afterText),m,font).pairs;let same=0,diff=[];
for(const [k,v]of A)if(Math.round(B.get(k)??0)===Math.round(v))same++;else diff.push(k+' '+v+'→'+B.get(k));for(const [k,v]of B)if(!A.has(k)&&Math.round(v)!==0)diff.push(k+' (new) '+v);
console.log(m,{same,differ:diff.length,classes:(after.masters[m].kerningClasses||[]).length},diff.slice(0,10).join(' '));assert.equal(diff.length,0,'every glyph pair as in the .vfm');
assert.deepEqual(after.metrics,before.metrics,'metrics kept');assert.deepEqual(errors,[]);
await browser.close();console.log('VFM round trip passed');
