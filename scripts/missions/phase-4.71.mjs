import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { prepareArchery } from "../lib/modern-archery.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  const h = createModernHunting(page, d, a, { arrowReserve: 0 });
  h.activate();
  d.setGoal("調理できました。かまどを一時的に置いて持ち物を空け、火打ち石を拾います。");
  if ((await d.info()).inventory.every(Boolean)) {
    const p = (await d.info()).position,
      cell = { x: Math.floor(p.x) - 1, y: Math.round(p.y), z: Math.floor(p.z) };
    for (const y of [cell.y + 1, cell.y])
      if ((await d.block({ ...cell, y })) !== 0) await d.mine({ ...cell, y });
    assert.ok(![0, 5, 26].includes(await d.block({ ...cell, y: cell.y - 1 })));
    await d.equip("furnace");
    await d.aim({ x: cell.x + 0.5, y: cell.y - 0.01, z: cell.z + 0.5 });
    await a.right();
    assert.equal(await d.block(cell), 13);
    meta.supplyFurnace = cell;
    flush();
    await wait(900);
  }
  const target = Math.min(36, (await d.count("arrow")) + 4 * (await d.count("feather")));
  assert.ok(target >= 24);
  await prepareArchery(page, d, a, target);
  if (meta.supplyFurnace && (await d.block(meta.supplyFurnace)) === 13) {
    await d.mine(meta.supplyFurnace);
    await wait(500);
    await d.collect("furnace", 1);
  }
  await a.eat();
  console.log("Camp supplies complete", await d.info());
  await chapter("焼肉8個を準備し、拾った火打ち石で矢を補充", 4);
}
