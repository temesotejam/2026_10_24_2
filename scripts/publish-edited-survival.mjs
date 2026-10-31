/** Publish only a verified edited recording of a genuinely completed new run. */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { playlistPage } from "./lib/video-playlist-page.mjs";

const source = path.resolve(process.argv[2]);
const collectionAt = process.argv.indexOf("--collection");
const collection = collectionAt >= 0 ? process.argv[collectionAt + 1] : "edited-survival";
assert.match(collection, /^[a-z][a-z0-9-]{0,50}$/);
const watchStem = collection === "edited-survival" ? "edited" : collection;
const previewFile =
  collection === "edited-survival" ? "survival-edited-finale.mp4" : `${collection}-finale.mp4`;
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
const destination = path.join(repository, "downloads", collection);
const watch = path.join(repository, "public/watch");
mkdirSync(destination, { recursive: true });
mkdirSync(watch, { recursive: true });
const base = `https://github.com/temesotejam/2026_10_24_2/raw/refs/heads/main/downloads/${collection}/`;
const length = (seconds) => {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}分${String(rounded % 60).padStart(2, "0")}秒`;
};
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
const title = proof.plan.title ?? "再挑戦のサバイバル：短く編集した字幕実況";
const notes =
  proof.plan.notes ??
  (collection === "edited-survival"
    ? [
        "討伐後に帰還ゲートの不具合が見つかったため、ゲームを修正して同じ通常セーブから帰還を再試行しました。卵・所持品・体力を引き継いで、設定済みのベッド地点へ生還しています。最終章の字幕でも説明しています。",
      ]
    : []);
assert.ok(notes.every((note) => typeof note === "string"));
const previewPath = path.join(source, "preview.gif");
if (collection !== "edited-survival")
  assert.ok(existsSync(previewPath), "provide a looping GitHub preview");
let previewMarkdown = "";
if (existsSync(previewPath)) {
  const gif = readFileSync(previewPath);
  assert.match(gif.subarray(0, 6).toString(), /^GIF8[79]a$/);
  assert.ok(gif.includes(Buffer.from("NETSCAPE2.0")), "GIF must include its looping extension");
  assert.ok(gif.length < 20 * 1024 * 1024, "keep the inline preview small");
  copyFileSync(previewPath, path.join(destination, "preview.gif"));
  proof.preview = {
    file: "preview.gif",
    bytes: gif.length,
    sha256: createHash("sha256").update(gif).digest("hex"),
    loop: true,
  };
  previewMarkdown = `[![本編からの短いループプレビュー](./preview.gif)](https://temesotejam.github.io/2026_10_24_2/watch/${watchStem}.html)\n\n上のGIFは本編の抜粋を自動ループします。画像を押すと、ダウンロードせずに本編を連続・ループ再生できます。\n\n`;
}
const viewingInstructions =
  "**日本語字幕・三人称・720p。** 本編ページでは全章を自動で連続再生できます。保存する場合は番号順にご覧ください。字幕は焼き込み済みなので、MP4だけでも再生できます。";
const eventNote =
  proof.sourceDeathCount > 0
    ? `途中の死亡${proof.sourceDeathCount}回と装備の回収も含め、`
    : "採掘・製作・探索・戦闘をつなぎ、";
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
  `# ${title}\n\n${previewMarkdown}${date}（日本時間）に開始した新規セーブ（シード2026）で、所持品ゼロからドラゴン討伐・卵の入手・通常世界への帰還まで進めたプレイです。${eventNote}流れが分かるよう合計${length(totalDuration)}に編集しました。\n\n${viewingInstructions}採掘・移動・待ち時間にはカットと早送りを使い、主要な戦闘は等速を中心に残しています。\n\n| 順番 | 章 | 時間 | 容量 | ダウンロード |\n| --- | --- | --- | --- | --- |\n${rows}\n\n合計約${Math.ceil(totalBytes / 1e6)}MB。CRF18・ビットレート上限なしで出力し、容量に応じて章を分けています。\n\n[ダウンロードせず再生する](https://temesotejam.github.io/2026_10_24_2/watch/${watchStem}.html) / [編集箇所・クリア結果・各ファイルのSHA-256](./edit-proof.json)\n\n操作スクリプトが、観測用の地図と通常のキー・マウス操作を使ってプレイしています。エンダーアイによる方向確認の後、地図で遺跡までの経路を選んでいます。録画時の描画倍率は100％です。音声はなく、実況は字幕です。\n\n${notes.join("\n\n")}\n`,
);
writeFileSync(path.join(destination, "edit-proof.json"), JSON.stringify(proof, null, 2) + "\n");
writeFileSync(path.join(watch, `${watchStem}-proof.json`), JSON.stringify(proof, null, 2) + "\n");
const finale = proof.outputs.at(-1);
if (collection === "edited-survival")
  copyFileSync(path.join(source, finale.file), path.join(watch, previewFile));
writeFileSync(
  path.join(watch, `${watchStem}.html`),
  playlistPage({
    title,
    outputs: proof.outputs,
    collection,
    totalLength: length(totalDuration),
    notes,
  }),
);
console.log(
  JSON.stringify({
    files: proof.outputs.length,
    duration: totalDuration,
    bytes: totalBytes,
    finaleDuration: finale.duration,
  }),
);
