import {chromium as playwright} from 'playwright';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
// A second, byte-different copy of the bundled font: same outlines, different fingerprint (mismatch test).
const otherFont=()=>{const out=os.tmpdir()+'/kg-test-other.ttf';fs.writeFileSync(out,Buffer.concat([fs.readFileSync('samples/KGJapaneseTest-Regular.ttf'),Buffer.alloc(8)]));return out;};
const server=http.createServer((req,res)=>{const path=req.url==='/'?'standalone.html':req.url.slice(1);try{const b=fs.readFileSync(path);res.setHeader('Content-Type',path.endsWith('.js')?'application/javascript':'text/html');res.end(b);}catch{res.statusCode=404;res.end();}}).listen(8765,'127.0.0.1');
const browser=await playwright.launch({executablePath:process.env.CHROMIUM_PATH || await chromium.executablePath(),args:chromium.args,headless:true});
const page=await browser.newPage({viewport:{width:1400,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8765');
// Locked tabs: later steps are disabled until the earlier ones are done, and say what to do.
assert.equal(await page.locator('[data-selectjp]').count(),0,'kana preset button removed');
for(const t of ['group','gadjust','kern','adjust','save'])assert.equal(await page.locator(`[data-tab=${t}]`).getAttribute('aria-disabled'),'true',t+' locked before a font');
await page.locator('[data-tab=adjust]').click({force:true});assert.match(await page.locator('[data-lock=adjust]').textContent(),/フォントが読み込まれていません/);assert.ok(await page.locator('[data-kreview]').isHidden());
await page.locator('[data-lock=adjust] [data-lockgo]').click();assert.equal(await page.locator('[data-tab=target]').getAttribute('aria-selected'),'true','lock note jumps to the step to do');
await page.locator('[data-file]').setInputFiles(process.env.TEST_FONT || 'samples/KGJapaneseTest-Regular.ttf');
await page.waitForFunction(()=>document.querySelector('[data-kerning-grouper]').shadowRoot.querySelector('[data-font]').textContent.includes('UPM'));
await page.waitForFunction(()=>document.querySelector('[data-kerning-grouper]').shadowRoot.querySelector('[data-tab=group]').getAttribute('aria-disabled')==='false');assert.equal(await page.locator('[data-tab=save]').getAttribute('aria-disabled'),'true','save stays locked until kerning is generated');
const count=async()=>+(await page.locator('[data-count]').textContent()).match(/選択 (\d+)/)[1];
const settle=()=>page.waitForTimeout(450);
assert.equal(await count(),62,'default checks = A-Z a-z 0-9');
assert.equal(await page.locator('[data-rulecount=upper]').textContent(),' 26','rule shows how many glyphs the font has');assert.equal(await page.locator('[data-category=han]').count(),0,'kanji cannot be chosen');assert.match(await page.locator('[data-kanjinote]').textContent(),/漢字/);assert.equal(await page.locator('[data-rulecount=hira]').textContent(),' 80');
await page.locator('[data-selecttext]').fill('AB A \n!');await settle();
assert.equal(await count(),60,'excluded characters leave the checked ranges; duplicates and whitespace ignored');
assert.match(await page.locator('[data-breakdown]').textContent(),/規則に該当 62 − 除外 2/);assert.match(await page.locator('[data-textinfo]').textContent(),/1文字はチェックした範囲に含まれないため影響なし/);
await page.locator('[data-category=upper]').uncheck();await settle();
assert.equal(await count(),36,'26 lower + 10 digits');
await page.locator('[data-category=upper]').check();await page.locator('[data-selecttext]').fill('Z漢');await settle();
assert.equal(await count(),61);assert.match(await page.locator('[data-textinfo]').textContent(),/未収録：漢/);
// exclusion template: fullwidth digits are appended once
await page.locator('[data-extpl="0"]').click();await page.locator('[data-extpl="0"]').click();assert.equal(await page.locator('[data-selecttext]').inputValue(),'Z漢 ０１２３４５６７８９');await page.locator('[data-selecttext]').fill('Z漢');await settle();assert.equal(await count(),61);
await page.locator('[data-category=hira]').check();await settle();assert.equal(await count(),141,'Unicode rule adds all hiragana in the font');await page.locator('[data-category=hira]').uncheck();await settle();
assert.equal(await page.locator('[data-search]').count(),0,'individual glyph selection removed');assert.equal(await page.locator('details').count(),0,'no collapsible sections');
await page.locator('[data-selectclear]').click();await settle();assert.equal(await count(),62,'clearing the exclusion restores the ranges');
await settle();await page.waitForFunction(()=>document.querySelector('[data-kerning-grouper]').shadowRoot.querySelector('[data-run]').disabled===false);
await page.locator('[data-tab=group]').click();await page.locator('[data-run]').click();await page.waitForFunction(()=>document.querySelector('[data-kerning-grouper]').shadowRoot.querySelector('.status').textContent.includes('分類完了'));
assert.match(await page.locator('.status').textContent(),/62グリフ/);
const first=+await page.locator('[data-nright]').textContent();
// presets: the grouping sliders show only for カスタム
await page.locator('[data-tab=group]').click();assert.equal(await page.locator('[data-gpreset=fine]').getAttribute('aria-pressed'),'true','default preset');assert.equal(await page.locator('[data-gadv]').isVisible(),false,'sliders hidden for a preset');await page.locator('[data-gpreset=custom]').click();assert.equal(await page.locator('[data-gadv]').isVisible(),true,'カスタム shows the sliders');
await page.locator('[data-number=shape]').fill('30');await page.locator('[data-number=bearing]').fill('35');await page.locator('[data-number=local]').fill('75');
await page.waitForFunction(()=>document.querySelector('[data-kerning-grouper]').shadowRoot.querySelector('.status').textContent.includes('分類完了')&&document.querySelector('[data-kerning-grouper]').shadowRoot.querySelector('.app').dataset.state==='ready');
assert.ok(+await page.locator('[data-nright]').textContent()<=first);
await page.locator('[data-number=local]').fill('400');assert.equal(await page.locator('[data-range=local]').inputValue(),'120','slider pins to its end');assert.equal(await page.locator('[data-number=local]').inputValue(),'400','number field keeps a value beyond the slider');assert.match(await page.locator('[data-over=local]').textContent(),/スライダーの範囲外/);
await page.locator('[data-number=missing]').fill('3');assert.match(await page.locator('[data-over=missing]').textContent(),/1まで/);await page.locator('[data-number=missing]').blur();assert.equal(await page.locator('[data-number=missing]').inputValue(),'1');
await page.locator('[data-number=local]').fill('75');await page.locator('[data-number=missing]').fill('0.06');await page.waitForFunction(()=>document.querySelector('[data-kerning-grouper]').shadowRoot.querySelector('.status').textContent.includes('分類完了')&&document.querySelector('[data-kerning-grouper]').shadowRoot.querySelector('.app').dataset.state==='ready');
assert.ok(await page.locator('[data-gscroll]').isVisible(),'table shows after grouping');
{const box=await page.locator('[data-gscroll]').boundingBox();await page.mouse.click(box.x+box.width*0.5,box.y+box.height*0.5);}
assert.match(await page.locator('[data-gdetailhost]').textContent(),/R\d+ × L\d+/);
await page.locator('[data-gfilter]').fill('A V');assert.match(await page.locator('[data-glegend]').textContent(),/絞り込み：一致した行 [12]・列 [12]（OR：どちらかが一致する組を表示）/);await page.locator('[data-gfilter]').fill('AV');assert.match(await page.locator('[data-glegend]').textContent(),/（AND：行と列の両方が一致する組だけを表示）/);assert.ok(await page.evaluate(()=>{const s=document.querySelector('[data-kerning-grouper]').shadowRoot.querySelector('[data-gscroll]');return s.scrollWidth<=s.clientWidth+2;}),'AND shows only the matching rows and columns');await page.locator('[data-gfilter]').fill('A');assert.match(await page.locator('[data-glegend]').textContent(),/（OR：/,'a single character shows it as both first and second');await page.locator('[data-gfilter]').fill('');
assert.equal(await page.locator('[data-gmode]').count(),0,'heatmap mode folded into the kerning-display toggle');await page.locator('[data-gscroll]').focus();await page.keyboard.press('ArrowRight');assert.match(await page.locator('[data-gdetailhost]').textContent(),/×/);
await page.locator('[data-gunit=glyph]').click();{const box=await page.locator('[data-gscroll]').boundingBox();await page.mouse.click(box.x+box.width*0.4,box.y+box.height*0.4);}assert.match(await page.locator('[data-gdetailhost]').textContent(),/R\d+ × L\d+/);assert.doesNotMatch(await page.locator('[data-glegend]').textContent(),/行 = ペアの先頭|クラス共通値/,'row/column caption removed');assert.equal(await page.locator('.foot').count(),0);await page.locator('[data-gunit=group]').click();
{const box=await page.locator('[data-gscroll]').boundingBox();await page.mouse.click(box.x+30,box.y+box.height*0.5);}assert.equal(await page.locator('[data-tab=gadjust]').getAttribute('aria-selected'),'true','row header opens the group adjust tab');assert.match(await page.locator('[data-ginsp-title]').textContent(),/^R\d+ · \d+ グリフ/);
await page.locator('[data-group-check]').nth(0).check();await page.locator('[data-group-check]').nth(1).check();await page.locator('[data-merge]').click();assert.match(await page.locator('.status').textContent(),/手動統合/);assert.equal(await page.locator('[data-group-check]:checked').count(),0,'checks cleared after merge');await page.locator('[data-group-check]').nth(2).check();assert.ok(await page.locator('[data-merge]').isDisabled(),'one check is not a merge target (merged/active group not added)');assert.match(await page.locator('[data-merge]').textContent(),/2つ以上/);await page.locator('[data-group]').nth(4).locator('.strip').click();assert.ok(await page.locator('[data-merge]').isDisabled(),'selecting another group does not add it');await page.locator('[data-group-check]').nth(3).check();assert.match(await page.locator('[data-merge]').textContent(),/チェックした 2 グループ/);await page.locator('[data-group-check]').nth(2).uncheck();await page.locator('[data-group-check]').nth(3).uncheck();
await page.locator('[data-member]').first().click();await page.locator('[data-split]').click();assert.match(await page.locator('.status').textContent(),/分離/);
const before=await page.locator('[data-nright]').textContent();
{// Settings live in localStorage (groups and kerning travel as .vfm): no work-file buttons; a reload keeps the conditions.
assert.equal(await page.locator('[data-save]').count(),0);assert.equal(await page.locator('[data-restore]').count(),0);
await page.waitForTimeout(500);const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('kerning-grouper:settings:v1')));assert.equal(stored.version,2,"rules split in version 2");assert.ok(Number.isFinite(stored.params.local));assert.ok(Array.isArray(stored.rules));assert.ok(stored.kerning&&stored.kerning.optical===60);
await page.locator('[data-tab=target]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('[data-tab=group]').getAttribute('aria-selected'),'true','arrow keys move between tabs');await page.keyboard.press('End');assert.equal(await page.locator('[data-tab=save]').getAttribute('aria-selected'),'true');await page.keyboard.press('Home');assert.equal(await page.locator('[data-tab=target]').getAttribute('aria-selected'),'true');await page.locator('[data-tab=group]').click();}
await page.evaluate(()=>{const s=document.querySelector('[data-kerning-grouper]').shadowRoot;s.querySelector('[data-run]').click();});assert.notEqual(await page.locator('.app').getAttribute('data-state'),'ready');assert.equal(await page.locator('[data-cancel]').count(),0,'cancel button removed');
await page.locator('[data-run]').click();await page.waitForFunction(()=>document.querySelector('[data-kerning-grouper]').shadowRoot.querySelector('.app').dataset.state==='ready');
await page.screenshot({path:'/tmp/kerning-grouper-ui.png',fullPage:true});
// A second instance, fallback without Worker, and restoration mismatch.
await page.evaluate(()=>{const h=document.createElement('div');h.id='second';document.body.appendChild(h);window.Worker=function(){throw Error('blocked');};window.KerningGrouper.mount(h);});
await page.locator('#second [data-file]').setInputFiles(process.env.TEST_TTF || otherFont());await page.waitForFunction(()=>document.querySelector('#second').shadowRoot.querySelector('[data-font]').textContent.includes('UPM'));
await page.locator('#second [data-tab=group]').click();await page.locator('#second [data-run]').click();await page.waitForFunction(()=>document.querySelector('#second').shadowRoot.querySelector('.status').textContent.includes('分類完了'));assert.match(await page.locator('#second .status').textContent(),/分割実行/);
assert.equal(await page.locator('[data-kerning-grouper] [data-nright]').textContent(),before);{// conditions survive a reload; the reset button returns to the defaults
const v=await page.locator('[data-kerning-grouper] [data-number=local]').inputValue();await page.waitForTimeout(500);await page.reload();await page.waitForFunction(()=>document.querySelector('[data-kerning-grouper]')?.shadowRoot?.querySelector('[data-number=local]'));
assert.equal(await page.locator('[data-kerning-grouper] [data-number=local]').inputValue(),v,'conditions survive a reload');assert.notEqual(v,'24');
await page.locator('[data-kerning-grouper] [data-resetsettings]').click();assert.equal(await page.locator('[data-kerning-grouper] [data-number=local]').inputValue(),'24');await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>localStorage.getItem('kerning-grouper:settings:v1')),null);}
assert.deepEqual(errors,[]);
console.log('UI passed: OTF + TTF, Worker + fallback, threshold, merge, split, settings in localStorage, reload, reset, two instances.');await browser.close();server.close();
