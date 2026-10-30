/** Craft and use a real local cache before collecting existing native drops. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { stashVillage } from "../lib/modern-storage.mjs";
export async function run({ page, d, a, meta, flush = () => undefined }) {
  a.setGuard(async () => false);
  const current = (await d.info()).position;
  d.setGoal("近くにチェストを作り、持ち物を整理して落とした羽根を回収します。");
  const table = await page.evaluate(() => {
    const p = window.__mc.position();
    for (let x = Math.floor(p.x) - 3; x <= p.x + 3; x++)
      for (let z = Math.floor(p.z) - 3; z <= p.z + 3; z++)
        for (let y = Math.round(p.y) - 1; y <= Math.round(p.y) + 1; y++)
          if (window.__mc.blockAt(x, y, z) === 12) return { x, y, z };
    return null;
  });
  assert.ok(table, "reuse the already placed real crafting table");
  const furnace = await d.station("furnace");
  await d.close();
  // The newly empty furnace slot may immediately pick up the nearby feather.
  // Place the three owned torches normally to guarantee another empty stack.
  const torchSites = await page.evaluate(() => {
    const p = window.__mc.position(),
      list = [];
    for (let x = Math.floor(p.x) - 2; x <= p.x + 2; x++)
      for (let z = Math.floor(p.z) - 2; z <= p.z + 2; z++)
        if (
          window.__mc.blockAt(x, Math.round(p.y), z) === 0 &&
          [1, 2, 3, 4, 9, 11].includes(window.__mc.blockAt(x, Math.round(p.y) - 1, z))
        )
          list.push({ x, y: Math.round(p.y), z });
    return list;
  });
  for (const cell of torchSites) {
    if (!(await d.count("torch"))) break;
    await d.equip("torch");
    await d.aim({ x: cell.x + 0.5, y: cell.y - 0.01, z: cell.z + 0.5 });
    const hit = await page.evaluate(() => window.__mc.target());
    if (!hit || hit.x !== cell.x || hit.z !== cell.z || hit.y !== cell.y - 1) continue;
    await a.right();
  }
  assert.ok(
    (await d.info()).inventory.some((slot) => slot === null),
    "free a real inventory slot by placing owned utility blocks",
  );
  await a.useAt(table);
  await d.make("chest");
  await d.close();
  assert.ok(await d.count("chest"), "actually craft the cache before storage");
  const cache = { x: Math.floor(current.x), y: Math.round(current.y), z: Math.floor(current.z) };
  await stashVillage(page, d, a, cache, [
    "sand",
    "gravel",
    "bone",
    "string",
    "dirt",
    "stone_sword",
    "stone_hoe",
    "apple",
    "ironOre",
  ]);
  meta.remoteCaches ??= [];
  meta.remoteCaches.push(cache.cacheChest);
  flush();
  await d.equip("diamond_pick");
  if ((await d.block(table)) === 12) {
    await d.mine(table);
    await wait(500);
  }
  if ((await d.block(furnace)) === 13) {
    await d.mine(furnace);
    await wait(500);
  }
  assert.ok(
    (await d.info()).inventory.filter((s) => s === null).length >= 4,
    "make real inventory space for feathers",
  );
  await wait(700);
  const points = [
    { x: 120.654, y: 35, z: -83.646 },
    { x: 150.048, y: 42, z: -91.372 },
    { x: 162.7, y: 35, z: -74.3 },
  ];
  for (const p of points) {
    if ((await d.count("feather")) >= 3) break;
    await a.surfaceTo({ x: Math.floor(p.x), z: Math.floor(p.z) });
    await a.move(p.x, p.z);
    await wait(700);
    console.log(
      "RECOVERED_FEATHERS",
      JSON.stringify({
        feathers: await d.count("feather"),
        rawMeat: await d.count("rawMeat"),
        position: (await d.info()).position,
      }),
    );
  }
  meta.featherRecovery = { count: await d.count("feather"), cache: cache.cacheChest };
  flush();
  await a.save(false);
}
