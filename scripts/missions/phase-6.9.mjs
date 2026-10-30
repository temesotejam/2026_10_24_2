/** Final End preparation from the materials earned and cached in this run. */
import assert from "node:assert/strict";
import { prepareArchery } from "../lib/modern-archery.mjs";
import { carriedFoodUnits } from "../lib/modern-resources.mjs";

export async function run(context) {
  const { page, d, a, meta, flush, chapter } = context;
  assert.ok((await d.count("enderPearl")) >= 12);
  assert.ok((await d.count("blazeRod")) >= 6);
  const chest = meta.village.cacheChest ?? {
    x: meta.village.x - 7,
    y: meta.village.y,
    z: meta.village.z + 5,
  };
  assert.equal(await d.block(chest), 14, "observe the existing village supply chest");
  meta.village.cacheChest = chest;
  const refresh = await import("./phase-4.81.mjs");
  await refresh.run({ ...context, foodTargetUnits: 40 });
  d.setGoal("実際に集めた羽根と火打ち石から、クリスタル6個と予備に使う矢を作ります。");
  await prepareArchery(page, d, a, 16);
  await a.eat();
  await a.recover(20);
  assert.ok((await d.count("arrow")) >= 16);
  assert.ok((await carriedFoodUnits(d)) >= 40);
  meta.finalPreparation = {
    inventory: (await d.info()).inventory,
    health: (await d.info()).health,
    foodUnits: await carriedFoodUnits(d),
  };
  flush();
  await chapter("実際の保管素材で新品の剣と矢16本を用意し、魚を携えてエンドへ出発", 7);
}
