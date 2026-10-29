/** Normal tactical retreat and resupply after using the carried arrows. */
import { wait } from "../lib/survival-driver.mjs";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { stockVillageFood } from "../lib/modern-resources.mjs";
import { prepareArchery } from "../lib/modern-archery.mjs";
export async function run({ page, d, a, meta, chapter }) {
  const v = meta.village;
  d.setThreatHandler(null);
  d.setGoal("矢を使い切ったので村へ退き、家の中で休んで補給します。");
  await page.keyboard.down("ControlLeft");
  try {
    await a.surfaceTo({ x: v.x + 7, z: v.z + 1 });
    await a.move(v.x + 7.5, v.z + 2.7);
    await a.move(v.x + 7.5, v.z + 3.5);
  } finally {
    await page.keyboard.up("ControlLeft");
  }
  await d.equip("iron_sword");
  await a.useAt({ x: v.x + 6, y: v.y, z: v.z + 5 });
  await a.eat();
  // Sleeping is a normal bed action. If nearby monsters prevent it, stay in
  // the house until the naturally advancing sunrise instead.
  const until = Date.now() + 120000;
  while (
    await page.evaluate(() => {
      const t = window.__mc.time() % 1200;
      return t >= 744 || t < 24;
    })
  ) {
    if (Date.now() > until) throw new Error("wait safely in the village house for sunrise");
    await a.eat();
    await wait(1000);
  }
  const h = createModernHunting(page, d, a, { arrowReserve: 0 });
  h.activate();
  await a.eat();
  await a.recover(18);
  await stockVillageFood(d, page, a, v, { breadTarget: 18, waitForGrowth: true });
  d.setGoal("昼の間に鶏を探し、矢の材料を補充します。");
  await h.collectAmmo(36, {
    timeoutMs: 900000,
    home: meta.huntingCamp.position ?? meta.huntingCamp,
    arrowReserve: 0,
  });
  await prepareArchery(page, d, a, 36);
  await chapter("村へ安全に撤退し、食料と弓矢を補充", 4);
}
