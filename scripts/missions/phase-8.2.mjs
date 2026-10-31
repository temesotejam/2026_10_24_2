/** A cautious, renewable village routine using only ordinary survival inputs. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { hostile } from "../lib/combat-policy.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  const danger = async () => {
    const p = (await d.info()).position,
      m = (await a.adventure()).creatures.filter((x) => x.hp > 0 && hostile(x));
    const t = m.find(
      (x) =>
        Math.hypot(x.position.x - p.x, x.position.y - p.y, x.position.z - p.z) <
        (x.species === "skeleton" ? 18 : 9),
    );
    if (t) throw Error(`Safety checkpoint: ${t.species} approaches the village`);
    return false;
  };
  a.setGuard(danger);
  d.setThreatHandler(danger);
  assert.ok((await d.info()).health > 0, "start alive");
  const now = await page.evaluate(() => window.__mc.time());
  assert.ok(now % 1200 < 680, "start work with enough daylight to reach the bed");
  meta.livingCycles ??= meta.livingSustainable ? [meta.livingSustainable] : [];
  const seedsBefore = await d.count("seeds"),
    pickBefore = (await d.info()).inventory.find((s) => s?.id === "diamond_pick")?.durability;
  d.setGoal("畑から必要な分だけ収穫し、種を残してすぐ植え直します。");
  let planted = 0,
    harvested = 0;
  for (let i = 0; i < 4; i++) {
    await danger();
    const c = await page.evaluate(() => {
      const p = window.__mc.position(),
        r = [];
      for (let x = 198; x <= 203; x++)
        for (let z = -83; z <= -80; z++)
          if (window.__mc.blockAt(x, 35, z) === 23)
            r.push({ x, y: 35, z, d: Math.hypot(p.x - x - 0.5, p.z - z - 0.5) });
      return r.sort((a, b) => a.d - b.d)[0] ?? null;
    });
    if (!c || c.d > 3.8) break;
    assert.ok((await d.count("seeds")) > 1, "retain seed before harvesting");
    assert.equal(await d.block({ ...c, y: c.y - 1 }), 21, "harvest only renewable farmland");
    await d.walk(c.x + 0.5, c.z + 0.5, false, 0.16, 0);
    await d.equip("stick");
    await d.aim({ x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 }, 0);
    const cropHit = await page.evaluate(() => window.__mc.target());
    assert.ok(
      cropHit && cropHit.x === c.x && cropHit.y === c.y && cropHit.z === c.z,
      "do not accidentally break neighboring seedlings",
    );
    await d.mine(c);
    await wait(500);
    assert.equal(await d.block(c), 0, "harvest the selected crop");
    harvested++;
    await d.equip("seeds");
    await d.aim({ x: c.x + 0.5, y: c.y - 0.5, z: c.z + 0.5 }, 0);
    const soilHit = await page.evaluate(() => window.__mc.target());
    assert.ok(
      soilHit && soilHit.x === c.x && soilHit.y === c.y - 1 && soilHit.z === c.z,
      "aim at the selected farmland before planting",
    );
    await a.right();
    await wait(150);
    assert.ok([22, 23].includes(await d.block(c)), "actually replant each harvested crop");
    planted++;
  }
  assert.ok(harvested > 0 && planted === harvested, "replant every harvested crop");
  const pickAfter = (await d.info()).inventory.find((s) => s?.id === "diamond_pick")?.durability;
  assert.equal(pickAfter, pickBefore, "do not wear the pick on crops");
  const wheat = await d.count("wheat");
  let made = 0;
  if (wheat >= 3) {
    const table = await d.station("table");
    while ((await d.count("wheat")) >= 3) {
      await d.make("bread");
      made++;
    }
    await d.close();
    await a.eat();
    // Leave the real table in the village as a reusable station when inventory is full.
    if ((await d.info()).inventory.some((s) => s === null)) {
      await d.mine(table);
      await wait(500);
      await d.collect("table", 1);
    }
  }
  const bed = { x: 202, y: 35, z: -72 };
  assert.equal(await d.block(bed), 15, "keep a real village bed");
  meta.livingSustainable = {
    harvested,
    planted,
    seedsBefore,
    seedsAfter: await d.count("seeds"),
    pickBefore,
    pickAfter,
    breadMade: made,
    health: (await d.info()).health,
    time: await page.evaluate(() => window.__mc.time()),
    bed,
  };
  meta.livingCycles.push(meta.livingSustainable);
  flush();
  console.log("Living renewable routine", JSON.stringify(meta.livingSustainable));
  await chapter("少量収穫して植え直し、道具を節約しながらパンを作る", 9);
}
