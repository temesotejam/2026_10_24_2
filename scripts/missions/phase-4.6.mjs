import assert from "node:assert/strict";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { prepareArchery } from "../lib/modern-archery.mjs";
import { stockVillageFood } from "../lib/modern-resources.mjs";
export async function run({ page, d, a, meta, chapter }) {
  const h = createModernHunting(page, d, a, { arrowReserve: 0 });
  h.activate();
  const target = Math.min(36, (await d.count("arrow")) + 4 * (await d.count("feather")));
  assert.ok(target >= 24, "use the actual collected feathers");
  d.setGoal("集めた羽根と自然の砂利から、夜の戦闘用の矢を補充します。");
  if ((await d.count("bread")) < 3 && (await d.count("rawMeat")) < 4 && (await d.count("meat")) < 2)
    await stockVillageFood(d, page, a, meta.village, { breadTarget: 8, waitForGrowth: false });
  await a.eat();
  await prepareArchery(page, d, a, target);
  await chapter("採集した材料から矢を補充して次の夜に備える", 4);
}
