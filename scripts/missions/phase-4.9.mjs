/** Fish at real water using native five-second bites and ordinary controls. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { hostile } from "../lib/combat-policy.mjs";

export async function run({ page, d, a, meta, flush = () => undefined, chapter }) {
  const fishTarget = meta.livingSafe ? (meta.livingFishTarget ?? 2) : 30;
  const h = createModernHunting(page, d, a, { arrowReserve: 24 });
  // Default hunting guard also eats. Invoke it only for an actual nearby enemy,
  // so a quiet fishing cast keeps its rod equipped until the bite is reeled in.
  const guard = async () => {
    const p = (await d.info()).position;
    const danger = (await a.adventure()).creatures.some(
      (mob) =>
        mob.hp > 0 &&
        hostile(mob) &&
        Math.hypot(mob.position.x - p.x, mob.position.y - p.y, mob.position.z - p.z) <
          (mob.species === "skeleton" ? 18 : 9),
    );
    if (danger) {
      if (meta.livingSafe) throw new Error("Safety checkpoint: hostile mob near the fishing spot");
      flush();
      return await h.guard();
    }
    return false;
  };
  a.setGuard(guard);
  await guard();
  assert.ok((await d.info()).health > 0, "start fishing alive after emergency defense");
  await a.eat();
  await d.open();
  for (let pass = 0; pass < 24; pass++) {
    const inv = (await d.info()).inventory;
    let pair;
    for (let i = 0; i < inv.length && !pair; i++)
      for (let j = i + 1; j < inv.length; j++)
        if (
          inv[i] &&
          inv[j] &&
          inv[i].id === inv[j].id &&
          inv[i].durability === undefined &&
          inv[j].durability === undefined &&
          inv[i].count + inv[j].count <= 64
        ) {
          pair = [i, j];
          break;
        }
    if (!pair) break;
    await page.locator(`[data-area="inventory"][data-slot="${pair[0]}"]`).click();
    await page.locator(`[data-area="inventory"][data-slot="${pair[1]}"]`).click();
  }
  await d.close();
  d.setGoal(
    meta.livingSafe
      ? "近くの水面で釣り、次の食事に備えます。"
      : "近くの本物の水面で釣り、体力を回復しながらエンド用の魚を集めます。",
  );
  // Several partially worn rods can be used in turn; count their combined
  // remaining casts before spending materials on a replacement.
  const rodDurability = (await d.info()).inventory
    .filter((s) => s?.id === "fishingRod")
    .reduce((total, s) => total + (s.durability ?? 0), 0);
  if (rodDurability < Math.max(1, fishTarget - (await d.count("fish")) + 2)) {
    assert.ok((await d.count("string")) >= 2, "own actual spider string for the rod");
    const table = await d.station("table");
    while ((await d.count("stick")) < 3) {
      if ((await d.count("planks")) < 2) {
        if (await d.count("log")) await d.make("planks");
        else {
          assert.ok(await d.count("birchLog"), "own wood for the rod's three sticks");
          await d.make("birch_planks");
        }
      }
      await d.make("sticks");
    }
    await d.make("fishingRod");
    await d.close();
    await d.equip("iron_pick");
    await d.mine(table);
    await wait(600);
    await d.collect("table", 1);
  }
  const progress = (meta.fishingFood ??= { caught: 0 });
  const until = Date.now() + 900000;
  let failures = 0,
    repositionAttempts = 0;
  while ((await d.info()).health < 20 || (await d.count("fish")) < fishTarget) {
    assert.ok(Date.now() < until, "finish native fishing within the ordinary recording window");
    await guard();
    const state = await d.info();
    assert.ok(state.health > 0, "survive fishing");
    const water = await page.evaluate(() => {
      const mc = window.__mc,
        p = mc.position(),
        eye = { ...p, y: p.y + mc.eyeHeight() };
      const pass = [0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43];
      const foot = mc.blockAt(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
      const support = mc.blockAt(Math.floor(p.x), Math.round(p.y) - 1, Math.floor(p.z));
      if (foot === 5 || pass.includes(support)) return null;
      const candidates = [];
      for (let x = Math.floor(p.x) - 6; x <= Math.floor(p.x) + 6; x++)
        for (let z = Math.floor(p.z) - 6; z <= Math.floor(p.z) + 6; z++)
          for (let y = Math.floor(p.y) - 4; y <= Math.floor(p.y) + 1; y++) {
            if (mc.blockAt(x, y, z) !== 5) continue;
            // Aim just inside the water surface. A ray to the block's middle
            // can hit the adjoining bank before reaching a one-block canal.
            const target = { x: x + 0.5, y: y + 0.97, z: z + 0.5 };
            const length = Math.hypot(target.x - eye.x, target.y - eye.y, target.z - eye.z);
            if (length > 5.85) continue;
            const crops = new Map();
            let clear = true;
            for (let t = 0.05; t < length; t += 0.04) {
              const cell = {
                x: Math.floor(eye.x + ((target.x - eye.x) * t) / length),
                y: Math.floor(eye.y + ((target.y - eye.y) * t) / length),
                z: Math.floor(eye.z + ((target.z - eye.z) * t) / length),
              };
              if (cell.x === x && cell.y === y && cell.z === z) break;
              const id = mc.blockAt(cell.x, cell.y, cell.z);
              if ([16, 22, 23].includes(id)) crops.set(`${cell.x},${cell.y},${cell.z}`, cell);
              else if (![0, 31].includes(id)) {
                clear = false;
                break;
              }
            }
            if (clear) candidates.push({ target, crops: [...crops.values()], length });
          }
      return (
        candidates.sort((a, b) => a.crops.length - b.crops.length || a.length - b.length)[0] ?? null
      );
    });
    progress.lastHealth = state.health;
    progress.fish = await d.count("fish");
    flush();
    if (!water && meta.fishingSpot && repositionAttempts++ < 3) {
      d.setGoal("戦闘で釣り場から離れたため、足場を直して井戸の縁へ戻ります。");
      const spot = meta.fishingSpot;
      if ((await d.info()).position.y < spot.y - 0.2) await a.pillarTo(Math.round(spot.y));
      await a.surfaceTo({ x: Math.floor(spot.x), z: Math.floor(spot.z) });
      await d.center();
      if ((await d.info()).position.y < spot.y - 0.2) await a.pillarTo(Math.round(spot.y));
      continue;
    }
    assert.ok(
      water,
      "checkpoint: no reachable water from safe dry ground; do not enter water blindly",
    );
    repositionAttempts = 0;
    if (meta.livingSafe && water.crops.length)
      throw new Error("Safety checkpoint: fishing would damage planted crops");
    for (const crop of water.crops) {
      await d.equip("iron_pick");
      await d.mine(crop);
      await wait(200);
    }
    await d.equip("fishingRod");
    await d.aim(water.target);
    await a.right();
    await wait(100);
    let cast = (await a.adventure()).cast;
    if (!cast) {
      assert.ok(
        ++failures < 3,
        "checkpoint: native fishing cast is blocked; inspect the actual water ray",
      );
      continue;
    }
    const castUntil = Date.now() + 45000;
    while (cast && cast.elapsed < 5.1) {
      await guard();
      assert.ok((await d.info()).health > 0, "survive the native fishing wait");
      assert.ok(Date.now() < castUntil, "checkpoint: fishing simulation stopped advancing");
      await wait(100);
      cast = (await a.adventure()).cast;
    }
    if (!cast || cast.elapsed >= 8) {
      assert.ok(++failures < 3, "checkpoint: repeated interrupted or missed fishing bites");
      continue;
    }
    const before = await d.count("fish");
    await a.right();
    await page.waitForFunction(
      (before) =>
        window.__mc
          .inventory()
          .filter((slot) => slot?.id === "fish")
          .reduce((n, slot) => n + slot.count, 0) ===
        before + 1,
      { timeout: 3000 },
      before,
    );
    failures = 0;
    progress.caught++;
    await a.eat(); // Only after reeling; food would otherwise cancel the cast.
    progress.fish = await d.count("fish");
    progress.lastHealth = (await d.info()).health;
    console.log("Native fishing", JSON.stringify(progress));
    flush();
  }
  assert.ok(
    (await d.count("fish")) >= fishTarget,
    "carry the genuinely caught travel and battle reserve",
  );
  assert.equal(
    (await d.info()).health,
    20,
    "recover by eating genuine fish and normal regeneration",
  );
  await d.equip("iron_pick");
  await chapter(
    meta.livingSafe
      ? `釣りで生魚${fishTarget}匹を確保し、体力を回復`
      : `実際に釣った魚で全快し、移動とエンド用の生魚${fishTarget}匹を確保`,
    meta.livingSafe ? 9 : 4,
  );
}
