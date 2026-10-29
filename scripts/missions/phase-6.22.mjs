/** Continue the actual apple/pillar checkpoint: no fresh-start assumptions. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";

export async function run({ page, d, a, meta, chapter }) {
  const v = meta.village;
  a.setGuard(async () => false);
  await d.releaseAttack();
  for (const key of ["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ControlLeft"])
    await page.keyboard.up(key);
  if (await page.$("#inventory-panel:not([hidden])")) await d.close();
  assert.ok(await d.count("stone_pick"), "keep the actually recovered stone pickaxe");
  assert.ok(await d.count("stone_sword"), "keep the actually crafted stone sword");
  async function eatStoredFood() {
    const hunger = await page.$eval("#hunger", (el) =>
      Number(el.textContent.match(/食料 (\d+)/)?.[1]),
    );
    if (hunger >= 18) return false;
    const food = (await d.count("apple")) ? "apple" : (await d.count("bread")) ? "bread" : null;
    assert.ok(food, "have actual stored food for regeneration");
    await d.equip(food);
    const p = (await d.info()).position;
    await d.aim({ x: p.x, y: p.y + 20, z: p.z - 1 }, 0);
    await a.right();
    await wait(100);
    return true;
  }
  await eatStoredFood();
  const healUntil = Date.now() + 150000;
  while ((await d.info()).health < 20) {
    assert.ok((await d.info()).health > 0, "survive the existing safe pillar checkpoint");
    assert.ok(Date.now() < healUntil, "regenerate on the existing pillar using actual apples");
    await eatStoredFood();
    await wait(700);
  }
  // Emergency checkpoint placed three owned blocks underfoot. Remove only
  // ordinary scaffold blocks, one landing at a time, stopping at village grade.
  await d.equip("stone_pick");
  for (let step = 0; step < 6 && (await d.info()).position.y > v.y + 0.15; step++) {
    const p = (await d.info()).position;
    const under = { x: Math.floor(p.x), y: Math.round(p.y) - 1, z: Math.floor(p.z) };
    if (![2, 10, 11].includes(await d.block(under))) break;
    await d.mine(under);
    await wait(800);
  }
  let guarding = false;
  const nearby = () =>
    page.evaluate(() => {
      const mc = window.__mc,
        p = mc.position(),
        eye = { x: p.x, y: p.y + mc.eyeHeight(), z: p.z };
      const hostile = (m) =>
        ["spider", "zombie", "skeleton", "mossling", "ember"].includes(m.species) ||
        (m.species === "wanderer" && m.fuse === 2);
      const passable = new Set([0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43]);
      const list = mc
        .adventure()
        .creatures.filter(
          (m) =>
            hostile(m) &&
            Math.hypot(m.position.x - p.x, m.position.y - p.y, m.position.z - p.z) < 3.2,
        );
      return (
        list
          .filter((m) => {
            const target = { ...m.position, y: m.position.y + 0.7 };
            const dx = target.x - eye.x,
              dy = target.y - eye.y,
              dz = target.z - eye.z,
              length = Math.hypot(dx, dy, dz);
            if (length > 2.95) return false;
            for (let t = 0.1; t < length - 0.3; t += 0.2)
              if (
                !passable.has(
                  mc.blockAt(
                    Math.floor(eye.x + (dx * t) / length),
                    Math.floor(eye.y + (dy * t) / length),
                    Math.floor(eye.z + (dz * t) / length),
                  ),
                )
              )
                return false;
            return true;
          })
          .sort((x, y) => x.hp - y.hp)[0] ?? null
      );
    });
  async function defendClose() {
    if (guarding) return false;
    let target = await nearby();
    if (!target) return false;
    guarding = true;
    try {
      const until = Date.now() + 25000;
      while (target && Date.now() < until) {
        const state = await d.info();
        assert.ok(state.health > 0, "survive close-range recovery defense");
        if (state.health <= 10) {
          await eatStoredFood();
          if ((await d.count("dirt")) + (await d.count("planks")) + (await d.count("cobble")) >= 2)
            await a.pillarTo(Math.round(state.position.y) + 2);
        }
        await d.releaseAttack();
        await d.equip("stone_sword");
        await d.aim({ ...target.position, y: target.position.y + 0.7 }, 0);
        await page.mouse.down();
        await wait(470);
        await page.mouse.up();
        target = await nearby();
      }
      assert.ok(!target, "finish nearby defense instead of chasing or retreating forever");
      await eatStoredFood();
      return true;
    } finally {
      await d.releaseAttack();
      guarding = false;
    }
  }
  a.setGuard(defendClose);
  await defendClose();
  d.setGoal("回収済みの石の道具を使い、安全な村道から足場用の丸石を集めます。");
  const skipped = [];
  for (let attempt = 0; (await d.count("cobble")) < 16 && attempt < 55; attempt++) {
    await defendClose();
    await eatStoredFood();
    const cell = await page.evaluate(
      ({ v, skipped }) => {
        const mc = window.__mc,
          p = mc.position(),
          list = [];
        const air = new Set([0, 16, 22, 23, 25]);
        for (let x = v.x - 10; x <= v.x + 10; x++)
          for (let z = v.z - 1; z <= v.z + 1; z++) {
            const y = v.y - 1,
              k = `${x},${y},${z}`;
            if (skipped.includes(k) || mc.blockAt(x, y, z) !== 11) continue;
            if ([0, 5, 26, 31, 40, 43].includes(mc.blockAt(x, y - 1, z))) continue;
            if (!air.has(mc.blockAt(x, y + 1, z)) || !air.has(mc.blockAt(x, y + 2, z))) continue;
            list.push({ x, y, z, d: Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) });
          }
        return list.sort((a, b) => a.d - b.d)[0] ?? null;
      },
      { v, skipped },
    );
    assert.ok(cell, "find an actual village cobble block with solid support beneath");
    // Stand on the existing road first. The excavated cell has checked support
    // one block below it, so collecting this drop cannot open a deep fall.
    await a.surfaceTo({ x: cell.x, z: cell.z });
    await wait(350);
    const p = await d.info();
    if (
      Math.hypot(
        cell.x + 0.5 - p.position.x,
        cell.y + 0.5 - p.position.y - p.eye,
        cell.z + 0.5 - p.position.z,
      ) > 4.3
    ) {
      skipped.push(`${cell.x},${cell.y},${cell.z}`);
      continue;
    }
    await d.equip("stone_pick");
    await d.mine(cell);
    await wait(800);
  }
  await d.collect("cobble", 16);
  await d.equip("stone_sword");
  console.log("Recovery supplies", await d.info());
  await chapter("既存の石の道具で安全な村道から丸石16個を採取", 6);
}
