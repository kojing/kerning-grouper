# 開発引き継ぎプロンプト — Kerning Grouper v0.5

以下の要件と同梱ソースを引き継ぎ、FontLab 8用カーニング補助Webアプリの開発を継続してください。まず同梱READMEと実装を確認し、実装済み機能を維持してください。仕様の説明だけで終わらず、依頼された変更を実装・検証し、更新した成果物を渡してください。

## 1. 目的・利用環境

文字の輪郭からカーニンググループを作成し、機械的な距離判定に加えて光学的な隙間の統一感を評価して、グループカーニングと個別例外を生成したい。

- 利用先は社内Confluence。メインJSと埋め込み用HTMLマクロで構成する。
- 拡張・プラグインの導入を前提にしない。利用時のnpm、Python、サーバー、外部CDN、外部通信を必須にしない。
- OTF/TTF等のフォントデータはブラウザ内で処理する。
- 開発時のNode・ビルドツール・フォント変換は可。利用時に必要なものはバンドルする。
- ConfluenceのHTMLマクロ実行可否、JavaScript配信、CSPは設置先の設定に依存する。全環境で動くと断定しない。
- ユーザーはOpenType Extension Lookupを使えない環境を想定している。
- 表示・操作説明は日本語。ここで操作できるデモと、Confluence用一式を提供する。

## 2. 入出力の最終目標と現状を区別する

当初はFontLabから出力したOTFとAFMの書き換えを検討した。その後、FontLabのJSON形式のカーニング情報を利用する方向になり、VFM仕様に合わせた出力が要求された。

### 現在できること
- 静的OTF/TTFの読み込み、輪郭解析、左右独立のグループ分類。
- 光学・機械判定を混合したペア値の生成、クラス共通値、個別例外、手動指定。
- 本アプリ専用の作業JSON保存・復元。
- FontLab 用 VFM（v0.5.3、src/vfm.js）、ペアCSVの保存。

### まだできないこと
- （v0.5.3 で VFM 書き出しを実装。下記 3 を参照）
- AFMの読み込み・書き換え。
- OTFのGPOSを書き換えた実フォントの出力。
- 実出力バイナリによる64KiB・16bitオフセット・Extension非使用の検証。

独自JSONに.vfmという拡張子を付けて対応済みとしない。

## 3. VFM対応（v0.5.3 で書き出しを実装）

ユーザーから FontLab 8 が書き出した実 VFM（FOT-MatisseProN-M.vfm）と同じ書体の OTF（M・B）を受け取り、構造を確認した（README の「v0.5.3」に構造を記載）。このファイルは CID フォントのもので、カーニングはグリフ単位のペアに展開されており、クラスの書き方は確認できていない。

実装（src/vfm.js、src/fontlab-names.js、test-vfm.mjs）：
1. 書き出しはグリフ単位のペア（クラス展開）。値はフォント単位の整数を文字列で。0は書かない。キーは辞書順、インデント4。
2. グリフ名：フォント自身の名前（名前付き CFF・post 2）、なければ最小コードポイントから FontLab の名前（fontlab-names.js、AGLFN を実ファイルに合わせて補正：twosuperior・threesuperior・onesuperior・f_f・fi・fl・f_f_i・f_f_l を追加、µ・ϑ・ϕ・Ω(2126)・ℵ・⊥・罫線・□▪▫● は uniXXXX）。
3. 読み込み先 VFM（任意）：マスター名・グリフ名を検証し、無い名前は送り幅＋外接矩形の一致で対応付け、そのファイルの当該マスターの pairs だけを差し替える（metrics・他マスター・未知フィールドは保持）。
4. マスター名の既定は name ID 17 → 2 → Regular。

未確認：VFM でのクラスカーニングの書き方、FontLab の読み込み時の置き換え／追加の選択肢、実際に FontLab へ読み戻せるか（この環境では FontLab を動かせない）。クラス付きの VFM の実例が入手できたら、クラスのまま書き出す方式を検討する。
参考： https://help.fontlab.com/fontlab/7/manual/Release-Notes-7435/

## 4. 対象グリフ

