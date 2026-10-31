/** Retrieve only items dropped in this recorded run, then establish a real bed. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { restInVillage } from "../lib/village-rest.mjs";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { craftArchery } from "../lib/modern-archery.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  assert.ok(meta.lastDeath && meta.village);
  a.setGuard(async () => false);
  d.setGoal("通常の復活地点から走って戻り、実際に落とした道具を回収します。");
  await page.keyboard.down("ControlLeft");
  try {
    await a.surfaceTo(meta.lastDeath);
    await a.move(meta.lastDeath.x, meta.lastDeath.z, true, 0.3);
  } finally {
    await page.keyboard.up("ControlLeft");
  }
  await wait(500);
  assert.ok(await d.count("diamond_pick"), "pick up this run's actual dropped diamond pickaxe");
  meta.gearRecoveries ??= [];
  meta.gearRecoveries.push({
    position: (await d.info()).position,
    inventory: (await d.info()).inventory,
    time: await page.evaluate(() => window.__mc.time()),
  });
  flush();
  const h = createModernHunting(page, d, a);
  h.activate();
  await a.eat();
  if ((await d.count("string")) >= 3 && !(await d.count("bow")))
    await craftArchery(d, await d.count("arrow"));
  await restInVillage(page, d, a, meta.village, meta, flush);
  await chapter("落とした装備を通常操作で回収し、弓とベッドを準備", 3);
}
