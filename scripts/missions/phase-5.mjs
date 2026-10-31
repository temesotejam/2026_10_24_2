/** Natural lava expedition and player-built portal, using ordinary inputs only. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { craftPortableBed, restWithPortableBed } from "../lib/portable-bed.mjs";
import { restInVillage } from "../lib/village-rest.mjs";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { createModernPortal } from "../lib/modern-portal.mjs";
const solid = (id) => ![0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43].includes(id);
const safeBody = (id) =>
  ![5, 8, 12, 13, 14, 15, 26, 28, 31, 34, 35, 36, 38, 39, 40, 42, 43].includes(id);

export async function run({ page, d, a, meta, flush, chapter, out }) {
  const village = meta.village;
  assert.ok(village, "remember the village actually discovered in this survival run");
  const guard = createModernHunting(page, d, a, { arrowReserve: 0 });
  guard.activate();
  const modern = createModernPortal(page, d, a);
  const mission = (meta.obsidianMission ??= { staircase: [], notes: [] });
  const record = () => {
    flush();
    writeFileSync(`${out}/obsidian-mission.json`, JSON.stringify(mission, null, 2));
  };
  assert.ok((await d.count("diamond_pick")) > 0, "carry the genuinely crafted diamond pickaxe");
  await a.eat();
  await a.recover(20);
  await craftPortableBed(d);
  const base = { x: village.x, y: village.y, z: village.z + 2 };
  let existingFrame = 0;
  for (let u = 0; u < 4; u++)
    for (let v = 0; v < 5; v++) {
      const required =
        ((u === 0 || u === 3) && v > 0 && v < 4) || ((v === 0 || v === 4) && u > 0 && u < 3);
      if (required && (await d.block({ x: base.x + u, y: base.y + v, z: base.z })) === 28)
        existingFrame++;
    }
  const needed = 10 - existingFrame;
  if ((await d.count("obsidian")) < needed) {
    assert.ok(
      (await d.count("waterBucket")) > 0 || mission.mining?.waterSupport,
      "carry a source of water or resume beside the source already placed in this expedition",
    );
    if ((await d.info()).position.y > 7) {
      // Start outside the houses, well and crop field. The rest of the descent
      // stays under the surface and never imports a route or a modified save.
      if (!mission.staircase.length) {
        await a.surfaceTo({ x: village.x - 12, z: village.z + 1 });
        await d.center();
      }
      d.setGoal("水とダイヤのツルハシを持って、安全な階段を掘りながら自然溶岩を探します。");
      const directions = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ];
      let bridges = 0;
      let bridgeHeading = null;
      for (let step = mission.staircase.length; step < 100; step++) {
        await d.checkThreat();
        await a.eat();
        const state = await d.info(),
          cy = Math.round(state.position.y);
        assert.ok(state.health > 0, "survive the natural cave descent");
        if (cy <= 5) break;
        const x = Math.floor(state.position.x),
          z = Math.floor(state.position.z);
        const preferred = Math.floor(step / 6) % 4;
        let chosen;
        for (const offset of [0, 1, 3, 2]) {
          const [dx, dz] = directions[(preferred + offset) % 4];
          const next = { x: x + dx, z: z + dz };
          if (!solid(await d.block({ ...next, y: cy - 2 }))) continue;
          let safe = true;
          for (const y of [cy + 1, cy, cy - 1])
            if (!safeBody(await d.block({ ...next, y }))) {
              safe = false;
              break;
            }
          if (safe) {
            chosen = next;
            break;
          }
        }
        await d.equip("diamond_pick");
        if (!chosen) {
          // A natural air pocket or lava can remove the next stair's floor.
          // Bridge at the CURRENT height until solid rock supports a descent.
          assert.ok(
            ++bridges < 40,
            "find natural rock beyond the cave instead of descending into fluid",
          );
          bridgeHeading ??= directions[preferred];
          const [dx, dz] = bridgeHeading;
          await d.tunnelTo({ x: x + dx, z: z + dz });
          mission.notes.push({
            kind: "bridged-cave",
            from: { x, y: cy, z },
            to: { x: x + dx, z: z + dz },
          });
          record();
          continue;
        }
        bridgeHeading = null;
        for (const y of [cy + 1, cy, cy - 1]) {
          const cell = { ...chosen, y },
            id = await d.block(cell);
          if (id !== 0) {
            assert.ok(safeBody(id), "clear only ordinary safe stair blocks");
            await d.mine(cell);
          }
        }
        await d.walk(chosen.x + 0.5, chosen.z + 0.5, false, 0.12, 100);
        await page.waitForFunction(
          (y) => Math.abs(window.__mc.position().y - y) < 0.12,
          { timeout: 10000 },
          cy - 1,
        );
        mission.staircase.push({ ...chosen, y: cy - 1 });
        if (mission.staircase.length % 8 === 0 && (await d.count("torch")) > 0) await d.light();
        record();
      }
    }
    assert.ok(
      (await d.info()).position.y < 7,
      "reach the deep natural-lava level via mined stairs",
    );
    await d.equip("diamond_pick");
    const pool =
      mission.mining?.waterSupport && mission.pool
        ? mission.pool
        : await page.evaluate(() => {
            const mc = window.__mc,
              p = mc.position(),
              options = [];
            const solid = (id) => ![0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43].includes(id);
            const clearable = (id) =>
              ![5, 8, 12, 13, 14, 15, 26, 28, 31, 34, 35, 36, 38, 39, 40, 42, 43].includes(id);
            const cx = Math.floor(p.x),
              cz = Math.floor(p.z);
            for (let x = cx - 36; x <= cx + 36; x++)
              for (let z = cz - 36; z <= cz + 36; z++) {
                if (
                  mc.blockAt(x, 4, z) !== 26 ||
                  !clearable(mc.blockAt(x, 5, z)) ||
                  !clearable(mc.blockAt(x, 6, z))
                )
                  continue;
                let amount = 0;
                for (let dx = -4; dx <= 4; dx++)
                  for (let dz = -4; dz <= 4; dz++)
                    if (Math.abs(dx) + Math.abs(dz) <= 5 && mc.blockAt(x + dx, 4, z + dz) === 26)
                      amount++;
                if (amount < 12) continue;
                for (const [dx, dz] of [
                  [1, 0],
                  [-1, 0],
                  [0, 1],
                  [0, -1],
                ]) {
                  const bx = x + dx,
                    bz = z + dz;
                  if (!solid(mc.blockAt(bx, 4, bz))) continue;
                  if (![5, 6, 7].every((y) => clearable(mc.blockAt(bx, y, bz)))) continue;
                  options.push({
                    lava: { x, y: 4, z },
                    bank: { x: bx, y: 5, z: bz },
                    amount,
                    score: Math.hypot(bx + 0.5 - p.x, bz + 0.5 - p.z) - Math.min(amount, 25) * 0.2,
                  });
                }
              }
            return options.sort((a, b) => a.score - b.score)[0] ?? null;
          });
    assert.ok(
      pool,
      "discover a natural lava pool with at least twelve source cells and a solid bank",
    );
    mission.pool = pool;
    record();
    d.setGoal("自然の溶岩だまりを見つけました。乾いた岸へ、安全な通路を掘って進みます。");
    await d.tunnelTo(pool.bank);
    await d.walk(pool.bank.x + 0.5, pool.bank.z + 0.5, false, 0.12, 200);
    assert.ok(
      Math.abs((await d.info()).position.y - 5) < 0.2,
      "stand on the real solid bank beside lava",
    );
    // Clear the top of the actual lava source from the dry bank. Never step
    // into the pool, and never place lava to manufacture extra source cells.
    for (const y of mission.mining?.waterSupport ? [] : [7, 6, 5]) {
      const cell = { x: pool.lava.x, y, z: pool.lava.z };
      const id = await d.block(cell);
      if (id !== 0) {
        assert.ok(safeBody(id), "open the natural pool without removing a hazardous fluid");
        await d.mine(cell);
      }
    }
    await page.screenshot({ path: `${out}/natural-lava-before-cooling.png` });
    mission.sourceObservation ??= {
      lavaId: await d.block(pool.lava),
      bankFloorId: await d.block({ ...pool.bank, y: 4 }),
      beforeInventory: await d.count("obsidian"),
    };
    record();
    mission.mining = await modern.gatherObsidian(needed, {
      lava: pool.lava,
      resume: mission.mining,
      onProgress: (progress) => {
        mission.mining = progress;
        record();
      },
    });
    assert.ok(
      (await d.count("obsidian")) >= needed,
      "actual obsidian was picked up into the normal inventory",
    );
    record();
    await page.screenshot({ path: `${out}/natural-obsidian-collected.png` });
  }
  await restWithPortableBed(page, d, a, meta, flush);
  if ((await d.info()).position.y < village.y - 2) await a.reachSurface();
  await a.surfaceTo({ x: village.x + 2, z: village.z + 1 });
  await a.eat();
  await a.recover(18);
  meta.portal = await modern.buildNetherPortal({ base });
  record();
  await page.screenshot({ path: `${out}/player-built-nether-portal.png` });
  await restInVillage(page, d, a, village, meta, flush);
  await chapter("自然溶岩を水で冷却して黒曜石10個を採掘し、自分でネザーゲートを建造・点火", 6);
}