- 対象はUnicodeの規則（src/unicode-rules.js：一般カテゴリ・Script・ブロック）のチェックの和集合から、「除外する文字」を引いたもの（ユーザー指定）。欧文：英大文字・英小文字・数字・ASCII記号・ラテン拡張・ギリシャ/キリル・その他の記号、和文：ひらがな・カタカナ・和文の約物・全角英数・漢字。各規則にフォント内の字数を表示。
- 個別選択・グリフ名検索・追加文字はv0.5で廃止（ユーザー指定）。作業JSONは selection v2（rules, exclude）。旧形式は、保存グリフを含む規則をすべて選び残りを除外文字にして変換。
- 和文検証はユーザーの指定により漢字を除外する。
- 現在の和文サンプルは、ひらがな・カタカナ・長音・小書き文字・濁音・半濁音・約物を含む174文字。同梱フォントはこれにASCIIを加えて収録（v0.5）。
- 空輪郭・結合マーク等は対象外。未収録文字を通知する。
- 制限：読込20000グリフまで、分類1回800グリフまで、カーニング生成320グリフまで。
- 可変フォント、CFF2、カラーフォント等は現行版では未対応。静的単色フォントを使う。

## 5. 和欧混植について

ユーザーから「和文と欧文のペアは？」という質問があった。

- v0.5で同梱サンプルにASCIIを追加。英大文字等にチェックを入れると和欧混在で生成できる。
- エンジンは選択グリフの全組み合わせを評価するので、両方を選択すれば和→欧・欧→和を生成できる。
- ただし現在の分類は欧文大文字/小文字の4カテゴリとotherであり、和欧専用の基準分離は未実装。
- v0.5で和欧の組み合わせを生成するかのチェックを実装（10.5参照）。将来案：「和欧間の追加余白」スライダー、和欧で別サブテーブルにした場合の容量評価。
- かな・約物174文字＋英数字62文字なら最大236文字・55696ペア。容量は改めて評価する。
- 追加余白は未実装。直近の主要求はグループ統合力の改善。

## 6. グループ判定の現行仕様

- 1000-UPMへ正規化。
- Bézier曲線を線分化し、共有高さグリッドで非ゼロ巻き数の走査線を評価。
- 左プロファイルは左端、右プロファイルはadvanceWidthから右端を引いた距離。
- 先頭文字には右輪郭グループ、後ろ文字には左輪郭グループを使う。左右は独立に分類する。
- 比較指標：差の中央値による余白差、中央値を除いたRMS形状差、絶対局所最大差、片側だけ輪郭が存在する高さの割合。
- 共有サンプル3点未満は統合しない。
- 完全連結クラスタリングを使い、グループ内の全組み合わせが閾値内であることを条件とする。単連結の連鎖による際限ない統合を避ける。
- 手動統合・分離・固定、輪郭の重ね表示ができる。
- Workerを利用し、使えない場合は分割実行へフォールバックする。

### v0.4で追加した「統合の強さ」0〜100

元の輪郭は変えず、分類用プロファイルだけをGaussian平滑化する。輪郭がない高さはnullのまま保持し、存在する近傍サンプルで重みを正規化する。

強度t = strength / 100 として：
- 平滑化sigma = 48 × t units。
- 実効形状閾値 = 基本値 + 72 × t。
- 実効余白閾値 = 基本値 + 48 × t。
- 実効局所閾値 = 基本値 + 216 × t。
- 実効高さ不一致率 = min(1, 基本値 + 0.34 × t)。

実効閾値をUIへ表示する。強度0は従来と同じ。旧作業JSONでstrengthがなければ0として復元する。通常アプリ初期値は0、会話内デモは40。

分類に用いる比較キャッシュは強度・サンプル間隔・左右を区別する。元輪郭を使うカーニング生成・接触回避に平滑化を流用しない。

強度を変えると分類を更新し、生成済みカーニングと手動調整は無効になる。強くすればグループ数は減りやすいが、例外が増え、総容量が増える場合がある。

## 7. カーニング生成

- 形状分類後、選択グリフの全ペアを評価する。
- 機械判定は最小水平隙間と基準ペアの隙間との差を用いる。
- 光学判定は左右外輪郭を指数濃度へ変換し、縦方向にGaussianぼかしを適用した相互作用を用いる。
- 横尺度24/60/120、縦sigma18/45/90 units、重み0.2/0.5/0.3の3尺度。
- 基準ペアの中央値との相違から推奨カーニングを求める。光学比重スライダーで機械判定と混合する。
- 「光学的」はヒューリスティックであり、人間の知覚の保証や学習済みAIではない。
- 元輪郭を2 units間隔で評価し、最小余白のための保護下限を計算する。微細形状・サンプル間衝突まで完全保証しない。
- クラスの共通値は推奨値の中央値。許容差・接触回避・数字保護等に応じて個別例外を作る。
- 手動クラス値・手動ペア値を指定できる。接触回避と数字保護は優先する。
- 数字×数字は初期設定で0に固定する。
- 微小値省略時も意味のある0値例外は消さない。

