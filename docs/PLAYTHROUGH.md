# サバイバルの討伐プレイ

## 生成方式3での実際のクリア（2026年10月30日）

所持品ゼロから始めた同じサバイバルワールドで、エンダードラゴン討伐・卵の入手・通常世界への生還を完了しました。最終HP17、ドラゴンHP0、卵1個です。

- [全工程のMP4を1本でダウンロード（軽量版）](https://github.com/temesotejam/2026_10_24_2/raw/refs/heads/main/public/watch/survival-generation3.mp4)：日本語字幕・背後視点・約1.5倍速、2時間23分49秒。
- [720p・画質優先版の全工程をダウンロード](https://github.com/temesotejam/2026_10_24_2/blob/main/downloads/survival-generation3-720p/README.md)：同じ全工程を番号順のMP4に分割しています。
- [最終戦の720p MP4](https://github.com/temesotejam/2026_10_24_2/raw/refs/heads/main/public/watch/survival-generation3-battle-720p.mp4)：3分3秒・約14MB。
- [以前の圧縮版・最終戦MP4をダウンロード](https://github.com/temesotejam/2026_10_24_2/raw/refs/heads/main/public/watch/survival-generation3-final-battle.mp4)：エンド進入前から帰還までの連続した3分3秒・約4.7MB。
- [全工程の検証記録](../public/watch/generation3-proof.json) / [全工程の字幕SRT](../public/watch/survival-generation3.srt) / [戦闘抜粋の検証記録](../public/watch/generation3-final-battle-proof.json)。

### 画質の修正（2026年10月31日）

最初の全編は約73kbps、3分割版も上限約262kbpsと圧縮しすぎていました。新しい版は元録画の1280×720を保ち、CRF18・ビットレート上限なし・ノイズ除去なしで再出力しています。容量を超える区間は画質を下げずに分割します。ゲームの描画倍率は録画時点で0.5だったため、その時点で失われた細部は復元できません。再撮影やゲーム進行の変更は行っていません。

各ファイルの尺・SHA-256・実際の出力設定は [画質優先版の検証記録](../public/watch/quality-full-proof.json) に記録しています。大きい全工程MP4はPages配信フォルダーの外に保存し、GitHubのraw URLからダウンロードできます。

### 実際に行った進行

自然の木・石・鉱石から道具を作り、鉄の精錬とダイヤ採掘を行いました。砂利から火打石を取り、自然の黒曜石10個をダイヤのツルハシで採掘し、自分でネザーゲートを建築・点火しました。ネザーの敵からロッド14本を入手し、通常世界の敵から得たパールと合わせてエンダーアイ11個を作成。実際に空いていた11枠を全て埋めました。食料には農業・調理に加え、通常の釣りで得た魚も使っています。

**この録画では、以前に読み取りで観測した地図の遺跡座標を使いました。** エンダーアイを投げて方向を探す工程は行っていません（`navigation.method=previously-observed-readonly-map`、`directionThrowSkipped=true`、`eyeThrows=0`）。アイの方向案内機能を実装したことと、今回の実プレイで使ったことは区別します。

エンドでは6個のクリスタルを破壊し、200HPのドラゴンを倒しました。エンド段階の矢は12→3本、鉄の剣は耐久251→217で34回命中。要塞へ向かう前の魚28匹は、移動と戦闘を経て8匹となり、食事と自然回復を使って生還しました。

### 録画と操作の条件

同一ブラウザプロファイルの137録画パートを時系列で連結しています。死亡10回と装備回収、操作を止めた点検画面も含め、録画済みの途中部分を省略していません。ブラウザを閉じて操作スクリプトを修正していた作業待ちは収録時間に含めません。

人の手操作を撮影した動画ではなく、自動操作の実プレイです。地形・位置・所持品・敵を読み取り、移動・採掘・製作・食事・戦闘は通常のキーボード、マウス、ゲーム内UIで行いました。本番には検証用セーブの読み込み、所持品注入、テレポート、敵HPや時刻の直接変更を使っていません。途中で操作スクリプトを直し、通常保存から再開しています。

全137パートでゲームの配信アセットは `index-BO-kpD8f.js` のままです。別ブラウザの支給品付き戦闘試験や機能試験は、この動画やクリア実績に含めていません。

元映像の合計は約3時間35分43秒。出力は約1.5倍速、H.264・30fps・日本語字幕焼き込み・音声なしです。録画中のカメラ観測6,421件は全て背後視点で、狭い場所では体を隠す既存の視界確保処理が働きます。

### 使用したスクリプト

`scripts/modern-dragon-playthrough.mjs` が通常保存・録画を管理し、`scripts/missions/` と `scripts/lib/` の操作スクリプトを通常保存から再開しました。字幕は記録された行動時刻と、時刻付きの読み取り観測に基づく補足14件から生成しています。調整を重ねた今回の実績であり、全てのSeedを一度で無人クリアした実績ではありません。

エンドへの進入から戦闘・帰還までを `phase-7.mjs` が担当します。エンド内での通常保存再開も `--resume 7 --until 8` を使います。`phase-8.mjs` はありません。原本とブラウザプロファイルは公開せず、配布用MP4と検証記録を公開します。

[操作ボットの参考資料](BOT-REFERENCES.md) / [サバイバル進行の修正](SURVIVAL-AUDIT.md) / [独立AIの複数回プレイ](QA-ITERATIONS.md)

## 旧仕様の動画アーカイブ

以下は進行見直し前の生成方式で撮影した動画です。完成に近いゲート・攻略用宝箱・少数のアイでの開通など、現在と異なる近道を含みます。方式3の実績には数えません。

- [距離を安定させた三人称・字幕版](https://github.com/temesotejam/2026_10_24_2/raw/refs/heads/main/public/watch/survival-steady-camera.mp4)：10分13秒・約19MB。
- [旧字幕版](https://github.com/temesotejam/2026_10_24_2/raw/refs/heads/main/public/watch/survival-narrated.mp4)：10分6秒・約17MB。
- [旧字幕なし版](https://github.com/temesotejam/2026_10_24_2/raw/refs/heads/main/public/watch/survival.mp4)：21分5秒。

旧動画は `scripts/dragon-playthrough.mjs` を使用しています。この旧ドライバーは方式3での起動を拒否します。[当時のリリース](https://github.com/temesotejam/2026_10_24_2/releases/tag/v0.2.0-beta.1) と [当時の字幕・検証記録](../public/watch/narrated-proof.json) は履歴として残しています。
