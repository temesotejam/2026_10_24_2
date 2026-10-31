/** Make a reusable wooden axe from the wood actually grown and harvested. */
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
    if (t) throw Error(`Safety checkpoint: ${t.species} near crafting`);
    return false;
  };
  a.setGuard(guard);
  d.setThreatHandler(guard);
  const site = meta.livingWood?.site;
  assert.ok(site && meta.livingWood.replanted);
  assert.equal(await d.block(site), 25, "observe the actually replanted sapling");
  meta.livingTree = { site, observedAt: await page.evaluate(() => window.__mc.time()) };
  const before = {
    logs: await d.count("log"),
    planks: await d.count("planks"),
    sticks: await d.count("stick"),
  };
  assert.ok(before.logs >= 1 && before.sticks >= 2, "use earned wood and sticks");
  d.setGoal("育てた木材の一部で木の斧を作り、次から木を短時間で収穫します。");
  await d.open();
  await d.make("planks");
  await d.close();
  assert.equal(await d.count("log"), before.logs - 1, "use an actually grown log");
  const table = await d.station("table");
  await d.make("wood_axe");
  assert.ok(await d.count("wood_axe"), "make a real wooden axe");
  await d.close();
  await d.mine(table);
  await wait(500);
  await d.collect("table", 1);
  meta.livingAxe = {
    logsBefore: before.logs,
    logsAfter: await d.count("log"),
    planksBefore: before.planks,
    planksAfter: await d.count("planks"),
    sticksBefore: before.sticks,
    sticksAfter: await d.count("stick"),
    durability: (await d.info()).inventory.find((s) => s?.id === "wood_axe")?.durability,
    health: (await d.info()).health,
  };
  flush();
  console.log("Living renewable axe", JSON.stringify(meta.livingAxe));
  await chapter("育てた木材から木の斧を作る", 9);
}