初期設定（v0.5.1）：光学比重60%、間隔調整0、最小余白18、微小値閾値20、クラス許容差18、自動補正上限100、基準ペアの範囲を保つ keepSpacing=true（すべて距離は1000-UPM）。v0.5.0までは85%・5・240・範囲なし。keepSpacing は generateKerning で targets[kind].band＝基準ペアそれぞれの desiredOf の最小〜最大を求め、desired がその範囲内なら0、外なら端との差にする（上限・接触回避・字詰めはその後）。旧作業JSONは keepSpacing=false で復元。Python 版（kg-trainer/kg_trainer/core.py の reference_band・banded_value）も同じ計算で、CORE_VERSION 0.5.1。v0.5から、個別例外の自動作成は既定オフ（kernDefaults.exceptions=false：光学例外を作らず、接触回避はクラス値の引き上げで確保。手動ペア・数字保護は有効）、和欧の組み合わせも既定オフ（mixScripts=false：和欧ペア0、グループも分離）。旧作業JSONはどちらもオンで復元。

欧文基準：HH HO OO nn no oo Hn Ho On Oo
和文基準：のの ねね カカ ロロ のカ カの のロ ロの
和文プレビュー：ひらがなとカタカナのカーニング

## 8. 容量制約

ユーザーの予算は64 KiB = 65536 bytes。これはVFMのJSONファイル容量ではなく、OpenTypeカーニングの構造・16bitオフセット制約を意識した予算として扱う。フォント全体やGPOS全体に一律64KiB上限があると説明しない。

現行の容量表示：単一PairPos Format 2、横組み、xAdvanceのみ、class0込みの密なクラス行列＋Coverage/ClassDef等の概算。生成後は個別例外の概算を加算する。実際のサブテーブル分割・レイアウト・FontLabの最適化は未検証。

重要：微小値を0にしても密なFormat 2行列のセル容量は減らない。非ゼロペアが減ったことだけで容量削減を保証しない。グループ削減、疎な表現、分割、例外数を考慮する。

望ましい操作順：対象選択 → グループ作成 → グループ数・候補ペア数・概算容量 → カーニング生成 → 例外込み容量・補正前後を確認 → 条件調整。

## 9. 検証済みサンプルと数値

Google FontsのNoto Sans JPを開発時にwght=400で静的化・文字限定し、内部名をKG Japanese Testに変更したTTFを同梱。SIL OFLライセンスも同梱する。配布元：https://github.com/google/fonts/tree/main/ofl/notosansjp

かな・約物174文字、30276グリフペア、他設定は初期値：

|統合強度|先頭グループ|後ろグループ|個別例外|例外込みモデル概算bytes|
|---|---:|---:|---:|---:|
|0|174|172|0|63142|
|40|162|147|201|52354|
|70|134|123|3807|52310|
|100|87|83|11432|64120|

最大強度はグループをほぼ半減できる一方、例外が11432件に増える。40は例外201件で、概算約51.1KiB。視覚品質や実OTF容量の保証ではない。

モデル誤差の減少を知覚品質の改善と同一視しない。かな・約物は現状同じotherカテゴリを使う。括弧・句読点・小書き文字・長音の目視校正が必要。

## 10. 今後の改善候補

- 単なる輪郭類似度に加え、複数の相手グリフに対する推奨カーニング値の並びを比較し、同じ調整を共有できる文字をまとめる。
- グループ数だけでなく、例外込みバイト数と光学誤差を評価して統合候補を選ぶ。
- 統合前後の例外増加を予測し、容量が悪化する統合を避ける。
- 和欧混植の基準分離・追加余白。
- 実VFMに基づく互換入出力。
- 実際のFontLab出力によるGPOS・Extension非使用検証。

これらは提案・未実装。v0.4では輪郭平滑化と閾値拡張、v0.5では手順タブ＋表＋校正プレビューの画面構成とGUI整理（下記）まで実装している。

