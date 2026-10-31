import { restInVillage } from "../lib/village-rest.mjs";
import { wait } from "../lib/survival-driver.mjs";
import assert from "node:assert/strict";
import { createModernPortal } from "../lib/modern-portal.mjs";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { stockVillageFood } from "../lib/modern-resources.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  const portal = createModernPortal(page, d, a),
    h = createModernHunting(page, d, a, { arrowReserve: 0 });
  a.setGuard(h.guard);
  if ((await a.adventure()).dimension === "overworld") {
    if (
      await page.evaluate(() => {
        const t = window.__mc.time() % 1200;
        return t >= 744 || t < 24;
      })
    )
      await restInVillage(page, d, a, meta.village, meta, flush);
    await stockVillageFood(d, page, a, meta.village, { breadTarget: 18, waitForGrowth: true });
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
  if ((await d.count("blazeRod")) < 7) {
    if (!meta.netherLanding) {
      meta.netherLanding = await page.evaluate(() => {
        const p = window.__mc.position(),
          list = [];
        for (let x = Math.floor(p.x) - 22; x <= p.x + 22; x++)
          for (let z = Math.floor(p.z) - 22; z <= p.z + 22; z++)
            for (let y = 31; y >= 25; y--) {
              if (
                [29, 32].includes(window.__mc.blockAt(x, y, z)) &&
                [0, 33].includes(window.__mc.blockAt(x, y + 1, z)) &&
                window.__mc.blockAt(x, y + 2, z) === 0 &&
                p.y - y - 1 <= 12
              ) {
                list.push({
                  x,
                  y: y + 1,
                  z,
                  score: Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) + Math.abs(p.y - y - 1) * 0.3,
                });
                break;
              }
            }
        return list.sort((a, b) => a.score - b.score)[0];
      });
      flush();
    }
    assert.ok(meta.netherLanding, "find real dry Nether terrain beyond the arrival portal");
    const landing = meta.netherLanding;
    if ((await d.info()).position.y > landing.y + 2.1) {
      d.setGoal("溶岩を避けて橋を架け、乾いた岸へ降ります。");
      await d.tunnelTo(landing);
      await d.center();
      const p = (await d.info()).position;
      await d.mine({ x: Math.floor(p.x), y: Math.round(p.y) - 1, z: Math.floor(p.z) });
      await wait(1200);
      assert.ok((await d.info()).health > 0, "land on the verified dry shore");
    } else await a.surfaceTo(landing);
    if (!meta.netherCamp) {
      meta.netherCamp = await page.evaluate((g) => {
        const mc = window.__mc,
          options = [];
        const floor = (x, z) => {
          for (let y = 31; y >= 25; y--)
            if (
              [29, 32].includes(mc.blockAt(x, y, z)) &&
              [0, 33].includes(mc.blockAt(x, y + 1, z)) &&
              mc.blockAt(x, y + 2, z) === 0
            )
              return y + 1;
          return null;
        };
        for (let x = g.x - 16; x <= g.x + 16; x += 4)
          for (let z = g.z - 20; z <= g.z + 20; z += 4) {
            const y = floor(x, z);
            if (y === null) continue;
            let good = 0,
              difference = 0;
            for (const r of [10, 15])
              for (let i = 0; i < 16; i++) {
                const h = floor(
                  Math.round(x + Math.cos((i * Math.PI) / 8) * r),
                  Math.round(z + Math.sin((i * Math.PI) / 8) * r),
                );
                if (h !== null) {
                  good++;
                  difference += Math.abs(h - y);
                }
              }
            options.push({
              x,
              y,
              z,
              score: good * 10 - difference - Math.hypot(x - g.x, z - g.z) * 0.2,
            });
          }
        return options.sort((a, b) => b.score - a.score)[0];
      }, meta.netherGate);
      flush();
    }
    if (meta.netherCamp) {
      d.setGoal("溶岩の少ない乾いた台地へ移り、敵を探します。");
      await a.surfaceTo(meta.netherCamp);
    }
    d.setGoal("ネザーの敵を倒し、エンダーアイに必要なロッドを集めます。");
    meta.netherHunt = await h.collectRods(7, {
      timeoutMs: 1200000,
      arrowReserve: 0,
      home: meta.netherCamp ?? meta.netherLanding,
    });
    flush();
  }
  // Once the earned target is met, leave instead of chasing fresh spawns.
  a.setGuard(async () => false);
  await a.eat();
  d.setGoal("必要なロッドを回収できたので、建てたゲートから帰還します。");
  await d.tunnelTo({ x: meta.netherGate.x + 3, z: meta.netherGate.z + 2 });
  await d.center();
  while ((await d.info()).position.y > meta.netherGate.y + 0.2) {
    const p = (await d.info()).position;
    assert.notEqual(
      Math.floor(p.z),
      meta.netherGate.z,
      "descend beside the frame without breaking it",
    );
    await d.mine({ x: Math.floor(p.x), y: Math.round(p.y) - 1, z: Math.floor(p.z) });
    await wait(700);
  }
  await a.pillarTo(meta.netherGate.y);
  await d.tunnelTo({ x: meta.netherGate.x, z: meta.netherGate.z + 2 });
  await portal.enterNetherPortal("overworld", meta.netherGate);
  assert.equal((await a.adventure()).dimension, "overworld");
  h.activate();
  if (
    await page.evaluate(() => {
      const t = window.__mc.time() % 1200;
      return t >= 744 || t < 24;
    })
  )
    await restInVillage(page, d, a, meta.village, meta, flush);
  await stockVillageFood(d, page, a, meta.village, { breadTarget: 18, waitForGrowth: true });
  await chapter("ネザーでブレイズロッドを7本集め、通常世界へ帰還", 7);
}
