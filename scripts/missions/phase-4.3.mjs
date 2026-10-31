/** Turn earned gravel and feathers into immediate native ranged defense. */
import assert from "node:assert/strict";
import { gatherFlint } from "../lib/modern-resources.mjs";
import { craftArchery } from "../lib/modern-archery.mjs";
import { createModernHunting } from "../lib/modern-hunting.mjs";
export async function run({ page, d, a, chapter }) {
  const h = createModernHunting(page, d, a, { arrowReserve: 0 });
  h.activate();
  const batches = Math.min(await d.count("gravel"), await d.count("feather"), 3);
  assert.ok(batches > 0, "carry real gravel and feathers");
  d.setGoal("集めた羽根と持ち帰った砂利を使い、夜の前に弓の矢を補充します。");
  await gatherFlint(d, page, a, { targetCount: batches, maxAttempts: 200 });
  const target = (await d.count("arrow")) + 4 * batches;
  await craftArchery(d, target);
  await chapter("実際の砂利と羽根から矢を作り、夜の戦闘に備える", 4);
}
