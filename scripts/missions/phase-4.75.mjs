import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, chapter }) {
  a.setGuard(async () => false);
  d.setGoal("岸のすぐ近くにいるスケルトンを、剣で先に倒します。");
  await d.equip("iron_sword");
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    const target = await page.evaluate(() => {
      const p = window.__mc.position();
      return window.__mc
        .adventure()
        .creatures.filter((m) => m.hp > 0 && m.species === "skeleton")
        .sort(
          (a, b) =>
            Math.hypot(a.position.x - p.x, a.position.y - p.y, a.position.z - p.z) -
            Math.hypot(b.position.x - p.x, b.position.y - p.y, b.position.z - p.z),
        )[0];
    });
    if (!target) break;
    const p = (await d.info()).position;
    if (Math.hypot(p.x - target.position.x, p.y - target.position.y, p.z - target.position.z) > 3.1)
      break;
    await d.aim({ ...target.position, y: target.position.y + 0.7 }, 0);
    await page.mouse.down();
    await wait(420);
    await page.mouse.up();
    console.log("Close defence", target.hp, (await d.info()).health);
  }
  await d.releaseAttack();
  assert.ok((await d.info()).health > 0);
  await chapter("岸の射手に剣で応戦", 4);
}
