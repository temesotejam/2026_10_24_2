/** Defend the bed house from behind real walls, then use the native bed. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";

export async function run({ page, d, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  const v = meta.village;
  const bed = { x: v.x + 6, y: v.y, z: v.z + 5 };
  const sleep = async () => {
    const before = await page.evaluate(() => window.__mc.time());
    await d.equip("iron_sword");
    await a.useAt(bed);
    await wait(180);
    const result = await page.evaluate(() => ({
      time: window.__mc.time(),
      notice: document.querySelector("#toast")?.textContent,
    }));
    const slept = result.time - before > 10;
    (meta.bedVisits ??= []).push({ before, after: result.time, slept, notice: result.notice });
    flush();
    return slept || (result.time % 1200 >= 24 && result.time % 1200 < 744);
  };
  d.setGoal("入口をふさいだ家で体力を戻し、近くの敵を弓で迎撃してから眠ります。");
  const healUntil = Date.now() + 60000;
  while ((await d.info()).health < 20 && Date.now() < healUntil) {
    assert.ok((await d.info()).health > 0, "survive behind the real house walls");
    await a.eat();
    await wait(1500);
  }
  if (!(await sleep())) {
    const window = { x: v.x + 9, y: v.y + 1, z: v.z + 4 };
    if ((await d.block(window)) === 37) {
      await d.equip("iron_pick");
      await d.mine(window);
    }
    const progress = (meta.houseDefense ??= { shots: [] });
    const deadline = Date.now() + 180000;
    const spots = [
      { x: v.x + 8.5, z: v.z + 4.5 },
      { x: v.x + 7.5, z: v.z + 4.5 },
    ];
    let rested = false;
    while (!rested && Date.now() < deadline) {
      assert.ok((await d.info()).health >= 8, "checkpoint before exhausting cover health");
      assert.ok((await d.count("arrow")) > 6, "checkpoint before spending every real arrow");
      let fired = false;
      for (const spot of spots) {
        await a.move(spot.x, spot.z, false, 0.15);
        const target = await page.evaluate((bed) => {
          const mc = window.__mc,
            p = mc.position(),
            eye = { ...p, y: p.y + mc.eyeHeight() };
          const candidates = mc
            .adventure()
            .creatures.filter(
              (m) =>
                m.hp > 0 &&
                !["villager", "pig", "cow", "sheep", "chicken"].includes(m.species) &&
                Math.hypot(m.position.x - bed.x, m.position.z - bed.z) < 8,
            );
          for (const mob of candidates) {
            const t = Math.hypot(mob.position.x - p.x, mob.position.z - p.z) / 22;
            const aim = {
              x: mob.position.x + mob.velocity.x * t,
              y: mob.position.y + 1 + 1.2 * t * t,
              z: mob.position.z + mob.velocity.z * t,
            };
            const length = Math.hypot(aim.x - eye.x, aim.y - eye.y, aim.z - eye.z);
            let clear = true;
            for (let d = 0.05; d < length - 0.5; d += 0.05) {
              const f = d / length;
              if (
                ![0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43].includes(
                  mc.blockAt(
                    Math.floor(eye.x + (aim.x - eye.x) * f),
                    Math.floor(eye.y + (aim.y - eye.y) * f),
                    Math.floor(eye.z + (aim.z - eye.z) * f),
                  ),
                )
              ) {
                clear = false;
                break;
              }
            }
            if (clear) return { id: mob.id, species: mob.species, hp: mob.hp, aim };
          }
          return null;
        }, bed);
        if (!target) continue;
        await d.equip("bow");
        await d.aim(target.aim, 0);
        const before = await d.count("arrow");
        await a.right();
        await wait(650);
        progress.shots.push({
          target,
          arrowsSpent: before - (await d.count("arrow")),
          health: (await d.info()).health,
        });
        console.log("Covered house shot", JSON.stringify(progress.shots.at(-1)));
        flush();
        fired = true;
        break;
      }
      rested = await sleep();
      if (!fired && !rested) await wait(1000);
    }
    assert.ok(rested, "rest at the real bed after dealing with nearby enemies");
  }
  d.narrate("ベッドで夜を越えました。明るいうちにゲートを完成させます。", 2);
  const door = meta.portalRecovery.doorway;
  if ((await d.block(door)) === 2) {
    await d.equip("stone_shovel");
    await d.mine(door);
  }
  await a.move(v.x + 7.5, v.z + 3.5, false, 0.15);
  await a.eat();
  meta.houseDefense ??= { shots: [] };
  meta.houseDefense.final = await d.info();
  flush();
  await chapter("家の遮蔽物から迎撃し、村のベッドで休んでゲート作りを再開", 5);
}
