/** Escape the observed water corner by approaching its low step squarely. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, meta, flush, chapter, out }) {
  a.setGuard(async () => false);
  d.setThreatHandler(null);
  d.setGoal("水際の低い段差に正面から近づき、地面へ上がります。");
  const start = (await d.info()).position;
  assert.ok(Math.hypot(start.x - 175, start.z + 153) < 8, "use the actually observed low bank");
  try {
    for (const q of [
      { x: 175, z: -151.5 },
      { x: 173.5, z: -151.5 },
      { x: 172.5, z: -151.5 },
    ]) {
      const until = Date.now() + 15000;
      await page.keyboard.down("Space");
      while (Date.now() < until) {
        const s = await d.info();
        assert.ok(s.health > 0, "survive the bank exit");
        if (Math.hypot(s.position.x - q.x, s.position.z - q.z) < 0.2) break;
        await d.aim({ x: q.x, y: s.position.y + 1.62, z: q.z }, 0);
        await page.keyboard.down("KeyW");
        await wait(80);
      }
      await page.keyboard.up("KeyW");
      await page.keyboard.up("Space");
      console.log("Observed low bank step", q, (await d.info()).position);
      assert.ok(
        Math.hypot((await d.info()).position.x - q.x, (await d.info()).position.z - q.z) < 0.3,
        "reach each observed low bank step",
      );
    }
    await wait(600);
    const p = (await d.info()).position;
    assert.notEqual(
      await d.block({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) }),
      5,
      "stand outside the water",
    );
    await chapter("低い岸へ順番に泳ぎ、地面へ脱出", 4);
    const fishing = await import("./phase-4.9.mjs");
    await fishing.run({ page, d, a, meta, flush, chapter, out });
  } finally {
    await page.keyboard.up("KeyW");
    await page.keyboard.up("Space");
  }
}
