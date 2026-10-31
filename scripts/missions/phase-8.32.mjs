/** Check a real one-block rise without mining or consuming the ground. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
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
    if (t) throw Error(`Safety checkpoint: ${t.species} near stepping test`);
    return false;
  };
  a.setGuard(guard);
  d.setThreatHandler(guard);
  const p = (await d.info()).position,
    base = { x: Math.floor(p.x), y: Math.round(p.y), z: Math.floor(p.z) };
  let site;
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const c = { x: base.x + dx, y: base.y, z: base.z + dz },
      under = await d.block(c);
    if (
      [1, 2, 3, 4, 9, 11].includes(under) &&
      (await d.block({ ...c, y: c.y + 1 })) === 0 &&
      (await d.block({ ...c, y: c.y + 2 })) === 0
    ) {
      site = { ...c, under };
      break;
    }
  }
  assert.ok(site, "find an actual clear one-block rise");
  const before = (await d.info()).inventory.find((s) => s?.id === "diamond_pick")?.durability;
  d.setGoal("段差は壊さずに跳んで上り、足場と道具の消耗を抑えます。");
  await d.walk(site.x + 0.5, site.z + 0.5, true, 0.16, 0);
  await page.waitForFunction(
    (y) => window.__mc.position().y >= y - 0.08,
    { timeout: 6000 },
    site.y + 1,
  );
  await wait(800);
  assert.equal(await d.block(site), site.under, "preserve the actual ground");
  assert.ok(Math.abs((await d.info()).position.y - site.y - 1) < 0.15, "land on the rise");
  const after = (await d.info()).inventory.find((s) => s?.id === "diamond_pick")?.durability;
  assert.equal(after, before, "do not spend pick durability");
  meta.livingStep = { site, before, after, health: (await d.info()).health };
  flush();
  console.log("Living actual safe step", JSON.stringify(meta.livingStep));
  await chapter("段差の土を壊さずに上る", 9);
}
