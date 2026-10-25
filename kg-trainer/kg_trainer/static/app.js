'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n1 = v => (v == null || isNaN(v)) ? '—' : (+v).toFixed(1);
const pct = v => (v == null || isNaN(v)) ? '—' : Math.round(v * 100) + '%';
const KIND = { UU: '大文字＋大文字', LL: '小文字＋小文字', UL: '大文字＋小文字', LU: '小文字＋大文字', other: 'その他（和文・混植など）' };
const PRESET = { kana: 'かな', latin: '欧文', digits: '数字', punct: '欧文約物' };

let S = null, R = null, tab = 'fonts', poll = null;

async function api(path, opt = {}) {
  const res = await fetch(path, opt);
  const ct = res.headers.get('Content-Type') || '';
  const body = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}
const post = (path, data) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });
function msg(text, cls = '') { const m = $('[data-msg]'); m.textContent = text; m.className = 'msg ' + cls; }

// ---- tabs and locks ----
function used() { return S ? S.fonts.filter(f => f.use) : []; }
function lockReason(t) {
  if (t === 'fonts') return null;
  if (!S || !S.fonts.length) return ['未登録', 'まず学習元フォントを登録してください。', 'fonts', 'フォントを登録する'];
  if (t === 'truth') return null;
  if (!used().length) return ['対象なし', '「使う」になっているフォントがありません。1つ以上オンにしてください。', 'fonts', 'フォント一覧へ'];
  if (t === 'train') return null;
  if (!S.hasResult) return ['未学習', '「評価・学習」で学習を実行すると使えます。', 'train', '評価・学習へ'];
  return null;
}
function renderTabs() {
  const subs = {
    fonts: S.fonts.length ? `${S.fonts.length} 書体（使う ${used().length}）` : 'OTF/TTF を登録',
    truth: S.fonts.length ? `${used().reduce((a, f) => a + f.kernPairs, 0).toLocaleString()} ペア` : '',
    train: R ? `誤差 ${n1(R.evaluation.model.mae)}` : (S.progress.busy ? '実行中…' : ''),
    group: R && R.grouping && R.grouping.best ? `一致 F1 ${R.grouping.best.f1}` : '',
    export: R ? '書き出せます' : '',
  };
  for (const b of $$('[data-tab]')) {
    const t = b.dataset.tab, lock = lockReason(t);
    b.classList.toggle('active', t === tab);
    b.classList.toggle('locked', !!lock);
    b.setAttribute('aria-disabled', lock ? 'true' : 'false');
    b.classList.toggle('done', !lock && t !== tab && ((t === 'fonts' && S.fonts.length) || (t === 'train' && R) || (t === 'truth' && S.fonts.length)));
    $(`[data-sub="${t}"]`).textContent = lock ? lock[0] : subs[t];
  }
  for (const p of $$('[data-pane]')) {
    const t = p.dataset.pane, lock = lockReason(t);
    p.classList.toggle('show', t === tab);
    p.classList.toggle('locked', !!lock);
    $('.locknote', p)?.remove();
    if (lock) {
      p.insertAdjacentHTML('afterbegin', `<div class="locknote"><b>${esc(lock[0])}</b><p>${esc(lock[1])}</p><button data-goto="${lock[2]}">${esc(lock[3])}</button></div>`);
    }
  }
}
function go(t) { tab = t; renderTabs(); }

