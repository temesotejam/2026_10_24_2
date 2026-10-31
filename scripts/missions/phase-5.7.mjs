/** Wait for real daylight, then reclaim the recorded equipment drop. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { restWithPortableBed } from "../lib/portable-bed.mjs";
export async function run(ctx) {
  const { page, d, a, meta, flush, chapter, out } = ctx;
  a.setGuard(async () => false);
  // The second death dropped the tools; the following empty-handed death did not.
  const grave = meta.equipmentDeath ?? meta.deaths[1].position;
  meta.equipmentDeath = grave;
  flush();
  d.setGoal("地下で本当に朝になるまで待ち、日光で敵が減ってから装備を回収します。");
  const until = Date.now() + 480000;
  while (true) {
    const time = await page.evaluate(() => window.__mc.time());
    assert.ok((await d.info()).health > 0 && Date.now() < until, "survive the actual dawn wait");
    if (time % 1200 >= 60 && time % 1200 < 700) break;
    await wait(1000);
  }
  console.log(
    "NATIVE_DAWN_RECOVERY",
    JSON.stringify({
      time: await page.evaluate(() => window.__mc.time()),
      p: (await d.info()).position,
      grave,
    }),
  );
  const start = (await d.info()).position;
  const steps = meta.obsidianMission.staircase
    .filter((s) => s.y >= Math.floor(start.y) - 0.1)
    .reverse();
  assert.ok(steps.length);
  await d.tunnelTo(steps[0]);
  for (const step of steps) await a.move(step.x + 0.5, step.z + 0.5, true, 0.25);
  await page.keyboard.down("ControlLeft");
  try {
    await a.surfaceTo(grave);
    await a.move(grave.x, grave.z, true, 0.35);
  } finally {
    await page.keyboard.up("ControlLeft");
  }
  await wait(700);
  assert.ok(
    await d.count("diamond_pick"),
    "recover actual equipment at the original item-bearing death",
  );
  assert.ok((await d.count("obsidian")) >= 10, "recover the ten actually mined obsidian");
  meta.gearRecoveries ??= [];
  meta.gearRecoveries.push({
    position: (await d.info()).position,
    inventory: (await d.info()).inventory,
    time: await page.evaluate(() => window.__mc.time()),
  });
  flush();
  await a.eat();
  await restWithPortableBed(page, d, a, meta, flush);
  const finish = await import("./phase-5.mjs");
  await finish.run({ page, d, a, meta, flush, chapter, out });
}
