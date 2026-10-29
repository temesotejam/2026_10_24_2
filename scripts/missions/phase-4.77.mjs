import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, meta, chapter }) {
  a.setGuard(async () => false);
  d.setGoal("村のベッドで眠り、明るくなってから落とした装備を回収します。");
  await a.pillarTo(meta.rescueWell.top);
  const v = meta.village;
  const bed = { x: v.x + 6, y: v.y, z: v.z + 5 };
  await a.surfaceTo({ x: v.x + 7, z: v.z + 1 });
  await a.move(v.x + 7.5, v.z + 2.5, true);
  await a.move(v.x + 7.5, v.z + 4.5, true);
  await a.useAt(bed);
  await wait(600);
  const time = await page.evaluate(() => window.__mc.time());
  console.log("Native sleep morning", time, await d.info());
  assert.ok(time % 1200 >= 24 && time % 1200 < 720, "sleep normally until morning");
  await chapter("村のベッドで眠り、朝を迎えて回収の準備", 4.78);
}
