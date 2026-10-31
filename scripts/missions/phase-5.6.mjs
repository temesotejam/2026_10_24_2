/** Recover the actual surface death by climbing the stairs mined in this run. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { restWithPortableBed } from "../lib/portable-bed.mjs";
export async function run(ctx) {
  const { page, d, a, meta, flush, chapter, out } = ctx;
  a.setGuard(async () => false);
  d.setGoal("地下の復活地点から、自分で掘った階段を登り、落とした装備を回収します。");
  if (!(await d.count("diamond_pick"))) {
    const start = (await d.info()).position;
    const steps = meta.obsidianMission.staircase
      .filter((s) => s.y >= Math.floor(start.y) - 0.1)
      .reverse();
    assert.ok(steps.length, "use the recorded real staircase");
    await d.tunnelTo(steps[0]);
    for (const step of steps) await a.move(step.x + 0.5, step.z + 0.5, true, 0.25);
    await a.surfaceTo(meta.lastDeath);
    await a.move(meta.lastDeath.x, meta.lastDeath.z, true, 0.3);
    await wait(700);
  }
  assert.ok(await d.count("diamond_pick"), "recover the actual dropped tools");
  assert.ok((await d.count("obsidian")) >= 10, "recover all ten earned obsidian blocks");
  meta.gearRecoveries ??= [];
  meta.gearRecoveries.push({
    position: (await d.info()).position,
    inventory: (await d.info()).inventory,
    time: await page.evaluate(() => window.__mc.time()),
  });
  flush();
  // Move down the known stairs and use the recovered bed away from surface threats.
  for (const step of meta.obsidianMission.staircase.slice(0, 16)) {
    const p = (await d.info()).position;
    if (step.y <= p.y + 0.2) await a.move(step.x + 0.5, step.z + 0.5, false, 0.3);
  }
  await restWithPortableBed(page, d, a, meta, flush);
  const finish = await import("./phase-5.mjs");
  await finish.run({ page, d, a, meta, flush, chapter, out });
}
