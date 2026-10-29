import assert from "node:assert/strict";
import { stockVillageFood, gatherFlint, craftFlintSteel } from "../lib/modern-resources.mjs";
import { gatherWood } from "../lib/modern-wood.mjs";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, meta, chapter }) {
  const v = meta.village;
  assert.ok(v);
  if (!(await d.count("diamond_pick"))) {
    d.setThreatHandler(null);
    d.setGoal("復活地点から歩いて戻り、死亡時に落とした道具を回収します。");
    await a.surfaceTo(meta.lastDeath);
    await a.move(meta.lastDeath.x, meta.lastDeath.z);
    await wait(1200);
    assert.ok(await d.count("diamond_pick"), "recover the actual items dropped on death");
  }
  const h = createModernHunting(page, d, a);
  h.activate();
  await h.guard();
  await a.eat();
  if (await d.count("bread")) {
    d.setGoal("食料を使って体力を十分に回復してから、作業を続けます。");
    await a.recover(18);
  }
  if (!(await d.count("table"))) {
    const placed = await page.evaluate(() => {
      const p = window.__mc.position(),
        found = [];
      for (let x = Math.floor(p.x) - 4; x <= p.x + 4; x++)
        for (let z = Math.floor(p.z) - 4; z <= p.z + 4; z++)
          for (let y = Math.floor(p.y) - 1; y <= p.y + 1; y++)
            if (window.__mc.blockAt(x, y, z) === 12)
              found.push({ x, y, z, d: Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y, z + 0.5 - p.z) });
      return found.sort((a, b) => a.d - b.d)[0];
    });
    assert.ok(placed, "recover the placed crafting table after an interrupted tool craft");
    await d.equip("iron_pick");
    await d.mine(placed);
    await wait(600);
    await d.collect("table", 1);
  }
  // Recover the same saved adventure after the defensive controller stalled.
  if ((await d.count("bread")) < 3 && (await d.count("wheat")) >= 3) {
    d.setGoal("収穫した小麦をすぐにパンにして、冒険を立て直します。");
    const table = await d.station("table");
    while ((await d.count("wheat")) >= 3) await d.make("bread");
    await d.close();
    await a.eat();
    await d.equip("iron_pick");
    await d.mine(table);
    await wait(400);
    await d.collect("table", 1);
  }
  await h.guard();
  await a.eat();

  await stockVillageFood(d, page, a, v, { breadTarget: 24, waitForGrowth: false });
  await a.recover(18);
  await gatherWood(page, d, a, 48);
  await a.eat();
  await a.recover(18);
  await gatherFlint(d, page, a, { targetCount: 10, maxAttempts: 200 });
  await craftFlintSteel(d);
  await a.surfaceTo({ x: v.x + 2, z: v.z + 1 });
  d.setGoal("村の井戸から水を汲み、黒曜石の採掘に備えます。");
  await d.equip("bucket");
  await a.useAt({ x: v.x, y: v.y - 1, z: v.z });
  await wait(400);
  assert.ok(await d.count("waterBucket"), "fill an owned bucket from natural well water");
  await stockVillageFood(d, page, a, v, {
    breadTarget: 24,
    waitForGrowth: true,
    timeoutMs: 480000,
  });
  // A spare sword is crafted from the iron mined in this same playthrough.
  const table = await d.station("table");
  if ((await d.count("stick")) < 2) await d.make("sticks");
  if ((await d.count("iron")) >= 2) await d.make("iron_sword");
  await d.close();
  await d.equip("iron_pick");
  await d.mine(table);
  await wait(500);
  await d.collect("table", 1);
  await chapter("パン・木材・天然の火打石・水・予備の剣を用意", 4);
}
