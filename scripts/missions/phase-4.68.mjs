import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { createModernHunting } from "../lib/modern-hunting.mjs";
export async function run({ page, d, a, meta, chapter }) {
  a.setGuard(async () => false);
  const v = meta.village;
  d.setGoal("通常復活から、崖を避ける低い海岸側の道で装備を回収します。");
  await a.surfaceTo({ x: v.x - 6, z: v.z + 1 });
  await a.move(v.x - 5.5, v.z + 3.5, true);
  await a.move(v.x - 5.5, v.z + 5.5, true);
  await a.useAt({ x: v.x - 7, y: v.y, z: v.z + 5 });
  await page.waitForSelector('[data-area="chest"]');
  let slot = -1;
  for (const name of ["石のツルハシ", "木のツルハシ"]) {
    slot = await page.$$eval(
      '[data-area="chest"]',
      (els, name) => els.findIndex((e) => e.querySelector("img")?.alt === name),
      name,
    );
    if (slot >= 0) break;
  }
  assert.ok(slot >= 0, "retrieve the actual stored spare pickaxe");
  await page.locator(`[data-area="chest"][data-slot="${slot}"]`).click();
  await page.locator('[data-area="inventory"][data-slot="0"]').click();
  await d.close();
  const goal = meta.deaths.find((d) => d.part === "part-56.mp4").position;
  await page.keyboard.down("ControlLeft");
  try {
    for (const target of [
      { x: 213, z: -95 },
      { x: 240, z: -105 },
      { x: 270, z: -106 },
      { x: 295, z: -104 },
      { x: 310, z: -86 },
      { x: 309, z: -82 },
      goal,
    ]) {
      console.log("Coastal recovery leg", target, (await d.info()).health);
      await a.surfaceTo(target);
      assert.ok((await d.info()).health > 0, "survive the coast route");
    }
  } finally {
    await page.keyboard.up("ControlLeft");
  }
  await a.move(goal.x, goal.z);
  await wait(800);
  assert.ok(await d.count("diamond_pick"), "retrieve the real diamond pick");
  assert.ok((await d.count("enderPearl")) >= 8, "retrieve eight real dropped pearls");
  assert.ok((await d.count("blazeRod")) >= 14, "retrieve fourteen real dropped rods");
  const h = createModernHunting(page, d, a, { arrowReserve: 0 });
  h.activate();
  await a.eat();
  await h.guard();
  console.log("Coastal gear recovery", await d.info());
  await chapter("海岸側から落としたパール・ロッド・装備を回収", 4.6);
}
