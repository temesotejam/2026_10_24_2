/** Work while crops grow, return before night, and actually use the bed. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { hostile } from "../lib/combat-policy.mjs";
export async function run(ctx) {
  const { page, d, a, meta, flush, chapter } = ctx;
  const guard = async () => {
    const p = (await d.info()).position;
    const t = (await a.adventure()).creatures.find(
      (m) =>
        m.hp > 0 &&
        hostile(m) &&
        Math.hypot(m.position.x - p.x, m.position.y - p.y, m.position.z - p.z) <
          (m.species === "skeleton" ? 18 : 9),
    );
    if (t) throw Error(`Safety checkpoint: ${t.species} before bedtime`);
    return false;
  };
  a.setGuard(guard);
  d.setThreatHandler(guard);
  assert.ok(meta.livingTree?.site, "use the genuinely planted sapling");
  const bed = { x: 202, y: 35, z: -72 };
  assert.equal(await d.block(bed), 15, "existing village bed");
  d.setGoal("明るいうちに畑を手入れし、暗くなる前に寝床へ戻ります。");
  await a.surfaceTo({ x: 200, z: -79 });
  const farm = await import("./phase-8.2.mjs");
  let cycles = 0;
  for (; cycles < 2; cycles++) {
    await guard();
    const now = await page.evaluate(() => window.__mc.time());
    if (now % 1200 >= 620 || (await d.count("bread")) >= 10) break;
    const ready = await page.evaluate(() => {
      const p = window.__mc.position();
      for (let x = 198; x <= 203; x++)
        for (let z = -83; z <= -80; z++)
          if (
            window.__mc.blockAt(x, 35, z) === 23 &&
            Math.hypot(p.x - x - 0.5, p.z - z - 0.5) < 3.8
          )
            return true;
      return false;
    });
    if (!ready) break;
    await farm.run(ctx);
  }
  d.setGoal("日暮れ前にベッドのある家へ戻り、苗木が育つのを確かめます。");
  await a.surfaceTo({ x: 203, z: -72 });
  const start = Date.now(),
    end = start + 360000;
  let grownTime = null;
  while (true) {
    await d.checkThreat();
    assert.ok((await d.info()).health > 0, "remain alive while waiting near the bed");
    await a.eat();
    const t = await page.evaluate(() => window.__mc.time());
    if (grownTime === null && (await d.block(meta.livingTree.site)) === 6) {
      grownTime = t;
      console.log(
        "Actual sapling grew into a tree",
        JSON.stringify({ time: t, site: meta.livingTree.site }),
      );
    }
    if (t % 1200 >= 744) break;
    assert.ok(Date.now() < end, "normal daylight advances towards night");
    await wait(800);
  }
  const before = await page.evaluate(() => window.__mc.time());
  await a.useAt(bed);
  await wait(600);
  const after = await page.evaluate(() => ({
    time: window.__mc.time(),
    notice: document.querySelector("#toast")?.textContent,
  }));
  const slept = after.time - before > 10;
  meta.livingDay = {
    cycles,
    treeGrown: grownTime !== null,
    treeGrownTime: grownTime,
    before,
    after: after.time,
    slept,
    notice: after.notice,
    health: (await d.info()).health,
    bread: await d.count("bread"),
    seeds: await d.count("seeds"),
  };
  flush();
  console.log("Living actual bedtime", JSON.stringify(meta.livingDay));
  assert.ok(slept, "sleep in the actual bed when night comes");
  await chapter("明るいうちに畑を手入れし、夜はベッドで眠る", 9);
}
