/** Recover the real completion materials, sleep above hostile reach, and resupply. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run(ctx) {
  const { page, d, a, meta, flush, chapter } = ctx;
  a.setGuard(async () => false);
  d.setThreatHandler(null);
  const v = meta.village,
    g = { ...meta.lastDeath };
  d.setGoal("落としたパール10個と装備を回収し、敵から離れた高い足場で休みます。");
  await page.keyboard.down("ControlLeft");
  try {
    await d.walk(g.x, g.z, false, 0.18, 0);
  } finally {
    await page.keyboard.up("ControlLeft");
  }
  await page.waitForFunction(
    () =>
      window.__mc
        .inventory()
        .filter((s) => s?.id === "enderPearl")
        .reduce((n, s) => n + s.count, 0) >= 10,
    { timeout: 1500 },
  );
  assert.ok(await d.count("diamond_pick"));
  assert.ok(await d.count("enderEye"));
  (meta.gearRecoveries ??= []).push({
    position: (await d.info()).position,
    inventory: (await d.info()).inventory,
    method: "native-recovery-of-ten-pearls-and-crafted-eye",
  });
  flush();
  // Exit the low doorway before building; continuous motion avoids the old
  // controller's idle settling delay beside the enemies.
  await page.keyboard.down("ControlLeft");
  try {
    await d.walk(g.x, g.z - 3, true, 0.18, 0);
  } finally {
    await page.keyboard.up("ControlLeft");
  }
  await d.center();
  const p = (await d.info()).position,
    base = { x: Math.floor(p.x), y: Math.round(p.y), z: Math.floor(p.z) };
  const target = await page.evaluate((p) => {
    let highest = p.y;
    for (let x = Math.floor(p.x) - 20; x <= p.x + 20; x++)
      for (let z = Math.floor(p.z) - 20; z <= p.z + 20; z++)
        for (let y = 90; y > 0; y--)
          if ([1, 2, 9].includes(window.__mc.blockAt(x, y, z))) {
            highest = Math.max(highest, y + 1);
            break;
          }
    return Math.min(86, Math.ceil(highest) + 6);
  }, p);
  d.setGoal("手持ちの土と丸石を積み、地上の敵から上下に離れた寝床を作ります。");
  for (let y = base.y; y < target; y++) {
    for (const yy of [y + 1, y + 2])
      if (![0, 5, 16, 22, 23, 25].includes(await d.block({ x: base.x, y: yy, z: base.z }))) {
        await page.keyboard.up("Space");
        await d.mine({ x: base.x, y: yy, z: base.z });
      }
    const material = await d.chooseMaterial();
    await d.equip(material.id);
    await d.aim({ x: base.x + 0.5, y: y - 0.5, z: base.z + 0.5 }, 0);
    await page.keyboard.down("Space");
    const until = Date.now() + 6000;
    while ((await d.block({ x: base.x, y, z: base.z })) !== material.block) {
      assert.ok((await d.info()).health > 0, "survive paid sky-platform building");
      assert.ok(Date.now() < until, "jump-place the actual pillar block");
      await a.right();
      await wait(25);
    }
  }
  await page.keyboard.up("Space");
  const bridge = await d.bridge(base.x + 1, target, base.z);
  await d.walk(base.x + 0.5, base.z + 0.5, false, 0.12, 0);
  const bed = { x: bridge.x, y: target, z: bridge.z };
  await d.equip("bed");
  await d.aim({ x: bed.x + 0.5, y: bed.y - 0.01, z: bed.z + 0.5 });
  await a.right();
  assert.equal(await d.block(bed), 15, "place the carried bed on the real bridge block");
  await d.equip("iron_sword");
  const before = await page.evaluate(() => window.__mc.time());
  await a.useAt(bed);
  await wait(600);
  const after = await page.evaluate(() => ({
    time: window.__mc.time(),
    notice: document.querySelector("#toast")?.textContent,
  }));
  (meta.bedVisits ??= []).push({
    before,
    after: after.time,
    slept: after.time - before > 10,
    notice: after.notice,
    site: bed,
  });
  meta.bedLocation = bed;
  meta.skyBed = { ...bed, base, target };
  flush();
  assert.ok(after.time - before > 10, "sleep through the actual night using the placed bed");
  console.log("Native sky-bed sleep", JSON.stringify({ before, ...after, bed }));
  // Sunlight clears exposed undead while we remove our pillar one real block
  // at a time; the bed and its supported bridge remain as the return spawn.
  await wait(8000);
  d.setGoal("朝になりました。柱を1段ずつ掘って地上へ戻り、井戸で食料を補給します。");
  while ((await d.info()).position.y > v.y + 1.1) {
    const here = (await d.info()).position,
      old = Math.round(here.y);
    await d.mine({ x: Math.floor(here.x), y: old - 1, z: Math.floor(here.z) });
    await page.waitForFunction((y) => window.__mc.position().y <= y - 0.9, { timeout: 5000 }, old);
  }
  await chapter("パール10個とアイを回収し、高い足場の自作ベッドで夜を越える", 4);
  const fish = await import("./phase-4.92.mjs");
  await fish.run(ctx);
}
