/** Corrections supported by the original observation logs, never by invented play.
 * Applied in memory only after completion; the primary renderer persists them
 * together with its verified export. Every raw recording and timestamp stays intact.
 */
import assert from "node:assert/strict";

const corrections = [
  {
    part: "part-107.mp4",
    at: "2026-10-30T01:35:56.523Z",
    replacement: "敵の位置を確認し、水中ではないため潜水対象から除外",
    evidence: {
      source: "/tmp/gen3-clear-107.log",
      observation: "UNDERWATER_WANDERER_OBSERVATIONS",
      entityId: 2738,
      feetBlock: 0,
      headBlock: 0,
      rejection: "feet are not in water (possibly a cave)",
    },
  },
  {
    part: "part-118.mp4",
    at: "2026-10-30T13:04:33.719Z",
    replacement: "敵の水深を確認し、6ブロックを超えるため潜水を見送る",
    evidence: {
      source: "/tmp/gen3-clear-118.log",
      observation: "UNDERWATER_WANDERER_OBSERVATIONS",
      entityId: 2961,
      feetBlock: 5,
      headBlock: 5,
      contiguousWaterTop: 32,
      depth: 7.999999993642298,
      rejection: "water deeper than six blocks",
    },
  },
];

export function correctObservedChapters(metadata) {
  assert.equal(metadata.completed, true, "do not correct metadata while recording is active");
  if (metadata.generator !== 3 || metadata.seed !== 2026) return metadata;
  for (const rule of corrections) {
    const chapter = metadata.chapters?.find(
      (item) => item.part === rule.part && item.at === rule.at,
    );
    if (!chapter || chapter.name === rule.replacement) continue;
    assert.equal(
      chapter.name,
      "浅い水中の敵を通常操作で討伐し、実際のドロップを回収",
      "review an unexpected caption rather than silently replacing it",
    );
    const original = chapter.name;
    chapter.name = rule.replacement;
    metadata.captionCorrections ??= [];
    metadata.captionCorrections.push({
      field: "chapters.name",
      part: chapter.part,
      at: chapter.at,
      seconds: chapter.seconds,
      original,
      corrected: chapter.name,
      reason:
        "The recorded target was rejected before combat; no kill or pickup is supported by this part's observations.",
      evidence: rule.evidence,
    });
  }
  return metadata;
}