## 10.5 v0.5で実装したGUI（実装済み）

- 画面配置（ユーザー指定）：PC版は上部＝校正のプレビュー（sticky）、左＝手順タブ「1 対象グリフ／2 グループ作成（実行・判定条件）／3 グループ調整（選択中のグループ・一覧）／4 カーニング生成／5 カーニング調整（選択中のペア＋要確認一覧）／6 保存（容量予算・書き出し・モデル説明）」（段階見出し：グリフ／グループ／カーニング／書き出し）。前段未完了のタブは無効（aria-disabled、class locked、pane.locked で中身を隠し locknote に理由・やること・移動ボタン）。条件は app.js の lockReason（各タブに状態表示）、右＝グループ／グリフの表（sticky）。折りたたみ（details）は使わない。表の見出し選択で3へ、セル選択・一覧の行クリックで5へ切替。「かな・約物テスト」ボタンは削除（japanesePreset はテスト用に残す）。右の表の上に要約（グループ数・容量バー、.table-col .summary。高さは --sumh で表の高さから差し引く）。狭い画面は縦積み。対象グリフの個別選択・グリフ名検索は削除（旧JSONの個別指定は内部で保持して復元）。
- ペアの表（src/grid.js）：「グループ単位」（クラス共通値）と「グリフ単位」（ペア最終値、例外は黄色枠、グループ境界は太線）を切り替え。字形／ヒートマップ、セル14〜96px、並び替え、文字での絞り込み、生成値の適用切替、ツールチップ、矢印キー。仮想化キャンバス。
- 選択の詳細（タブ内）：セル選択＝クラス内全ペア（最大24×24、クリックでペア選択）＋カーニング調整（クラス値・個別値・前後比較）。見出し選択＝グループの重ね表示・メンバー・指標・分離・固定、統合対象は checkedGroups のみ（active は含めない。Ctrl/⌘/Shift の見出し選択はチェックのトグルで、初回のみ active もチェック）。統合後チェックは解除。「グループを作成」は判定条件の下、中止ボタンは削除（内部の cancel は自動再分類用に残す）。タブ側の選択変更は表に追従。
- 対象グリフ＝チェック ∪ 追加文字 ∪ 個別追加 − 個別除外。0.3秒で反映し自動再分類。作業JSONに selection を保存。
- 領域ごとの組み合わせ（ユーザー指定、和欧チェックを置換）：領域＝グリフが当てはまるチェック済みUnicode規則の最初のもの。app.js pairPlan() が region・deny（'先頭>後ろ'）・separation（各グリフの相手シグネチャ）を作り、result.params.pairs / separation として分類・生成に渡す。cluster は separation が異なるグリフを統合しない（スコア無限大）、generateKerning は pairFilter で deny を評価しない。既定は unicode-rules.js defaultAllowed（同じ group 同士）。作業JSONは regionAllow（既定からの変更）。旧 mixScripts は互換で残す（false=既定、true/なし=全組み合わせ）。グループ内の個別例外の自動作成もオフ（生成バーのチェック、kernDefaults.exceptions。オフ時はresolveKerningでクラス値をメンバーの接触下限の最大値まで引き上げ、raisedClassesを返す。光学例外・評価不能例外を作らない。手動ペア・数字保護・手動クラス値による接触は例外として残る）。比較表はREADMEとsamples/grouping-comparison.json（defaultNoAutoExceptions）。
- 全ペア0のグループ（最終値基準）は resolveKerning が zeroGroups として返し、estimate(glyphs,groups,zero) でCoverage・ClassDef・行列から除外して概算。表は行・列ごと無効表示（grid.js offReason：和欧0固定＝cross、全ペア0＝zero）、見出しは「除外」、VFM は0のペアを書かない（旧カーニングJSONの excludedGroups は廃止）。0でない例外が残るグループは除外しない。サンプルでは発生0件。
- 表の「値のヒートマップ」切替は廃止し、色分けも「カーニングの表示のみ」で消える（ユーザー指定）。28px未満のセルは字形なしの色だけ。画面から「units」表記を削除し、各スライダーに項目の説明を表示（ユーザー指定）。値は1000 UPM換算と生成の設定欄に一度だけ明記。
- 表示の切替（ユーザー指定）：プレビュー（data-konly）と表（data-gonly）に「カーニングの表示のみ」。オンで補正前の輪郭・ずれのバー・数値を消す。生成値の適用そのものは切り替えない。
- 補正前後の重ね表示：プレビュー・選択ペア（kerning-ui drawSequence）と表のセル・クラス内全ペア（grid drawGlyphs overlay）。輪郭＝補正前、塗り＝補正後、バー＝ずれ。セルの拡大率・位置は補正前の並びで固定。プレビューは直前ペアのみ戻した位置と比較し、行長の変化を表示（ぼかし・累積比較はユーザー指定で削除）。
- グループの輪郭重ね表示（app.js draw）：右輪郭グループは送り幅の右端、左輪郭グループは原点で揃える。キャンバスは表示サイズで描画。
- 表の絞り込み（grid.js prepare、ユーザー指定）：入力にスペースを含めば OR（行か列のどちらかが一致する組を表示）、スペースなしは AND（一致した行×一致した列だけ）。1文字だけなら OR。OR の詳細：一致した行・列を先頭へ並べ替え、両方不一致のセルは空白（クリック・ツールチップ無効）。
- 上限に張り付く組：既定は上限値のまま動かす（ユーザー指定）。オプション zeroSaturated（「上限に張り付く組は0にする」）で、全ペアが limited のクラスを0にでき、0になったグループは zeroGroups として除外。旧JSONはオフ。
- 対象グリフの規則化：かな・約物テストは hira＋kata＋jpunct のプリセット（同梱サンプルで174字ちょうど）。test-core.mjs に規則判定のテスト。
- 機能整理（v0.5末）：対象の個別選択の内部処理を削除し、旧JSONの個別指定は復元時に範囲＋追加文字へ変換（文字コードのないグリフは除外しグループ再作成）。要確認一覧の行クリックで「3 カーニング」へ。タブは←→/Home/Endで移動。表の切替は「表に生成値を適用」。旧inspector・views等の残りコードとCSSを削除。テスト既定フォントは同梱サンプル。
- スライダーの数値欄は自由入力（スライダー範囲外も可）。受付範囲は app.js labels の第7・8要素と kerning.js KERN_LIMITS（意味・計算量による上限、超過時は上限に合わせ理由表示）。統合の強さは最大200（core.js MAX_STRENGTH）。
- 生成の整合：readiness()（未作成・要再作成・320超・基準なし）で生成ボタンを無効化し理由を表示。基準ペアの即時検証と代用校正の明示。対象に数字がなければ数字保護を無効化。グループ選択は文字表示。
- サンプルフォントをかな・約物174字＋ASCIIで作り直し（かなの輪郭・送り幅はv0.4と同一）。
- 校正プレビューの直接入力（ユーザー指定）：見えない textarea[data-ktext]（.pv-input、カーソル位置へ移動して IME 候補の位置を合わせる）が入力を受け、drawPreview が全行を描いてキャレット・選択範囲を描画。クリック・ドラッグ・Shift+クリックで caretAt により位置決め。複数行（\n）は行ごとに描画・行の長さ表示。
- 校正プレビューの拡大縮小（kerning-ui：zoom='fit'|倍率、ZOOMS 0.5〜8、100%＝高さ130pxに収まる字の大きさ、.pv-scroll で横・縦スクロール、Ctrl/⌘＋ホイールはカーソル位置基準）。
- GUI 刷新（ユーザー指示「アプリ全体をモダンに」）：app.js CSS 末尾の theme layer（:host の CSS 変数 --bg/--surface/--raised/--line/--text/--muted/--faint/--accent）。旧配色の16進は3ファイル（app/kerning-ui/grid）で一括置換済み。設定の真偽値はスイッチ（input[type=checkbox]:is([data-kauto],…)）、一覧はチェックボックス。
- グループ調整タブ：右輪郭／左輪郭の切り替え（.sidetabs）をタブ上部に配置（ユーザー指定）。
- 字詰め・約物（kern のみ、ユーザー決定：palt/chws は使えない前提、ツメ組み、漢字は詰めない、最小表示 18px@FHD、色タグの境は考慮しない）：src/jlreq.js（jaClass/glyphJaClass/punctKeep）。kerning.js の設定 tsume・tsumeAmount・tsumeHira/Kata/Small・punct('off'|'tsume'|'beta')・keepPeriod/keepComma/keepBracket/keepMiddle（ツメ組みの残す空き。旧 bracketQuarter=true は keepBracket=250 に読み替え）。applyPunctKeeps(raw,settings) で約物の組だけ再計算（残す空きのスライダー）。見比べ UI はユーザー指示で削除。pair.parts={tsume,punct,optical}、約物を含む組は rule:'punct'（光学補正なし、resolve で許容差超なら reason 'punct-rule' の例外）。app.js pairPlan の separation に約物の種類を付加。test-tsume.mjs。
- mount(element, {save}) で保存処理を差し替え可能。
- 計算処理は不変（mixScripts=false時のみ和欧ペアを省略）。v0.4の検証数値（強度40で162/147グループ、例外201、52354 bytes）を再現済み。
- 会話内デモは make-artifact-demo.mjs で生成する単一HTML。

