/** Move along this run's real cooled bank before collecting the last obsidian. */
import assert from "node:assert/strict";
import { createModernPortal } from "../lib/modern-portal.mjs";
export async function run(ctx) {
  const { page, d, a, meta, flush, chapter, out } = ctx;
  a.setGuard(async () => false);
  const mission = meta.obsidianMission,
    lava = mission.mining.lava;
  const remaining = await page.evaluate((lava) => {
    const mc = window.__mc,
      p = mc.position(),
      obsidian = [],
      banks = [];
    for (let x = lava.x - 10; x <= lava.x + 10; x++)
      for (let z = lava.z - 10; z <= lava.z + 10; z++) {
        const block = mc.blockAt(x, lava.y, z);
        if (block === 28) obsidian.push({ x, y: lava.y, z });
        if (
          [2, 3, 11].includes(block) &&
          [0, 5].includes(mc.blockAt(x, lava.y + 1, z)) &&
          [0, 5].includes(mc.blockAt(x, lava.y + 2, z))
        )
          banks.push({ x, y: lava.y + 1, z });
      }
    const approaches = [];
    for (const b of banks)
      for (const o of obsidian) {
        const reach = Math.hypot(b.x - o.x, 2.12, b.z - o.z);
        if (reach <= 4.2)
          approaches.push({ ...b, score: Math.hypot(b.x + 0.5 - p.x, b.z + 0.5 - p.z) + reach });
      }
    return { obsidian, banks, approach: approaches.sort((a, b) => a.score - b.score)[0] };
  }, lava);
  console.log("ACTUAL_COOLING_BANK", JSON.stringify(remaining));
  assert.ok(remaining.approach, "find actual cooled obsidian reachable from a dry solid bank");
  d.setGoal("冷やした溶岩の岸を移動し、残りの黒曜石を採掘できる場所へ近づきます。");
  await d.tunnelTo(remaining.approach);
  await a.move(remaining.approach.x + 0.5, remaining.approach.z + 0.5, false, 0.15);
  mission.mining = await createModernPortal(page, d, a).gatherObsidian(10, {
    lava,
    resume: mission.mining,
    onProgress: (p) => {
      mission.mining = p;
      flush();
    },
  });
  flush();
  assert.ok((await d.count("obsidian")) >= 10);
  const finish = await import("./phase-5.mjs");
  await finish.run({ page, d, a, meta, flush, chapter, out });
}
