# サバイバルの討伐プレイ

通常入力によるサバイバルで、所持品ゼロから道具・鉄の精錬・自然のダイヤ採掘、村の探索・農業・取引、ネザーの敵との戦闘とロッドの回収、エンダーアイの作成、地下遺跡、6個のクリスタルの破壊、エンダードラゴン討伐と帰還まで進める操作スクリプトです。

[対応バージョンのリリース（v0.2.0-beta.1）](https://github.com/temesotejam/2026_10_24_2/releases/tag/v0.2.0-beta.1)

動画と `recording.json` は実行環境の出力ディレクトリに保存します。完成動画はこの作業のチャットで提供し、動画本体やブラウザプロファイルはGitへ追加しません。

## 録画条件

- `scripts/dragon-playthrough.mjs` を新規ブラウザプロファイルで開始し、所持品36枠がすべて空であることを確認してから録画する。
- キーボード・マウス・ゲーム内UIで操作する。地形・敵・所持品の読み取りで経路を計画する。人間の手操作を撮影した動画ではない。
- 検証用バックアップ、アイテム注入、テレポート、時刻変更、敵HPの直接変更は使わない。
- 操作の調整に伴う通常保存からの再開がある場合も、同じワールド・所持品を引き継ぎ、全録画パートを時系列でつなぐ。ゲームを閉じている間の作業待ちは含めない。
- 1280×720、描画倍率0.5、元動画15fps。実際のブラウザ画面をH.264で記録し、全工程を約1.5倍速で書き出す。音声は含まない。
- `recording.json` に初期所持品・各パートのコードのコミットとゲームのアセット名・進行時刻・最終HP・ドラゴン討伐状態・卵の数・出力尺を記録する。
- 書き出し後に全編のデコードと、出力尺が元動画の約2/3であることを検査する。

## 再現方法

```bash
npm ci
npm run build:pages
npm run preview -- --host 127.0.0.1 --port 4173 --base /2026_10_24_2/
# 別のターミナルで実行（ChromiumとFFmpegが必要）
node scripts/dragon-playthrough.mjs --out visual-check/dragon-playthrough/new-run
node scripts/render-playthrough.mjs visual-check/dragon-playthrough/new-run
```

再開は同じ出力ディレクトリで `--resume <recording.jsonのnextPhase>` を指定する。新規録画では既存プロファイルを受け付けない。録画ファイルやブラウザプロファイルはGitへコミットしない。

## 戦闘の実装と検証

[ボットの参考資料](BOT-REFERENCES.md) に、Mineflayer・mineflayer-pvp・pathfinder・Baritoneの参照元と、この独自ゲームへの適用方法を記録しています。近接・遠距離の脅威に応じて作業を中断し、入力を解放し、戦闘後に元の移動・クラフトへ戻ります。

`combat-check.mjs` と `adventure-check.mjs` は明示した検証用データを使う機能試験です。配布する所持品ゼロからの動画とは区別します。
