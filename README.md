# Kerning Grouper

FontLab 向けのカーニンググループとカーニングを作るツール一式です。

| フォルダ | 内容 |
|---|---|
| [kerning-grouper/](kerning-grouper/) | Web 版（Confluence に置ける1ファイルの JS、外部通信なし）。グループ作成・カーニング生成・調整・書き出し。v0.5.2 |
| [kg-trainer/](kg-trainer/) | 学習ツール（Python、ローカルのブラウザ画面）。プロのフォントのカーニングから設定と補正モデルを学習 |
| [eval/](eval/) | プロのフォント（OFL）との比較に使った評価スクリプト |

- 始め方：[kerning-grouper/START-HERE-ja.md](kerning-grouper/START-HERE-ja.md)
- 精度の評価：[kerning-grouper/VALIDATION.md](kerning-grouper/VALIDATION.md)
- 学習ツール：[kg-trainer/README-ja.md](kg-trainer/README-ja.md)

学習や評価に使うフォントは、ライセンス上許されたもの（OFL や自社フォントなど）だけにしてください。リポジトリにフォントは同梱サンプル（OFL の Noto Sans JP から作成）以外含みません。