// ---- fonts ----
function renderFonts() {
  $('[data-version]').textContent = `core ${S.coreVersion} · 特徴量 v${S.featureVersion} · ローカル`;
  const total = new Set([...S.chars].filter(c => c.trim())).size;
  $('[data-fontlist]').innerHTML = S.fonts.length ? `<div class="fonts">${S.fonts.map(f => `
    <div class="font${f.use ? '' : ' off'}" data-key="${f.key}">
      <div><div class="name">${esc(f.family || f.file)} <small>${esc(f.file)}</small></div>
      <div class="meta"><span>UPM <b>${f.upm}</b></span><span>グリフ <b>${f.glyphs.toLocaleString()}</b></span>
        <span>カーニング <b>${f.kernPairs.toLocaleString()}</b> ペア</span><span>対象の字 <b>${f.coverage}</b>/${total}</span>
        ${f.variable ? '<span class="warn">可変フォント：既定のインスタンスだけを使います</span>' : ''}
        ${f.kernPairs ? (f.kernPairs < 50 ? '<span class="warn">カーニングが少なく、ほとんどのペアが「0」として学習されます</span>' : '') : '<span class="bad">カーニングがありません</span>'}</div></div>
      <div class="side"><label class="switch"><input type="checkbox" data-use ${f.use ? 'checked' : ''}>使う</label>
        <button class="small" data-remove>削除</button></div>
      <div class="lic">ライセンス<input data-license value="${esc(f.license)}" placeholder="例：OFL 1.1 / 自社フォント" class="${f.license ? '' : 'empty'}"></div>
    </div>`).join('')}</div>
    ${used().length === 1 ? '<div class="callout">フォントが1つだと、同じフォントの中で字を分けて検証します。別のフォントへの精度を確かめるには、2つ以上登録してください。</div>' : ''}` : '';
  const chars = $('[data-chars]');
  if (document.activeElement !== chars) chars.value = S.chars;
  const refs = $('[data-refs]');
  if (document.activeElement !== refs) refs.value = S.references;
  const min = $('[data-min]');
  if (document.activeElement !== min) min.value = S.minimum;
  $('[data-presets]').innerHTML = Object.keys(S.presets).map(k => `<button data-preset="${k}">＋${PRESET[k] || k}</button>`).join('') +
    '<button data-preset="">クリア</button>';
}
async function upload(files) {
  let ok = 0;
  for (const file of files) {
    msg(`${file.name} を読み込み中…`);
    try {
      S = await api('/api/fonts', { method: 'POST', headers: { 'X-Filename': encodeURIComponent(file.name) }, body: await file.arrayBuffer() });
      ok++;
    } catch (e) { msg(`${file.name}: ${e.message}`, 'bad'); R = null; render(); return; }
  }
  R = null;
  msg(ok ? `${ok} 書体を追加しました。` : '', 'ok');
  render();
}
let settingsTimer = null;
function saveSettings() {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(async () => {
    S = await post('/api/settings', { chars: $('[data-chars]').value, references: $('[data-refs]').value, minimum: +$('[data-min]').value || 0 });
    R = null; render();
  }, 400);
}

// ---- truth ----
function renderTruth() {
  if (!S.fonts.length) return;
  $('[data-truth]').innerHTML = `<thead><tr><th>フォント</th><th>使う</th><th>カーニング</th><th>1つ目クラス</th><th>2つ目クラス</th><th>palt</th><th>対象の字</th><th>読めなかった部分</th></tr></thead><tbody>${S.fonts.map(f => `
    <tr><td>${esc(f.family || f.file)}<br><small>${esc(f.file)} · ${f.sha1}</small></td><td>${f.use ? '○' : '—'}</td>
    <td class="num">${f.kernPairs.toLocaleString()}</td><td class="num">${f.classes.first}</td><td class="num">${f.classes.second}</td>
    <td class="num">${f.palt}</td><td class="num">${f.coverage}</td><td>${f.skipped.length ? `<span class="warn">${esc(f.skipped.join('、'))}</span>` : '—'}</td></tr>`).join('')}</tbody>`;
  const notes = [];
  if (S.fonts.some(f => f.skipped.length)) notes.push('文脈依存のカーニングなど、ペアとして読めない部分は学習に使っていません。');
  if (S.fonts.some(f => !f.classes.first)) notes.push('クラスを使っていないフォントは「グループ」の評価に入りません（カーニング値の学習には使えます）。');
  if (S.fonts.some(f => f.palt)) notes.push('palt は学習に使いません。kern の値だけを正解にしています。');
  notes.push('値はすべて 1000 UPM に揃えて比べます。カーニングのないペアは「0 が正解」として弱い重みで扱います。');
  $('[data-truthnotes]').innerHTML = notes.map(t => `<div class="callout">${esc(t)}</div>`).join('');
}

