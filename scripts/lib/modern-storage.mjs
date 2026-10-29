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
  let chest = v.cacheChest ?? { x: v.x - 7, y: v.y, z: v.z + 5 };
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
  for (let n = 0; n < 36; n++) {
    const inv = (await d.info()).inventory,
      index = inv.findIndex((s) => s && ids.includes(s.id));
    if (index < 0) break;
    const slot = await page.$$eval('[data-area="chest"]', (els) =>
      els.findIndex((el) => !el.querySelector("img")),
    );
    assert.ok(slot >= 0, "room in discovered chest for surplus");
    await page.locator(`[data-area="inventory"][data-slot="${index}"]`).click();
    await page.locator(`[data-area="chest"][data-slot="${slot}"]`).click();
  }
  await d.close();
}
