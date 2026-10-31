/** Replant the harvested tree on the actual remaining soil. */
import assert from "node:assert/strict";
import { hostile } from "../lib/combat-policy.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  const guard = async () => {
    const p = (await d.info()).position;
    const t = (await a.adventure()).creatures.find(
      (m) =>
        m.hp > 0 &&
        hostile(m) &&
        Math.hypot(m.position.x - p.x, m.position.y - p.y, m.position.z - p.z) <
          (m.species === "skeleton" ? 18 : 9),
    );
    if (t) throw Error(`Safety checkpoint: ${t.species} near replanting`);
    return false;
  };
  a.setGuard(guard);
  d.setThreatHandler(guard);
  const site = meta.livingTree.site,
    here = (await d.info()).position;
  const soil = { x: site.x, y: Math.round(here.y) - 1, z: site.z },
    plant = { ...soil, y: soil.y + 1 };
  assert.ok([1, 2].includes(await d.block(soil)), "use the real remaining soil");
  assert.equal(await d.block(plant), 0, "plant only in actual air");
  assert.ok(await d.count("sapling"), "own a replacement actually dropped by leaves");
  d.setGoal("回収した苗木を、残っている土の上に植え直します。");
  await d.walk(site.x + 0.5, site.z + 0.5, false, 0.16, 0);
  await d.equip("sapling");
  await d.aim({ x: soil.x + 0.5, y: soil.y + 0.5, z: soil.z + 0.5 }, 0);
  const hit = await page.evaluate(() => window.__mc.target());
  assert.ok(hit && hit.x === soil.x && hit.y === soil.y && hit.z === soil.z, "aim at actual soil");
  const before = await d.count("sapling");
  await a.right();
  assert.equal(await d.block(plant), 25, "actually replant the sapling");
  meta.livingTree = {
    site: plant,
    plantedTime: await page.evaluate(() => window.__mc.time()),
    health: (await d.info()).health,
  };
  meta.livingWood = {
    site: plant,
    logsAfter: await d.count("log"),
    saplingsBefore: before,
    saplingsAfter: await d.count("sapling"),
    replanted: true,
    health: (await d.info()).health,
  };
  flush();
  console.log("Living replanted tree", JSON.stringify(meta.livingWood));
  await chapter("木材を収穫し、回収した苗木を植え直す", 9);
}
