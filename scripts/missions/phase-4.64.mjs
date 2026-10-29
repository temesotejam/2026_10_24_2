import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, meta, chapter }) {
  a.setGuard(async () => false);
  const v = meta.village;
  d.setGoal("復活して、村に保管した道具と食料を持って装備を回収します。");
  await a.surfaceTo({ x: v.x - 6, z: v.z + 1 });
  await a.move(v.x - 5.5, v.z + 3.5, true);
  await a.move(v.x - 5.5, v.z + 5.5, true);
  const chest = { x: v.x - 7, y: v.y, z: v.z + 5 };
  await a.useAt(chest);
  await page.waitForSelector('[data-area="chest"]');
  for (const names of [["石のツルハシ", "木のツルハシ"], ["生肉"]]) {
    const slot = await page.$$eval(
      '[data-area="chest"]',
      (els, names) => els.findIndex((e) => names.includes(e.querySelector("img")?.alt)),
      names,
    );
    assert.ok(slot >= 0, "retrieve actual stored backup supplies");
    const free = (await d.info()).inventory.findIndex((s) => s === null);
    await page.locator(`[data-area="chest"][data-slot="${slot}"]`).click();
    await page.locator(`[data-area="inventory"][data-slot="${free}"]`).click();
  }
  await d.close();
  await a.eat();
  await page.keyboard.down("ControlLeft");
  try {
    await a.surfaceTo(meta.lastDeath);
    await a.move(meta.lastDeath.x, meta.lastDeath.z, true);
  } finally {
    await page.keyboard.up("ControlLeft");
  }
  for (let i = 0; i < 5 && !(await d.count("diamond_pick")); i++) {
    const p = (await d.info()).position;
    if (p.y > meta.lastDeath.y + 0.8) {
      await d.center();
      const q = (await d.info()).position;
      await d.mine({ x: Math.floor(q.x), y: Math.round(q.y) - 1, z: Math.floor(q.z) });
    }
    await wait(800);
  }
  assert.ok(await d.count("diamond_pick"), "retrieve the actually dropped diamond pick");
  assert.ok((await d.count("enderPearl")) >= 8, "retrieve the eight actual pearls");
  assert.ok((await d.count("blazeRod")) >= 14, "retrieve actual rods");
  await a.eat();
  console.log("Recovered ordinary death", await d.info());
  await chapter("村の予備道具と食料を使い、パール8個と装備を回収", 4.6);
}