GUIで未対応：表からの直接値編集（値は「5 カーニング調整」タブで入力）、表の画像書き出し、和欧間の追加余白。

## 11. 実装構成・作業手順

- kerning-grouper.js：利用時のメインJS。依存・Workerソース込み。
- confluence-macro.html：HTMLマクロ本文。MAIN_JS_URLを社内配信URLへ変更する。
- standalone.html：ローカル確認ページ。同梱JSと同じ階層に置く。サンプルTTFは手動読込。
- src/app.js：読み込み、対象選択、グループUI、作業保存復元。
- src/core.js：曲線平坦化、輪郭プロファイル、統合強度、比較、分類、容量概算。
- src/engine.js、src/worker.js：分類処理。
- src/kerning.js、src/kern-worker.js：機械・光学カーニング生成。
- src/kerning-ui.js：設定、生成、プレビュー、手動編集、JSON/CSV保存。
- src/japanese.js：漢字を含まないサンプル文字・基準ペア。
- src/grid.js：ペアの表（グループ単位・グリフ単位、v0.5）。
- make-artifact-demo.mjs：Claudeアーティファクト用デモHTMLの生成（開発用）。
- samples/：静的テストフォント、OFL、数値検証結果。

開発時：npm ci → npm run build。
検証：npm test、npm run test:japanese、npm run test:grouping。
UI検証：test-ui.mjs / test-kerning-ui.mjs。Playwrightと実行可能なChromium（CHROMIUM_PATH）が必要。フォントは既定で同梱サンプルを使う。

