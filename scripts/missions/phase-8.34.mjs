/** Wait for the replanted tree during daylight, then test the renewable wood cycle. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { hostile } from "../lib/combat-policy.mjs";

export async function run(ctx) {
  const { page, d, a, meta, flush, chapter } = ctx;
  const site = meta.livingTree?.site;
  assert.ok(site && meta.livingWood?.replanted && meta.livingDay?.slept);
  const guard = async () => {
    const p = (await d.info()).position;
    const t = (await a.adventure()).creatures.find(
      (m) =>
        m.hp > 0 &&
        hostile(m) &&
        Math.hypot(m.position.x - p.x, m.position.y - p.y, m.position.z - p.z) <
          (m.species === "skeleton" ? 18 : 9),
    );
    if (t) throw Error(`Safety checkpoint: ${t.species} near the village`);
    return false;
  };
  a.setGuard(guard);
  d.setThreatHandler(guard);
  d.setGoal("苗木が育つ間、安全な寝床の近くで待ちます。");
  await a.surfaceTo({ x: 203, z: -72 });
  const deadline = Date.now() + 360000;
  let grownAt = null;
  while (Date.now() < deadline) {
    await d.checkThreat();
    assert.ok((await d.info()).health > 0, "remain alive while waiting");
    await a.eat();
    const time = await page.evaluate(() => window.__mc.time());
    if ((await d.block(site)) === 6) {
      grownAt = time;
      break;
    }
    if (time % 1200 >= 620) break;
    await wait(800);
  }
  meta.livingSecondTree = { grownAt, site, health: (await d.info()).health };
  flush();
  if (grownAt === null) {
    await chapter("日暮れに備え、木の収穫を翌日に延期", 9);
    return;
  }
  d.setGoal("木が育ちました。日が暮れる前に、苗木を確保して木の斧で収穫します。");
  const wood = await import("./phase-8.29.mjs");
  await wood.run(ctx);
  a.setGuard(guard);
  d.setThreatHandler(guard);
  await a.surfaceTo({ x: 203, z: -72 });
  meta.livingSecondTree.completed = !!meta.livingWood?.replanted;
  meta.livingSecondTree.health = (await d.info()).health;
  flush();
  await chapter("木を収穫して植え直し、寝床の近くへ戻る", 9);
}
