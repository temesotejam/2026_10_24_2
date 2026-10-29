/** Recorded, normal-input recovery of the actual Nether death drops. No fixtures. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { createModernPortal } from "../lib/modern-portal.mjs";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { createPillarRecovery } from "../lib/modern-pillar-recovery.mjs";
import { huntingPath } from "../lib/hunting-path.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  const portal = createModernPortal(page, d, a),
    h = createModernHunting(page, d, a, { arrowReserve: 0 }),
    recovery = createPillarRecovery(page, d, a);
  const death = { x: 24.52748708553198, y: 26, z: -21.360592871587514 };
  meta.netherGearRecovery ??= { death, events: [] };
  const record = async (name, extra = {}) => {
    meta.netherGearRecovery.events.push({ name, position: (await d.info()).position, ...extra });
    flush();
  };
  // This navigator never mines, places or enters a portal. Each route treats
  // purple portal cells as solid walls and preserves every obsidian block.
  async function safeWalkTo(target, timeout = 60000) {
    const deadline = Date.now() + timeout;
    while (true) {
      assert.ok(Date.now() < deadline, "walk around the portal without mining its frame");
      const s = await d.info();
      assert.ok(s.health > 0, "survive equipment retrieval");
      if (Math.hypot(s.position.x - target.x, s.position.z - target.z) < 0.2) return;
      const terrain = await page.evaluate(
        ({ p, target }) => {
          const cells = {},
            loX = Math.floor(Math.min(p.x, target.x)) - 4,
            hiX = Math.ceil(Math.max(p.x, target.x)) + 4,
            loZ = Math.floor(Math.min(p.z, target.z)) - 4,
            hiZ = Math.ceil(Math.max(p.z, target.z)) + 4,
            loY = Math.floor(Math.min(p.y, target.y ?? p.y)) - 3,
            hiY = Math.ceil(Math.max(p.y, target.y ?? p.y)) + 5;
          for (let x = loX; x <= hiX; x++)
            for (let z = loZ; z <= hiZ; z++)
              for (let y = loY; y <= hiY; y++)
                cells[`${x},${y},${z}`] = window.__mc.blockAt(x, y, z);
          return cells;
        },
        { p: s.position, target },
      );
      const blockAt = (x, y, z) => {
        const id = terrain[`${x},${y},${z}`] ?? 8;
        return id === 31 ? 28 : id;
      };
      const route = huntingPath(s.position, target, blockAt, {
        radius: 30,
        minimumY: Math.floor(Math.min(s.position.y, target.y ?? s.position.y)) - 2,
        maximumY: Math.ceil(Math.max(s.position.y, target.y ?? s.position.y)) + 2,
        goal: (p) =>
          Math.hypot(p.x - target.x, p.z - target.z) < 0.3 &&
          Math.abs(p.y - (target.y ?? s.position.y)) < 0.2,
      });
      assert.ok(route.reached, `a dry walking route exists to ${JSON.stringify(target)}`);
      if (!route.path.length) {
        // At most half a cell within the already verified destination cell.
        await d.walk(target.x, target.z, false, 0.12, 0);
      } else {
        const next = route.path[0];
        await d.walk(next.x, next.z, next.y > s.position.y + 0.2, 0.16, 0);
      }
    }
  }
  async function observeGate() {
    return page.evaluate(() => {
      const p = window.__mc.position(),
        candidates = [];
      for (let x = Math.floor(p.x) - 10; x <= p.x + 10; x++)
        for (let z = Math.floor(p.z) - 10; z <= p.z + 10; z++)
          for (let y = Math.floor(p.y) - 3; y <= p.y + 3; y++) {
            const b = (dx, dy, dz = 0) => window.__mc.blockAt(x + dx, y + dy, z + dz);
            if (b(0, 0) !== 31 || b(0, -1) !== 28) continue;
            // Native arrival portals have a 2x3 interior along X.
            if (
              [0, 1].every((u) => [0, 1, 2].every((v) => b(u, v) === 31)) &&
              [-1, 2].every((u) => [0, 1, 2].every((v) => b(u, v) === 28)) &&
              [0, 1].every((u) => b(u, 3) === 28)
            )
              candidates.push({ x, y, z, d: Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) });
          }
      return candidates.sort((a, b) => a.d - b.d)[0] ?? null;
    });
  }
  a.setGuard(h.guard);
  if ((await a.adventure()).dimension === "overworld") {
    assert.ok((await d.info()).health >= 18, "recover health before the rescue expedition");
    assert.ok(await d.count("stone_sword"), "carry the normally crafted rescue sword");
    assert.ok((await d.count("cobble")) >= 3, "carry blocks for the real three-high pillar");
    d.setGoal("村で作った石の剣と足場を持ち、ネザーの装備を取り戻しに向かいます。");
    const entry = meta.portal.entry,
      p = (await d.info()).position;
    // Approach beside the frame, then along its front face.
    await a.surfaceTo({ x: entry.x + 5, z: Math.floor(p.z) });
    await a.surfaceTo({ x: entry.x + 5, z: entry.z + 2 });
    await a.surfaceTo({ x: entry.x, z: entry.z + 2 });
    a.setGuard(async () => false);
    await portal.enterNetherPortal("nether", entry);
    await record("entered Nether normally");
  }
  assert.equal((await a.adventure()).dimension, "nether");
  a.setGuard(async () => false);
  const gate = await observeGate();
  assert.ok(
    gate,
    "observe a complete, valid native replacement portal, rather than the broken old gate",
  );
  meta.netherGate = gate;
  meta.netherGearRecovery.gate = gate;
  flush();
  assert.ok([25, 26].includes(gate.y), "observe the native arrival floor");
  async function returnWithGear() {
    a.setGuard(h.guard);
    d.setGoal("新しくつながったゲートの手前を通り、装備を持って通常世界へ帰ります。");
    const p = (await d.info()).position;
    await safeWalkTo({ x: p.x, y: Math.round(p.y), z: gate.z + 2.5 });
    // The first portal column's front cell contains our intact rescue pillar.
    // Use the SECOND interior column, then approach along its unobstructed face.
    await safeWalkTo({ x: gate.x + 1.5, y: gate.y, z: gate.z + 2.5 });
    await safeWalkTo({ x: gate.x + 1.5, y: gate.y, z: gate.z + 1.5 });
    a.setGuard(async () => false);
    assert.equal(await d.block(gate), 31, "the replacement portal remains lit and untouched");
    await portal.enterNetherPortal("overworld", gate);
    assert.equal((await a.adventure()).dimension, "overworld");
    a.setGuard(h.guard);
    await record("returned with rescued equipment");
    await chapter("三段の足場から敵を倒し、失ったロッド・パール・道具を回収して帰還", 6);
  }
  if (
    (await d.count("blazeRod")) >= 13 &&
    (await d.count("enderPearl")) >= 5 &&
    (await d.count("diamond_pick"))
  ) {
    await record("resume with already rescued equipment");
    await returnWithGear();
    return;
  }

  let site = meta.netherGearRecovery.pillar;
  if (!site || Math.abs((await d.info()).position.y - site.y - 3) > 0.2) {
    const front = { x: gate.x + 0.5, y: gate.y, z: gate.z + 2.5 };
    await safeWalkTo(front, 15000);
    site = { x: Math.floor(front.x), y: gate.y, z: Math.floor(front.z) };
    const clear = await page.evaluate((site) => {
      const pass = [0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43];
      if (pass.includes(window.__mc.blockAt(site.x, site.y - 1, site.z))) return false;
      for (let y = site.y; y < site.y + 5; y++)
        if (window.__mc.blockAt(site.x, y, site.z) !== 0) return false;
      return true;
    }, site);
    assert.ok(clear, "the front platform has a real floor and five air blocks above the pillar");
    // Native frames are four blocks high and cannot be climbed by these
    // same-level melee creatures. Do not clear or mine any gate headroom.
    d.setGoal("ゲートの手前に三段の柱を積み、敵の近接攻撃が届かない高さを確保します。");
    await a.pillarTo(site.y + 3);
    meta.netherGearRecovery.pillar = site;
    flush();
    await record("built actual three-block rescue pillar", { site });
  }
  d.setGoal("柱の上から跳ね上がる敵を狙い、包囲している敵を倒します。");
  const battle = await recovery.standAndFight(site, { timeout: 90000 });
  await record("pillar battle", battle);
  assert.ok(battle.cleared, "defeat the initial ember pack before descending to the dropped gear");
  // Step down three blocks onto an observed dry floor. Digging cobble with
  // only a sword would leave us exposed at the second and first pillar levels.
  let landing = null;
  for (const candidate of [
    { x: site.x + 1.5, y: site.y, z: site.z + 0.5 },
    { x: site.x - 0.5, y: site.y, z: site.z + 0.5 },
    { x: site.x + 0.5, y: site.y, z: site.z + 1.5 },
  ]) {
    const dry = await page.evaluate((p) => {
      const pass = [0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43],
        x = Math.floor(p.x),
        z = Math.floor(p.z);
      return (
        !pass.includes(window.__mc.blockAt(x, p.y - 1, z)) &&
        [p.y, p.y + 1, p.y + 2].every((y) => window.__mc.blockAt(x, y, z) === 0)
      );
    }, candidate);
    if (dry) {
      landing = candidate;
      break;
    }
  }
  assert.ok(landing, "observe a dry descent beside the pillar within the native portal platform");
  await page.keyboard.up("ShiftLeft");
  await d.walk(landing.x, landing.z, false, 0.15, 0);
  await wait(600);
  assert.ok(
    Math.abs((await d.info()).position.y - site.y) < 0.15,
    "land on the verified Nether floor",
  );
  a.setGuard(h.guard);
  d.setGoal("壊れた古いゲートの手前へ回り、落としたロッドと道具を拾います。");
  // First stay in front of both gates, then move along X. Never walk through
  // the old frame plane at z=-22 while going from one gate to the other.
  await safeWalkTo({
    x: (await d.info()).position.x,
    y: gate.y,
    z: Math.max(gate.z + 2.5, death.z + 1.5),
  });
  await safeWalkTo({
    x: Math.floor(death.x) + 0.5,
    y: death.y,
    z: Math.max(gate.z + 2.5, death.z + 1.5),
  });
  await safeWalkTo({ x: Math.floor(death.x) + 0.5, y: death.y, z: Math.floor(death.z) + 0.5 });
  await wait(800);
  // Drops are actual physics objects. This small ordinary walk crosses their
  // recorded death position rather than importing an inventory or moving loot.
  await d.walk(death.x, death.z, false, 0.12, 0);
  await wait(800);
  assert.ok((await d.count("blazeRod")) >= 13, "retrieve the thirteen real dropped rods");
  assert.ok((await d.count("enderPearl")) >= 5, "retrieve the five real dropped pearls");
  assert.ok(await d.count("diamond_pick"), "retrieve the actual diamond pickaxe");
  await record("retrieved real death equipment", {
    rods: await d.count("blazeRod"),
    pearls: await d.count("enderPearl"),
  });
  await returnWithGear();
}
