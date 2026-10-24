# Classic Voxel Survival

昔の Minecraft を参考にした軽量ブラウザゲーム。現在は **M0 の開発基盤 + M1 の操作改善（第1段階）**です。
地形探索・移動・ジャンプ・採掘・設置・Seed 別のブロック差分保存ができます。
クラフト、体力・空腹、モブ、IndexedDB 保存は未実装です。

## 開発

Node.js 24、npm を使用します。

```sh
npm ci
npm run dev -- --host 0.0.0.0
```

WASD：移動、マウス：視点、Space：ジャンプ、Ctrl：ダッシュ、Shift：しゃがみ、
左クリック：採掘、右クリック：設置、1〜9 / ホイール：ブロック選択、Esc：操作解除。
しゃがみ中は移動速度が下がり、地上では端からの落下を防ぎます。
ジャンプ中・空中・水中の落下防止は行いません。視点は下がりますが、衝突判定の高さは変わりません。
フォーカスを失うと操作を一時停止し、開始ボタンで再開できます。
URL の `?seed=12345` で地形の Seed を指定できます。
現在の保存対象はブロック変更のみで、同じブラウザ・オリジンの localStorage に保存します。
プレイヤー位置や所持品の保存、エクスポートにはまだ対応していません。

## 検証

```sh
npm run lint
npm run format
npm run test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
# 別ターミナルで実行。スクリーンショットは visual-check/ に出力
node scripts/visual-check.mjs
```

Puppeteer の Chromium が必要です。システム Chromium を使う場合は
`PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` を指定できます。
依存インストール時のブラウザダウンロードを省く場合は、システム Chromium がある環境でのみ
`PUPPETEER_SKIP_DOWNLOAD=true npm ci` を使用してください。

Pages のサブディレクトリ配信も検証できます。

```sh
npm run build:pages
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort --base /2026_10_24_2/
node scripts/visual-check.mjs --url http://127.0.0.1:4173/2026_10_24_2/
```

## GitHub Pages

`.github/workflows/ci.yml` は PR / main で静的検査・単体テスト・ビルド・ブラウザ検証を行います。
検査を通過した main のみ Pages にデプロイします。GitHub の Settings → Pages で
Source を **GitHub Actions** に設定してください。まだリモートへの push や公開はしていません。

## 設計と出典

- [開発計画書](docs/PLAN.md)
- [基盤評価・次の実装](docs/BASELINE.md)
- [M1 操作改善と検証](docs/M1-CONTROLS.md)
- [上流の説明](docs/UPSTREAM.md)

基盤は [Vincent-P-essy/minecraft-clone](https://github.com/Vincent-P-essy/minecraft-clone)、
MIT License。取得時コミットは `6766703c14f7a443d94983600528614cc931df89`。
元の著作権表示と [LICENSE](LICENSE) を保持しています。
テクスチャは基盤コードが手続き生成します。Minecraft 公式の素材は同梱していません。
このゲームは Mojang / Microsoft の公式製品ではありません。
