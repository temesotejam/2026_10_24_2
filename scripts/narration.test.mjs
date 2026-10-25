import { test } from "node:test";
import assert from "node:assert/strict";
import { narrationCues, ass, srt } from "./lib/narration.mjs";

test("maps resumed action timestamps onto the joined 1.5x video", () => {
  const cues = narrationCues({
    parts: [
      { path: "a", duration: 60 },
      { path: "b", duration: 30 },
    ],
    narration: [
      { part: "a", seconds: 3, text: "木を集めます。" },
      { part: "b", seconds: 9, text: "戦闘を再開します。" },
    ],
  });
  assert.equal(cues[0].start, 2);
  assert.equal(cues[1].start, 46);
  assert.equal(cues[1].end, 51.5);
});
test("excludes out-of-recording actions and prevents overlapping captions", () => {
  const cues = narrationCues({
    parts: [{ path: "a", duration: 12 }],
    narration: [
      { part: "a", seconds: -1, text: "録画前" },
      { part: "a", seconds: 3, text: "採掘" },
      { part: "a", seconds: 6, text: "戦闘" },
      { part: "a", seconds: 12, text: "録画後" },
    ],
  });
  assert.equal(cues.length, 2);
  assert.ok(cues[0].end < cues[1].start);
  assert.equal(cues[1].end, 8);
});
test("exports Japanese captions and neutralizes ASS formatting in text", () => {
  const cues = [{ start: 1.5, end: 5, text: "鉄を採掘\n{字幕}\\確認" }];
  assert.match(srt(cues), /00:00:01,500 --> 00:00:05,000/);
  assert.match(ass(cues), /Noto Sans CJK JP/);
  assert.match(ass(cues), /鉄を採掘\\N｛字幕｝＼確認/);
});

test("explains a recorded interruption without removing its gameplay", () => {
  const cues = narrationCues({
    parts: [
      { path: "a", duration: 30, error: "travel blocked" },
      { path: "b", duration: 10 },
    ],
    narration: [
      { part: "a", seconds: 0, text: "移動します。" },
      { part: "b", seconds: 0.2, text: "再開します。" },
    ],
  });
  const explanation = cues.find((c) => c.text.includes("通常保存"));
  assert.equal(explanation.start, 16);
  assert.ok(explanation.end < 20.2 / 1.5 + 30 / 1.5);
});
