/** Re-equip after the night battle, craft the bow immediately and secure camp. */
import assert from "node:assert/strict";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { craftArchery } from "../lib/modern-archery.mjs";
import { stockVillageFood } from "../lib/modern-resources.mjs";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  if (!(await d.count("diamond_pick"))) {
    d.setThreatHandler(null);
    d.setGoal("復活して落とした装備を回収し、今ある糸と羽根で弓矢を作ります。");
    await page.keyboard.down("ControlLeft");
    try {
      await a.surfaceTo(meta.lastDeath);
      await a.move(meta.lastDeath.x, meta.lastDeath.z);
    } finally {
      await page.keyboard.up("ControlLeft");
    }
    await wait(1000);
    assert.ok(await d.count("diamond_pick"), "recover the actual lost gear");
  }
  const h = createModernHunting(page, d, a, { arrowReserve: 0 });
  h.activate();
  await h.guard();
  await a.eat();
  await a.recover(18);
  const available = (await d.count("arrow")) + 4 * (await d.count("feather"));
  assert.ok(available >= 4, "own actual materials for immediate ranged defense");
  if (!(await d.count("table"))) {
    await d.open();
    await d.make("table");
    await d.close();
  }
  if (!(await d.count("bow"))) await craftArchery(d, available);
  await stockVillageFood(d, page, a, meta.village, { breadTarget: 24, waitForGrowth: true });
  const v = meta.village;
  if (
    (await page.evaluate(() => window.__mc.time() % 1200)) >= 24 &&
    (await page.evaluate(() => window.__mc.time() % 1200)) < 744
  ) {
    d.setGoal("村のベッドを使って復活地点を設定し、遠征に備えます。");
    await a.surfaceTo({ x: v.x + 7, z: v.z + 1 });
    await a.move(v.x + 7.5, v.z + 2.7);
    await a.move(v.x + 7.5, v.z + 3.5);
    await a.useAt({ x: v.x + 6, y: v.y, z: v.z + 5 });
    meta.bedSet = true;
    flush();
  }
  await chapter("装備を回収し、弓と実際の矢を作成・食料補給・村を拠点化", 4);
}
