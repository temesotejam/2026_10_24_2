/** Optional higher-quality, chronological downloads AFTER the primary full render.
 * node scripts/render-playthrough-parts.mjs /workspace/artifacts/generation3-clear
 * Original recordings and primary movie are read only; metadata is updated last.
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
import { validateCompletedRecording } from "./publish-generation3-video.mjs";

export function segmentCues(cues, start, end) {
  return cues
    .filter((cue) => cue.end > start && cue.start < end)
    .map((cue) => ({
      ...cue,
      start: Math.max(cue.start, start) - start,
      end: Math.min(cue.end, end) - start,
    }));
}

export function planSegments(rawDuration, count = 3) {
  assert.ok(Number.isFinite(rawDuration) && rawDuration > 0);
  return Array.from({ length: count }, (_, index) => {
    const rawStart = (rawDuration * index) / count;
    const rawEnd = (rawDuration * (index + 1)) / count;
    const duration = (rawEnd - rawStart) / 1.5;
    return {
      file: `survival-generation3-part-${index + 1}.mp4`,
      subtitleFile: `survival-generation3-part-${index + 1}.srt`,
      rawStart,
      rawEnd,
      start: rawStart / 1.5,
      end: rawEnd / 1.5,
      duration,
      maximumRateKbps: Math.min(300, Math.floor((90 * 1024 * 1024 * 8) / duration / 1000)),
    };
  });
}

export function main(args = process.argv.slice(2)) {
  const directory = path.resolve(args[0] ?? "/workspace/artifacts/generation3-clear");
  const metadataFile = path.join(directory, "recording.json");
  const original = readFileSync(metadataFile, "utf8");
  const metadata = JSON.parse(original);
  const rawDuration = validateCompletedRecording(metadata);
  assert.ok(
    existsSync(path.join(directory, metadata.export.file)),
    "render the primary movie first",
  );
  const manifest = readFileSync(path.join(directory, "recorded-parts.ffconcat"), "utf8");
  assert.equal(
    manifest,
    "ffconcat version 1.0\n" + metadata.parts.map((part) => `file '${part.path}'\n`).join(""),
    "use every recorded part in the primary render's order",
  );
  const cues = narrationCues(metadata);
  assert.ok(cues.length >= 10);
  const staging = mkdtempSync(path.join(directory, ".hq-parts-"));
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
    // Explicit durations let concat seek accurately across any number of parts.
    const concat =
      "ffconcat version 1.0\n" +
      metadata.parts
        .map((part) => {
          const source = path.join(directory, part.path).replaceAll("'", "'\\''");
          return `file '${source}'\nduration ${part.duration}\n`;
        })
        .join("");
    writeFileSync(path.join(staging, "parts.ffconcat"), concat);
    const downloads = planSegments(rawDuration);
    for (const segment of downloads) {
      assert.ok(segment.maximumRateKbps > 0);
      const localCues = segmentCues(cues, segment.start, segment.end);
      const assFile = segment.subtitleFile.replace(/\.srt$/, ".ass");
      writeFileSync(path.join(staging, segment.subtitleFile), srt(localCues));
      writeFileSync(path.join(staging, assFile), ass(localCues));
      run("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-progress",
        `${segment.file}.progress.txt`,
        "-ss",
        String(segment.rawStart),
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "parts.ffconcat",
        "-vf",
        `setpts=(PTS-STARTPTS)/1.5,scale=960:540:flags=lanczos,fps=30,hqdn3d=1.2:1.2:4:4,ass=${assFile}:fontsdir=/usr/share/fonts/opentype/noto`,
        "-t",
        String(segment.duration),
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "25",
        "-maxrate",
        `${segment.maximumRateKbps}k`,
        "-bufsize",
        `${segment.maximumRateKbps * 2}k`,
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        segment.file,
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
          segment.file,
        ]),
      );
      const video = probe.streams[0];
      assert.equal(video.codec_name, "h264");
      assert.equal(video.width, 960);
      assert.equal(video.height, 540);
      assert.equal(video.pix_fmt, "yuv420p");
      const measured = Number(probe.format.duration);
      assert.ok(Math.abs(measured - segment.duration) < 0.25);
      const bytes = statSync(path.join(staging, segment.file)).size;
      assert.ok(bytes > 0 && bytes < 95 * 1024 * 1024);
      run("ffmpeg", ["-v", "error", "-xerror", "-i", segment.file, "-f", "null", "-"]);
      Object.assign(segment, {
        duration: measured,
        bytes,
        speed: 1.5,
        captionCount: localCues.length,
        captions: "Japanese, burned into the picture",
        fullDecodeVerified: true,
        outputFps: 30,
        audio: false,
      });
    }
    assert.ok(
      Math.abs(
        downloads.reduce((sum, segment) => sum + segment.duration, 0) - metadata.export.duration,
      ) < 1,
      "three chunks preserve the primary movie's complete duration",
    );
    assert.equal(
      readFileSync(metadataFile, "utf8"),
      original,
      "recording metadata changed during rendering; do not overwrite another process",
    );
    for (const segment of downloads)
      for (const name of [segment.file, segment.subtitleFile])
        renameSync(path.join(staging, name), path.join(directory, name));
    metadata.export.additionalDownloads = downloads;
    const stagedMetadata = path.join(staging, "recording.json");
    writeFileSync(stagedMetadata, JSON.stringify(metadata, null, 2) + "\n");
    renameSync(stagedMetadata, metadataFile);
    console.log(JSON.stringify(downloads, null, 2));
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