// ---- training ----
function stat(title, m, hero) {
  return `<div class="stat${hero ? ' hero' : ''}"><div class="t">${title}</div><div class="number">${n1(m.mae)}</div>
    <div class="sub">誤差の平均 · 半px以内 ${pct(m.within)} · 1px超 ${m.over} · 偏り ${m.bias > 0 ? '+' : ''}${n1(m.bias)}</div></div>`;
}
// Family name, plus the file name when several fonts share a family.
const fname = key => {
  const f = S.fonts.find(x => x.key === key);
  if (!f) return key;
  const dup = S.fonts.filter(x => x.family === f.family).length > 1;
  return f.family ? (dup ? `${f.family}（${f.file}）` : f.family) : f.file;
};
function renderResult() {
  const box = $('[data-result]');
  if (!R) { box.innerHTML = S.progress.busy ? '' : '<p class="muted">「学習する」で、今の計算と学習後のモデルを、プロの値と比べます。</p>'; return; }
  const ev = R.evaluation, m = R.model;
  const multi = ev.method === 'leave-one-font-out';
  const curve = ev.curve;
  let curveHtml = '';
  if (curve && curve.length) {
    const max = Math.max(...curve.map(c => c.mae), ev.default.mae);
    const gain = curve.length > 1 ? curve[curve.length - 2].mae - curve[curve.length - 1].mae : null;
    curveHtml = `<h3>学習に使うフォントの数と精度</h3>
      <p class="muted">1書体を外して、残りから k 書体で学習したときの、外した書体での誤差です。</p>
      <div class="curve">${curve.map(c => `<div class="bar"><span>${c.fonts} 書体</span><i style="width:${(c.mae / max * 100).toFixed(1)}%"></i><span>${n1(c.mae)} · ${pct(c.within)}</span></div>`).join('')}</div>
      ${gain != null ? `<div class="callout${gain > 1 ? '' : ' warn'}">${gain > 1
        ? `最後の1書体を足すと誤差が ${n1(gain)} 減っています。似た傾向のフォントをさらに足すと、まだ精度が上がる見込みがあります。`
        : '書体を足しても誤差がほとんど変わっていません。精度を上げるには、数より「仕上げたいフォントに近い書体」を選ぶことが効きます。'}</div>` : ''}`;
  }
  const spread = Object.values(ev.byFont || {}).map(f => f.model.bias);
  const tight = spread.length > 1 && Math.max(...spread) - Math.min(...spread) > 20;
  box.innerHTML = `
    <p class="method">検証：<b>${multi ? 'フォント単位の1つ抜き（知らないフォントでの精度）' : esc(ev.method)}</b> · ${ev.pairs.toLocaleString()} ペア · ${ev.seconds} 秒</p>
    <div class="stats">${stat('今の計算（初期設定）', ev.default)}${stat('設定だけ学習', ev.settings)}${stat('学習したモデル', ev.model, true)}</div>
    <small>誤差は 1000 UPM の単位。18px 表示で 28 が半ピクセル、56 が1ピクセルです。</small>
    ${ev.model.mae >= ev.default.mae ? `<div class="callout warn">学習したモデルが今の計算より良くなっていません。詰め方の方針が大きく違うフォントや、カーニングがわずかしかないフォントが混ざっていると起きます。下の「フォントごとの精度」で外れているフォントを「使う」から外して、もう一度学習してください。</div>` : ''}
    <h3>学習した設定</h3>
    <table class="data"><tbody>
      <tr><td>光学の割合</td><td class="num">${m.settings.optical}%</td></tr>
      <tr><td>上限</td><td class="num">±${m.settings.limit}</td></tr>
      <tr><td>基準ペアと同じくらいの字間は動かさない</td><td class="num">${m.settings.keepSpacing ? 'オン' : 'オフ'}</td></tr>
      ${Object.entries(m.kindOffsets).map(([k, v]) => `<tr><td>字間の補正：${KIND[k]}</td><td class="num">${v > 0 ? '+' : ''}${n1(v)}</td></tr>`).join('')}
    </tbody></table>
    ${multi ? `<h3>フォントごとの精度</h3>
    <div class="table-wrap"><table class="data"><thead><tr><th>外したフォント</th><th>ペア</th><th>今の計算</th><th>モデル</th><th>半px以内</th><th>偏り</th></tr></thead><tbody>
      ${Object.entries(ev.byFont).map(([k, f]) => `<tr><td>${esc(fname(k))}</td><td class="num">${f.model.n}</td><td class="num">${n1(f.default.mae)}</td><td class="num">${n1(f.model.mae)}</td><td class="num">${pct(f.model.within)}</td><td class="num">${f.model.bias > 0 ? '+' : ''}${n1(f.model.bias)}</td></tr>`).join('')}
    </tbody></table></div>
    ${tight ? '<div class="callout warn">フォントごとの「偏り」の差が大きく、詰め具合の方針が書体ごとに違うようです。方針の近い書体だけを「使う」にすると、狙った仕上がりに合いやすくなります。</div>' : ''}` : ''}
    ${curveHtml}
    <h3>ペアの種類ごと</h3>
    <div class="table-wrap"><table class="data"><thead><tr><th>種類</th><th>ペア</th><th>今の計算</th><th>モデル</th><th>半px以内</th></tr></thead><tbody>
      ${Object.entries(ev.byKind).map(([k, v]) => `<tr><td>${KIND[k]}</td><td class="num">${v.model.n}</td><td class="num">${n1(v.default.mae)}</td><td class="num">${n1(v.model.mae)}</td><td class="num">${pct(v.model.within)}</td></tr>`).join('')}
    </tbody></table></div>
    <h3>ずれの大きいペア</h3>
    <div class="legend"><span><i class="p"></i>プロの値</span><span><i class="o"></i>モデルの値</span></div>
    <div class="worst">${ev.worst.slice(0, 24).map(w => `<div class="pair" data-svg="${w.font}|${w.a}|${w.b}|${w.pro}|${w.model}">
      <div class="head"><b>${esc(w.pair)}</b><small>${esc(fname(w.font))}</small></div><div class="svg"></div>
      <div class="vals">プロ ${w.pro} · 今 ${w.default} · モデル ${w.model}</div></div>`).join('')}</div>`;
  loadSvgs(box);
}
async function loadSvgs(root) {
  for (const el of $$('[data-svg]', root)) {
    const [font, a, b, pro, ours] = el.dataset.svg.split('|');
    try { $('.svg', el).innerHTML = await api(`/api/pair?font=${font}&a=${a}&b=${b}&pro=${pro}&ours=${ours}`); } catch (e) { }
  }
}
async function run() {
  try { await post('/api/run'); } catch (e) { msg(e.message, 'bad'); return; }
  R = null; S.progress.busy = true; render(); watch();
}
function watch() {
  clearInterval(poll);
  poll = setInterval(async () => {
    S = await api('/api/state');
    const p = S.progress;
    $('[data-prog]').classList.remove('hidden');
    $('[data-progfill]').style.width = Math.round(p.value * 100) + '%';
    $('[data-proglabel]').textContent = p.label;
    $('[data-run]').disabled = p.busy;
    if (!p.busy) {
      clearInterval(poll);
      if (S.hasResult) R = await api('/api/result');
      if (!/^エラー/.test(p.label)) $('[data-prog]').classList.add('hidden');
      render();
    }
  }, 350);
}

