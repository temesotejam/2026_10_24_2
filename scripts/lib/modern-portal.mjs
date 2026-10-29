/** Revision3 portal progression through real inventory, keyboard and mouse only.
 * No fixture imports, teleports, world edits, or direct inventory APIs. */
import assert from "node:assert/strict";
import { wait } from "./survival-driver.mjs";
const empty = (id) => [0, 16, 22, 23, 25, 33].includes(id);
const solidBlock = (id) => ![0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43].includes(id);

export function createModernPortal(page, d, a) {
  async function placeOnTop(cell, id, block) {
    if ((await d.block(cell)) === block) return;
    if (![0, 5].includes(await d.block(cell))) {
      const existing = await d.block(cell);
      assert.ok(
        ![8, 14, 15, 28, 31, 38, 39, 40].includes(existing),
        "preserve completed frame and protected cells",
      );
      await d.mine(cell);
    }
    assert.ok(
      [0, 5].includes(await d.block(cell)),
      `clear or water-filled placement cell ${JSON.stringify(cell)}`,
    );
    await d.equip(id);
    let hit;
    const support = { x: cell.x, y: cell.y - 1, z: cell.z };
    for (let attempt = 0; attempt < 10; attempt++) {
      await d.aim({ x: cell.x + 0.5, y: cell.y - 0.01, z: cell.z + 0.5 });
      hit = await page.evaluate(() => window.__mc.target());
      if (hit && hit.x === support.x && hit.y === support.y && hit.z === support.z) break;
      assert.ok(hit, "see a real supporting face for ordinary placement");
      const id = await d.block(hit),
        p = (await d.info()).position;
      assert.ok(
        ![8, 14, 15, 28, 31, 38, 39, 40].includes(id),
        "keep the portal frame and protected blocks while clearing scaffolding",
      );
      assert.ok(
        !(hit.x === Math.floor(p.x) && hit.z === Math.floor(p.z) && hit.y < Math.round(p.y)),
        "keep the platform supporting the player",
      );
      await d.mine(hit);
    }
    assert.deepEqual(
      hit,
      support,
      `aim at the actual supporting top face for ${JSON.stringify(cell)}`,
    );
    await d.equip(id);
    await a.right();
    await wait(150);
    assert.equal(await d.block(cell), block, `place owned ${id} through right click`);
  }

  async function buildNetherPortal({ base } = {}) {
    if (!base)
      base = await page.evaluate(() => {
        const mc = window.__mc,
          player = mc.position(),
          y = Math.round(player.y),
          options = [];
        const safe = (id) => ![0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43].includes(id);
        for (let x = Math.floor(player.x) - 10; x <= Math.floor(player.x) + 10; x++)
          for (let z = Math.floor(player.z) - 10; z <= Math.floor(player.z) + 10; z++) {
            let valid = true;
            for (let dx = 0; dx < 4 && valid; dx++)
              for (let dz = 0; dz <= 3 && valid; dz++) {
                if (!safe(mc.blockAt(x + dx, y - 1, z + dz))) {
                  valid = false;
                  break;
                }
                for (let dy = 0; dy <= 6; dy++)
                  if (![0, 16, 22, 23, 25, 33].includes(mc.blockAt(x + dx, y + dy, z + dz))) {
                    valid = false;
                    break;
                  }
              }
            if (valid)
              options.push({ x, y, z, d: Math.hypot(x + 1.5 - player.x, z + 2.5 - player.z) });
          }
        const chosen = options.sort((a, b) => a.d - b.d)[0];
        return chosen ? { x: chosen.x, y: chosen.y, z: chosen.z } : null;
      });
    assert.ok(
      base,
      "find a clear flat four-by-four area; an explicit prepared base can be supplied",
    );
    let alreadyBuilt = 0;
    for (let u = 0; u < 4; u++)
      for (let v = 0; v < 5; v++) {
        const required =
          ((u === 0 || u === 3) && v > 0 && v < 4) || ((v === 0 || v === 4) && u > 0 && u < 3);
        if (required && (await d.block({ x: base.x + u, y: base.y + v, z: base.z })) === 28)
          alreadyBuilt++;
      }
    assert.ok(
      (await d.count("obsidian")) >= 10 - alreadyBuilt,
      "own all remaining naturally gathered frame blocks",
    );
    if (alreadyBuilt === 10) {
      const cells = [];
      for (let u = 1; u <= 2; u++)
        for (let v = 1; v <= 3; v++) cells.push({ x: base.x + u, y: base.y + v, z: base.z });
      let lit = true;
      for (const cell of cells) if ((await d.block(cell)) !== 31) lit = false;
      if (lit) return { base, entry: cells[0], interior: cells };
    }
    const scaffold = { x: base.x + 1, z: base.z + 2 };
    d.setGoal("採掘した黒曜石で、ネザーゲートの枠を一から組み立てます。");
    await a.surfaceTo(scaffold);
    await d.walk(scaffold.x + 0.5, scaffold.z + 0.5, false, 0.1);
    while ((await d.info()).position.y > base.y + 0.2) {
      const p = (await d.info()).position;
      const under = { x: Math.floor(p.x), y: Math.round(p.y) - 1, z: Math.floor(p.z) };
      assert.ok(under.y >= base.y, "recover only the earlier scaffold, not the original floor");
      await d.equip((await d.count("iron_pick")) ? "iron_pick" : "diamond_pick");
      await d.mine(under);
      await wait(700);
    }
    // A temporary wall supports each placement. The six interior blocks are
    // mined away after the lintel is complete; the four corners may remain dirt.
    const interior = [];
    for (let v = 0; v < 5; v++) {
      if (v) await a.pillarTo(base.y + v);
      for (const u of [3, 0, 2, 1]) {
        await d.checkThreat();
        const cell = { x: base.x + u, y: base.y + v, z: base.z };
        const corner = (u === 0 || u === 3) && (v === 0 || v === 4);
        const inner = u > 0 && u < 3 && v > 0 && v < 4;
        if (corner || inner) {
          if (solidBlock(await d.block(cell))) {
            if (inner) interior.push(cell);
            continue;
          }
          if (!empty(await d.block(cell)))
            assert.fail(`prepare the portal cell normally: ${JSON.stringify(cell)}`);
          if ((await d.block(cell)) !== 0) await d.mine(cell);
          const material = await d.chooseMaterial();
          await placeOnTop(cell, material.id, material.block);
          if (inner) interior.push(cell);
        } else await placeOnTop(cell, "obsidian", 28);
      }
    }
    // Recover the real scaffold by mining downward, never changing player state.
    while ((await d.info()).position.y > base.y + 0.2) {
      const p = (await d.info()).position;
      const under = { x: Math.floor(p.x), y: Math.round(p.y) - 1, z: Math.floor(p.z) };
      assert.ok(under.y >= base.y, "do not dig below the original safe floor");
      await d.equip((await d.count("iron_pick")) ? "iron_pick" : "diamond_pick");
      await d.mine(under);
      await wait(700);
    }
    for (const cell of interior.sort((a, b) => b.y - a.y)) {
      await d.equip((await d.count("iron_pick")) ? "iron_pick" : "diamond_pick");
      await d.mine(cell);
      await wait(100);
    }
    await d.equip("flintSteel");
    await d.aim({ x: base.x + 1.5, y: base.y + 0.5, z: base.z + 0.5 });
    await a.right();
    const entry = { x: base.x + 1, y: base.y + 1, z: base.z };
    await page.waitForFunction(
      (p) => window.__mc.blockAt(p.x, p.y, p.z) === 31,
      { timeout: 5000 },
      entry,
    );
    for (let u = 1; u <= 2; u++)
      for (let v = 1; v <= 3; v++)
        assert.equal(
          await d.block({ x: base.x + u, y: base.y + v, z: base.z }),
          31,
          "six naturally ignited portal cells",
        );
    await d.report("自然に集めた黒曜石10個で枠を建造し、火打石で点火");
    return {
      base,
      entry,
      interior: Array.from({ length: 6 }, (_, i) => ({
        x: base.x + 1 + (i % 2),
        y: base.y + 1 + Math.floor(i / 2),
        z: base.z,
      })),
    };
  }

  async function finishTravel(destination, action) {
    const arrived = page.waitForFunction(
      (target) => window.__mc?.adventure().dimension === target,
      { timeout: 120000 },
      destination,
    );
    void arrived.catch(() => {
      /* The main await below reports navigation failure. */
    });
    try {
      await action();
    } catch (error) {
      if (!/Execution context was destroyed|Cannot find context|Target closed/.test(String(error)))
        throw error;
    }
    await arrived;
    await a.boot();
    await page.select("#render-scale", "0.5");
    if ((await page.evaluate(() => window.__mc.mode())) !== "pointer") {
      await page.locator("#play-button").click();
      await page.waitForFunction(() => window.__mc.mode() === "pointer");
    }
  }
  async function enterNetherPortal(destination, entry) {
    d.setGoal(
      destination === "nether"
        ? "点火したゲートの中に入り、ネザーへ渡ります。"
        : "ゲートの中に入り、通常世界へ帰ります。",
    );
    for (const id of [
      "iron_sword",
      "stone_sword",
      "wood_sword",
      "diamond_pick",
      "iron_pick",
      "stone_pick",
    ])
      if (await d.count(id)) {
        await d.equip(id);
        break;
      }
    await finishTravel(destination, async () => {
      const p = (await d.info()).position;
      await d.walk(entry.x + 0.5, entry.z + 0.5, p.y < entry.y - 0.1, 0.12, 0);
      await wait(4600);
    });
  }
  async function enterEndPortal(destination, gate) {
    d.setGoal(
      destination === "end"
        ? "開いたエンドゲートへ歩いて入ります。"
        : "討伐後の帰還ゲートへ歩いて戻ります。",
    );
    for (const id of [
      "iron_sword",
      "stone_sword",
      "wood_sword",
      "diamond_pick",
      "iron_pick",
      "stone_pick",
    ])
      if (await d.count(id)) {
        await d.equip(id);
        break;
      }
    await finishTravel(destination, async () => {
      const p = (await d.info()).position;
      await d.walk(gate.x + 0.5, gate.z + 0.5, p.y < gate.y - 0.1, 0.12, 0);
      await wait(500);
    });
  }

  /** Cool actual naturally generated lava cells; no lava creation or repeated
   * cooling of a single duplicated source. Call near a dry ledge by the pool. */
  async function gatherObsidian(
    target = 10,
    { lava, stand, resume, onProgress = () => undefined } = {},
  ) {
    assert.ok((await d.count("diamond_pick")) > 0, "own a normally crafted diamond pickaxe");
    assert.ok(
      (await d.count("waterBucket")) > 0 || resume?.waterSupport,
      "own a real water source in a bucket or resume beside the same placed source",
    );
    if (stand) {
      await d.tunnelTo(stand);
      await d.walk(stand.x + 0.5, stand.z + 0.5, false, 0.12);
    }
    if (!lava)
      lava = await page.evaluate(() => {
        const mc = window.__mc,
          p = mc.position(),
          list = [];
        for (let x = Math.floor(p.x) - 4; x <= Math.floor(p.x) + 4; x++)
          for (let z = Math.floor(p.z) - 4; z <= Math.floor(p.z) + 4; z++)
            for (let y = Math.max(1, Math.floor(p.y) - 3); y <= Math.floor(p.y); y++)
              if (mc.blockAt(x, y, z) === 26 && mc.blockAt(x, y + 1, z) === 0) {
                const distance = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y - 1.62, z + 0.5 - p.z);
                if (distance < 4.4) list.push({ x, y, z, d: distance });
              }
        const found = list.sort((a, b) => a.d - b.d)[0];
        return found ? { x: found.x, y: found.y, z: found.z } : null;
      });
    assert.ok(lava, "approach an exposed natural lava pool from a dry ledge within bucket reach");
    if (!resume?.waterSupport)
      assert.equal(await d.block(lava), 26, "selected lava genuinely exists before cooling");
    d.setGoal("自然の溶岩へ水を流し、ダイヤのツルハシで黒曜石を採掘します。");
    const waterSupport =
      resume?.waterSupport ??
      (await page.evaluate((lava) => {
        const mc = window.__mc,
          player = mc.position(),
          options = [];
        const solid = (id) => ![0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43].includes(id);
        for (let dx = -3; dx <= 3; dx++)
          for (let dz = -3; dz <= 3; dz++) {
            if (Math.abs(dx) + Math.abs(dz) > 3) continue;
            const x = lava.x + dx,
              z = lava.z + dz,
              y = lava.y;
            if (solid(mc.blockAt(x, y, z)) && mc.blockAt(x, y + 1, z) === 0) {
              const d = Math.hypot(
                x + 0.5 - player.x,
                y + 0.99 - player.y - 1.62,
                z + 0.5 - player.z,
              );
              if (d < 4.4) options.push({ x, y, z, d });
            }
          }
        const best = options.sort((a, b) => a.d - b.d)[0];
        return best ? { x: best.x, y: best.y, z: best.z } : null;
      }, lava));
    assert.ok(waterSupport, "find an exposed solid bank beside the real lava pool");
    if (!resume?.waterSupport) {
      await d.equip("waterBucket");
      await d.aim({ x: waterSupport.x + 0.5, y: waterSupport.y + 0.99, z: waterSupport.z + 0.5 });
      assert.deepEqual(
        await page.evaluate(() => window.__mc.target()),
        waterSupport,
        "aim at the real solid bank before pouring the owned bucket",
      );
      await a.right();
      assert.equal(
        await d.block({ ...waterSupport, y: waterSupport.y + 1 }),
        5,
        "place the actual bucket source above the bank",
      );
      await onProgress({
        lava,
        waterSupport,
        mined: [],
        pending: null,
        inventoryCount: await d.count("obsidian"),
      });
      await page.waitForFunction(
        (p) => window.__mc.blockAt(p.x, p.y, p.z) === 28,
        { timeout: 15000 },
        lava,
      );
    } else
      assert.equal(
        await d.block({ ...waterSupport, y: waterSupport.y + 1 }),
        5,
        "the same normally placed source is still present on resume",
      );
    const deadline = Date.now() + 360000;
    const mined = [...(resume?.mined ?? [])];
    let pending = resume?.pending ?? null;
    const progress = async () =>
      onProgress({
        lava,
        waterSupport,
        mined: [...mined],
        pending,
        inventoryCount: await d.count("obsidian"),
      });
    await progress();
    while ((await d.count("obsidian")) < target) {
      assert.ok(
        Date.now() < deadline,
        "collect ten cooled natural source cells within the expedition",
      );
      await d.checkThreat();
      const p = (await d.info()).position;
      const next =
        pending ??
        (await page.evaluate(
          ({ p, lava }) => {
            const mc = window.__mc,
              list = [];
            for (let x = lava.x - 5; x <= lava.x + 5; x++)
              for (let z = lava.z - 5; z <= lava.z + 5; z++)
                for (let y = lava.y; y <= lava.y; y++)
                  if (mc.blockAt(x, y, z) === 28) {
                    const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y - 1.62, z + 0.5 - p.z);
                    if (d <= 4.4) list.push({ x, y, z, d });
                  }
            const found = list.sort((a, b) => a.d - b.d)[0];
            return found ? { x: found.x, y: found.y, z: found.z } : null;
          },
          { p, lava },
        ));
      assert.ok(
        next,
        "remaining cooled natural obsidian is reachable; move along the safe dry bank before continuing",
      );
      const countBefore = await d.count("obsidian");
      if (!pending) {
        await d.equip("diamond_pick");
        await d.mine(next, async () => (await d.block(next)) !== 28);
        mined.push({ ...next });
        pending = { ...next };
        await progress();
      }
      await wait(600);
      // Keep the mining route at the original bank height. The water cools the
      // exposed lava underneath, then an owned block closes the hole. Walking
      // onto that safe backfill brings the actual dropped obsidian into pickup
      // range instead of merely counting destroyed blocks as inventory.
      for (let y = next.y; y <= lava.y; y++) {
        const cell = { x: next.x, y, z: next.z };
        if (solidBlock(await d.block(cell))) continue;
        const below = { ...cell, y: y - 1 };
        await page.waitForFunction(
          (p) => ![0, 5, 26].includes(window.__mc.blockAt(p.x, p.y, p.z)),
          { timeout: 15000 },
          below,
        );
        const material = await d.chooseMaterial();
        await placeOnTop(cell, material.id, material.block);
      }
      await d.equip("diamond_pick");
      await d.tunnelTo({ x: next.x, z: next.z });
      await wait(600);
      if ((await d.count("obsidian")) === countBefore) {
        const p = (await d.info()).position;
        const under = { x: Math.floor(p.x), y: Math.round(p.y) - 1, z: Math.floor(p.z) };
        // A drop may have fallen one level before the lower lava cooled.
        // Recover it through ordinary motion, then rebuild that one step.
        if (under.y === lava.y && solidBlock(await d.block({ ...under, y: under.y - 1 }))) {
          d.narrate("落ちた黒曜石を拾うため、一段だけ下りて回収します。", 1);
          await d.equip("diamond_pick");
          await d.mine(under);
          await wait(700);
          assert.ok(
            (await d.info()).position.y >= lava.y - 0.2,
            "the cooled lower block supports pickup",
          );
          await wait(500);
          await a.pillarTo(lava.y + 1);
          await wait(300);
        }
      }
      assert.ok((await d.info()).health > 0, "survive the real obsidian mining expedition");
      pending = null;
      await progress();
    }
    // Preserve the one real source for later use; flowing water is never
    // counted as another bucket or a newly created lava source.
    if (await d.count("bucket")) {
      await d.equip("diamond_pick");
      await d.tunnelTo({ x: waterSupport.x, z: waterSupport.z });
      const source = { x: waterSupport.x, y: waterSupport.y + 1, z: waterSupport.z };
      if ((await d.block(source)) === 5) {
        await d.equip("bucket");
        await d.aim({ x: source.x + 0.5, y: source.y + 0.5, z: source.z + 0.5 });
        await a.right();
      }
    }
    await d.report(`自然溶岩を水で冷却し、ダイヤのツルハシで黒曜石を${target}個採掘`);
    return { lava, waterSupport, mined, inventoryCount: await d.count("obsidian") };
  }
  return { buildNetherPortal, enterNetherPortal, enterEndPortal, gatherObsidian };
}
