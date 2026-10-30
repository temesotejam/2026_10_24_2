/** Publish only a verified edited recording of a genuinely completed new run. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const source = path.resolve(process.argv[2]);
const proof = JSON.parse(readFileSync(path.join(source, "edit-proof.json"), "utf8"));
assert.equal(proof.sourceCompleted, true);
assert.equal(proof.sourceInitialInventoryEmpty, true);
assert.equal(proof.sourceFinal.dragon.defeated, true);
assert.equal(proof.sourceFinal.eggCount, 1);
assert.equal(proof.sourceFinal.dimension, "overworld");
assert.equal(proof.settings.crf, 18);
assert.equal(proof.settings.bitrateCap, null);
assert.ok(proof.outputs.length > 0);
const repository = process.cwd();
const destination = path.join(repository, "downloads/edited-survival");
const watch = path.join(repository, "public/watch");
mkdirSync(destination, { recursive: true });
mkdirSync(watch, { recursive: true });
const base =
  "https://github.com/temesotejam/2026_10_24_2/raw/refs/heads/main/downloads/edited-survival/";
const escapeHtml = (value) =>
  String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const length = (seconds) =>
  `${Math.floor(seconds / 60)}分${String(Math.round(seconds % 60)).padStart(2, "0")}秒`;
for (const item of proof.outputs) {
  assert.match(item.file, /^survival-edited-\d+\.mp4$/);
  assert.equal(item.fullDecodeVerified, true);
  const file = path.join(source, item.file);
  assert.equal(statSync(file).size, item.bytes);
  assert.ok(
    item.bytes <= 90 * 1024 * 1024,
    "split the edit at a chapter boundary; preserve CRF18 quality",
  );
  assert.equal(createHash("sha256").update(readFileSync(file)).digest("hex"), item.sha256);
  copyFileSync(file, path.join(destination, item.file));
  copyFileSync(path.join(source, item.subtitleFile), path.join(destination, item.subtitleFile));
  item.url = base + item.file;
}
const totalDuration = proof.outputs.reduce((sum, item) => sum + item.duration, 0);
const totalBytes = proof.outputs.reduce((sum, item) => sum + item.bytes, 0);
const date = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
}).format(new Date(proof.sourceStartedAt));
const rows = proof.outputs
  .map(
    (item, i) =>
      `| ${i + 1} | ${item.title} | ${length(item.duration)} | 約${Math.ceil(item.bytes / 1e6)}MB | [MP4をダウンロード](${item.url}) |`,
  )
  .join("\n");
writeFileSync(
  path.join(destination, "README.md"),
  `# 再挑戦のサバイバル：短く編集した字幕実況\n\n${date}（日本時間）に開始した新規セーブ（シード2026）で、所持品ゼロからドラゴン討伐・卵の入手・通常世界への帰還まで進めたプレイです。途中の死亡${proof.sourceDeathCount}回と装備の回収も含め、流れが分かるよう合計${length(totalDuration)}に編集しました。\n\n**日本語字幕・三人称・720p。番号順に再生してください。** 字幕は焼き込み済みなので、MP4だけで再生できます。採掘・移動・待ち時間にはカットと早送りを使い、主要な戦闘は等速を中心に残しています。\n\n| 順番 | 章 | 時間 | 容量 | ダウンロード |\n| --- | --- | --- | --- | --- |\n${rows}\n\n合計約${Math.ceil(totalBytes / 1e6)}MB。CRF18・ビットレート上限なしで出力し、容量に応じて章を分けています。\n\n[最終章の再生ページ](https://temesotejam.github.io/2026_10_24_2/watch/edited.html) / [編集箇所・クリア結果・各ファイルのSHA-256](./edit-proof.json)\n\n操作スクリプトが、観測用の地図と通常のキー・マウス操作を使ってプレイしています。エンダーアイによる方向確認の後、地図で遺跡までの経路を選んでいます。録画時の描画倍率は100％です。音声はなく、実況は字幕です。\n\n討伐後に帰還ゲートの不具合が見つかったため、ゲームを修正して同じ通常セーブから帰還を再試行しました。卵・所持品・体力を引き継いで、設定済みのベッド地点へ生還しています。最終章の字幕でも説明しています。\n`,
);
writeFileSync(path.join(destination, "edit-proof.json"), JSON.stringify(proof, null, 2) + "\n");
writeFileSync(path.join(watch, "edited-proof.json"), JSON.stringify(proof, null, 2) + "\n");
const finale = proof.outputs.at(-1);
copyFileSync(path.join(source, finale.file), path.join(watch, "survival-edited-finale.mp4"));
const links = proof.outputs
  .map(
    (item, i) =>
      `<li><a href="${item.url}" download>${i + 1}. ${escapeHtml(item.title)}（${length(item.duration)}・約${Math.ceil(item.bytes / 1e6)}MB）をダウンロード</a></li>`,
  )
  .join("\n");
writeFileSync(
  path.join(watch, "edited.html"),
  `<!doctype html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>再挑戦のサバイバル・短く編集した字幕実況</title><style>body{margin:0;background:#171b22;color:#eee;font:17px/1.7 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:24px}a{color:#9ed2ff}video{display:block;width:100%;height:auto;background:#000}li{margin:16px 0}button{font:inherit;padding:8px 16px}</style></head>
<body><main><h1>再挑戦のサバイバル：短く編集した字幕実況</h1>
<p>新規セーブの所持品ゼロから、ドラゴン討伐・卵の入手・生還まで。日本語字幕と三人称視点で、合計${length(totalDuration)}に編集しました。採掘や待ち時間を短縮し、主要な戦闘と失敗からの立て直しを残しています。</p>
<h2>全${proof.outputs.length}章をダウンロード</h2><p>番号順に再生してください。字幕は動画に入っています。</p><ol>${links}</ol>
<p>実況は字幕です（音声なし）。討伐後の帰還ゲートの不具合を修正し、同じ通常セーブから帰還を再試行しています。</p>
<h2>最終章のプレビュー</h2><video controls playsinline preload="metadata"><source src="./survival-edited-finale.mp4" type="video/mp4"></video><p><button data-time="0">最終章を最初から再生</button></p>
<p><a href="https://github.com/temesotejam/2026_10_24_2/blob/main/downloads/edited-survival/README.md">ダウンロード一覧</a> / <a href="./edited-proof.json">編集とクリアの記録</a> / <a href="../?seed=20261029&amp;mode=survival&amp;view=third-person">ゲームを遊ぶ</a></p></main>
<script>document.querySelector('[data-time="0"]').addEventListener('click',async()=>{const video=document.querySelector('video');video.currentTime=0;await video.play();});</script></body></html>`,
);
console.log(
  JSON.stringify({
    files: proof.outputs.length,
    duration: totalDuration,
    bytes: totalBytes,
    finaleDuration: finale.duration,
  }),
);
