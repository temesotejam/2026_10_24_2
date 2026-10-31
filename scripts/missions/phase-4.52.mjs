/** Recover on the real perch and let the normal night end before leaving it. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  d.setThreatHandler(null);
  const start = await page.evaluate(() => window.__mc.time());
  d.setGoal("高い足場で食事と回復。通常の時間で朝になるのを待ちます。");
  const until = Date.now() + 360000;
  while (true) {
    const s = await d.info();
    assert.ok(s.health > 0, "survive on the real perch");
    const t = await page.evaluate(() => window.__mc.time());
    if (t % 1200 >= 36 && t % 1200 < 744 && s.health >= 20) break;
    assert.ok(Date.now() < until, "normal dawn and recovery within six real minutes");
    await a.eat();
    await wait(800);
  }
  meta.perchDawn = {
    before: start,
    after: await page.evaluate(() => window.__mc.time()),
    health: (await d.info()).health,
    method: "normal-clock-wait-and-ordinary-food-regeneration",
  };
  flush();
  await chapter("実際に積んだ足場で食事と回復を行い、自然に朝になるまで待機", 4);
}
