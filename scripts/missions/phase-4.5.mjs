/** Recover the real grave, build a perch, and use the adjacent real chest from it. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { stashOpenChest } from "../lib/modern-storage.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  d.setThreatHandler(null);
  const v = meta.village,
    g = { ...meta.lastDeath },
    c = v.cacheChest ?? { x: v.x - 7, y: v.y, z: v.z + 5 };
  d.setGoal("村の道を走って装備を回収し、チェスト横に高い足場を作ります。");
  await page.keyboard.down("ControlLeft");
  try {
    await a.move(v.x + 7.5, v.z + 2.5, true);
    await a.surfaceTo({ x: v.x + 7, z: v.z + 1 });
    await a.surfaceTo({ x: Math.floor(g.x), z: Math.floor(g.z) });
    await a.move(g.x, g.z, true, 0.15);
  } finally {
    await page.keyboard.up("ControlLeft");
  }
  await wait(400);
  assert.ok(await d.count("diamond_pick"), "retrieve the actual pick");
  assert.ok(
    (await d.count("blazeRod")) * 2 +
      (await d.count("blazePowder")) +
      (await d.count("enderEye")) >=
      11,
    "retain the genuinely earned rod/powder/eye reserve",
  );
  assert.ok(
    (await d.count("enderPearl")) + (await d.count("enderEye")) >= 7,
    "recover pearls already converted to eyes as well",
  );
  (meta.gearRecoveries ??= []).push({
    position: (await d.info()).position,
    inventory: (await d.info()).inventory,
    method: "native-chest-side-corpse-recovery",
  });
  flush();
  await a.pillarTo(Math.round((await d.info()).position.y) + 2);
  await a.eat();
  d.setGoal("足場の上から元のチェストを開き、砂と生肉を保管して所持品の空きを作ります。");
  assert.equal(await d.block(c), 14, "use the original real chest");
  await d.equip("iron_pick");
  for (let i = 0; i < 8; i++) {
    await d.aim({ x: c.x + 0.5, y: c.y + 0.8, z: c.z + 0.5 });
    const h = await page.evaluate(() => window.__mc.target());
    assert.ok(h, "see the adjacent real chest");
    if (h.x === c.x && h.y === c.y && h.z === c.z) break;
    assert.ok(![8, 12, 13, 14, 15, 28, 31, 38, 39, 40].includes(await d.block(h)));
    await d.mine(h);
  }
  await a.useAt(c);
  await page.waitForSelector('[data-area="chest"]', { timeout: 5000 });
  await stashOpenChest(page, d, ["sand", "rawMeat"]);
  assert.ok(
    (await d.info()).inventory.filter((s) => s === null).length >= 2,
    "two genuine free slots for powder and eye",
  );
  await chapter("落とした装備と素材を回収し、足場からチェストへ余剰品を保管", 4);
}
