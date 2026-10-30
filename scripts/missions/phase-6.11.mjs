/** Retrieve this run's real Nether doorway drops and leave without a new hunt. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { createModernPortal } from "../lib/modern-portal.mjs";
import { restInVillage } from "../lib/village-rest.mjs";

export async function run({ page, d, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  const portal = createModernPortal(page, d, a),
    gate = meta.netherGate;
  assert.ok(
    meta.lastDeath && Math.hypot(meta.lastDeath.x - gate.x, meta.lastDeath.z - gate.z) < 4,
    "recover the actual gate-side Nether death",
  );
  d.setGoal("復活地点からゲートへ戻り、入口に落とした装備とロッドを回収して帰還します。");
  if ((await a.adventure()).dimension === "overworld") {
    await page.keyboard.down("ControlLeft");
    try {
      await a.move(meta.portal.entry.x + 0.5, meta.portal.entry.z + 2.5, false, 0.2);
      await portal.enterNetherPortal("nether", meta.portal.entry);
    } finally {
      await page.keyboard.up("ControlLeft");
    }
  }
  await wait(200);
  if (!(await d.count("diamond_pick"))) {
    await a.move(meta.lastDeath.x - 0.5, meta.lastDeath.z + 0.2, false, 0.2);
    await wait(200);
  }
  assert.ok(await d.count("diamond_pick"), "retrieve the actual dropped diamond pickaxe");
  assert.ok((await d.count("blazeRod")) >= 14, "retrieve fourteen earned rods");
  assert.equal(await d.count("enderPearl"), 2);
  await d.equip("iron_sword");
  const until = Date.now() + 3500;
  while (Date.now() < until) {
    const s = await d.info();
    assert.ok(s.health > 0, "survive the short gate recovery");
    const mob = (await a.adventure()).creatures.find(
      (m) =>
        m.hp > 0 &&
        m.species === "ember" &&
        Math.hypot(
          m.position.x - s.position.x,
          m.position.y - s.position.y,
          m.position.z - s.position.z,
        ) < 2.8,
    );
    if (!mob) break;
    await d.aim({ ...mob.position, y: mob.position.y + 0.8 }, 0);
    await d.releaseAttack();
    await page.mouse.down();
    await wait(80);
    await d.releaseAttack();
    await wait(280);
  }
  meta.netherGateRecovery = { actualRecovered: await d.info() };
  flush();
  await portal.enterNetherPortal("overworld", gate);
  assert.equal((await a.adventure()).dimension, "overworld");
  assert.ok((await d.info()).health > 0);
  assert.ok((await d.count("blazeRod")) >= 14);
  if (
    await page.evaluate(() => {
      const t = window.__mc.time() % 1200;
      return t >= 744 || t < 24;
    })
  )
    await restInVillage(page, d, a, meta.village, meta, flush);
  meta.netherGateRecovery.returned = await d.info();
  flush();
  await chapter("ネザーの入口で実際の装備とロッド14本を回収し、通常世界へ帰還", 4);
}
