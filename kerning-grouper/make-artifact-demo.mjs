import fs from 'node:fs';
const [,, js, font, out] = process.argv;
const app = fs.readFileSync(js,'utf8').replace(/<\/script/gi,'<\\/script');
const b64 = fs.readFileSync(font).toString('base64');
const html = `<title>Kerning Grouper</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root{--bg:#141519;--fg:#ededf2;--muted:#a4a7b4;--line:#3b3e48;--accent:#9d87ff;color-scheme:dark}
body{font:13px/1.6 system-ui,-apple-system,"Hiragino Sans","Yu Gothic UI","Noto Sans JP",sans-serif;background:var(--bg);color:var(--fg);padding-block:20px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.wrap{max-width:1450px;margin:0 auto;display:grid;gap:12px}
.demo{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;font-size:13px;color:var(--muted)}
.demo button{font:inherit;color:var(--bg);background:var(--accent);border:0;border-radius:8px;padding:7px 14px;font-weight:600;cursor:pointer}
.demo button:focus-visible{outline:2px solid var(--fg);outline-offset:2px}
.demo b{color:var(--fg);font-weight:600}
</style>
<div class="wrap">
<div class="demo"><button id="loadSample" type="button">サンプルで試す</button><span class="note"><b>デモ</b> 同梱の KG Japanese Test（Noto Sans JP 由来・OFL）で、かな・約物174文字を自動でグループ化します。グループ作成とカーニング生成まで自動で進めます。サンプルには欧文（ASCII）も入っているので、英大文字などにチェックを入れると和欧混在で試せます。手元のOTF/TTFも下から読み込めます。保存ボタンは確認画面を経てダウンロードします。</span></div>
<main data-kg-artifact></main>
</div>
<script>${app}</script>
<script>
(function(){
  var FONT_B64='${b64}';
  var root=document.querySelector('[data-kg-artifact]');
  var dl=null;
  function getDownloads(){if(!dl)dl=(window.claude&&window.claude.use)?window.claude.use('downloads').catch(function(){return null;}):Promise.resolve(null);return dl;}
  KerningGrouper.mount(root,{save:async function(name,blob){var d=await getDownloads();if(!d)throw new Error('この表示ではファイルを保存できません');try{await d.save({filename:name,data:blob});}catch(e){if(e&&e.code==='declined')throw new Error('保存をキャンセルしました');throw new Error((e&&e.message)||(e&&e.code)||'不明なエラー');}}});
  var s=root.shadowRoot;
  function wait(test,ms){return new Promise(function(res,rej){var t0=Date.now();(function tick(){var v=test();if(v)return res(v);if(Date.now()-t0>(ms||20000))return rej(new Error('timeout'));setTimeout(tick,80);})();});}
  async function runSample(){
    var bin=atob(FONT_B64),u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
    var file=new File([u],'KGJapaneseTest-Regular.ttf',{type:'font/ttf'});
    var input=s.querySelector('[data-file]');var dt=new DataTransfer();dt.items.add(file);input.files=dt.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
    await wait(function(){var f=s.querySelector('[data-font]');return f&&!/未読込/.test(f.textContent)&&f;});
    var kana=['hira','kata','jpunct'];s.querySelectorAll('[data-category]').forEach(function(el){el.checked=kana.indexOf(el.dataset.category)>=0;});
    var c0=s.querySelector('[data-category]');c0.dispatchEvent(new Event('change',{bubbles:true}));
    var st=s.querySelector('[data-number="strength"]');
    if(st){st.value=40;st.dispatchEvent(new Event('input',{bubbles:true}));st.dispatchEvent(new Event('change',{bubbles:true}));}
    await wait(function(){var r=s.querySelector('[data-run]');return r&&!r.disabled&&r;});
    s.querySelector('[data-run]').click();
    await wait(function(){var g=s.querySelector('[data-kgen]');return g&&!g.disabled&&g;},40000);
    var ts=s.querySelector('[data-ktsume]');if(ts&&!ts.checked){ts.checked=true;ts.dispatchEvent(new Event('change',{bubbles:true}));}
    var tx=s.querySelector('[data-ktext]');if(tx){tx.value='「ひらがな」と、カタカナ。ゲームのセリフ';tx.dispatchEvent(new Event('input',{bubbles:true}));}
    s.querySelector('[data-kgen]').click();
  }
  document.getElementById('loadSample').onclick=function(){runSample().catch(function(e){console.warn(e);});};
  runSample().catch(function(e){console.warn(e);});
})();
</script>`;
fs.writeFileSync(out,html);
