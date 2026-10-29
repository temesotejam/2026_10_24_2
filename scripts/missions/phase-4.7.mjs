import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { cookCarriedMeat } from "../lib/modern-resources.mjs";
import { prepareArchery } from "../lib/modern-archery.mjs";
export async function run({ page, d, a, meta, chapter }) {
  const h = createModernHunting(page, d, a, { arrowReserve: 0 });
  h.activate();
  d.setGoal("武器を取り戻したので、近くに落とした食料を回収して調理します。");
  // First use the flint already carried: two real recipes also free its slot.
  if ((await d.count("flint")) && (await d.count("feather"))) {
    const table = await d.station("table");
    while ((await d.count("flint")) && (await d.count("feather")) && (await d.count("stick")))
      await d.make("arrow");
    await d.close();
    await d.mine(table);
    await wait(500);
    await d.collect("table", 1);
  }
  const food = meta.deaths.find((death) => death.part === "part-60.mp4").position;
  if ((await d.count("rawMeat")) < 8) {
    await a.surfaceTo(food);
    await a.move(food.x, food.z);
    if ((await d.info()).position.y < food.y - 0.2) await a.pillarTo(Math.round(food.y));
    await wait(700);
    await a.move(food.x, food.z);
    await wait(700);
  }
  assert.ok(
    (await d.count("rawMeat")) >= 8,
    "retrieve the actual stored food dropped by the previous rescue attempt",
  );
  await a.eat();
  if (!(await d.count("furnace"))) {
    const p = (await d.info()).position,
      cell = { x: Math.floor(p.x) + 1, y: Math.round(p.y), z: Math.floor(p.z) };
    assert.equal(await d.block(cell), 13, "resume the actually placed empty cooking furnace");
    await d.mine(cell);
    await wait(500);
    await d.collect("furnace", 1);
  }
  await cookCarriedMeat(d, page, a, { count: 8 });
  await a.eat();
  await a.recover(18);
  const target = Math.min(36, (await d.count("arrow")) + 4 * (await d.count("feather")));
  assert.ok(target >= 24);
  await prepareArchery(page, d, a, target);
  console.log("Food and arrows", await d.info());
  await chapter("落とした食料を回収して調理し、矢を補充", 4);
}
