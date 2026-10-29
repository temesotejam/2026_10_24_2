import assert from "node:assert/strict";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { prepareArchery } from "../lib/modern-archery.mjs";
export async function run({ page, d, a, chapter }) {
  const h = createModernHunting(page, d, a, { arrowReserve: 0 });
  h.activate();
  d.setGoal("回収したりんごで体力を戻し、集めた砂利と羽根で矢を作ります。");
  await a.eat();
  await a.recover(20);
  const target = Math.min(36, (await d.count("arrow")) + 4 * (await d.count("feather")));
  assert.ok(target >= 24);
  await prepareArchery(page, d, a, target);
  console.log("Recovered and rearmed", await d.info());
  await chapter("回収した食料で全快し、採集済みの材料から矢を製作", 4.7);
}
