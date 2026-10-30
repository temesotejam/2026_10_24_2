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
  if (Math.hypot((await d.info()).position.x - 187.5, (await d.info()).position.z + 83.5) > 12)
    await a.surfaceTo({ x: 187, z: -84 });
  const right = async () => {
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
    await wait(120);
  };
  const stable = async () => {
    await page.keyboard.up("Space");
    await wait(300);
    if ((await d.info()).position.y < 34.9) await a.pillarTo(35);
    for (let step = 0; step < 5 && (await d.info()).position.y > 35.1; step++) {
      await d.center();
      const p = (await d.info()).position;
      const floor = { x: Math.floor(p.x), y: Math.round(p.y) - 1, z: Math.floor(p.z) };
      assert.ok(
        [1, 2, 3, 4, 9, 11, 21].includes(await d.block(floor)),
        "lower only ordinary high footing",
      );
      await d.equip("iron_pick");
      await d.mine(floor);
      await wait(450);
      if ((await d.info()).position.y < 34.9) await a.pillarTo(35);
    }
    await d.center();
    assert.ok(
      Math.abs((await d.info()).position.y - 35) < 0.12,
      "stable feet at field level before moving",
    );
  };
  const irrigation = (x, z) => x === 196 && z >= -83 && z <= -80;
  const fillFloor = async (x, z) => {
    assert.ok(!irrigation(x, z), "never fill the original irrigation");
    if (![0, 5].includes(await d.block({ x, y: 34, z }))) return;
    let foundation = 33;
    while (foundation >= 30 && [0, 5].includes(await d.block({ x, y: foundation, z })))
      foundation--;
    assert.ok(foundation >= 31, "reachable native foundation under the real hole");
    const p = (await d.info()).position;
    const dx = x + 0.5 - p.x,
      dz = z + 0.5 - p.z;
    const length = Math.hypot(dx, dz);
    assert.ok(length < 1.3 && length > 0.5, "repair one adjacent column from dry footing");
    await d.equip("dirt");
    await page.keyboard.down("ShiftLeft");
    try {
      // Lean safely over the supported edge so the low ray clears our own
      // floor. Crouching also brings foundation31 within ordinary reach.
      await d.walk(p.x + (dx / length) * 0.45, p.z + (dz / length) * 0.45, false, 0.015, 50);
      await wait(200);
      for (let y = foundation + 1; y <= 34; y++) {
        await d.aim({ x: x + 0.5, y: y - 0.01, z: z + 0.5 });
        for (let attempt = 0; attempt < 4 && [0, 5].includes(await d.block({ x, y, z })); attempt++)
          await right();
        assert.equal(await d.block({ x, y, z }), 2, `place real foundation dirt ${x},${y},${z}`);
      }
    } finally {
      await page.keyboard.up("ShiftLeft");
    }
    await d.center();
  };
  const walk = async (x, z) => {
    await stable();
    // Axis-aligned, one-column steps; repair every landing before entering it.
    for (let leg = 0; leg < 100; leg++) {
      const p = (await d.info()).position;
      const cx = Math.floor(p.x),
        cz = Math.floor(p.z),
        tx = Math.floor(x),
        tz = Math.floor(z);
      if (cx === tx && cz === tz) break;
      let nx = cx,
        nz = cz,
        jump = false;
      if (cx !== tx) nx += Math.sign(tx - cx);
      else nz += Math.sign(tz - cz);
      if (irrigation(nx, nz)) {
        assert.ok(nx !== cx, "cross irrigation sideways on the preserved two-cell jump");
        nx += Math.sign(tx - cx);
        jump = true;
      }
      // A two-cell irrigation landing is a previously repaired row. Keep it
      // intact; all ordinary adjacent landings can be rebuilt from here.
      if (jump)
        assert.ok(
          ![0, 5].includes(await d.block({ x: nx, y: 34, z: nz })),
          "dry irrigation jump landing",
        );
      else await fillFloor(nx, nz);
      await d.walk(nx + 0.5, nz + 0.5, jump, 0.18, jump ? 600 : 60);
      await stable();
      assert.ok((await d.info()).health > 0, "survive ordinary farm repairs");
    }
    const p = (await d.info()).position;
    assert.ok(Math.hypot(p.x - x, p.z - z) < 0.3, "reach repaired walkway target");
  };
  // Keep all approach travel outside the broken farm: surfaceTo's terrain
  // excavation is deliberately never used within the crop rectangle.
  await walk(187.5, -83.5);
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
    await walk(188.5, -78.5);
    const table = await d.station("table");
    await page.waitForSelector('[data-recipe="stone_hoe"]');
    assert.ok(
      (await d.count("cobble")) >= 2 && (await d.count("stick")) >= 2,
      "real hoe ingredients",
    );
    await d.make("stone_hoe");
    await d.close();
    await d.equip("iron_pick");
    await d.mine(table);
    await wait(600);
    await d.collect("table", 1);
  }
  await walk(187.5, -74.5);
  await walk(187.5, -83.5);
  const repair = async (x, z) => {
    const base = { x, y: 34, z },
      crop = { x, y: 35, z };
    let soil = await d.block(base);
    if ([0, 5].includes(soil)) {
      await fillFloor(x, z);
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
    await walk(188.5, -83.5);
    await walk(189.5, -83.5);
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
    await walk(188.5, -83.5);
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
