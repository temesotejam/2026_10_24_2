import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, chapter }) {
  a.setGuard(async () => false);
  await d.releaseAttack();
  d.setGoal("浅瀬で戦うのをやめ、泳いで岸へ上がります。");
  await a.eat();
  console.log("Swimming escape", await d.info());
  await d.aim({ x: 274.5, y: (await d.info()).position.y + 1.6, z: -58.5 }, 0);
  await page.keyboard.down("Space");
  await page.keyboard.down("KeyW");
  try {
    for (let i = 0; i < 24; i++) {
      await wait(150);
      const s = await d.info();
      if (s.health <= 4) break;
      if (s.position.z < -57 && s.position.y >= 34) break;
    }
  } finally {
    await page.keyboard.up("Space");
    await page.keyboard.up("KeyW");
  }
  console.log("Swimming result", await d.info());
  assert.ok((await d.info()).health > 0);
  await chapter("浅瀬から泳いで岸へ避難", 4);
}
