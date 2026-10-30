import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, meta, chapter, flush }) {
  a.setGuard(async () => false);
  d.setGoal("通常復活から海岸へ戻り、落とした道具と素材を回収します。");
  const v = meta.village,
    c = v.cacheChest;
  const p = (await d.info()).position;
  if (p.x > v.x + 3) {
    await a.move(v.x + 7.5, v.z + 2.5, true);
    await a.move(v.x + 7.5, v.z + 1.5, true);
  }
  await a.surfaceTo({ x: c.x - 1, z: c.z });
  await a.useAt(c);
  await page.waitForSelector('[data-area="chest"]');
  for (const label of ["木のツルハシ", "土"]) {
    const slot = await page.$$eval(
      '[data-area="chest"]',
      (els, label) => els.findIndex((e) => e.querySelector("img")?.alt === label),
      label,
    );
    if (slot < 0) continue;
    const free = (await d.info()).inventory.findIndex((s) => s === null);
    assert.ok(free >= 0);
    await page.locator(`[data-area="chest"][data-slot="${slot}"]`).click();
    await page.locator(`[data-area="inventory"][data-slot="${free}"]`).click();
  }
  await d.close();
  assert.ok(await d.count("wood_pick"), "retrieve the actual cached spare tool");
  a.setGuard(async () => {
    const state = await d.info();
    assert.ok(state.health > 0, "survive the daylight equipment recovery");
    const target = await page.evaluate(() => {
      const p = window.__mc.position(),
        eye = window.__mc.eyeHeight();
      return window.__mc
        .adventure()
        .creatures.find(
          (m) =>
            m.hp > 0 &&
            m.species === "wanderer" &&
            m.fuse === 2 &&
            Math.hypot(m.position.x - p.x, m.position.y + 0.7 - p.y - eye, m.position.z - p.z) < 3,
        );
    });
    if (target) {
      await page.keyboard.up("KeyW");
      await page.keyboard.up("Space");
      await d.equip((await d.count("iron_sword")) ? "iron_sword" : "wood_pick");
      await d.aim({ ...target.position, y: target.position.y + 0.7 }, 0);
      await d.releaseAttack();
      await page.mouse.down();
      await wait(420);
      await page.mouse.up();
      return true;
    }
    return false;
  });
  const goal = meta.lastDeath;
  assert.ok(goal && goal.x > 230 && goal.z < -110, "recover the actual tenth death");
  for (const q of [{ x: 213, z: -105 }, { x: 240, z: -121 }, goal]) {
    console.log("Tenth recovery leg", q, (await d.info()).health);
    await a.surfaceTo(q);
    await a.eat();
  }
  await a.move(goal.x, goal.z, true);
  await wait(700);
  assert.ok(await d.count("diamond_pick"), "recover actual diamond pick");
  assert.ok(
    (await d.count("enderPearl")) >= 9 && (await d.count("blazeRod")) >= 14,
    "recover actual progression materials",
  );
  await d.equip("iron_sword");
  for (let i = 0; i < 8; i++) if (!(await d.checkThreat())) break;
  meta.tenthRecovery = await d.info();
  flush();
  await chapter("海岸で落としたパール9個とロッド14本、装備を回収", 4.85);
}
