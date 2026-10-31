/** Put surplus items into the discovered village chest through its normal UI. */
import assert from "node:assert/strict";
import { wait } from "./survival-driver.mjs";
export async function stashVillage(
  page,
  d,
  a,
  v,
  ids = ["sapling", "snow", "sand", "wood_pick", "stone_pick", "seeds", "apple"],
) {
  d.setGoal("戦利品をチェストでまとめ、持ち物の空きを作ります。");
  let chest = v.cacheChest ?? { x: v.x - 7, y: v.y, z: v.z + 5 };
  const current = (await d.info()).position;
  // A surface chest should be approached from the ground, rather than mining
  // a long horizontal cave tunnel beneath the village.
  if (current.y < chest.y - 2 && !(await d.count("chest"))) await a.reachSurface();
  if (!v.cacheChest && (await d.count("chest"))) {
    // Use the genuinely crafted camp chest, rather than carrying it full-time.
    chest = { x: Math.floor(current.x) - 1, y: Math.round(current.y), z: Math.floor(current.z) };
    for (const y of [chest.y + 1, chest.y])
      if ((await d.block({ ...chest, y })) !== 0) await d.mine({ ...chest, y });
    await d.equip("chest");
    await d.aim({ x: chest.x + 0.5, y: chest.y - 0.01, z: chest.z + 0.5 });
    await a.right();
    assert.equal(await d.block(chest), 14, "place the crafted empty camp chest");
    v.cacheChest = chest;
    await wait(700);
  } else if (Math.hypot(current.x - chest.x, current.z - chest.z) > 48) {
    // Unloaded chunks read as air. Load the area before deciding a chest was lost.
    await a.surfaceTo({ x: chest.x + 2, z: chest.z - 3 });
  }
  if ((await d.block(chest)) !== 14) {
    // The original house can be damaged in real combat. Craft a new empty
    // cache at a different coordinate so it cannot regenerate structure loot.
    chest = { x: v.x - 3, y: v.y, z: v.z + 1 };
    if ((await d.block(chest)) !== 14) {
      if (!(await d.count("chest"))) {
        const table = await d.station("table");
        await d.make("chest");
        await d.close();
        await d.mine(table);
        await wait(500);
        await d.collect("table", 1);
      }
      await a.surfaceTo({ x: chest.x - 1, z: chest.z });
      if ((await d.block(chest)) !== 0) await d.mine(chest);
      await d.equip("chest");
      await d.aim({ x: chest.x + 0.5, y: chest.y - 0.01, z: chest.z + 0.5 });
      await a.right();
      assert.equal(await d.block(chest), 14, "place a genuinely crafted replacement cache");
    }
    v.cacheChest = chest;
    await a.surfaceTo({ x: chest.x - 1, z: chest.z });
  } else if (!v.cacheChest) {
    await a.surfaceTo({ x: v.x - 6, z: v.z + 1 });
    await a.move(v.x - 5.5, v.z + 2.7);
    await a.move(v.x - 5.5, v.z + 3.5);
    await a.move(chest.x + 1.5, chest.z + 0.5);
  } else await a.surfaceTo({ x: chest.x - 1, z: chest.z });
  await d.equip("iron_pick");
  for (let attempt = 0; attempt < 12; attempt++) {
    await d.aim({ x: chest.x + 0.5, y: chest.y + 0.8, z: chest.z + 0.5 });
    const hit = await page.evaluate(() => window.__mc.target());
    assert.ok(hit, "see the actual storage chest");
    if (hit.x === chest.x && hit.y === chest.y && hit.z === chest.z) break;
    assert.ok(
      ![8, 14, 15, 28, 31, 38, 39, 40].includes(await d.block(hit)),
      "clear only surplus approach scaffolding",
    );
    await d.mine(hit);
  }
  await a.useAt(chest);
  await page.waitForSelector('[data-area="chest"]', { timeout: 5000 });
  await stashOpenChest(page, d, ids);
}

/** Store through a chest UI that normal interaction has already opened. */
export async function stashOpenChest(page, d, ids) {
  // Merge matching partial stacks using the same slot clicks as a player.
  for (let pass = 0; pass < 30; pass++) {
    const pair = await page.$$eval('[data-area="chest"]', (els) => {
      const slots = els.map((el, i) => ({
        i,
        name: el.querySelector("img")?.alt,
        count: Number(el.querySelector(".item-count")?.textContent) || 1,
        tool: !!el.querySelector(".durability"),
      }));
      for (const a of slots)
        for (const b of slots)
          if (
            a.i < b.i &&
            a.name &&
            a.name === b.name &&
            !a.tool &&
            !b.tool &&
            a.count + b.count <= 64
          )
            return [a.i, b.i];
      return null;
    });
    if (!pair) break;
    await page.locator(`[data-area="chest"][data-slot="${pair[1]}"]`).click();
    await page.locator(`[data-area="chest"][data-slot="${pair[0]}"]`).click();
  }
  for (let n = 0; n < 36; n++) {
    const inv = (await d.info()).inventory,
      index = inv.findIndex((s) => s && ids.includes(s.id));
    if (index < 0) break;
    const item = inv[index];
    const label = await page.$eval(
      `[data-area="inventory"][data-slot="${index}"]`,
      (el) => el.querySelector("img").alt,
    );
    const slot = await page.$$eval(
      '[data-area="chest"]',
      (els, { item, label }) => {
        const merged = els.findIndex(
          (el) =>
            !el.querySelector(".durability") &&
            item.durability === undefined &&
            el.querySelector("img")?.alt === label &&
            (Number(el.querySelector(".item-count")?.textContent) || 1) + item.count <= 64,
        );
        return merged >= 0 ? merged : els.findIndex((el) => !el.querySelector("img"));
      },
      { item, label },
    );
    assert.ok(slot >= 0, "room in discovered chest for surplus");
    await page.locator(`[data-area="inventory"][data-slot="${index}"]`).click();
    await page.locator(`[data-area="chest"][data-slot="${slot}"]`).click();
  }
  await d.close();
}