function renderValue() {
  const box = $('[data-vresult]');
  $('[data-vdl]').classList.toggle('hidden', !S.hasValue);
  $('[data-vrun]').disabled = S.progress.busy || !used().length;
  const ev = S.valueEval;
  box.innerHTML = !S.hasValue ? '' : ev
    ? `<div class="stats"><div class="stat"><div class="t">今の計算（初期設定）</div><div class="number">${n1(ev.tool.mae)}</div><div class="sub">半px以内 ${pct(ev.tool.within)}</div></div>
       <div class="stat hero"><div class="t">補正モデル</div><div class="number">${n1(ev.model.mae)}</div><div class="sub">半px以内 ${pct(ev.model.within)} · 1px超 ${pct(ev.model.over)}</div></div></div>
       <small>プロもツールも値を入れている英字のペアで、1書体を外して学習し、外した書体で測った誤差です。</small>`
    : '<div class="callout warn">フォントが1つなので、知らない書体での精度は測れていません。2つ以上で学習するのがおすすめです。</div>';
}
async function runValue() {
  try { await post('/api/valuemodel'); } catch (e) { msg(e.message, 'bad'); return; }
  S.progress.busy = true; render(); watch();
}

// ---- grouping ----
function renderGroup() {
  const box = $('[data-group]');
  if (!R) return;
  const g = R.grouping;
  if (!g || !g.pairs) { box.innerHTML = '<div class="callout warn">使っているフォントにカーニングクラスがない（または対象の字がクラスに入っていない）ため、比べられません。</div>'; return; }
  const top = [...g.table].sort((a, b) => b.f1 - a.f1).slice(0, 10);
  box.innerHTML = `
    <div class="stats">
      <div class="stat hero"><div class="t">一致（F1）</div><div class="number">${g.best.f1}</div><div class="sub">比べた字の組 ${g.pairs.toLocaleString()}</div></div>
      <div class="stat"><div class="t">適合率</div><div class="number">${pct(g.best.precision)}</div><div class="sub">同じと判定した組のうち、プロも同じクラス</div></div>
      <div class="stat"><div class="t">再現率</div><div class="number">${pct(g.best.recall)}</div><div class="sub">プロが同じクラスの組のうち、同じと判定</div></div>
    </div>
    ${g.pairs < 50 ? '<div class="callout warn">比べられた字の組がまだ少なく、この結果は目安です。クラスを使っているフォントを足すか、対象の字を増やしてください。</div>' : ''}
    <h3>いちばん近かった設定</h3>
    <table class="data"><tbody>
      <tr><td>強さ</td><td class="num">${g.params.strength}</td></tr>
      <tr><td>形の許容</td><td class="num">${g.params.shape}</td></tr>
      <tr><td>サイドベアリングの許容</td><td class="num">${g.params.bearing}</td></tr>
      <tr><td>局所の許容</td><td class="num">${g.params.local}</td></tr>
      <tr><td>欠けの許容</td><td class="num">${g.params.missing}</td></tr>
    </tbody></table>
    <small class="help">この設定はモデルに入り、Web 版のグループ作成の初期値になります。</small>
    <h3>上位の組み合わせ</h3>
    <div class="table-wrap"><table class="data"><thead><tr><th>強さ</th><th>許容の倍率</th><th>F1</th><th>適合率</th><th>再現率</th></tr></thead><tbody>
      ${top.map(r => `<tr class="${r === g.best || (r.strength === g.best.strength && r.scale === g.best.scale) ? 'best' : ''}"><td class="num">${r.strength}</td><td class="num">×${r.scale}</td><td class="num">${r.f1}</td><td class="num">${pct(r.precision)}</td><td class="num">${pct(r.recall)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

// ---- export ----
function renderExport() {
  if (!R) return;
  const fonts = used();
  const noLic = fonts.filter(f => !f.license);
  $('[data-export]').innerHTML = `
    ${noLic.length ? `<div class="callout warn">ライセンスが未入力のフォントがあります：${noLic.map(f => esc(f.family || f.file)).join('、')}。モデルには学習元の情報として記録されます。</div>` : ''}
    <h3>モデルに入る内容</h3>
    <table class="data"><tbody>
      <tr><td>学習元</td><td>${fonts.map(f => esc(f.family || f.file) + (f.license ? `（${esc(f.license)}）` : '')).join('<br>')}</td></tr>
      <tr><td>検証</td><td>${R.evaluation.method === 'leave-one-font-out' ? 'フォント単位の1つ抜き' : esc(R.evaluation.method)} · 誤差 ${n1(R.evaluation.model.mae)}（初期 ${n1(R.evaluation.default.mae)}）</td></tr>
      <tr><td>カーニング</td><td>光学 ${R.model.settings.optical}% · 上限 ±${R.model.settings.limit} · 補正 ${R.model.residual.features.length} 特徴量</td></tr>
      <tr><td>グループ</td><td>${R.grouping && R.grouping.pairs ? `強さ ${R.grouping.params.strength} · F1 ${R.grouping.best.f1}` : 'なし（クラスのあるフォントがない）'}</td></tr>
      <tr><td>互換</td><td>core ${S.coreVersion} · 特徴量 v${S.featureVersion}</td></tr>
    </tbody></table>
    <small class="help">フォントのアウトラインや字形は入りません。入るのは数値の設定と係数だけです。</small>`;
}

// ---- wiring ----
function render() {
  renderFonts(); renderTruth(); renderResult(); renderValue(); renderGroup(); renderExport(); renderTabs();
  $('[data-run]').disabled = S.progress.busy || !used().length;
}
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-tab]');
  if (t) return go(t.dataset.tab);
  const g = e.target.closest('[data-goto]');
  if (g) return go(g.dataset.goto);
  const f = e.target.closest('[data-key]');
  if (e.target.closest('[data-remove]') && f) { S = await post(`/api/fonts/${f.dataset.key}/remove`); R = null; msg(''); return render(); }
  const p = e.target.closest('[data-preset]');
  if (p) {
    const ta = $('[data-chars]');
    const add = p.dataset.preset ? S.presets[p.dataset.preset] : null;
    ta.value = add == null ? '' : [...new Set([...ta.value, ...add])].join('');
    return saveSettings();
  }
  if (e.target.closest('[data-run]')) return run();
  if (e.target.closest('[data-vrun]')) return runValue();
  if (e.target.closest('[data-download]')) {
    const name = $('[data-name]').value.trim() || 'kerning-model';
    location.href = `/api/package?name=${encodeURIComponent(name)}`;
  }
});
document.addEventListener('change', async e => {
  const f = e.target.closest('[data-key]');
  if (e.target.matches('[data-use]') && f) { S = await post(`/api/fonts/${f.dataset.key}`, { use: e.target.checked }); R = null; return render(); }
  if (e.target.matches('[data-license]') && f) { S = await post(`/api/fonts/${f.dataset.key}`, { license: e.target.value }); return render(); }
  if (e.target.matches('[data-file]')) { await upload([...e.target.files]); e.target.value = ''; }
});
document.addEventListener('input', e => { if (e.target.matches('[data-chars],[data-refs],[data-min]')) saveSettings(); });
const drop = $('[data-drop]');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => upload([...e.dataTransfer.files]));

(async () => {
  S = await api('/api/state');
  if (S.hasResult) R = await api('/api/result');
  render();
  if (S.progress.busy) watch();
})();
