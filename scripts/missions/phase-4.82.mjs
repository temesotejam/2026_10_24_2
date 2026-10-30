/** Repair the actual damaged field through carried blocks, tools and clicks. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { createModernHunting } from "../lib/modern-hunting.mjs";

export async function run({ page, d, a, meta, chapter, flush = () => undefined }) {
  const v = meta.village;
  assert.ok(v?.cacheChest, "know the actual surviving village cache");
  const h = createModernHunting(page, d, a, { arrowReserve: 0 });
  h.activate();
  d.setGoal("壊れた畑に実際の土を戻し、クワで耕して種を植え直します。");
  // Reach the field's real walking level with carried material, never teleport.
  if ((await d.info()).position.y < 34.9) await a.pillarTo(35);
  const walk = async (x, z, jump = false) => {
    await d.walk(x, z, jump, 0.24, jump ? 450 : 60);
    assert.ok((await d.info()).health > 0, "survive ordinary farm repairs");
  };
  // Keep all approach travel outside the broken farm: surfaceTo's terrain
  // excavation is deliberately never used within the crop rectangle.
  await walk(187.5, -85.5);
  await walk(187.5, -74.5);
  await walk(188.5, -74.5);
  await a.useAt(v.cacheChest);
  await page.waitForSelector('[data-area="chest"]');
  const stored = await page.$$eval('[data-area="chest"]', (els) =>
    els.map((el, index) => ({
      index,
      name: el.querySelector("img")?.alt,
      count: el.querySelector("img")
        ? Number(el.querySelector(".item-count")?.textContent) || 1
        : 0,
    })),
  );
  console.log("Actual farm repair cache", JSON.stringify(stored));
  for (const [name, id, target] of [
    ["種", "seeds", 64],
    ["土", "dirt", 64],
  ]) {
    for (const slot of stored.filter((slot) => slot.name === name)) {
      if ((await d.count(id)) >= target) break;
      const inventory = (await d.info()).inventory;
      let free = inventory.findIndex((stack) => stack?.id === id && stack.count + slot.count <= 64);
      if (free < 0) free = inventory.findIndex((stack) => stack === null);
      assert.ok(free >= 0, "room for actual stored seeds and repair dirt");
      await page.locator(`[data-area="chest"][data-slot="${slot.index}"]`).click();
      await page.locator(`[data-area="inventory"][data-slot="${free}"]`).click();
    }
  }
  await d.close();
  assert.ok((await d.count("seeds")) >= 56, "own actual seeds to restore the entire field");
  assert.ok((await d.count("dirt")) >= 40, "own actual soil for the missing field bases");
  if (!(await d.count("stone_hoe"))) {
    await walk(190.5, -72.5);
    await a.useAt({ x: 191, y: 35, z: -72 });
    await page.waitForSelector('[data-recipe="stone_hoe"]');
    assert.ok(
      (await d.count("cobble")) >= 2 && (await d.count("stick")) >= 2,
      "real hoe ingredients",
    );
    await d.make("stone_hoe");
    await d.close();
  }
  await walk(187.5, -74.5);
  await walk(187.5, -84.5);
  const right = async () => {
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
    await wait(100);
  };
  const repair = async (x, z) => {
    const base = { x, y: 34, z },
      crop = { x, y: 35, z };
    let soil = await d.block(base);
    if ([0, 5].includes(soil)) {
      assert.ok(
        ![0, 5, 26].includes(await d.block({ x, y: 33, z })),
        "native support below repair soil",
      );
      await d.equip("dirt");
      await d.aim({ x: x + 0.5, y: 33.99, z: z + 0.5 });
      for (let attempt = 0; attempt < 3 && [0, 5].includes(await d.block(base)); attempt++)
        await right();
      soil = await d.block(base);
      assert.equal(soil, 2, `place actual dirt at ${x},34,${z}`);
    }
    if ([1, 2].includes(soil)) {
      assert.equal(await d.block(crop), 0, "clear real planting space above dirt");
      await d.equip("stone_hoe");
      await d.aim({ x: x + 0.5, y: 34.99, z: z + 0.5 });
      for (let attempt = 0; attempt < 3 && (await d.block(base)) !== 21; attempt++) await right();
    }
    assert.equal(await d.block(base), 21, `till real farmland ${x},34,${z}`);
    if ((await d.block(crop)) === 0) {
      await d.equip("seeds");
      await d.aim({ x: x + 0.5, y: 34.99, z: z + 0.5 });
      for (let attempt = 0; attempt < 3 && (await d.block(crop)) === 0; attempt++) await right();
    }
    assert.ok([22, 23].includes(await d.block(crop)), `plant actual crop ${x},35,${z}`);
  };
  meta.fieldRepair = { repaired: [], startedAt: new Date().toISOString() };
  flush();
  // Each row is repaired from its northern neighbour, which is either the
  // intact perimeter or the previous restored row. Never stand in placed dirt.
  for (let z = -83; z <= -80; z++) {
    await walk(188.5, -84.5);
    await walk(189.5, -84.5);
    await walk(189.5, z - 0.5);
    for (let x = 189; x <= 203; x++) {
      if (x === 196) continue; // Preserve all four original irrigation cells.
      if (x === 197) await walk(197.5, z - 0.5, true);
      else await walk(x + 0.5, z - 0.5);
      const standing = (await d.info()).position;
      assert.ok(standing.y >= 34.8 && standing.y <= 35.3, "stand on dry field-level footing");
      await repair(x, z);
      meta.fieldRepair.repaired.push({ x, y: 34, z });
      flush();
    }
    // Return across the now restored northern row; explicitly jump irrigation.
    await walk(197.5, z - 0.5);
    await walk(195.5, z - 0.5, true);
    await walk(188.5, z - 0.5);
    await walk(188.5, -84.5);
  }
  for (let z = -83; z <= -80; z++) {
    assert.equal(await d.block({ x: 196, y: 34, z }), 5, "preserve original irrigation");
    for (let x = 189; x <= 203; x++)
      if (x !== 196) {
        assert.equal(await d.block({ x, y: 34, z }), 21);
        assert.ok([22, 23].includes(await d.block({ x, y: 35, z })));
      }
  }
  meta.fieldRepair.completedAt = new Date().toISOString();
  meta.fieldRepair.plantedCells = 56;
  flush();
  await chapter("実際の土とクワで畑56区画を修復し、種を植え直す", 4.83);
}
