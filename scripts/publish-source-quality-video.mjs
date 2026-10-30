/** Publish verified 720p downloads without putting the large full recording in Pages. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
const repository = path.resolve(import.meta.dirname, "..");
const source = path.resolve(
  process.argv[2] ?? "/workspace/artifacts/generation3-clear/quality-720p",
);
const proof = JSON.parse(readFileSync(path.join(source, "quality-full-proof.json"), "utf8"));
assert.equal(proof.completed, true);
assert.equal(proof.includesFullPlaythrough, true);
assert.equal(proof.fixtureImports, false);
assert.equal(proof.stateMutationAPI, false);
assert.equal(proof.settings.bitrateCap, false);
assert.equal(proof.settings.crf, 18);
assert.equal(proof.settings.width, 1280);
assert.equal(proof.settings.height, 720);
assert.ok(proof.final.dragon.defeated && proof.final.eggCount === 1 && proof.final.health > 0);
let previous = 0;
const destination = path.join(repository, "downloads/survival-generation3-720p");
mkdirSync(destination, { recursive: true });
for (const item of proof.downloads) {
  assert.ok(Math.abs(item.rawStart - previous) < 0.001);
  previous = item.rawEnd;
  assert.equal(item.fullDecodeVerified, true);
  assert.match(item.file, /^survival-generation3-720p-part-\d+\.mp4$/);
  const file = path.join(source, item.file);
  assert.equal(statSync(file).size, item.bytes);
  assert.ok(item.bytes < 95 * 1024 * 1024);
  assert.equal(createHash("sha256").update(readFileSync(file)).digest("hex"), item.sha256);
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:format=duration",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const measured = JSON.parse(result.stdout);
  assert.equal(measured.streams[0].width, 1280);
  assert.equal(measured.streams[0].height, 720);
  assert.ok(Math.abs(Number(measured.format.duration) - item.duration) < 0.1);
  copyFileSync(file, path.join(destination, item.file));
  copyFileSync(path.join(source, item.subtitleFile), path.join(destination, item.subtitleFile));
  item.url = `https://github.com/temesotejam/2026_10_24_2/raw/refs/heads/main/downloads/survival-generation3-720p/${item.file}`;
}
assert.ok(Math.abs(previous - proof.sourceRawDuration) < 0.001);
assert.ok(
  Math.abs(
    proof.downloads.reduce((sum, p) => sum + p.duration, 0) - proof.sourceRawDuration / 1.5,
  ) < 1,
);
const clock = (s) => {
  s = Math.round(s);
  return `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ""}${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const totalBytes = proof.downloads.reduce((sum, item) => sum + item.bytes, 0);
const rows = proof.downloads
  .map(
    (item, i) =>
      `<li><a href="${item.url}" download>第${i + 1}部をダウンロード</a>（${clock(item.rawStart / 1.5)}〜${clock(item.rawEnd / 1.5)}・約${Math.ceil(item.bytes / 1e6)}MB）</li>`,
  )
  .join("\n");
const markdownRows = proof.downloads
  .map(
    (item, i) =>
      `| ${i + 1} | ${clock(item.rawStart / 1.5)}〜${clock(item.rawEnd / 1.5)} | 約${Math.ceil(item.bytes / 1e6)}MB | [MP4をダウンロード](${item.url}) |`,
  )
  .join("\n");
const watch = path.join(repository, "public/watch");
writeFileSync(path.join(watch, "quality-full-proof.json"), JSON.stringify(proof, null, 2) + "\n");
writeFileSync(
  path.join(destination, "README.md"),
  `# サバイバル録画・720p画質優先版\n\n同じ全工程を${proof.downloads.length}本（合計約${(totalBytes / 1e9).toFixed(1)}GB）に分割しています。番号順に再生してください。各MP4は日本語字幕を焼き込んだ1.5倍速です。\n\n録画の720p解像度を保ち、CRF18・ビットレート上限なしで再出力しました。録画時のゲーム描画倍率は0.5です。\n\n[最終戦の720p MP4（約14MB）](https://github.com/temesotejam/2026_10_24_2/raw/refs/heads/main/public/watch/survival-generation3-battle-720p.mp4) / [再生ページ](https://temesotejam.github.io/2026_10_24_2/watch/quality.html)\n\n| 番号 | 全編での時刻 | サイズ | ダウンロード |\n| --- | --- | --- | --- |\n${markdownRows}\n`,
);
writeFileSync(
  path.join(watch, "quality.html"),
  `<!doctype html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>720p・画質優先のサバイバル録画</title><style>body{margin:0;background:#171b22;color:#eee;font:17px/1.7 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:24px}a{color:#9ed2ff}video{display:block;width:100%;height:auto;background:#000}li{margin:14px 0}button{padding:8px 16px;font:inherit}</style></head>
<body><main><h1>サバイバル録画：720p・画質優先版</h1>
<p>所持品ゼロからドラゴン討伐・卵取得・帰還までの同じ実プレイです。三人称・日本語字幕・1.5倍速。全工程は2時間23分49秒で、死亡10回と再挑戦も含みます。</p>
<p>元録画の1280×720を保ち、CRF18・ビットレート上限なしで再出力しました。録画時のゲーム描画倍率は0.5で、その時点で失われた細部は復元していません。遺跡へは観測済みの座標を使って移動しています。</p>
<h2>最終戦の抜粋（3分03秒）</h2><video id="recording" controls playsinline preload="metadata" data-expected-duration="183.066667"><source src="./survival-generation3-battle-720p.mp4" type="video/mp4"></video><p><button data-time="0">最初から再生</button> <a href="https://github.com/temesotejam/2026_10_24_2/raw/refs/heads/main/public/watch/survival-generation3-battle-720p.mp4" download>最終戦の720p MP4をダウンロード（約14MB）</a></p>
<h2>全工程のダウンロード（全${proof.downloads.length}本・合計約${(totalBytes / 1e9).toFixed(1)}GB）</h2><p>番号順に見ると全工程を視聴できます。画質を下げて容量に合わせる代わりに、各ファイルを分割しています。各リンクは通常のMP4です。</p><ol>${rows}</ol>
<p><a href="./quality-full-proof.json">ファイルごとの尺・設定・SHA-256</a> / <a href="./index.html">以前の圧縮版と旧仕様の記録</a></p></main><script>document.querySelector('[data-time="0"]').addEventListener('click',async()=>{const v=document.querySelector('video');v.currentTime=0;await v.play();});</script></body></html>`,
);
const oldFile = path.join(watch, "index.html");
let html = readFileSync(oldFile, "utf8");
html = html
  .replace(/高画質/g, "圧縮版")
  .replace("各動画の画質を上げています。", "容量を抑えた以前の書き出しです。");
const banner =
  '<section id="source-quality"><h2>画質を見直した720p版</h2><p>ビットレート上限を外して作り直しました。<a href="./quality.html">720p版の再生・全工程MP4のダウンロード一覧</a></p><p>以下のプレビューと3分割版は、以前の圧縮版です。</p></section>';
if (!html.includes('id="source-quality"'))
  html = html.replace(/(<h1>[\s\S]*?<\/h1>)/, "$1" + banner);
writeFileSync(oldFile, html);
console.log(
  JSON.stringify({
    count: proof.downloads.length,
    duration: proof.downloads.reduce((s, p) => s + p.duration, 0),
    bytes: proof.downloads.reduce((s, p) => s + p.bytes, 0),
    page: "public/watch/quality.html",
  }),
);
