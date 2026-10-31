/** Replant actual empty farmland from directly above its supported surface. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { hostile } from "../lib/combat-policy.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  const danger = async () => {
    const p = (await d.info()).position;
    const t = (await a.adventure()).creatures.find(
      (m) =>
        m.hp > 0 &&
        hostile(m) &&
        Math.hypot(m.position.x - p.x, m.position.y - p.y, m.position.z - p.z) <
          (m.species === "skeleton" ? 18 : 9),
    );
    if (t) throw Error(`Safety checkpoint: ${t.species} near farmland`);
    return false;
  };
  a.setGuard(danger);
  d.setThreatHandler(danger);
  d.setGoal("空いた耕地を一つずつ確認し、実際に種を植え直します。");
  const plots = await page.evaluate(() => {
    const out = [];
    for (let x = 200; x <= 203; x++)
      for (let z = -83; z <= -80; z++)
        if (window.__mc.blockAt(x, 34, z) === 21 && window.__mc.blockAt(x, 35, z) === 0)
          out.push({ x, y: 35, z });
    return out;
  });
  const before = await d.count("seeds");
  let replanted = 0;
  const failed = [];
  for (const c of plots) {
    await danger();
    assert.ok((await d.count("seeds")) > 1, "retain seed for future crops");
    await d.walk(c.x + 0.5, c.z + 0.5, false, 0.16, 0);
    await d.equip("seeds");
    await d.aim({ x: c.x + 0.5, y: 34.5, z: c.z + 0.5 }, 0);
    const hit = await page.evaluate(() => window.__mc.target());
    if (!hit || hit.x !== c.x || hit.y !== 34 || hit.z !== c.z) {
      failed.push({ ...c, hit });
      continue;
    }
    await a.right();
    await wait(120);
    if ([22, 23].includes(await d.block(c))) replanted++;
    else failed.push(c);
  }
  meta.livingFieldRepair = {
    initialEmpty: plots.length,
    replanted,
    failed,
    seedsBefore: before,
    seedsAfter: await d.count("seeds"),
    health: (await d.info()).health,
  };
  flush();
  console.log("Actual field replant", JSON.stringify(meta.livingFieldRepair));
  assert.equal(failed.length, 0, "plant each observed empty plot");
  await chapter("空いた耕地を確認し、種を植え直す", 9);
}
