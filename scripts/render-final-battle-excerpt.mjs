/** Optional excerpt AFTER the completed full-length render. Does not replace it.
 * node scripts/render-final-battle-excerpt.mjs /workspace/artifacts/generation3-clear
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { narrationCues, ass, srt } from "./lib/narration.mjs";
import { segmentCues } from "./render-playthrough-parts.mjs";
import { validateCompletedRecording } from "./publish-generation3-video.mjs";

export function finalBattleWindow(metadata) {
  const offsets = new Map();
  let rawDuration = 0;
  for (const part of metadata.parts) {
    offsets.set(part.path, rawDuration);
    rawDuration += part.duration;
  }
  const chapterTime = (chapter) => {
    const part = metadata.parts.find((item) => item.path === chapter.part);
    assert.ok(
      part &&
        Number.isFinite(chapter.seconds) &&
        chapter.seconds >= 0 &&
        chapter.seconds < part.duration,
      "use actual chapter timestamps",
    );
    return offsets.get(part.path) + chapter.seconds;
  };
  const entries = metadata.chapters.filter((chapter) => chapter.phase === 8);
  const returns = metadata.chapters.filter((chapter) => chapter.phase === 9);
  assert.ok(
    entries.length && returns.length,
    "record End entry and actual victorious return chapters first",
  );
  const enteredAt = Math.min(...entries.map(chapterTime));
  const returnedAt = Math.max(...returns.map(chapterTime));
  assert.ok(returnedAt > enteredAt);
  const rawStart = Math.max(0, enteredAt - 2);
  const rawEnd = rawDuration;
  const locate = (time) => {
    const part =
      metadata.parts.find((item) => time < offsets.get(item.path) + item.duration) ??
      metadata.parts.at(-1);
    return { part: part.path, seconds: time - offsets.get(part.path) };
  };
  return {
    rawStart,
    rawEnd,
    start: rawStart / 1.5,
    end: rawEnd / 1.5,
    duration: (rawEnd - rawStart) / 1.5,
    sourceWindow: {
      start: locate(rawStart),
      end: locate(rawEnd),
      endEntryRawSeconds: enteredAt,
      victoriousReturnRawSeconds: returnedAt,
      contiguous: true,
    },
  };
}

export function main(args = process.argv.slice(2)) {
  const directory = path.resolve(args[0] ?? "/workspace/artifacts/generation3-clear");
  const metadataFile = path.join(directory, "recording.json");
  const original = readFileSync(metadataFile, "utf8");
  const metadata = JSON.parse(original);
  validateCompletedRecording(metadata);
  assert.ok(
    existsSync(path.join(directory, metadata.export.file)),
    "render and verify the mandatory full movie first",
  );
  assert.equal(
    readFileSync(path.join(directory, "recorded-parts.ffconcat"), "utf8"),
    "ffconcat version 1.0\n" + metadata.parts.map((part) => `file '${part.path}'\n`).join(""),
  );
  const excerpt = {
    ...finalBattleWindow(metadata),
    file: "survival-generation3-final-battle.mp4",
    subtitleFile: "survival-generation3-final-battle.srt",
    kind: "final-battle-excerpt",
    speed: 1.5,
    audio: false,
    outputFps: 30,
    perspective: "third-person-behind",
    captions: "Japanese, burned into the picture",
  };
  const cues = segmentCues(narrationCues(metadata), excerpt.start, excerpt.end);
  assert.ok(cues.length > 0, "retain observed Japanese commentary in the battle window");
  excerpt.maximumRateKbps = Math.min(
    800,
    Math.floor((18 * 1024 * 1024 * 8) / excerpt.duration / 1000),
  );
  assert.ok(excerpt.maximumRateKbps > 0);
  const staging = mkdtempSync(path.join(directory, ".final-battle-"));
  const run = (command, commandArgs) => {
    const result = spawnSync(command, commandArgs, {
      cwd: staging,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  try {
    writeFileSync(
      path.join(staging, "parts.ffconcat"),
      "ffconcat version 1.0\n" +
        metadata.parts
          .map(
            (part) =>
              `file '${path.join(directory, part.path).replaceAll("'", "'\\''")}'\nduration ${part.duration}\n`,
          )
          .join(""),
    );
    writeFileSync(path.join(staging, excerpt.subtitleFile), srt(cues));
    writeFileSync(path.join(staging, "excerpt.ass"), ass(cues));
    run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-ss",
      String(excerpt.rawStart),
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "parts.ffconcat",
      "-vf",
      "setpts=(PTS-STARTPTS)/1.5,scale=960:540:flags=lanczos,fps=30,hqdn3d=1.2:1.2:4:4,ass=excerpt.ass:fontsdir=/usr/share/fonts/opentype/noto",
      "-t",
      String(excerpt.duration),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "24",
      "-maxrate",
      `${excerpt.maximumRateKbps}k`,
      "-bufsize",
      `${excerpt.maximumRateKbps * 2}k`,
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      excerpt.file,
    ]);
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
        excerpt.file,
      ]),
    );
    assert.equal(probe.streams[0].codec_name, "h264");
    assert.equal(probe.streams[0].width, 960);
    assert.equal(probe.streams[0].height, 540);
    assert.equal(probe.streams[0].pix_fmt, "yuv420p");
    const duration = Number(probe.format.duration);
    assert.ok(Math.abs(duration - excerpt.duration) < 0.25);
    const bytes = statSync(path.join(staging, excerpt.file)).size;
    assert.ok(bytes > 0 && bytes <= 20 * 1024 * 1024);
    run("ffmpeg", ["-v", "error", "-xerror", "-i", excerpt.file, "-f", "null", "-"]);
    Object.assign(excerpt, {
      duration,
      bytes,
      captionCount: cues.length,
      fullDecodeVerified: true,
    });
    assert.equal(
      readFileSync(metadataFile, "utf8"),
      original,
      "do not overwrite concurrent recording/export changes",
    );
    for (const name of [excerpt.file, excerpt.subtitleFile])
      renameSync(path.join(staging, name), path.join(directory, name));
    metadata.export.finalBattleExcerpt = excerpt;
    writeFileSync(path.join(staging, "recording.json"), JSON.stringify(metadata, null, 2) + "\n");
    renameSync(path.join(staging, "recording.json"), metadataFile);
    console.log(JSON.stringify(excerpt, null, 2));
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
