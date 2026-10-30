/** Render a reviewed edit decision list from genuine recorded gameplay. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ass, srt } from "./lib/narration.mjs";

const directory = path.resolve(process.argv[2]);
const plan = JSON.parse(readFileSync(process.argv[3], "utf8"));
const metadata = JSON.parse(readFileSync(path.join(directory, "recording.json"), "utf8"));
assert.equal(metadata.completed, true, "only publish an actually completed adventure");
assert.equal(metadata.fixtureImports, false);
assert.equal(metadata.stateMutationAPI, false);
assert.equal(metadata.final.dragon.defeated, true);
assert.equal(metadata.final.dimension, "overworld");
assert.equal(metadata.final.eggCount, 1);
const output = path.join(directory, "edited");
mkdirSync(output, { recursive: true });
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
const duration = (file) =>
  Number(
    run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]),
  );
const parts = new Map(
  metadata.parts.map((p, i) => [
    p.path,
    { ...p, index: i, duration: duration(path.join(directory, p.path)) },
  ]),
);
const outputs = [];
let previousIndex = -1,
  previousEnd = 0;
for (const [episodeIndex, episode] of plan.episodes.entries()) {
  const clips = [],
    captions = [];
  let cursor = 0;
  for (const [clipIndex, clip] of episode.clips.entries()) {
    const part = parts.get(clip.part);
    assert.ok(part, `unknown source ${clip.part}`);
    assert.ok(clip.start >= 0 && clip.end <= part.duration + 0.1 && clip.end > clip.start);
    assert.ok(
      clip.speed >= 1 && clip.speed <= 12,
      "show combat at normal speed; montage at up to 12x",
    );
    assert.ok(
      part.index > previousIndex ||
        (part.index === previousIndex && clip.start >= previousEnd - 0.01),
      "preserve source chronology",
    );
    previousIndex = part.index;
    previousEnd = clip.end;
    const length = (clip.end - clip.start) / clip.speed;
    const name = `episode-${episodeIndex + 1}-clip-${clipIndex + 1}`;
    const localCues = [{ start: 0, end: Math.min(length, 8), text: clip.text }];
    for (const cue of clip.captions ?? []) {
      assert.ok(cue.start >= 0 && cue.end <= length && cue.end > cue.start);
      localCues.push(cue);
    }
    writeFileSync(path.join(output, name + ".ass"), ass(localCues));
    run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-ss",
      String(clip.start),
      "-i",
      path.join(directory, clip.part),
      "-t",
      String(length),
      "-vf",
      `setpts=(PTS-STARTPTS)/${clip.speed},fps=30,scale=1280:720,ass=${path.join(output, name + ".ass")}:fontsdir=/usr/share/fonts/opentype/noto`,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      path.join(output, name + ".mp4"),
    ]);
    const measured = duration(path.join(output, name + ".mp4"));
    assert.ok(Math.abs(measured - length) < 0.2);
    clips.push(path.join(output, name + ".mp4"));
    captions.push(
      ...localCues.map((c) => ({ ...c, start: cursor + c.start, end: cursor + c.end })),
    );
    cursor += measured;
    console.log(
      JSON.stringify({ episode: episodeIndex + 1, clip: clipIndex + 1, duration: measured }),
    );
  }
  const stem = `survival-edited-${String(episodeIndex + 1).padStart(2, "0")}`;
  const manifest = path.join(output, stem + ".ffconcat");
  writeFileSync(
    manifest,
    "ffconcat version 1.0\n" + clips.map((p) => `file '${p.replaceAll("'", "'\\''")}'\n`).join(""),
  );
  const file = path.join(output, stem + ".mp4");
  run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    manifest,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    file,
  ]);
  run("ffmpeg", ["-v", "error", "-xerror", "-i", file, "-f", "null", "-"]);
  writeFileSync(path.join(output, stem + ".srt"), srt(captions));
  outputs.push({
    title: episode.title,
    file: stem + ".mp4",
    subtitleFile: stem + ".srt",
    duration: duration(file),
    bytes: statSync(file).size,
    sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
    fullDecodeVerified: true,
  });
}
writeFileSync(
  path.join(output, "edit-proof.json"),
  JSON.stringify(
    {
      sourceRun: metadata.url,
      sourceCompleted: metadata.completed,
      sourceFinal: metadata.final,
      plan,
      outputs,
      settings: {
        width: 1280,
        height: 720,
        crf: 18,
        bitrateCap: null,
        narration: "Japanese subtitles",
        footageReusedFromPreviousRun: false,
      },
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify({ completed: true, outputs }));
