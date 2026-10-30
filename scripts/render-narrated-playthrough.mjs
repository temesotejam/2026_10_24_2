/** Burn observed Japanese commentary into the new full-length survival recording. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { narrationCues, ass, srt } from "./lib/narration.mjs";
import { correctObservedChapters } from "./lib/recording-corrections.mjs";

const directory = path.resolve(process.argv[2]);
const metadata = JSON.parse(readFileSync(path.join(directory, "recording.json"), "utf8"));
assert.equal(metadata.completed, true);
correctObservedChapters(metadata);
assert.equal(metadata.fixtureImports, false);
assert.equal(metadata.stateMutationAPI, false);
assert.ok(metadata.parts[0].initial.inventory.every((slot) => slot === null));
assert.ok(
  metadata.final.dragon.defeated && metadata.final.eggCount === 1 && metadata.final.health > 0,
);
assert.ok(metadata.narration.length >= 10, "use observed actions from the new recording");
let cameraVerification;
if (metadata.perspective === "third-person-behind") {
  const samples = metadata.parts.flatMap((part) => part.cameraSamples ?? []);
  assert.ok(samples.length >= 10, "observe the actual camera during recording");
  assert.ok(metadata.parts.every((part) => part.camera?.perspective === 1));
  assert.ok(samples.every((sample) => sample.perspective === 1));
  cameraVerification = {
    perspective: "third-person-behind",
    samples: samples.length,
    allSamplesThirdPerson: true,
    bodyVisibleSamples: samples.filter((sample) => sample.distance > 0.75).length,
    minimumDistance: Math.min(...samples.map((sample) => sample.distance)),
    maximumDistance: Math.max(...samples.map((sample) => sample.distance)),
  };
}

assert.ok(
  existsSync("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
  "Japanese subtitle font is installed",
);
const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: directory,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
let rawDuration = 0;
for (const part of metadata.parts) {
  assert.match(part.path, /^part-\d+\.mp4$/);
  part.duration = Number(
    run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      part.path,
    ]),
  );
  rawDuration += part.duration;
}
const observationsFile = path.join(directory, "observed-commentary.json");
if (existsSync(observationsFile)) {
  const observed = JSON.parse(readFileSync(observationsFile, "utf8"));
  for (const event of observed.events)
    if (
      !metadata.narration.some(
        (n) => n.part === event.part && n.seconds === event.seconds && n.text === event.text,
      )
    )
      metadata.narration.push(event);
  metadata.observedCommentaryReadOnly = true;
}
const cues = narrationCues(metadata);
assert.ok(cues.length >= 10);
writeFileSync(path.join(directory, "commentary.srt"), srt(cues));
writeFileSync(path.join(directory, "commentary.ass"), ass(cues));
writeFileSync(path.join(directory, "commentary-timeline.json"), JSON.stringify(cues, null, 2));
writeFileSync(
  path.join(directory, "recorded-parts.ffconcat"),
  "ffconcat version 1.0\n" + metadata.parts.map((part) => `file '${part.path}'\n`).join(""),
);
// Keep the complete long-form MP4 below GitHub's individual-file limit.
const maximumRateKbps = Math.min(
  300,
  Math.max(40, Math.floor((76 * 1024 * 1024 * 8) / (rawDuration / 1.5) / 1000)),
);
const output = "survival-narrated-1.5x.mp4";
run("ffmpeg", [
  "-y",
  "-v",
  "error",
  "-progress",
  "encode-progress.txt",
  "-f",
  "concat",
  "-safe",
  "1",
  "-i",
  "recorded-parts.ffconcat",
  "-vf",
  "setpts=(PTS-STARTPTS)/1.5,scale=960:540:flags=lanczos,fps=30,hqdn3d=1.2:1.2:4:4,ass=commentary.ass:fontsdir=/usr/share/fonts/opentype/noto",
  "-an",
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "29",
  "-maxrate",
  `${maximumRateKbps}k`,
  "-bufsize",
  `${maximumRateKbps * 2}k`,
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  output,
]);
const duration = Number(
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
assert.ok(Math.abs(duration - rawDuration / 1.5) < 1);
run("ffmpeg", ["-v", "error", "-i", output, "-f", "null", "-"]);
metadata.export = {
  file: output,
  speed: 1.5,
  rawDuration,
  duration,
  audio: false,
  outputFps: 30,
  maximumRateKbps,
  captions: "Japanese, burned into the picture",
  captionCount: cues.length,
  subtitleFile: "commentary.srt",
  fullDecodeVerified: true,
  cameraVerification,
};
writeFileSync(path.join(directory, "recording.json"), JSON.stringify(metadata, null, 2));
console.log(JSON.stringify(metadata.export, null, 2));
