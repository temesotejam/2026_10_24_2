import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, chapter }) {
  a.setGuard(async () => false);
  d.setGoal("射手を倒した足場で剣を構え、食料で体力を回復します。");
  const until = Date.now() + 150000;
  while ((await d.info()).health < 20) {
    assert.ok((await d.info()).health > 0, "survive defensive recovery");
    assert.ok(Date.now() < until, "recover on the defended shore");
    await a.eat();
    await d.equip("iron_sword");
    const target = await page.evaluate(() => {
      const p = window.__mc.position(),
        e = window.__mc.eyeHeight();
      return __mc
        .adventure()
        .creatures.filter(
          (m) =>
            m.hp > 0 &&
            (["spider", "zombie", "skeleton", "mossling"].includes(m.species) ||
              (m.species === "wanderer" && m.fuse === 2)) &&
            Math.hypot(m.position.x - p.x, m.position.y + 0.7 - p.y - e, m.position.z - p.z) < 3,
        )
        .sort((a, b) => a.hp - b.hp)[0];
    });
    if (target) {
      await d.aim({ ...target.position, y: target.position.y + 0.7 }, 0);
      await page.mouse.down();
      await wait(420);
      await page.mouse.up();
    } else await wait(500);
  }
  console.log("Defended recovery complete", await d.info());
  await chapter("岸の足場で接近する敵を防ぎ、体力を回復", 4);
}
