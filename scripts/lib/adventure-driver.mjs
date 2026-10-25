/** Read-only world inspection plus normal keyboard/mouse/UI actions. */
import assert from "node:assert/strict";
import { wait } from "./survival-driver.mjs";
export function createAdventureDriver(page, d) {
  const adventure = () => page.evaluate(() => window.__mc.adventure());
  const right = async () => {
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
  };
  const boot = () =>
    page.waitForFunction(
      () =>
        window.__mc?.loadedChunks() >= 60 &&
        window.__mc.meshedChunks() >= (window.__mc.adventure().dimension === "end" ? 24 : 60),
      { timeout: 120000 },
    );
  async function save() {
    if (await page.$("#inventory-panel:not([hidden])")) await d.close();
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForFunction(() => window.__mc.mode() === "idle");
    await page.click("#save-button");
    await page.waitForFunction(
      () => document.querySelector("#save-status").textContent === "保存済み",
    );
    await page.click("#play-button");
    await page.waitForFunction(() => window.__mc.mode() === "pointer");
  }
  async function move(x, z, jump = false, tolerance = 0.3) {
    const deadline = Date.now() + 25000;
    while (true) {
      const s = await d.info(),
        distance = Math.hypot(x - s.position.x, z - s.position.z);
      assert.ok(s.health > 0, "survive movement");
      if (distance < tolerance) break;
      assert.ok(Date.now() < deadline, `move ${x},${z} from ${JSON.stringify(s.position)}`);
      await d.aim({ x, y: s.position.y + s.eye, z });
      await page.keyboard.down("KeyW");
      if (jump) await page.keyboard.down("Space");
      await wait(Math.max(35, Math.min(160, (distance / 4.317) * 650)));
      await page.keyboard.up("KeyW");
      await page.keyboard.up("Space");
    }
    await wait(jump ? 500 : 180);
  }
  async function pillarTo(target) {
    await d.center();
    for (let step = 0; step < 80; step++) {
      const s = await d.info(),
        y = Math.round(s.position.y),
        x = Math.floor(s.position.x),
        z = Math.floor(s.position.z);
      if (y >= target) return;
      for (const yy of [y + 1, y + 2])
        if (![0, 5, 26, 31, 40].includes(await d.block({ x, y: yy, z }))) {
          if (await d.count("iron_pick")) await d.equip("iron_pick");
          await d.mine({ x, y: yy, z });
        }
      const material = (await d.count("cobble")) ? "cobble" : "dirt";
      await d.equip(material);
      await d.aim({ x: x + 0.5, y: y - 0.5, z: z + 0.5 });
      let placed = false;
      for (let attempt = 0; attempt < 4 && !placed; attempt++) {
        await page.keyboard.down("Space");
        for (let t = 0; t < 20; t++) {
          await right();
          await wait(30);
          if ((await d.block({ x, y, z })) === (material === "cobble" ? 11 : 2)) {
            placed = true;
            break;
          }
        }
        await page.keyboard.up("Space");
        await wait(600);
      }
      assert.ok(placed, "jump-place a real block under the player's feet");
      await page.waitForFunction(
        (y) => Math.abs(window.__mc.position().y - y) < 0.02,
        { timeout: 4000 },
        y + 1,
      );
    }
    throw new Error("pillar limit");
  }
  async function reachSurface() {
    const top = await page.evaluate(() => {
      const p = window.__mc.position(),
        x = Math.floor(p.x),
        z = Math.floor(p.z);
      for (let y = 94; y > 0; y--)
        if ([1, 2, 3, 4, 9, 10, 11, 17, 18, 19, 20, 21, 36].includes(window.__mc.blockAt(x, y, z)))
          return y + 1;
      return Math.round(p.y);
    });
    await pillarTo(top);
  }
  async function surfaceTo(target) {
    for (let leg = 0; leg < 80; leg++) {
      const s = await d.info();
      if (Math.hypot(target.x + 0.5 - s.position.x, target.z + 0.5 - s.position.z) < 0.8) return;
      const route = await page.evaluate((target) => {
        const mc = window.__mc,
          p = mc.position(),
          sx = Math.floor(p.x),
          sz = Math.floor(p.z);
        const nether = mc.adventure().dimension === "nether";
        const heights = new Map(),
          key = (x, z) => `${x},${z}`;
        function height(x, z) {
          const k = key(x, z);
          if (heights.has(k)) return heights.get(k);
          for (let y = nether ? 60 : 94; y > 0; y--)
            if (
              [1, 2, 3, 4, 5, 9, 10, 11, 17, 18, 19, 20, 21, 28, 29, 30, 32, 36].includes(
                mc.blockAt(x, y, z),
              )
            ) {
              if (nether && mc.blockAt(x, y + 1, z) === 26) {
                heights.set(k, null);
                return null;
              }
              heights.set(k, y + 1);
              return y + 1;
            }
          heights.set(k, null);
          return null;
        }
        const start = { x: sx, z: sz, h: height(sx, sz) },
          queue = [start],
          prev = new Map([[key(sx, sz), null]]);
        let best = start,
          score = Math.hypot(target.x - sx, target.z - sz);
        for (const node of queue) {
          const d = Math.hypot(target.x - node.x, target.z - node.z);
          if (d < score) {
            score = d;
            best = node;
          }
          if (d === 0) break;
          for (const [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const x = node.x + dx,
              z = node.z + dz,
              k = key(x, z);
            if (prev.has(k) || Math.abs(x - sx) > 24 || Math.abs(z - sz) > 24) continue;
            const h = height(x, z);
            if (h === null || node.h === null || h - node.h > 2 || node.h - h > 3) continue;
            const n = { x, z, h };
            prev.set(k, node);
            queue.push(n);
          }
        }
        const result = [];
        let n = best;
        while (n) {
          result.push(n);
          n = prev.get(key(n.x, n.z));
        }
        return result.reverse().slice(1, 17);
      }, target);
      assert.ok(route.length, "find a surface route");
      for (const p of route) {
        const current = await d.info(),
          foot = Math.min(p.h, Math.floor(current.position.y) + 1);
        for (let y = foot; y <= Math.max(foot + 2, Math.floor(current.position.y) + 2); y++) {
          const cell = { x: p.x, y, z: p.z },
            block = await d.block(cell);
          if (![0, 5, 22, 23, 25, 31, 33, 40].includes(block)) {
            if (await d.count("iron_pick")) await d.equip("iron_pick");
            await d.mine(cell);
          }
        }
        await move(
          p.x + 0.5,
          p.z + 0.5,
          p.h > current.position.y + 0.1 || (await d.block({ x: p.x, y: p.h - 1, z: p.z })) === 5,
        );
      }
    }
    throw new Error("surface route limit");
  }
  async function useAt(p) {
    await d.aim({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 });
    await right();
  }
  async function takeChest() {
    await page.waitForSelector('[data-area="chest"]');
    for (let i = 0; i < 27; i++) {
      const present = await page.$eval(
        `[data-area="chest"][data-slot="${i}"]`,
        (el) => !!el.querySelector("img"),
      );
      if (!present) continue;
      const free = (await d.info()).inventory.findIndex((s) => s === null);
      assert.ok(free >= 0, "space for discovered treasure");
      await page.click(`[data-area="chest"][data-slot="${i}"]`);
      await page.click(`[data-area="inventory"][data-slot="${free}"]`);
    }
    await d.close();
  }
  async function eat() {
    const hunger = await page.$eval("#hunger", (el) =>
      Number(el.textContent.match(/食料 (\d+)/)?.[1]),
    );
    if (hunger < 20 && (await d.count("bread"))) {
      await d.equip("bread");
      await right();
    }
  }
  async function harvest(village, needed = 144, replant = true) {
    await eat();
    for (let pass = 0; pass < 3 && (await d.count("wheat")) < needed; pass++) {
      let found = 0;
      for (let x = -7; x <= 7 && (await d.count("wheat")) < needed; x++)
        for (let z = -6; z <= -3 && (await d.count("wheat")) < needed; z++) {
          const p = { x: village.x + x, y: village.y, z: village.z + z };
          if ((await d.block(p)) !== 23) continue;
          await move(p.x + 0.5, p.z + 0.5);
          if (await d.count("stick")) await d.equip("stick");
          await d.mine(p);
          await wait(350);
          found++;
          if (replant && (await d.count("seeds"))) {
            await d.equip("seeds");
            await d.aim({ x: p.x + 0.5, y: p.y - 0.01, z: p.z + 0.5 });
            await right();
          }
        }
      if (!found || (await d.count("wheat")) >= needed) break;
    }
  }
  async function tradePearls(village) {
    await move(village.x + 3.5, village.z + 0.5);
    for (let attempt = 0; attempt < 40; attempt++) {
      const mobs = (await adventure()).creatures.filter((m) => m.species === "villager");
      const p = (await d.info()).position;
      const near = mobs.sort(
        (a, b) =>
          Math.hypot(a.position.x - p.x, a.position.z - p.z) -
          Math.hypot(b.position.x - p.x, b.position.z - p.z),
      )[0];
      if (near) {
        if (Math.hypot(near.position.x - p.x, near.position.z - p.z) > 2.5)
          await move(near.position.x, near.position.z);
        await d.aim({ ...near.position, y: near.position.y + 1 });
        await right();
        if (await page.$('[data-action="sell-wheat"]')) break;
      }
      await wait(500);
    }
    await page.waitForSelector('[data-action="sell-wheat"]');
    while ((await d.count("wheat")) >= 12 && (await d.count("emerald")) < 12)
      await page.click('[data-action="sell-wheat"]');
    while ((await d.count("emerald")) >= 3 && (await d.count("enderPearl")) < 4)
      await page.click('[data-action="buy-pearl"]');
    await d.close();
    assert.ok((await d.count("enderPearl")) >= 4, "trade for four ender pearls");
  }
  async function travel(destination, p) {
    await d.equip((await d.count("iron_sword")) ? "iron_sword" : "iron_pick");
    await useAt(p);
    await page.waitForFunction(
      (d) => window.__mc?.adventure().dimension === d,
      { timeout: 120000 },
      destination,
    );
    await boot();
    await page.select("#render-scale", "0.5");
    await page.click("#play-button");
    await page.waitForFunction(() => window.__mc.mode() === "pointer");
  }
  async function shootCrystal(p) {
    await d.equip("bow");
    for (let attempt = 0; attempt < 4; attempt++) {
      if ((await d.block(p)) === 0) return;
      const s = await d.info(),
        distance = Math.hypot(p.x + 0.5 - s.position.x, p.z + 0.5 - s.position.z),
        dy = p.y + 0.9 - s.position.y - s.eye;
      const tangent =
        (22 ** 2 - Math.sqrt(22 ** 4 - 2.4 * (2.4 * distance ** 2 + 2 * dy * 22 ** 2))) /
        (2.4 * distance);
      await d.aim({ x: p.x + 0.5, y: s.position.y + s.eye + tangent * distance, z: p.z + 0.5 });
      await right();
      await wait(1400);
    }
    assert.equal(await d.block(p), 0, "destroy crystal with an actual arrow");
  }
  async function defeatDragon() {
    await move(0.5, 10);
    const crystals = Array.from({ length: 6 }, (_, i) => ({
      x: Math.round(Math.cos((i * Math.PI) / 3) * 16),
      z: Math.round(Math.sin((i * Math.PI) / 3) * 16),
      y: 39 + (i % 3) * 2,
    }));
    for (const p of crystals) {
      const s = await d.info(),
        start = Math.atan2(s.position.z, s.position.x),
        goal = Math.atan2(p.z, p.x) + Math.PI;
      const delta = Math.atan2(Math.sin(goal - start), Math.cos(goal - start)),
        steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.25));
      for (let j = 1; j <= steps; j++) {
        const a = start + (delta * j) / steps;
        await move(Math.cos(a) * 10, Math.sin(a) * 10);
      }
      await shootCrystal(p);
      await d.report(`Destroyed end crystal at ${p.x},${p.y},${p.z}`);
    }
    await eat();
    await move(0.5, 4);
    await d.equip("iron_sword");
    for (let i = 0; i < 120; i++) {
      const a = await adventure();
      if (a.dragon.defeated) break;
      assert.ok((await d.info()).health > 0, "survive dragon combat");
      await d.aim(a.dragonPosition);
      await page.mouse.down();
      await wait(450);
      await page.mouse.up();
    }
    assert.ok((await adventure()).dragon.defeated, "dragon defeated by normal survival attacks");
    assert.equal(await d.count("dragonEgg"), 1, "receive a single victory egg");
  }
  return {
    adventure,
    right,
    boot,
    save,
    move,
    pillarTo,
    reachSurface,
    surfaceTo,
    useAt,
    takeChest,
    eat,
    harvest,
    tradePearls,
    travel,
    shootCrystal,
    defeatDragon,
  };
}
