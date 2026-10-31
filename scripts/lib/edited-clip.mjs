/** Reuse only byte-verified encodes of the exact same source and edit decision. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ass } from "./narration.mjs";
const sourceHashes = new Map();
const hashFile = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
export function renderEditedClip({ directory, output, clip, name, localCues }) {
  assert.match(clip.part, /^part-\d+\.mp4$/);
  const source = path.join(directory, clip.part);
  if (!sourceHashes.has(source)) sourceHashes.set(source, hashFile(source));
  const key = createHash("sha256")
    .update(
      JSON.stringify({
        source: sourceHashes.get(source),
        clip,
        captions: ass(localCues),
        encoder: "720p30-x264-medium-crf18-yuv420p-v1",
      }),
    )
    .digest("hex");
  const file = path.join(output, name + ".mp4"),
    receipt = file + ".json";
  if (existsSync(file) && existsSync(receipt)) {
    const saved = JSON.parse(readFileSync(receipt, "utf8"));
    if (saved.key === key && saved.sha256 === hashFile(file)) return { file, reused: true };
  }
  writeFileSync(path.join(output, name + ".ass"), ass(localCues));
  let framing = "scale=1280:720";
  if (clip.viewport) {
    const { width, height } = clip.viewport;
    assert.ok(Number.isInteger(width) && width > 0 && width <= 1280);
    assert.ok(Number.isInteger(height) && height > 0 && height <= 720);
    framing = `crop=${width}:${height}:0:0,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1`;
  }
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-ss",
      String(clip.start),
      "-i",
      source,
      "-t",
      String((clip.end - clip.start) / clip.speed),
      "-vf",
      `setpts=(PTS-STARTPTS)/${clip.speed},fps=30,${framing},eq=gamma=${clip.gamma ?? 1},ass=${path.join(output, name + ".ass")}:fontsdir=/usr/share/fonts/opentype/noto`,
      "-an",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      "-filter_threads",
      "1",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      file,
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, result.stderr);
  writeFileSync(receipt, JSON.stringify({ key, sha256: hashFile(file) }) + "\n");
  return { file, reused: false };
}
