/** Preserve the original 720p picture; control file size by splitting, not bitrate. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, statSync, rmSync } from "node:fs";
import path from "node:path";
import { narrationCues, ass, srt } from "./lib/narration.mjs";
import { segmentCues } from "./render-playthrough-parts.mjs";
import { finalBattleWindow } from "./render-final-battle-excerpt.mjs";
import { validateCompletedRecording } from "./publish-generation3-video.mjs";
const directory = path.resolve(process.argv[2] ?? "/workspace/artifacts/generation3-clear");
const full = process.argv.includes("--full");
const original = readFileSync(path.join(directory, "recording.json"), "utf8");
const metadata = JSON.parse(original);
const rawDuration = validateCompletedRecording(metadata);
const out = path.join(directory, "quality-720p");
mkdirSync(out, { recursive: true });
const manifest =
  "ffconcat version 1.0\n" +
  metadata.parts
    .map(
      (p) =>
        `file '${path.join(directory, p.path).replaceAll("'", "'\\''")}'\nduration ${p.duration}\n`,
    )
    .join("");
writeFileSync(path.join(out, "sources.ffconcat"), manifest);
const cues = narrationCues(metadata);
function run(command, args) {
  const r = spawnSync(command, args, { cwd: out, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
function render(window, name) {
  const duration = (window.rawEnd - window.rawStart) / 1.5;
  const local = segmentCues(cues, window.rawStart / 1.5, window.rawEnd / 1.5);
  writeFileSync(path.join(out, name + ".ass"), ass(local));
  writeFileSync(path.join(out, name + ".srt"), srt(local));
  run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-progress",
    name + ".progress.txt",
    "-ss",
    String(window.rawStart),
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    "sources.ffconcat",
    "-vf",
    `setpts=(PTS-STARTPTS)/1.5,scale=1280:720:flags=lanczos,fps=30,ass=${name}.ass:fontsdir=/usr/share/fonts/opentype/noto`,
    "-t",
    String(duration),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    name + ".mp4",
  ]);
  const file = path.join(out, name + ".mp4"),
    bytes = statSync(file).size;
  if (bytes > 90 * 1024 * 1024) return null;
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
      file,
    ]),
  );
  assert.equal(probe.streams[0].codec_name, "h264");
  assert.equal(probe.streams[0].width, 1280);
  assert.equal(probe.streams[0].height, 720);
  assert.equal(probe.streams[0].pix_fmt, "yuv420p");
  const measured = Number(probe.format.duration);
  assert.ok(Math.abs(measured - duration) < 0.25);
  run("ffmpeg", ["-v", "error", "-xerror", "-i", file, "-f", "null", "-"]);
  const result = {
    ...window,
    file: name + ".mp4",
    subtitleFile: name + ".srt",
    duration: measured,
    bytes,
    captionCount: local.length,
    fullDecodeVerified: true,
    sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
  };
  console.log(JSON.stringify(result));
  return result;
}
const queue = full
  ? Array.from({ length: 12 }, (_, i) => ({
      rawStart: (rawDuration * i) / 12,
      rawEnd: (rawDuration * (i + 1)) / 12,
    }))
  : [finalBattleWindow(metadata)];
const results = [];
while (queue.length) {
  const window = queue.shift();
  const name = full
    ? `survival-generation3-720p-part-${String(results.length + 1).padStart(2, "0")}`
    : "survival-generation3-battle-720p";
  const result = render(window, name);
  if (!result) {
    assert.ok(full, "battle exceeds individual download size; split explicitly before publishing");
    rmSync(path.join(out, name + ".mp4"));
    const mid = (window.rawStart + window.rawEnd) / 2;
    queue.unshift(
      { rawStart: window.rawStart, rawEnd: mid },
      { rawStart: mid, rawEnd: window.rawEnd },
    );
    continue;
  }
  results.push(result);
}
if (full) {
  assert.equal(results[0].rawStart, 0);
  assert.ok(Math.abs(results.at(-1).rawEnd - rawDuration) < 0.001);
  for (let i = 1; i < results.length; i++)
    assert.ok(Math.abs(results[i - 1].rawEnd - results[i].rawStart) < 0.001);
  assert.ok(Math.abs(results.reduce((sum, p) => sum + p.duration, 0) - rawDuration / 1.5) < 1);
}
assert.equal(
  readFileSync(path.join(directory, "recording.json"), "utf8"),
  original,
  "leave original recording/export metadata untouched",
);
const proof = {
  kind: full ? "source-quality-full-playthrough" : "source-quality-battle-excerpt",
  includesFullPlaythrough: full,
  completed: true,
  generator: 3,
  seed: metadata.seed,
  initialInventoryEmpty: true,
  fixtureImports: false,
  stateMutationAPI: false,
  final: metadata.final,
  navigation: metadata.endMission?.navigation,
  deathCount: metadata.deaths.length,
  sourceMetadataSha256: createHash("sha256").update(original).digest("hex"),
  sourcePartCount: metadata.parts.length,
  sourceRawDuration: rawDuration,
  settings: {
    width: 1280,
    height: 720,
    crf: 18,
    bitrateCap: false,
    denoise: false,
    speed: 1.5,
    fps: 30,
    audio: false,
    captions: "Japanese, burned into picture",
  },
  downloads: results,
};
writeFileSync(
  path.join(out, full ? "quality-full-proof.json" : "quality-battle-proof.json"),
  JSON.stringify(proof, null, 2) + "\n",
);