既存検証には分類、ペアの表（グループ・グリフ単位、セル選択、見出しからのグループ選択、絞り込み、キー操作）、対象グリフの和集合、和欧の0固定（test-mixscript.mjs）、完全連結条件、数値有限性、元輪郭の保護下限、0値例外、手動調整、キャンセル、作業復元、Workerなし、狭い画面、統合強度操作を含む。すべてのブラウザやConfluence実機で検証済みとしない。

## 12. 完了条件・引き継ぎ姿勢

- ユーザーが指定した機能を実装し、ビルド済みJSも更新する。
- 「実装済み」「提案」「互換性未検証」を明確に区別する。
- 漢字除外の和文サンプルを維持する。
- 光学品質と容量のトレードオフを隠さない。
- 実施した検証、重要な制限、利用方法を簡潔に説明する。
- ソース・メインJS・HTMLマクロ・サンプル・ライセンス・引き継ぎ文書をZIPにまとめる。node_modulesや一時スクリーンショットは含めない。


## 学習ツール（kg-trainer）

隣の `kg-trainer/` は、プロのフォント（複数可）のカーニングから設定と補正モデルを学習する Python ツールです（`python -m kg_trainer` でブラウザ画面）。計算は `src/core.js` / `src/kerning.js` と完全一致させており、`kg-trainer/tests/test_parity.py` で確認します。JS 側の計算を変えたら、Python 側も同じ変更を入れて CORE_VERSION / FEATURE_VERSION を上げてください。詳しくは `kg-trainer/README-ja.md`。


## v0.5.2 学習した値の補正（実装済み）

