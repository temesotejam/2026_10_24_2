/** Harvest a grown tree only after finding a replacement sapling, then replant. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { hostile } from "../lib/combat-policy.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  const guard = async () => {
    const time = await page.evaluate(() => window.__mc.time());
    if (time % 1200 >= 680) throw Error("Safety checkpoint: return to bed before night");
    const p = (await d.info()).position;
    const t = (await a.adventure()).creatures.find(
      (m) =>
        m.hp > 0 &&
        hostile(m) &&
        Math.hypot(m.position.x - p.x, m.position.y - p.y, m.position.z - p.z) <
          (m.species === "skeleton" ? 18 : 9),
    );
    if (t) throw Error(`Safety checkpoint: ${t.species} near the tree`);
    return false;
  };
  a.setGuard(guard);
  d.setThreatHandler(guard);
  const site = meta.livingWood?.replanted ? meta.livingWood.site : meta.livingTree?.site;
  assert.ok(site && meta.livingDay?.slept, "start after the real night sleep");
  d.setGoal("朝になったので、育った木を見に行き、苗木を確保してから木材を使います。");
  const beforeRoute = (await d.info()).inventory.find((s) => s?.id === "diamond_pick")?.durability;
  await a.surfaceTo({ x: site.x - 1, z: site.z });
  await d.walk(site.x - 0.5, site.z + 0.5, false, 0.2, 0);
  assert.equal(await d.block(site), 6, "the planted sapling actually became wood");
  const pickBefore = (await d.info()).inventory.find((s) => s?.id === "diamond_pick")?.durability;
  const logsBefore = await d.count("log"),
    saplingsBefore = await d.count("sapling");
  let leaves = 0;
  const axeBefore = (await d.info()).inventory.find((s) => s?.id === "wood_axe")?.durability;
  async function breakWithoutPick(cell, held = "stick") {
    await guard();
    await d.equip(held);
    await d.aim({ x: cell.x + 0.5, y: cell.y + 0.5, z: cell.z + 0.5 }, 0);
    const hit = await page.evaluate(() => window.__mc.target());
    if (!hit || hit.x !== cell.x || hit.y !== cell.y || hit.z !== cell.z) return false;
    const id = await d.block(cell),
      until = Date.now() + 6000;
    await page.mouse.down();
    try {
      while ((await d.block(cell)) === id) {
        await guard();
        assert.ok((await d.info()).health > 0, "remain alive while harvesting");
        assert.ok(Date.now() < until, "finish ordinary hand harvest");
        await wait(80);
      }
    } finally {
      await page.mouse.up();
    }
    await wait(1200);
    return true;
  }
  const replacementGoal = Math.max(2, saplingsBefore);
  for (let i = 0; i < 16 && (await d.count("sapling")) < replacementGoal; i++) {
    const p = (await d.info()).position;
    const leavesNearby = await page.evaluate(
      ({ site, p }) => {
        const r = [];
        for (let x = site.x - 2; x <= site.x + 2; x++)
          for (let z = site.z - 2; z <= site.z + 2; z++)
            for (let y = site.y + 3; y <= site.y + 5; y++)
              if (window.__mc.blockAt(x, y, z) === 7) {
                const dist = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y - 1.62, z + 0.5 - p.z);
                if (dist < 3.8) r.push({ x, y, z, d: dist });
              }
        return r.sort((a, b) => a.d - b.d);
      },
      { site, p },
    );
    let broken = false;
    for (const cell of leavesNearby) {
      if (await breakWithoutPick(cell)) {
        leaves++;
        broken = true;
        break;
      }
    }
    if (!broken) break;
  }
  if ((await d.count("sapling")) < replacementGoal) {
    meta.livingWood = {
      deferred: true,
      reason: "replacement sapling not found; standing tree preserved",
      leaves,
      health: (await d.info()).health,
    };
    flush();
    console.log("Living wood deferred", JSON.stringify(meta.livingWood));
    await chapter("苗木を確保できるまで伐採を延期", 9);
    return;
  }
  d.setGoal("苗木を確保したので、木材を収穫して同じ場所へ植え直します。");
  for (let y = site.y; y < site.y + 4; y++) {
    const cell = { ...site, y };
    assert.equal(await d.block(cell), 6, "harvest only the real grown trunk");
    assert.ok(
      await breakWithoutPick(cell, axeBefore ? "wood_axe" : "stick"),
      "reach the selected trunk block",
    );
  }
  await d.collect("log", logsBefore + 4);
  const soilBefore = await d.block({ ...site, y: site.y - 1 });
  assert.ok([1, 2].includes(soilBefore), "keep the original planting soil");
  // The tree may stand one block higher than the approach. Jump onto its
  // support instead of clearing the soil as a walking obstruction.
  await d.walk(site.x + 0.5, site.z + 0.5, true, 0.16, 0);
  await page.waitForFunction(
    (y) => Math.abs(window.__mc.position().y - y) < 0.08,
    { timeout: 6000 },
    site.y,
  );
  await wait(250);
  assert.equal(await d.block({ ...site, y: site.y - 1 }), soilBefore, "preserve planting soil");
  await d.equip("sapling");
  await d.aim({ x: site.x + 0.5, y: site.y - 0.5, z: site.z + 0.5 }, 0);
  const soil = await page.evaluate(() => window.__mc.target());
  assert.ok(
    soil && soil.x === site.x && soil.y === site.y - 1 && soil.z === site.z,
    "aim at the actual planting soil",
  );
  await a.right();
  assert.equal(await d.block(site), 25, "replant the actually recovered sapling");
  const pickAfter = (await d.info()).inventory.find((s) => s?.id === "diamond_pick")?.durability;
  assert.equal(pickAfter, pickBefore, "do not wear the valuable pick on leaves or wood");
  meta.livingWood = {
    site,
    leaves,
    logsBefore,
    logsAfter: await d.count("log"),
    saplingsBefore,
    saplingsAfter: await d.count("sapling"),
    replanted: true,
    pickBefore,
    pickAfter,
    axeBefore,
    axeAfter: (await d.info()).inventory.find((s) => s?.id === "wood_axe")?.durability,
    routePickBefore: beforeRoute,
    health: (await d.info()).health,
  };
  flush();
  console.log("Living actual wood cycle", JSON.stringify(meta.livingWood));
  await chapter("育てた木を収穫し、得た苗木を同じ場所に植え直す", 9);
}
