import assert from "node:assert/strict";
export async function run({ d, a, meta, flush, chapter }) {
  d.setGoal("地上へ戻り、食料を用意するため村を探します。");
  await a.reachSurface();
  const p = (await d.info()).position;
  const village = (await a.adventure()).structures
    .filter((s) => s.kind === "village")
    .sort((s, t) => Math.hypot(s.x - p.x, s.z - p.z) - Math.hypot(t.x - p.x, t.z - p.z))[0];
  assert.ok(village, "discover natural village");
  meta.village = village;
  flush();
  await a.surfaceTo({ x: village.x - 6, z: village.z + 1 });
  await a.move(village.x - 5.5, village.z + 2.7);
  await a.useAt({ x: village.x - 7, y: village.y, z: village.z + 5 });
  await a.takeChest();
  await a.eat();
  await chapter("地上へ戻り、村の自然生成された宝箱を探索", 3);
}
