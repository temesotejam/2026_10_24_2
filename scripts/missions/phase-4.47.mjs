/** Native bed use, real corpse recovery, then a paid two-block combat perch. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { hostile } from "../lib/combat-policy.mjs";
import { mobAimHeight } from "../lib/mob-aim.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  d.setThreatHandler(null);
  const v = meta.village,
    bed = meta.bedLocation ?? { x: v.x + 6, y: v.y, z: v.z + 5 },
    grave = { ...meta.lastDeath };
  d.setGoal("村のベッドを使い、落とした装備と素材の回収に備えます。");
  const before = await page.evaluate(() => window.__mc.time());
  await a.useAt(bed);
  await wait(500);
  const after = await page.evaluate(() => ({
    time: window.__mc.time(),
    notice: document.querySelector("#toast")?.textContent,
  }));
  (meta.bedVisits ??= []).push({
    before,
    after: after.time,
    slept: after.time - before > 10,
    notice: after.notice,
  });
  flush();
  console.log("Native recovery bed", JSON.stringify({ before, ...after }));
  d.setGoal("村の道から走って、実際に落とした装備・ロッド・パールを回収します。");
  await page.keyboard.down("ControlLeft");
  try {
    await a.move(v.x + 7.5, v.z + 2.5, true);
    await a.surfaceTo({ x: v.x + 7, z: v.z + 1 });
    await a.surfaceTo({ x: Math.floor(grave.x), z: Math.floor(grave.z) });
    await a.move(grave.x, grave.z, true, 0.15);
  } finally {
    await page.keyboard.up("ControlLeft");
  }
  await wait(400);
  assert.ok(await d.count("diamond_pick"), "recover the actual dropped diamond pick");
  assert.ok((await d.count("blazeRod")) >= 8, "recover all eight earned rods");
  assert.ok((await d.count("enderPearl")) >= 7, "recover the seven earned pearls");
  (meta.gearRecoveries ??= []).push({
    position: (await d.info()).position,
    inventory: (await d.info()).inventory,
    method: "native-overworld-corpse-recovery",
  });
  flush();
  d.setGoal("手持ちのブロックを2段積んで足場を作り、近くの敵から身を守ります。");
  await a.pillarTo(Math.round((await d.info()).position.y) + 2);
  await a.eat();
  const until = Date.now() + 45000;
  while (Date.now() < until) {
    const s = await d.info();
    assert.ok(s.health > 0, "survive the real recovery perch");
    await a.eat();
    const mobs = (await a.adventure()).creatures.filter((m) => m.hp > 0 && hostile(m));
    const target = mobs
      .map((m) => ({ m, aim: { ...m.position, y: m.position.y + mobAimHeight(m) } }))
      .sort(
        (a, b) =>
          Math.hypot(
            a.aim.x - s.position.x,
            a.aim.y - s.position.y - s.eye,
            a.aim.z - s.position.z,
          ) -
          Math.hypot(
            b.aim.x - s.position.x,
            b.aim.y - s.position.y - s.eye,
            b.aim.z - s.position.z,
          ),
      )
      .find(
        ({ aim }) =>
          Math.hypot(aim.x - s.position.x, aim.y - s.position.y - s.eye, aim.z - s.position.z) <=
          2.95,
      );
    if (target) {
      await d.equip("iron_sword");
      await d.aim(target.aim, 0);
      await page.mouse.down();
      await wait(450);
      await d.releaseAttack();
    } else await wait(700);
    if (
      (await d.info()).health >= 19 &&
      !mobs.some((m) => Math.hypot(m.position.x - s.position.x, m.position.z - s.position.z) < 6)
    )
      break;
  }
  await chapter("落とした装備・ロッド8本・パール7個を実際に回収し、足場の上で態勢を立て直す", 4);
}
