/** Bring owned stored blocks to recover the real raised doorway corpse. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { createModernPortal } from "../lib/modern-portal.mjs";
import { restInVillage } from "../lib/village-rest.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  const portal = createModernPortal(page, d, a),
    gate = meta.netherGate,
    grave = meta.lastDeath,
    v = meta.village;
  assert.ok(Math.hypot(grave.x - gate.x, grave.z - gate.z) < 6);
  if ((await a.adventure()).dimension === "overworld") {
    const bed = meta.bedLocation ?? { x: v.x + 6, y: v.y, z: v.z + 5 };
    const before = await page.evaluate(() => window.__mc.time());
    await a.useAt(bed);
    await wait(500);
    const after = await page.evaluate(() => ({
      time: window.__mc.time(),
      notice: document.querySelector("#toast")?.textContent,
    }));
    (meta.bedVisits ??= []).push({
      before,
      after: after.time,
      slept: after.time - before > 10,
      notice: after.notice,
    });
    flush();
    d.setGoal("保管していた土をチェストから取り出し、落とした装備への足場に使います。");
    const chest = v.cacheChest ?? { x: v.x - 7, y: v.y, z: v.z + 5 };
    await a.surfaceTo({ x: chest.x + 1, z: chest.z });
    for (let attempt = 0; attempt < 8; attempt++) {
      await d.aim({ x: chest.x + 0.5, y: chest.y + 0.7, z: chest.z + 0.5 });
      const hit = await page.evaluate(() => window.__mc.target());
      assert.ok(hit);
      if (hit.x === chest.x && hit.y === chest.y && hit.z === chest.z) break;
      assert.ok(![8, 14, 15, 28, 31, 38, 39, 40].includes(await d.block(hit)));
      await d.mine(hit);
    }
    await a.useAt(chest);
    await page.waitForSelector('[data-area="chest"]');
    const stored = await page.$$eval('[data-area="chest"]', (els) =>
      els
        .map((el, i) => ({
          i,
          name: el.querySelector("img")?.alt,
          count: Number(el.querySelector(".item-count")?.textContent) || 1,
        }))
        .find((s) => s.name === "土" && s.count >= 8),
    );
    assert.ok(stored, "retrieve only the dirt actually stored in this run");
    const free = (await d.info()).inventory.findIndex((s) => s === null);
    assert.ok(free >= 0);
    await page.locator(`[data-area="chest"][data-slot="${stored.i}"]`).click();
    for (let i = 0; i < Math.min(16, stored.count); i++)
      await page.locator(`[data-area="inventory"][data-slot="${free}"]`).click({ button: "right" });
    await d.close();
    assert.ok((await d.count("dirt")) >= 8);
    await a.surfaceTo({ x: meta.portal.entry.x, z: meta.portal.entry.z + 2 });
    await portal.enterNetherPortal("nether", meta.portal.entry);
  }
  d.setGoal("持参した土で足場を作り、ゲート近くの高い位置に落とした装備を拾います。");
  const arrived = (await d.info()).position;
  await d.tunnelTo({ x: Math.floor(arrived.x), z: gate.z + 2 });
  await d.tunnelTo({ x: Math.floor(grave.x), z: gate.z + 2 });
  await a.pillarTo(Math.round(grave.y) - 1);
  await d.tunnelTo({ x: Math.floor(grave.x), z: Math.floor(grave.z) + 1 });
  await wait(400);
  assert.ok(await d.count("diamond_pick"), "pick up the actual raised corpse tools");
  assert.ok(
    (await d.count("blazeRod")) >= 8,
    "retrieve the eight rods earned by sixteen actual kills",
  );
  meta.gearRecoveries ??= [];
  meta.gearRecoveries.push({
    position: (await d.info()).position,
    inventory: (await d.info()).inventory,
    time: await page.evaluate(() => window.__mc.time()),
  });
  flush();
  await d.equip("iron_sword");
  await d.tunnelTo({ x: Math.floor(grave.x), z: gate.z + 2 });
  await d.center();
  while ((await d.info()).position.y > gate.y + 0.2) {
    const p = (await d.info()).position;
    await d.mine({ x: Math.floor(p.x), y: Math.round(p.y) - 1, z: Math.floor(p.z) });
    await wait(400);
  }
  await d.tunnelTo({ x: Math.floor(arrived.x), z: gate.z + 2 });
  await portal.enterNetherPortal("overworld", gate);
  assert.equal((await a.adventure()).dimension, "overworld");
  assert.ok((await d.info()).health > 0);
  await restInVillage(page, d, a, v, meta, flush);
  await chapter("実際に落とした装備とロッド8本を回収し、通常世界へ帰還", 7);
}
