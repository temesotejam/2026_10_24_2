/** Recover the genuinely dropped End equipment in daylight, including the flooded pit. */
import assert from "node:assert/strict";
export async function run({ page, d, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  d.setThreatHandler(null);
  const g = { ...meta.lastDeath };
  d.setGoal("朝になったので近くの木の上へ降り、落とした装備の回収へ向かいます。");
  if ((await d.info()).position.y > 50) {
    await page.keyboard.down("ControlLeft");
    try {
      await d.walk(209.5, -79.5, true, 0.2, 0);
    } finally {
      await page.keyboard.up("ControlLeft");
    }
  }
  assert.ok((await d.info()).health > 0, "survive ordinary jump onto the lower tree");
  console.log("Actual descent", JSON.stringify(await d.info()));
  await a.surfaceTo({ x: Math.floor(g.x), z: Math.floor(g.z) });
  const here = (await d.info()).position;
  console.log("Actual grave approach", JSON.stringify(here));
  // The inventory is genuinely down in the water column. Remove the real lid
  // first, then descend only to collect, and immediately swim back to air.
  const x = Math.floor(g.x),
    z = Math.floor(g.z);
  for (let y = Math.floor(here.y) - 1; y >= Math.floor(g.y) + 2; y--) {
    if (![0, 5].includes(await d.block({ x, y, z }))) await d.mine({ x, y, z });
  }
  await d.walk(x + 0.5, z + 0.5, false, 0.16, 0);
  await page.waitForFunction(() => window.__mc.inventory().some((s) => s?.id === "enderEye"), {
    timeout: 10000,
  });
  await a.pillarTo(33);
  assert.ok((await d.info()).health > 0, "swim to actual air after collecting");
  assert.equal(await d.count("enderEye"), 11, "recover all eleven actually crafted eyes");
  assert.ok(await d.count("diamond_pick"), "recover earned mining equipment");
  (meta.gearRecoveries ??= []).push({
    position: (await d.info()).position,
    inventory: (await d.info()).inventory,
    method: "native-daylight-recovery-from-water",
  });
  flush();
  await a.eat();
  await a.recover(20);
  await a.reachSurface();
  await chapter("昼のうちに水場の装備とエンダーアイ11個を回収し、地上へ復帰", 7);
}
