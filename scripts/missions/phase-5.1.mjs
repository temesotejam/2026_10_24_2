/** Recover the actual nearby portal-building death, using the bed house as cover. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";

export async function run({ page, d, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  const v = meta.village,
    goal = meta.lastDeath;
  assert.ok(
    goal && Math.hypot(goal.x - (v.x + 7.5), goal.z - (v.z + 1)) < 3,
    "recover the actual nearby doorway death",
  );
  d.setGoal("ベッドから復活。入口に落とした装備を拾い、すぐに家の中へ戻ります。");
  await page.keyboard.down("ControlLeft");
  try {
    await a.move(v.x + 7.5, goal.z + 1.2, false, 0.15);
    await wait(250);
    assert.ok(await d.count("diamond_pick"), "pick up the genuine dropped tools");
    await a.move(v.x + 7.5, v.z + 4.5, false, 0.15);
    await a.move(v.x + 8.5, v.z + 4.5, false, 0.15);
  } finally {
    await page.keyboard.up("ControlLeft");
  }
  assert.ok((await d.info()).health > 0, "return to shelter alive");
  assert.ok(await d.count("bow"));
  assert.equal(await d.count("enderPearl"), 2, "recover the two pearls earned in this run");
  d.setGoal("回収した土で入口をふさぎ、矢を避けて立て直します。");
  const door = { x: v.x + 7, y: v.y, z: v.z + 2 };
  if ((await d.block(door)) === 0) {
    await d.equip("dirt");
    await d.aim({ x: door.x + 0.5, y: door.y - 0.01, z: door.z + 0.5 });
    await a.right();
    await wait(150);
    assert.equal(await d.block(door), 2, "place carried dirt across the real doorway");
  }
  await a.eat();
  meta.portalRecovery = { recovered: await d.info(), doorway: door };
  flush();
  await chapter("実際に落とした装備を回収し、土で入口をふさいで家へ退避", 5.2);
}
