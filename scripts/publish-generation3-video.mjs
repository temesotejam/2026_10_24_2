/** Publish only a completed, fully rendered gen3 survival recording.
 *
 * Run AFTER render-narrated-playthrough.mjs has finished, never while recording:
 * node scripts/publish-generation3-video.mjs /workspace/artifacts/generation3-clear
 * Optional: --poster /absolute/verified-poster.jpg or --poster-at <output seconds>.
 * This script does not build dist or touch the recording profile/source media.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = path.resolve(import.meta.dirname, "..");
const rawDownload =
  "https://github.com/temesotejam/2026_10_24_2/raw/refs/heads/main/public/watch/survival-generation3.mp4";
const mediaName = "survival-generation3.mp4";
const posterName = "poster-generation3.jpg";
const subtitleName = "survival-generation3.srt";
const proofName = "generation3-proof.json";

export function validateActualClear(metadata) {
  assert.equal(metadata.completed, true, "finish the actual survival clear before publishing");
  assert.equal(
    metadata.generator,
    3,
    "publish the revised survival generation, not legacy footage",
  );
  assert.equal(metadata.mode, "survival");
  assert.equal(metadata.fixtureImports, false);
  assert.equal(metadata.stateMutationAPI, false);
  assert.equal(metadata.perspective, "third-person-behind");
  assert.ok(Number.isInteger(metadata.seed));
  assert.ok(Array.isArray(metadata.parts) && metadata.parts.length > 0);
  assert.ok(Array.isArray(metadata.parts[0].initial.inventory));
  assert.equal(metadata.parts[0].initial.inventory.length, 36);
  assert.ok(
    metadata.parts[0].initial.inventory.every((item) => item === null),
    "start with zero items",
  );
  let rawDuration = 0;
  metadata.parts.forEach((part, index) => {
    assert.equal(part.path, `part-${index + 1}.mp4`, "retain every chronological recording part");
    assert.equal(part.generator ?? metadata.generator, 3);
    assert.ok(
      Number.isFinite(part.duration) && part.duration > 0,
      "probe every raw part before publishing",
    );
    assert.ok(part.finishedAt, "finalize the recording before exporting");
    rawDuration += part.duration;
  });
  assert.equal(metadata.final?.dragon?.defeated, true);
  assert.equal(metadata.final.dragon.health, 0);
  assert.equal(metadata.final.eggCount, 1);
  assert.ok(metadata.final.health > 0, "return alive with the actual reward");
  assert.equal(metadata.final.dimension, "overworld");
  assert.ok(metadata.portal?.entry, "record the player-built portal");
  assert.ok(
    metadata.obsidianMission?.mining?.inventoryCount >= 10,
    "verify actual obsidian pickup",
  );
  assert.ok(Array.isArray(metadata.deaths), "keep the recorded deaths visible in the provenance");
  for (const death of metadata.deaths)
    assert.ok(
      metadata.parts.some((part) => part.path === death.part),
      "include each recorded death's part",
    );
  return rawDuration;
}

export function validateCompletedRecording(metadata) {
  const rawDuration = validateActualClear(metadata);
  assert.equal(metadata.export?.speed, 1.5);
  assert.equal(metadata.export.fullDecodeVerified, true);
  assert.equal(metadata.export.audio, false);
  assert.ok(metadata.export.captionCount >= 10);
  assert.match(metadata.export.captions, /Japanese.*burned/i);
  assert.equal(metadata.export.cameraVerification?.allSamplesThirdPerson, true);
  assert.ok(
    Math.abs(metadata.export.rawDuration - rawDuration) < 1,
    "include the complete raw timeline",
  );
  assert.ok(
    Math.abs(metadata.export.duration - rawDuration / 1.5) < 1,
    "speed up without removing parts",
  );
  assert.ok(metadata.export.duration > 0);
  return rawDuration;
}

const shortError = (error) =>
  String(error ?? "")
    .split("\n")[0]
    .slice(0, 240);
export function createCompactProof(metadata, download, parts) {
  return {
    schemaVersion: 1,
    generator: 3,
    seed: metadata.seed,
    mode: metadata.mode,
    completed: true,
    fixtureImports: false,
    stateMutationAPI: false,
    initialInventoryEmpty: true,
    perspective: metadata.perspective,
    allRecordedPartsIncluded: true,
    recordingPartCount: parts.length,
    ordinarySaveResumeCount: Math.max(0, parts.length - 1),
    deathCount: metadata.deaths.length,
    deaths: metadata.deaths.map((death) => ({
      part: death.part,
      position: death.position,
      recordedErrorOrCause: shortError(death.cause),
    })),
    parts,
    chapters: metadata.chapters,
    captionCorrections: metadata.captionCorrections,
    progression: {
      playerBuiltPortal: metadata.portal,
      naturallyMinedObsidianInventoryCount: metadata.obsidianMission.mining.inventoryCount,
      minedNaturalLavaCoordinates: metadata.obsidianMission.mining.mined,
      bedSet: metadata.bedSet === true,
    },
    final: metadata.final,
    export: { ...metadata.export, file: mediaName, subtitleFile: subtitleName },
    download,
  };
}

function lengthLabel(seconds) {
  const total = Math.round(seconds),
    hours = Math.floor(total / 3600),
    minutes = Math.floor(total / 60) % 60,
    remainder = total % 60;
  return `${hours ? `${hours}時間` : ""}${minutes}分${remainder}秒`;
}

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );

export function renderWatchPage(proof, style) {
  const length = lengthLabel(proof.export.duration),
    megabytes = Math.ceil(proof.download.bytes / 1e6);
  assert.match(style, /^<style>[\s\S]*<\/style>$/);
  const offsets = new Map();
  let offset = 0;
  for (const part of proof.parts) {
    offsets.set(part.path, { offset, duration: part.duration });
    offset += part.duration;
  }
  const chapters = (proof.chapters ?? []).flatMap((chapter) => {
    const part = offsets.get(chapter.part);
    if (
      !part ||
      !Number.isFinite(chapter.seconds) ||
      chapter.seconds < 0 ||
      chapter.seconds >= part.duration
    )
      return [];
    const time = (part.offset + chapter.seconds) / proof.export.speed;
    return [`<button type="button" data-time="${time}">${escapeHtml(chapter.name)}</button>`];
  });
  const chapterNavigation = chapters.length
    ? `<details><summary>場面を選んで再生</summary><nav aria-label="動画の章">${chapters.join("\n")}</nav></details>`
    : "";
  const additionalDownloads = proof.export.additionalDownloads ?? [];
  const higherQuality = additionalDownloads.length
    ? `<section><h2>高画質・分割版（全3本）</h2>
      <p>同じ全工程を時系列に3分割し、各動画の画質を上げています。順番に見ると全編を視聴できます。三人称・日本語字幕・1.5倍速です。</p>
      <nav aria-label="高画質の分割動画">${additionalDownloads.map((item, index) => `<a class="download" href="${escapeHtml(item.url)}" download="${escapeHtml(item.file)}">${index + 1}/3をダウンロード（${lengthLabel(item.duration)}・約${Math.ceil(item.bytes / 1e6)}MB）</a>`).join("\n")}</nav></section>`
    : "";
  const excerpt = proof.export.finalBattleExcerpt;
  const finalBattle = excerpt
    ? `<section><h2>最終戦の抜粋</h2><p>エンド進入直前から、ドラゴンとの戦い・卵の入手・通常世界への帰還までを抜き出した動画です。冒険の全工程は上の全編動画に収録しています。</p><a class="download" href="${escapeHtml(excerpt.url)}" download="${escapeHtml(excerpt.file)}">最終戦の抜粋をダウンロード（${lengthLabel(excerpt.duration)}・約${Math.ceil(excerpt.bytes / 1e6)}MB）</a></section>`
    : "";
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>修正後のサバイバル討伐動画 | Classic Voxel Survival</title>
    ${style}
  </head>
  <body>
    <main>
      <a href="../?seed=20261029&amp;mode=survival&amp;view=third-person">← 修正後の新しい冒険へ</a>
      <h1>修正後のサバイバル：所持品ゼロからドラゴン討伐・帰還まで</h1>
      <p>三人称・日本語の実況字幕付き・約1.5倍速・${length}。自然の素材を採掘してネザーゲートを自作し、敵との戦闘で素材を集めてエンドへ進んだ、新しい仕様でのプレイ記録です。</p>
      <p>途中の死亡${proof.deathCount}回と装備の回収、操作の調整、通常保存からの再開も含みます。${proof.recordingPartCount}本の録画パートを順番につなぎ、プレイ映像を途中で切り取らず収録しています。</p>
      <video id="recording" controls playsinline preload="metadata"
        poster="./${posterName}" data-proof="./${proofName}"
        data-expected-duration="${proof.export.duration}" aria-label="修正後のサバイバル討伐の全工程">
        <source src="./${mediaName}" type="video/mp4" />
        <a href="${rawDownload}">MP4を直接ダウンロード</a>
      </video>
      <nav aria-label="動画の再生とダウンロード">
        <button type="button" data-time="0">最初から再生</button>
        <a class="download" href="${rawDownload}" download="survival-generation3-1.5x.mp4">全工程のMP4をダウンロード（約${megabytes}MB）</a>
        <a class="download" href="./${subtitleName}" download>字幕ファイル</a>
        <a class="download" href="./${proofName}">進行と録画の検証記録</a>
      </nav>
      ${chapterNavigation}
      ${higherQuality}
      ${finalBattle}
      <p>字幕は映像に入っているので設定は不要です。長時間の全工程を収めるため画質を軽量化しています。音声はありません。壁際や狭い坑道ではカメラが近づき、体が視界を塞ぐ場合は非表示になります。</p>
      <details>
        <summary>旧仕様の動画（生成方式2・改善前）</summary>
        <p>以下は、村のゲートや素材の入手方法などを見直す前の記録です。現在の新規ワールドの進行とは異なります。</p>
        <nav aria-label="旧仕様の動画">
          <a class="download" href="./survival-steady-camera.mp4" download>旧仕様・三人称・カメラ調整後</a>
          <a class="download" href="./survival-third-person.mp4" download>旧仕様・三人称・カメラ調整前</a>
          <a class="download" href="./survival-narrated.mp4" download>旧仕様・一人称・字幕付き</a>
          <a class="download" href="./survival.mp4" download>最初の旧仕様の動画・字幕なし</a>
        </nav>
      </details>
      <p id="status" role="status" aria-live="polite"></p>
    </main>
    <script>
      const video = document.querySelector("#recording");
      const status = document.querySelector("#status");
      for (const button of document.querySelectorAll("[data-time]")) {
        button.addEventListener("click", async () => {
          video.currentTime = Number(button.dataset.time);
          try {
            await video.play();
            status.textContent = "";
          } catch {
            status.textContent = "動画の再生ボタンを押してください。MP4の直接ダウンロードも利用できます。";
          }
        });
      }
      video.addEventListener("error", () => {
        status.textContent = "動画を読み込めませんでした。MP4のダウンロードリンクから直接開いてください。";
      });
    </script>
  </body>
</html>
`;
}

const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
async function sha256(file) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}
function sourceFile(directory, name) {
  assert.ok(
    typeof name === "string" && path.basename(name) === name,
    "use a local recording filename",
  );
  const file = path.join(directory, name);
  assert.ok(existsSync(file) && statSync(file).isFile(), `missing completed artifact: ${name}`);
  return file;
}

export async function main(args = process.argv.slice(2)) {
  const option = (key, fallback) => (args.includes(key) ? args[args.indexOf(key) + 1] : fallback);
  const directory = path.resolve(
    args[0] && !args[0].startsWith("--") ? args[0] : "/workspace/artifacts/generation3-clear",
  );
  const output = path.resolve(option("--out", path.join(repository, "public/watch")));
  const metadata = JSON.parse(readFileSync(path.join(directory, "recording.json"), "utf8"));
  validateCompletedRecording(metadata);
  const movie = sourceFile(directory, metadata.export.file);
  const subtitles = sourceFile(directory, metadata.export.subtitleFile);
  assert.match(readFileSync(subtitles, "utf8"), /\d{2}:\d{2}:\d{2},\d{3} --> /);
  const bytes = statSync(movie).size;
  assert.ok(
    bytes > 0 && bytes < 95 * 1024 * 1024,
    "keep the complete compressed MP4 below GitHub's file limit before publishing",
  );
  const probe = JSON.parse(
    run("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height,pix_fmt:format=duration",
      "-of",
      "json",
      movie,
    ]),
  );
  const video = probe.streams[0];
  assert.equal(video.codec_name, "h264");
  assert.equal(video.width, 960);
  assert.equal(video.height, 540);
  assert.equal(video.pix_fmt, "yuv420p");
  assert.ok(Math.abs(Number(probe.format.duration) - metadata.export.duration) < 1);
  const parts = [];
  for (const part of metadata.parts) {
    const file = sourceFile(directory, part.path);
    parts.push({
      path: part.path,
      duration: part.duration,
      resumePhase: part.resumePhase,
      generator: part.generator ?? metadata.generator,
      sourceCommit: part.sourceCommit,
      completed: part.completed,
      recordedError: part.error ? shortError(part.error) : undefined,
      bytes: statSync(file).size,
      sha256: await sha256(file),
    });
  }
  const download = { file: mediaName, url: rawDownload, bytes, sha256: await sha256(movie) };
  const additionalDownloads = [];
  const extraSources = [];
  if (metadata.export.additionalDownloads !== undefined) {
    assert.equal(metadata.export.additionalDownloads.length, 3);
    let rawEnd = 0;
    for (const [index, item] of metadata.export.additionalDownloads.entries()) {
      assert.equal(item.file, `survival-generation3-part-${index + 1}.mp4`);
      assert.equal(item.subtitleFile, `survival-generation3-part-${index + 1}.srt`);
      assert.equal(item.fullDecodeVerified, true);
      assert.equal(item.speed, 1.5);
      assert.equal(item.audio, false);
      assert.match(item.captions, /Japanese.*burned/i);
      assert.ok(Math.abs(item.rawStart - rawEnd) < 0.001, "contiguous chronological chunks");
      assert.ok(item.rawEnd > item.rawStart);
      assert.ok(Math.abs(item.start - item.rawStart / 1.5) < 0.001);
      assert.ok(Math.abs(item.end - item.rawEnd / 1.5) < 0.001);
      assert.ok(Math.abs(item.duration - (item.rawEnd - item.rawStart) / 1.5) < 0.25);
      rawEnd = item.rawEnd;
      const file = sourceFile(directory, item.file);
      const subtitle = sourceFile(directory, item.subtitleFile);
      const size = statSync(file).size;
      assert.ok(size > 0 && size < 95 * 1024 * 1024);
      const extraProbe = JSON.parse(
        run("ffprobe", [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=codec_name,width,height,pix_fmt:format=duration",
          "-of",
          "json",
          file,
        ]),
      );
      assert.deepEqual(extraProbe.streams[0], {
        codec_name: "h264",
        width: 960,
        height: 540,
        pix_fmt: "yuv420p",
      });
      assert.ok(Math.abs(Number(extraProbe.format.duration) - item.duration) < 0.1);
      additionalDownloads.push({
        ...item,
        bytes: size,
        sha256: await sha256(file),
        url: rawDownload.replace(mediaName, item.file),
      });
      extraSources.push({ file, name: item.file }, { file: subtitle, name: item.subtitleFile });
    }
    assert.ok(Math.abs(rawEnd - metadata.export.rawDuration) < 0.001);
    assert.ok(
      Math.abs(
        additionalDownloads.reduce((sum, item) => sum + item.duration, 0) -
          metadata.export.duration,
      ) < 1,
    );
  }
  const proof = createCompactProof(metadata, download, parts);
  if (additionalDownloads.length) proof.export.additionalDownloads = additionalDownloads;
  if (metadata.export.finalBattleExcerpt !== undefined) {
    const item = metadata.export.finalBattleExcerpt;
    assert.equal(item.file, "survival-generation3-final-battle.mp4");
    assert.equal(item.subtitleFile, "survival-generation3-final-battle.srt");
    assert.equal(item.kind, "final-battle-excerpt");
    assert.equal(item.fullDecodeVerified, true);
    assert.equal(item.speed, 1.5);
    assert.equal(item.audio, false);
    assert.equal(item.perspective, "third-person-behind");
    assert.match(item.captions, /Japanese.*burned/i);
    assert.ok(item.captionCount > 0);
    assert.equal(item.sourceWindow.contiguous, true);
    const sourceTime = (point) => {
      let offset = 0;
      for (const part of metadata.parts) {
        if (part.path === point.part) {
          assert.ok(
            Number.isFinite(point.seconds) && point.seconds >= 0 && point.seconds <= part.duration,
          );
          return offset + point.seconds;
        }
        offset += part.duration;
      }
      assert.fail("excerpt timestamp must identify an actual recorded part");
    };
    assert.ok(Math.abs(sourceTime(item.sourceWindow.start) - item.rawStart) < 0.001);
    assert.ok(Math.abs(sourceTime(item.sourceWindow.end) - item.rawEnd) < 0.001);
    const entries = metadata.chapters.filter((chapter) => chapter.phase === 8).map(sourceTime);
    const returns = metadata.chapters.filter((chapter) => chapter.phase === 9).map(sourceTime);
    assert.ok(entries.length && returns.length);
    const enteredAt = Math.min(...entries),
      returnedAt = Math.max(...returns);
    assert.ok(enteredAt >= item.rawStart && enteredAt - item.rawStart <= 2.001);
    assert.ok(returnedAt > enteredAt && returnedAt <= item.rawEnd);
    assert.ok(Math.abs(item.rawEnd - metadata.export.rawDuration) < 0.001);
    assert.ok(Math.abs(item.start - item.rawStart / 1.5) < 0.001);
    assert.ok(Math.abs(item.end - item.rawEnd / 1.5) < 0.001);
    assert.ok(Math.abs(item.duration - (item.rawEnd - item.rawStart) / 1.5) < 0.25);
    const file = sourceFile(directory, item.file);
    const subtitle = sourceFile(directory, item.subtitleFile);
    assert.match(readFileSync(subtitle, "utf8"), /\d{2}:\d{2}:\d{2},\d{3} --> /);
    const size = statSync(file).size;
    assert.ok(size > 0 && size <= 20 * 1024 * 1024);
    const excerptProbe = JSON.parse(
      run("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name,width,height,pix_fmt:format=duration",
        "-of",
        "json",
        file,
      ]),
    );
    const stream = excerptProbe.streams[0];
    assert.equal(stream.codec_name, "h264");
    assert.equal(stream.width, 960);
    assert.equal(stream.height, 540);
    assert.equal(stream.pix_fmt, "yuv420p");
    assert.ok(Math.abs(Number(excerptProbe.format.duration) - item.duration) < 0.1);
    proof.export.finalBattleExcerpt = {
      ...item,
      bytes: size,
      sha256: await sha256(file),
      url: rawDownload.replace(mediaName, item.file),
    };
    extraSources.push({ file, name: item.file }, { file: subtitle, name: item.subtitleFile });
  }
  const layoutFile = existsSync(path.join(output, "index.html"))
    ? path.join(output, "index.html")
    : path.join(repository, "public/watch/index.html");
  const existingPage = readFileSync(layoutFile, "utf8");
  const style = existingPage.match(/<style>[\s\S]*?<\/style>/)?.[0];
  assert.ok(style, "preserve the existing watch layout");
  const html = renderWatchPage(proof, style);
  // Stage every new asset, then replace index last. A failed extraction never
  // changes the page's primary video or damages the existing legacy downloads.
  mkdirSync(output, { recursive: true });
  const staging = mkdtempSync(path.join(output, ".generation3-publish-"));
  try {
    copyFileSync(movie, path.join(staging, mediaName));
    copyFileSync(subtitles, path.join(staging, subtitleName));
    for (const extra of extraSources) copyFileSync(extra.file, path.join(staging, extra.name));
    const poster = option("--poster", null);
    if (poster) {
      assert.match(poster, /\.jpe?g$/i, "provide a verified JPEG poster");
      copyFileSync(path.resolve(poster), path.join(staging, posterName));
    } else {
      const at = Number(option("--poster-at", String(Math.max(0, metadata.export.duration - 16))));
      assert.ok(Number.isFinite(at) && at >= 0 && at < metadata.export.duration);
      run("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-ss",
        String(at),
        "-i",
        movie,
        "-frames:v",
        "1",
        "-q:v",
        "3",
        path.join(staging, posterName),
      ]);
    }
    writeFileSync(path.join(staging, proofName), JSON.stringify(proof, null, 2) + "\n");
    writeFileSync(path.join(staging, "index.html"), html);
    for (const name of [
      mediaName,
      subtitleName,
      posterName,
      proofName,
      ...extraSources.map((extra) => extra.name),
      "index.html",
    ])
      renameSync(path.join(staging, name), path.join(output, name));
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  console.log(
    JSON.stringify(
      {
        download,
        duration: proof.export.duration,
        length: lengthLabel(proof.export.duration),
        partCount: parts.length,
        deathCount: proof.deathCount,
        proof: path.join(output, proofName),
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
