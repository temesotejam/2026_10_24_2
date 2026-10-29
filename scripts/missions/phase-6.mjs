import assert from "node:assert/strict";
import { createModernPortal } from "../lib/modern-portal.mjs";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { stockVillageFood } from "../lib/modern-resources.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  const portal = createModernPortal(page, d, a),
    h = createModernHunting(page, d, a);
  a.setGuard(h.guard);
  if ((await a.adventure()).dimension === "overworld") {
    await stockVillageFood(d, page, a, meta.village, { breadTarget: 24, waitForGrowth: true });
    await a.surfaceTo({ x: meta.portal.entry.x, z: meta.portal.entry.z + 2 });
    await portal.enterNetherPortal("nether", meta.portal.entry);
    meta.netherGate = await page.evaluate(() => {
      const p = window.__mc.position(),
        cells = [];
      for (let x = Math.floor(p.x) - 8; x <= p.x + 8; x++)
        for (let z = Math.floor(p.z) - 8; z <= p.z + 8; z++)
          for (let y = Math.floor(p.y) - 3; y <= p.y + 3; y++)
            if (window.__mc.blockAt(x, y, z) === 31)
              cells.push({ x, y, z, d: Math.hypot(x + 0.5 - p.x, y - p.y, z + 0.5 - p.z) });
      return cells.sort((a, b) => a.d - b.d)[0];
    });
    flush();
    assert.ok(meta.netherGate, "observe the portal created by legitimate first entry");
    const p = (await d.info()).position;
    await a.surfaceTo({ x: Math.floor(p.x), z: Math.floor(p.z) + 2 });
  }
  d.setGoal("ネザーの敵を倒し、エンダーアイに必要なロッドを集めます。");
  meta.netherHunt = await h.collectRods(7, { timeoutMs: 1200000, arrowReserve: 12 });
  flush();
  d.setGoal("必要なロッドを回収できたので、建てたゲートから帰還します。");
  await a.surfaceTo({ x: meta.netherGate.x, z: meta.netherGate.z + 2 });
  await portal.enterNetherPortal("overworld", meta.netherGate);
  assert.equal((await a.adventure()).dimension, "overworld");
  await stockVillageFood(d, page, a, meta.village, { breadTarget: 20, waitForGrowth: true });
  await chapter("ネザーでブレイズロッドを7本集め、通常世界へ帰還", 7);
}
