import assert from "node:assert/strict";
export async function run({ d, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  d.setGoal("村の畑の水路を避け、石畳の広場へ戻ります。");
  const v = meta.village;
  await a.surfaceTo({ x: v.x - 4, z: v.z - 1 });
  await a.eat();
  assert.ok((await d.count("enderPearl")) >= 8 && (await d.count("blazeRod")) >= 14);
  meta.huntingCamp = {
    x: v.x - 4,
    y: v.y,
    z: v.z - 1,
    position: { x: v.x - 3.5, y: v.y, z: v.z - 0.5 },
  };
  flush();
  await chapter("落とした素材と装備を回収し、村の石畳へ帰還", 4);
}
