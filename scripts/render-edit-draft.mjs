/** Encode closed, genuine source clips while the adventure continues.
 * This produces no completion proof or publishable collection.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderEditedClip } from "./lib/edited-clip.mjs";
const directory = path.resolve(process.argv[2]),
  plan = JSON.parse(readFileSync(process.argv[3], "utf8"));
const meta = JSON.parse(readFileSync(path.join(directory, "recording.json"), "utf8"));
assert.equal(meta.fixtureImports, false);
assert.equal(meta.stateMutationAPI, false);
assert.ok(meta.parts[0].initial.inventory.every((s) => s === null));
const output = path.join(directory, "edited");
mkdirSync(output, { recursive: true });
let previousPart = -1,
  previousEnd = 0;
for (const [episodeIndex, episode] of plan.episodes.entries())
  for (const [clipIndex, clip] of episode.clips.entries()) {
    const index = meta.parts.findIndex((p) => p.path === clip.part),
      source = meta.parts[index];
    assert.ok(source?.finishedAt, "only encode already closed recordings");
    assert.ok(index > previousPart || (index === previousPart && clip.start >= previousEnd));
    previousPart = index;
    previousEnd = clip.end;
    const probe = spawnSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        path.join(directory, clip.part),
      ],
      { encoding: "utf8" },
    );
    assert.equal(probe.status, 0, probe.stderr);
    assert.ok(clip.start >= 0 && clip.end > clip.start && clip.end <= Number(probe.stdout) + 0.1);
    assert.ok(clip.speed >= 1 && clip.speed <= 12);
    assert.ok((clip.gamma ?? 1) >= 1 && (clip.gamma ?? 1) <= 1.6);
    const length = (clip.end - clip.start) / clip.speed,
      localCues = [{ start: 0, end: Math.min(length, 8), text: clip.text }];
    for (const cue of clip.captions ?? []) {
      assert.ok(cue.start >= 0 && cue.end <= length && cue.end > cue.start);
      localCues.push(cue);
    }
    const result = renderEditedClip({
      directory,
      output,
      clip,
      name: `episode-${episodeIndex + 1}-clip-${clipIndex + 1}`,
      localCues,
    });
    console.log(
      JSON.stringify({ episode: episodeIndex + 1, clip: clipIndex + 1, reused: result.reused }),
    );
  }
