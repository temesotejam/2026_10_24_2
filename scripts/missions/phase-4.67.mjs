import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, chapter }) {
  a.setGuard(async () => false);
  await d.releaseAttack();
  d.setGoal("接近した敵から走って離れ、水へ飛び込んで落下を防ぎます。");
  const water = await page.evaluate(() => {
    const p = window.__mc.position(),
      list = [];
    for (let x = Math.floor(p.x) - 10; x <= p.x + 10; x++)
      for (let z = Math.floor(p.z) - 10; z <= p.z + 10; z++)
        for (let y = Math.floor(p.y) - 1; y >= p.y - 25; y--)
          if (
            window.__mc.blockAt(x, y, z) === 5 &&
            window.__mc.blockAt(x, y - 1, z) === 5 &&
            window.__mc.blockAt(x, y + 1, z) === 0
          ) {
            const dist = Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z);
            if (dist <= 10 && x > p.x + 0.5) list.push({ x: x + 0.5, z: z + 0.5, y, d: dist });
            break;
          }
    return list.sort((a, b) => a.d - b.d)[0];
  });
  console.log("Water escape", water);
  assert.ok(water, "observe a close, deep-water landing away from the nearby enemies");
  await page.keyboard.down("ControlLeft");
  try {
    await d.walk(water.x, water.z, true, 0.16, 0);
  } finally {
    await page.keyboard.up("ControlLeft");
  }
  await page.keyboard.down("Space");
  try {
    for (let i = 0; i < 12; i++) {
      await a.eat();
      await wait(500);
      assert.ok((await d.info()).health > 0, "survive the ordinary deep-water landing");
    }
  } finally {
    await page.keyboard.up("Space");
  }
  console.log("Water landing", await d.info());
  await chapter("敵から離れ、水へ飛び込んで落下を回避", 4.68);
}
