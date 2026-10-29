/** Add light commentary from read-only, timestamped recorded combat observations. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const out = path.resolve(process.argv[2]);
const meta = JSON.parse(readFileSync(path.join(out, "recording.json"), "utf8"));
assert.equal(meta.completed, true, "finish the actual run before preparing commentary");
const observations = JSON.parse(readFileSync(path.join(out, "hunting-events.json"), "utf8"));
const texts = {
  wanderer: "パールを落とす敵を倒しました。ドロップを確認します。",
  ember: "ネザーの敵を倒しました。ロッドのドロップを確認します。",
  skeleton: "スケルトンを倒しました。戦利品を拾います。",
  spider: "クモを倒し、周囲の安全を確認します。",
  chicken: "鶏から、矢の材料になる羽根を集めています。",
};
let last = -Infinity;
const events = [];
for (const observation of observations) {
  if (observation.name !== "mob-defeated" || !texts[observation.species]) continue;
  const at = Date.parse(observation.at);
  if (at - last < (observation.species === "wanderer" ? 12000 : 35000)) continue;
  const part = meta.parts.find(
    (p) => at >= Date.parse(p.startedAt) && at < Date.parse(p.finishedAt),
  );
  if (!part) continue;
  events.push({
    part: part.path,
    seconds: (at - Date.parse(part.startedAt)) / 1000,
    text: texts[observation.species],
    source: "timestamped combat observation",
  });
  last = at;
}
writeFileSync(
  path.join(out, "observed-commentary.json"),
  JSON.stringify({ readOnly: true, source: "hunting-events.json", events }, null, 2),
);
console.log(`Prepared ${events.length} observed combat captions without changing the recording.`);
