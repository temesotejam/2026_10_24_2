/** Plant a sapling in a real clear grass patch outside the village field. */
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
    if (t) throw Error(`Safety checkpoint: ${t.species} near tree site`);
    return false;
  };
  a.setGuard(guard);
  d.setThreatHandler(guard);
  assert.ok(await d.count("sapling"), "start from a genuinely held sapling");
  d.setGoal("畑から離れた草地に苗木を植え、将来の木材を育てます。");
  const site = await page.evaluate(() => {
    const p = window.__mc.position(),
      o = [];
    for (let x = 184; x <= 208; x++)
      for (let z = -97; z <= -87; z++)
        if (
          [1, 2].includes(window.__mc.blockAt(x, 34, z)) &&
          [35, 36, 37, 38, 39, 40].every((y) => window.__mc.blockAt(x, y, z) === 0)
        )
          o.push({ x, y: 35, z, d: Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) });
    return o.sort((a, b) => a.d - b.d)[0] ?? null;
  });
  assert.ok(site, "find clear supported ground for a sapling");
  await a.surfaceTo(site);
  await d.walk(site.x + 0.5, site.z + 0.5, false, 0.16, 0);
  await d.equip("sapling");
  await d.aim({ x: site.x + 0.5, y: 34.5, z: site.z + 0.5 }, 0);
  const hit = await page.evaluate(() => window.__mc.target());
  assert.ok(hit && hit.x === site.x && hit.y === 34 && hit.z === site.z, "aim at the real grass");
  await a.right();
  assert.equal(await d.block(site), 25, "plant the carried sapling");
  meta.livingTree = {
    site: { x: site.x, y: site.y, z: site.z },
    plantedTime: await page.evaluate(() => window.__mc.time()),
    health: (await d.info()).health,
  };
  flush();
  console.log("Living planted tree", JSON.stringify(meta.livingTree));
  await chapter("村の草地に苗木を植えて木材を育てる", 9);
}