- kerning.js：`learned`（既定 true）。generateKerning の通常ペアで、kind が UU/UL/LU/LL・数字保護でない・光学評価あり・ユーザー設定での ideal の絶対値が10以上のとき、`valueFeatures` → `predictValue(src/kern-model.js)` → ユーザーの上限でクランプ → `max(safe)` → 丸め、を ideal にする。pair に `learned:true` と `toolValue`（元の計算値）を付ける。
- 特徴量は kg-trainer/kg_trainer/valuemodel.py と1対1（VALUE_FEATURE_VERSION 2）。基準設定（光学60・上限100・範囲あり、targets[kind].bandBase）で計算し、各値は 1/1024 に丸める（Python と JS の加算順の差 1e-14 が木の分岐を変えないように）。
- generateKerning の引数 `metrics`（{cap, xh}）は kerning-ui が font 全体の H・x を flatten して渡す（fontMetrics）。なければ items 内の H・x、それもなければ 700/500。
- 一致の確認：kg-trainer/tests/test_parity.py（同梱フォント、`KG_PARITY_FONT` で実フォントも）。Lato・Inter・M PLUS 1p・Open Sans で一致を確認済み。
- 旧作業JSONは learned=false で復元。


## v0.5.4 VFM の読み込み（実装済み）

- src/vfm.js：`readVfm(ref, master, font)` → pairs（Map "a:b"→1000UPM）、groups（right=前・left=後ろ）、source（classes／inferred）、ids、unmapped。`nameIndex` は FontLab 名→gid（なければ VFM の width＋bbox）。クラス定義は未確認形式のため複数の形を受ける（"@名前" 参照があるときは @ 付きだけをクラスとみなす）。定義がなければ、非ゼロの値の並び（行・列）が同じグリフを同じグループに推定。
- core.js cluster：`params.absorbFixed` で、固定グループどうしは合わず、未固定の字を complete link（全構成員と閾値内）で取り込める。
- app.js：vfm 状態、vfmGroupMode（singles／all／keep）→ runFixed()（ユーザーの固定を優先）、vfmUnchanged()（VFM の構成員がちょうど1つの VFM グループに一致するグループ＝引き継ぎ、ほかの構成員は VFM に無い字）。kerningUI の context に vfm（pairs, unchanged, members, ref, master, file）。
- kerning.js resolveKerning の第5引数 kept={classes,pairs}：閾値・接触回避なしでそのまま採用（reason 'vfm'）。manual が優先。
- kerning-ui.js：vfmKern（changed／all）、keptValues()、書き出しは読み込んだ VFM を参照にして同じファイル名で保存、targets 以外を含む元のペアは保持（buildVfm の targets）。
- テスト：test-vfm.mjs（読み込み・推定・クラス・kept・absorb）、test-kerning-ui.mjs（書き出した VFM を読み込み→引き継ぎ→書き換え保存）。
- 作業JSON には VFM の状態を保存しない（復元後は VFM を読み込み直す）。


## v0.5.5 お作法でまとめるグループ作成（実装済み）

- src/conventions.js：baseOf（NFD＋左右別の表 SIDE）、protrudes（horn／caron ď ľ ť Ľ／dakuten、いずれも right 側）、CLASSIC（欧文の定番の組）、conventionKey、conventionGroups(items, side, params, {taken, sep})。輪郭の確認は、派生した字＝元の字にインクがある行だけで比較（かなは差 100 超の行を15%まで除外し、許容×6）、許容×2。元の字どうし＝リードと許容×6。外れた字は removed（reason: shape／horn／caron／dakuten）。
- engine.js：params.convention のとき、各側で conventionGroups を作り、ユーザー／VFM の固定グループの後ろに「取り込み可の固定グループ」として cluster に渡す。結果に convention（groups, removed）。
- core.js cluster：fixedAbsorb（固定グループごとの取り込み可否）。取り込み可の固定グループは、未固定の字を complete link で取り込めるが、固定グループどうしは合わない。params.absorbFixed===true は全固定グループ（VFM の singles モード）。
- app.js：useConvention（既定 true）、run() の usedParams.convention、convStat（2 作成）、グループ一覧の「お作法」バッジ、詳細の警告の扱い、作業 JSON の convention（旧ファイルは false）。グリフ名は vfm.js の glyphNamer（FontLab の名前）。
- 評価スクリプト：eval/study_groups.py（方式の比較）、eval/eval_conv.py（エンジンで on/off）、eval/eval_kana.py、eval/conv2.py、eval/why_big.py。正解はプロのカーニングで行・列の値が同じ字。
- 未対応：Python（kg-trainer）のグループ評価は形のみ。
