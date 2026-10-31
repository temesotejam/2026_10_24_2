/** Make a short looping GitHub image from this series' verified edited clips. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
const directory = path.resolve(process.argv[2]);
const proof = JSON.parse(readFileSync(path.join(directory, "edit-proof.json"), "utf8"));
assert.equal(proof.sourceCompleted, true);
assert.equal(proof.sourceFinal.dragon.defeated, true);
assert.equal(proof.sourceFinal.dimension, "overworld");
assert.equal(proof.settings.footageReusedFromPreviousRun, false);
const clips = proof.plan.preview;
assert.ok(Array.isArray(clips) && clips.length >= 2 && clips.length <= 8);
let total = 0,
  previousEpisode = 0,
  previousEnd = 0;
const inputs = [],
  filters = [];
for (const [i, clip] of clips.entries()) {
  assert.ok(
    Number.isInteger(clip.episode) && clip.episode >= 1 && clip.episode <= proof.outputs.length,
  );
  const episode = proof.outputs[clip.episode - 1];
  assert.ok(clip.start >= 0 && clip.end > clip.start && clip.end <= episode.duration);
  assert.ok(
    clip.episode > previousEpisode ||
      (clip.episode === previousEpisode && clip.start >= previousEnd),
  );
  previousEpisode = clip.episode;
  previousEnd = clip.end;
  total += clip.end - clip.start;
  inputs.push(
    "-ss",
    String(clip.start),
    "-t",
    String(clip.end - clip.start),
    "-i",
    path.join(directory, episode.file),
  );
  filters.push(`[${i}:v]setpts=PTS-STARTPTS,fps=10,scale=640:360:flags=lanczos,setsar=1[v${i}]`);
}
assert.ok(total >= 10 && total <= 45, "make a brief excerpt, not a giant full-length GIF");
filters.push(
  clips.map((_, i) => `[v${i}]`).join("") +
    `concat=n=${clips.length}:v=1:a=0,split[video][palette]`,
);
filters.push("[palette]palettegen=max_colors=128:stats_mode=diff[colors]");
filters.push("[video][colors]paletteuse=dither=bayer:bayer_scale=3[out]");
const file = path.join(directory, "preview.gif");
const result = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-v",
    "error",
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[out]",
    "-loop",
    "0",
    file,
  ],
  { encoding: "utf8" },
);
assert.equal(result.status, 0, result.stderr);
const probe = spawnSync(
  "ffprobe",
  [
    "-v",
    "error",
    "-count_frames",
    "-show_entries",
    "stream=nb_read_frames:format=duration",
    "-of",
    "json",
    file,
  ],
  { encoding: "utf8" },
);
assert.equal(probe.status, 0, probe.stderr);
const media = JSON.parse(probe.stdout);
assert.ok(Number(media.streams[0].nb_read_frames) > 1);
assert.ok(Math.abs(Number(media.format.duration) - total) < 0.3);
assert.ok(statSync(file).size < 20 * 1024 * 1024);
console.log(
  JSON.stringify({
    file,
    duration: Number(media.format.duration),
    frames: Number(media.streams[0].nb_read_frames),
    bytes: statSync(file).size,
    loop: true,
  }),
);
