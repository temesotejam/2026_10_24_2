import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, chapter }) {
  a.setGuard(async () => false);
  await d.releaseAttack();
  await d.equip("iron_sword");
  d.setGoal("岩の角で接近している敵には、跳びながら剣で応戦します。");
  const p = (await d.info()).position;
  const mobs = (await a.adventure()).creatures.filter(
    (m) =>
      m.species === "skeleton" &&
      Math.hypot(m.position.x - p.x, m.position.y - p.y, m.position.z - p.z) < 5,
  );
  console.log("Corner targets", JSON.stringify(mobs));
  await page.keyboard.down("Space");
  try {
    for (let i = 0; i < 25; i++) {
      assert.ok((await d.info()).health > 0, "survive ordinary jumping melee");
      const alive = (await a.adventure()).creatures.filter((m) => mobs.some((t) => t.id === m.id));
      if (!alive.length) break;
      const mob = alive[0];
      await d.aim({ ...mob.position, y: mob.position.y + 1.4 }, 0);
      console.log(
        "Corner swing",
        i,
        JSON.stringify({
          p: (await d.info()).position,
          target: await page.evaluate(() => window.__mc.target()),
          hp: mob.hp,
        }),
      );
      await page.mouse.down();
      await wait(450);
      await page.mouse.up();
    }
  } finally {
    await page.keyboard.up("Space");
    await d.releaseAttack();
  }
  assert.ok(
    !(await a.adventure()).creatures.some((m) => mobs.some((t) => t.id === m.id)),
    "defeat the close corner skeleton normally",
  );
  await chapter("岩の角で追いかけてきた敵にジャンプ攻撃で対応", 4.6);
}
