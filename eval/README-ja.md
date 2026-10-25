# プロのフォントとの比較（評価スクリプト）

Web 版のエンジンを OFL のフォントで動かし、フォントに入っている kern 値と比べるためのスクリプトです。
結果は kerning-grouper/VALIDATION.md の「v0.5.1 プロのフォントとの比較」にまとめています。

フォントは同梱していません。google/fonts リポジトリ（https://github.com/google/fonts）の ofl/ 以下を
`git clone --depth 1 --filter=blob:none --sparse` で取り、`git sparse-checkout set ofl/lato ...` で必要な書体だけ取り出してください。
fonts_latin.txt のパスは /tmp/gf/ofl/... を前提にしているので、置き場所に合わせて書き換えてください。
スクリプト内の /home/claude/kg/... も、引き継ぎパッケージを置いた場所に合わせてください。

- run_js.mjs：1書体を Web 版のエンジンで処理（グループ作成→カーニング生成→クラス値決定、1字1クラスの値も出力）
- run_variant.sh タグ 設定JSON：fonts_latin.txt の全書体を英字52字で処理（例：`./run_variant.sh new '{}'`）
- summarize.py v/タグ…：プロの値との比較表（全ペア・プロが詰めるペア・取りこぼし・プロが0のペアへの値）
- analyze_latin.py / final_latin.py：書体ごと・種類ごとの詳細、学習モデル・他のプロとの比較
- analyze_kana.py：かな（palt＋kern を正解にした比較）
- train_lofo.py / train_lofo2.py：kg-trainer でフォント1つ抜きの学習と、その予測値の保存
- survey.py：各フォントのカーニング数（欧文・かな）の一覧
- fonts_test.txt / test_unseen.py：学習に使っていない9書体で、値の補正あり・なしを比べる（`run_js.mjs` を `{}` と `{"kern":{"learned":false}}` で実行して t/on, t/off に置く）
- build_dataset.py / models_both.py / ablate.py：値の補正の方法比較と特徴量の絞り込み
