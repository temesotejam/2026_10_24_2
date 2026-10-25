/** Preserve every recorded frame in chronological order, with only a 1.5x speed change. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const directory = path.resolve(process.argv[2]);
const metadata = JSON.parse(readFileSync(path.join(directory, "recording.json"), "utf8"));
assert.equal(metadata.completed, true, "only render a completed survival journey");
assert.equal(metadata.fixtureImports, false);
assert.equal(metadata.stateMutationAPI, false);
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
let rawDuration = 0;
for (const part of metadata.parts) {
  const file = path.join(directory, part.path);
  const probe = JSON.parse(
    run("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", file]),
  );
  assert.ok(probe.streams.some((stream) => stream.codec_type === "video"));
  part.duration = Number(probe.format.duration);
  rawDuration += part.duration;
}
const list = path.join(directory, "recorded-parts.ffconcat");
writeFileSync(
  list,
  "ffconcat version 1.0\n" +
    metadata.parts
      .map((part) => {
        assert.match(part.path, /^part-\d+\.mp4$/);
        return `file '${part.path}'\n`;
      })
      .join(""),
);
const output = path.join(directory, "survival-to-dragon-1.5x.mp4");
run("ffmpeg", [
  "-y",
  "-v",
  "error",
  "-f",
  "concat",
  "-safe",
  "1",
  "-i",
  list,
  "-vf",
  "setpts=(PTS-STARTPTS)/1.5",
  "-an",
  "-c:v",
  "libx264",
  "-preset",
  "fast",
  "-crf",
  "23",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  output,
]);
const actual = Number(
  run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    output,
  ]),
);
assert.ok(
  Math.abs(actual - rawDuration / 1.5) < 1,
  `duration ${actual}, expected ${rawDuration / 1.5}`,
);
run("ffmpeg", ["-v", "error", "-i", output, "-f", "null", "-"]);
metadata.export = {
  file: path.basename(output),
  speed: 1.5,
  rawDuration,
  duration: actual,
  audio: false,
  fullDecodeVerified: true,
};
writeFileSync(path.join(directory, "recording.json"), JSON.stringify(metadata, null, 2));
console.log(JSON.stringify(metadata.export, null, 2));
