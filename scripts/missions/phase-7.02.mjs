/** Open the actual dirt lid and swim to air, then recover in the sheltered column. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  d.setThreatHandler(null);
  await page.keyboard.down("Space");
  await page.locator("#play-button").click();
  const p = (await d.info()).position;
  await d.aim({ x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 3, z: Math.floor(p.z) + 0.5 }, 0);
  await page.mouse.down();
  try {
    await page.waitForFunction(
      () => {
        const p = window.__mc.position();
        return window.__mc.health() <= 0 || p.y >= 31.5;
      },
      { timeout: 7000 },
    );
  } finally {
    await page.mouse.up();
    await page.keyboard.up("Space");
  }
  assert.ok((await d.info()).health > 0, "surface through the dirt lid before drowning");
  d.setGoal("水面へ出ました。食事を取り、くぼみの中で回復しながら朝を待ちます。");
  while (
    await page.evaluate(() => {
      const t = window.__mc.time() % 1200;
      return t < 36 || t >= 744;
    })
  ) {
    await a.eat();
    await wait(700);
  }
  await a.recover(20);
  meta.endShelter = {
    health: (await d.info()).health,
    after: await page.evaluate(() => window.__mc.time()),
    position: (await d.info()).position,
  };
  flush();
  await chapter("水から脱出し、くぼみで通常の食事と朝待ちで回復", 7);
}
