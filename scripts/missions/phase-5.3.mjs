/** Move the owned bed to the sheltered side of the house, away from enemies. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";

export async function run({ page, d, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  const v = meta.village;
  const old = { x: v.x + 6, y: v.y, z: v.z + 5 };
  d.setGoal("敵が近くて眠れないため、持っているベッドを家の反対側へ移します。");
  await a.eat();
  await a.move(v.x + 7.5, v.z + 4.5, false, 0.15);
  if ((await d.block(old)) === 15) {
    await d.equip("iron_pick");
    await d.mine(old);
    await wait(300);
  }
  await d.collect("bed", 1);
  await a.move(v.x + 6.5, v.z + 4.5, false, 0.15);
  for (const y of [v.y + 1, v.y]) {
    const cell = { x: v.x + 5, y, z: v.z + 4 };
    if ((await d.block(cell)) !== 0) {
      await d.equip("iron_pick");
      await d.mine(cell);
    }
  }
  await a.move(v.x + 4.5, v.z + 4.5, false, 0.15);
  await a.move(v.x + 3.5, v.z + 4.5, false, 0.15);
  const bed = { x: v.x + 2, y: v.y, z: v.z + 5 };
  const clearance = await page.evaluate(
    (bed) =>
      window.__mc
        .adventure()
        .creatures.filter(
          (m) => m.hp > 0 && !["villager", "pig", "cow", "sheep", "chicken"].includes(m.species),
        )
        .map((m) => Math.hypot(m.position.x - bed.x, m.position.z - bed.z)),
    bed,
  );
  assert.ok(
    clearance.every((distance) => distance >= 8.5),
    "choose a real bed site away from nearby hostiles",
  );
  assert.equal(await d.block(bed), 0);
  await d.equip("bed");
  await d.aim({ x: bed.x + 0.5, y: bed.y - 0.01, z: bed.z + 0.5 });
  await a.right();
  await wait(150);
  assert.equal(await d.block(bed), 15, "place the actual recovered bed");
  meta.bedLocation = bed;
  flush();
  await d.equip("iron_sword");
  const before = await page.evaluate(() => window.__mc.time());
  await a.useAt(bed);
  await wait(250);
  const after = await page.evaluate(() => ({
    time: window.__mc.time(),
    notice: document.querySelector("#toast")?.textContent,
  }));
  (meta.bedVisits ??= []).push({
    before,
    after: after.time,
    slept: after.time - before > 10,
    notice: after.notice,
    location: bed,
  });
  flush();
  assert.ok(after.time - before > 10, "sleep through the native bed interaction");
  d.narrate("持ち運んだベッドで朝にできました。明るいうちにゲートを完成させます。", 2);
  await chapter("実際のベッドを安全な側へ移して眠り、朝を迎えた", 5);
}
