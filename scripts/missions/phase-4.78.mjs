import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { stockVillageFood } from "../lib/modern-resources.mjs";
import { createModernHunting } from "../lib/modern-hunting.mjs";

/** Ordinary recovery of the actual part-83 death; never imports a fixture. */
export async function run({ page, d, a, meta, chapter, flush = () => undefined }) {
  // Do not provoke wanderers or interrupt an unarmed daylight supply trip.
  a.setGuard(async () => false);
  const village = meta.village;
  assert.ok(village, "know the original discovered village");
  const death = meta.deaths?.find((entry) => entry.part === "part-83.mp4");
  const goal = death?.position ?? meta.lastDeath;
  assert.ok(
    goal && Math.hypot(goal.x - 272.512453, goal.y - 36, goal.z + 65.617463) < 2,
    "recover the ninth actual death, not the old eastern body",
  );
  d.setGoal("朝の村で予備の道具とパンを用意し、海岸から装備を回収します。");
  // Leave the original bed house through its door before crossing the village.
  await a.move(village.x + 7.5, village.z + 2.5, true);
  await a.move(village.x + 7.5, village.z + 1.5, true);
  await a.surfaceTo({ x: village.x - 6, z: village.z + 1 });
  await a.move(village.x - 5.5, village.z + 3.5, true);
  await a.move(village.x - 5.5, village.z + 5.5, true);
  await a.useAt({ x: 189, y: 35, z: -72 });
  await page.waitForSelector('[data-area="chest"]');
  let slot = -1;
  for (const name of ["石のツルハシ", "木のツルハシ"]) {
    slot = await page.$$eval(
      '[data-area="chest"]',
      (els, label) => els.findIndex((el) => el.querySelector("img")?.alt === label),
      name,
    );
    if (slot >= 0) break;
  }
  assert.ok(slot >= 0, "retrieve the actual original chest spare pickaxe");
  const free = (await d.info()).inventory.findIndex((stack) => stack === null);
  assert.ok(free >= 0, "space for the real spare pickaxe");
  await page.locator(`[data-area="chest"][data-slot="${slot}"]`).click();
  await page.locator(`[data-area="inventory"][data-slot="${free}"]`).click();
  await d.close();
  assert.ok((await d.count("stone_pick")) || (await d.count("wood_pick")));

  const food = await stockVillageFood(d, page, a, village, {
    breadTarget: 16,
    waitForGrowth: true,
  });
  assert.ok(food.complete && (await d.count("bread")) >= 16, "carry real village bread");
  await a.eat();
  const daytime = (await page.evaluate(() => window.__mc.time())) % 1200;
  assert.ok(daytime < 600, "leave enough daylight for unarmed coastal recovery");
  meta.recovery4_78 = { goal, breadBeforeTravel: await d.count("bread"), legs: [] };
  flush();

  for (const target of [
    { x: 213, z: -95 },
    { x: 240, z: -95 },
    { x: 260, z: -80 },
    { x: 272, z: -66 },
  ]) {
    console.log("Daylight coastal recovery leg", target, await d.info());
    await a.surfaceTo(target);
    assert.ok((await d.info()).health > 0, "survive the daylight coastal route");
    await a.eat();
    meta.recovery4_78.legs.push({ target, position: (await d.info()).position });
    flush();
  }
  await a.move(goal.x, goal.z);
  await wait(900);
  // Surface routing can arrive on a nearby ledge; descend only if the real
  // body's level and read-only support demonstrate a small safe drop.
  for (let step = 0; step < 4 && !(await d.count("diamond_pick")); step++) {
    await d.center();
    const p = (await d.info()).position;
    if (p.y <= goal.y + 0.8) break;
    const floor = { x: Math.floor(p.x), y: Math.round(p.y) - 1, z: Math.floor(p.z) };
    const landing = await page.evaluate((floor) => {
      const pass = [0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43];
      for (let y = floor.y - 1; y >= floor.y - 4; y--)
        if (!pass.includes(window.__mc.blockAt(floor.x, y, floor.z))) return y + 1;
      return -Infinity;
    }, floor);
    assert.ok(p.y - landing <= 3.1 && landing >= goal.y - 0.5, "safe short descent to real loot");
    assert.ok(
      ![0, 5, 8, 26, 28, 31, 38, 39, 40, 43].includes(await d.block(floor)),
      "mine only ordinary terrain above the actual body",
    );
    await d.equip("iron_pick");
    await d.mine(floor);
    await wait(700);
    await a.move(goal.x, goal.z);
    await wait(600);
  }
  assert.ok(await d.count("diamond_pick"), "recover the actual diamond pickaxe");
  assert.ok((await d.count("enderPearl")) >= 8, "recover eight actual pearls");
  assert.ok((await d.count("blazeRod")) >= 14, "recover fourteen actual rods");
  assert.ok(await d.count("bow"), "recover the actual bow");
  assert.ok(await d.count("iron_sword"), "recover the actual sword before combat guard");
  const hunting = createModernHunting(page, d, a, { arrowReserve: 0 });
  hunting.activate();
  await d.equip("iron_sword");
  await a.eat();
  await hunting.guard();
  assert.ok((await d.info()).health > 0, "survive actual gear recovery");
  meta.recovery4_78.recovered = await d.info();
  flush();
  d.setGoal("取り戻した装備を持って、平らな元の村へ海岸沿いに戻ります。");
  for (const target of [
    { x: 260, z: -80 },
    { x: 240, z: -95 },
    { x: 213, z: -95 },
    { x: village.x, z: village.z - 5 },
  ]) {
    await a.surfaceTo(target);
    await a.eat();
    await hunting.guard();
    assert.ok((await d.info()).health > 0, "return alive to the original village");
  }
  meta.huntingCamp = {
    x: village.x,
    y: village.y,
    z: village.z - 5,
    position: { x: village.x + 0.5, y: village.y, z: village.z - 4.5 },
  };
  meta.recovery4_78.returned = await d.info();
  if (village.cacheChest) {
    meta.remoteCacheChest = { ...village.cacheChest };
    delete village.cacheChest;
  }
  flush();
  await chapter("村でパンを補給し、パール8個とロッド14本を回収して元の村へ帰還", 4);
}
