import fs from 'node:fs';
const [,, js, font, out, font2, font3] = process.argv;   // optional: font2 Latin/Greek/symbols sample, font3 every-category sample
const app = fs.readFileSync(js,'utf8').replace(/<\/script/gi,'<\\/script');
const b64 = fs.readFileSync(font).toString('base64');
const b64b = font2 ? fs.readFileSync(font2).toString('base64') : '';
const b64c = font3 ? fs.readFileSync(font3).toString('base64') : '';
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
<div class="demo"><button id="loadSample" type="button">サンプル：かな</button>${b64b?'<button id="loadSample2" type="button">サンプル：欧文・ギリシャ・記号</button>':''}${b64c?'<button id="loadSample3" type="button">サンプル：全分類</button>':''}<span class="note"><b>デモ</b> 「かな」は同梱の KG Japanese Test（Noto Sans JP 由来・OFL）で、かな・約物174文字をグループ化します。${b64b?'「欧文・ギリシャ・記号」は Fira Sans（OFL、一部の文字に絞ったもの）で、英数字・ASCII記号・ギリシャ文字・その他の記号 275 文字をグループ化します。':''}${b64c?'「全分類」は KG All Test（Noto Sans JP 由来・OFL）で、Unicode の規則をすべてチェックして 720 文字を処理します（カーニング生成に数分かかります）。':''}どちらもグループ作成とカーニング生成まで自動で進めます。手元のOTF/TTFも下から読み込めます。保存ボタンは確認画面を経てダウンロードします。</span></div>
<main data-kg-artifact></main>
</div>
<script>${app}</script>
<script>
(function(){
  var FONT_B64='${b64}',FONT2_B64='${b64b}',FONT3_B64='${b64c}';
  var root=document.querySelector('[data-kg-artifact]');
  var dl=null;
  function getDownloads(){if(!dl)dl=(window.claude&&window.claude.use)?window.claude.use('downloads').catch(function(){return null;}):Promise.resolve(null);return dl;}
  KerningGrouper.mount(root,{save:async function(name,blob){var d=await getDownloads();if(!d)throw new Error('この表示ではファイルを保存できません');try{await d.save({filename:name,data:blob});}catch(e){if(e&&e.code==='declined')throw new Error('保存をキャンセルしました');throw new Error((e&&e.message)||(e&&e.code)||'不明なエラー');}}});
  var s=root.shadowRoot;
  function wait(test,ms){return new Promise(function(res,rej){var t0=Date.now();(function tick(){var v=test();if(v)return res(v);if(Date.now()-t0>(ms||20000))return rej(new Error('timeout'));setTimeout(tick,80);})();});}
  // sample: {b64, file, rules, strength, tsume, text}
  var SAMPLES={kana:{b64:FONT_B64,file:'KGJapaneseTest-Regular.ttf',rules:['hira','kata','jpunct'],strength:40,tsume:true,text:'「ひらがな」と、カタカナ。ゲームのセリフ'},
   latin:{b64:FONT2_B64,file:'FiraSans-Regular-subset.ttf',rules:['upper','lower','digit','punct','asciisym','greek','gpunct','currency','math','othersym'],strength:0,tsume:false,text:'AVATAR To WA ΑΥΤΟΣ Τα «Γειά σου» “Quote” – 2026'},
   all:{b64:FONT3_B64,file:'KGAllTest-Regular.ttf',rules:'all',strength:0,tsume:false,text:'AVATAR Τα «Γειά» Жук 「ひらがな」とカタカナ。ＡＢＣ１２３ → ※'}};
  async function runSample(key){var S=SAMPLES[key||'kana'];
    var bin=atob(S.b64),u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
    var file=new File([u],S.file,{type:'font/ttf'});
    var input=s.querySelector('[data-file]');var dt=new DataTransfer();dt.items.add(file);input.files=dt.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
    await wait(function(){var f=s.querySelector('[data-font]');return f&&!/未読込/.test(f.textContent)&&f;},60000);
    s.querySelectorAll('[data-category]').forEach(function(el){el.checked=S.rules==='all'||S.rules.indexOf(el.dataset.category)>=0;});
    var c0=s.querySelector('[data-category]');c0.dispatchEvent(new Event('change',{bubbles:true}));
    var st=s.querySelector('[data-number="strength"]');
    if(st){st.value=S.strength;st.dispatchEvent(new Event('input',{bubbles:true}));st.dispatchEvent(new Event('change',{bubbles:true}));}
    // let the selection settle (it is applied after a short delay) before grouping
    var cnt=function(){return (s.querySelector('[data-count]')||{}).textContent||'';},last=cnt(),same=0;await wait(function(){var v=cnt();if(v===last)same++;else{same=0;last=v;}return same>=6;},8000).catch(function(){});
    await wait(function(){var r=s.querySelector('[data-run]');return r&&!r.disabled&&r;},300000);
    var app=s.querySelector('.app');if(!app||app.dataset.state!=='ready')s.querySelector('[data-run]').click();
    await wait(function(){var g=s.querySelector('[data-kgen]');return g&&!g.disabled&&g;},300000);
    var ts=s.querySelector('[data-ktsume]');if(ts&&ts.checked!==S.tsume){ts.checked=S.tsume;ts.dispatchEvent(new Event('change',{bubbles:true}));}
    var tx=s.querySelector('[data-ktext]');if(tx){tx.value=S.text;tx.dispatchEvent(new Event('input',{bubbles:true}));}
    s.querySelector('[data-kgen]').click();
  }
  var busy=false;function go(k){if(busy)return;busy=true;runSample(k).catch(function(e){console.warn(e);}).finally(function(){busy=false;});}
  document.getElementById('loadSample').onclick=function(){go('kana');};
  var b2=document.getElementById('loadSample2');if(b2)b2.onclick=function(){go('latin');};
  var b3=document.getElementById('loadSample3');if(b3)b3.onclick=function(){go('all');};
  go('kana');
})();
</script>`;
fs.writeFileSync(out,html);
