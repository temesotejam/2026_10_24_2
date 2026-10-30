import { canMelee, chooseThreat, hostile, safeRetreat, solid } from "./combat-policy.mjs";
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
  async function save(resumeControls = true) {
    if (await page.$("#inventory-panel:not([hidden])")) await d.close();
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForFunction(() => window.__mc.mode() === "idle");
    await page.locator("#save-button").click();
    await page.waitForFunction(
      () => document.querySelector("#save-status").textContent === "保存済み",
    );
    if (resumeControls) {
      await page.locator("#play-button").click();
      await page.waitForFunction(() => window.__mc.mode() === "pointer");
    }
  }
  async function move(x, z, jump = false, tolerance = 0.3) {
    await d.walk(x, z, jump, tolerance, jump ? 800 : 60);
  }
  async function pillarTo(target) {
    await d.center();
    for (let step = 0; step < 80; step++) {
      await d.checkThreat();
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
      const material = await d.chooseMaterial();
      await d.equip(material.id);
      await d.aim({ x: x + 0.5, y: y - 0.5, z: z + 0.5 });
      let placed = false;
      for (let attempt = 0; attempt < 4 && !placed; attempt++) {
        await page.keyboard.down("Space");
        for (let t = 0; t < 20; t++) {
          await right();
          await wait(30);
          if ((await d.block({ x, y, z })) === material.block) {
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
          // Preserve complete portal columns when planning ordinary travel.
          // Their passable purple interior still rests on an obsidian base.
          for (let y = Math.max(1, Math.floor(p.y) - 3); y <= Math.floor(p.y) + 8; y++)
            if ([28, 31].includes(mc.blockAt(x, y, z))) {
              heights.set(k, null);
              return null;
            }
          const candidates = [];
          const passable = (id) => [0, 5, 16, 22, 23, 25, 31, 33, 40, 43].includes(id);
          for (let y = nether ? 60 : 94; y > 0; y--)
            if (
              [1, 2, 3, 4, 5, 9, 10, 11, 17, 18, 19, 20, 21, 28, 29, 30, 32, 36, 44].includes(
                mc.blockAt(x, y, z),
              ) &&
              passable(mc.blockAt(x, y + 1, z)) &&
              passable(mc.blockAt(x, y + 2, z))
            )
              candidates.push(y + 1);
          candidates.sort((a, b) => Math.abs(a - p.y) - Math.abs(b - p.y) || b - a);
          if (candidates.length) {
            heights.set(k, candidates[0]);
            return candidates[0];
          }
          heights.set(k, null);
          return null;
        }
        const start = { x: sx, z: sz, h: Math.round(p.y) },
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
            if (h === null || node.h === null || h - node.h > 1) continue;
            const drop = node.h - h,
              waterLanding = mc.blockAt(x, h - 1, z) === 5;
            if (drop > 3 && (!waterLanding || drop > 8)) continue;
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
      if (!route.length) {
        d.narrate("急な地形なので、掘って通り道を作ります。", 1);
        const dx = target.x - Math.floor(s.position.x),
          dz = target.z - Math.floor(s.position.z);
        const next = { x: Math.floor(s.position.x), z: Math.floor(s.position.z) };
        if (Math.abs(dx) >= Math.abs(dz)) next.x += Math.sign(dx);
        else next.z += Math.sign(dz);
        if (await d.count("iron_pick")) await d.equip("iron_pick");
        await d.tunnelTo(next);
        continue;
      }
      for (let index = 0; index < route.length; index++) {
        const p = route[index];
        let replan = false;
        const current = await d.info(),
          foot = Math.min(p.h, Math.floor(current.position.y) + 1);
        for (let y = foot; y <= Math.max(foot + 2, Math.floor(current.position.y) + 2); y++) {
          const cell = { x: p.x, y, z: p.z },
            block = await d.block(cell);
          if (![0, 5, 22, 23, 25, 31, 33, 40].includes(block)) {
            assert.notEqual(block, 28, "route around an obsidian frame");
            if (await d.count("iron_pick")) await d.equip("iron_pick");
            if ((await d.mine(cell)) === false) {
              replan = true;
              break;
            }
          }
        }
        if (replan) break;
        const water = (await d.block({ x: p.x, y: p.h - 1, z: p.z })) === 5;
        if (water && current.position.y - p.h > 3) d.narrate("水へ降りて、先へ進みます。", 1);
        let end = index;
        if (p.h <= current.position.y + 0.1) {
          const dx = Math.sign(p.x - Math.floor(current.position.x)),
            dz = Math.sign(p.z - Math.floor(current.position.z));
          while (end + 1 < route.length && end - index < 7) {
            const a = route[end],
              b = route[end + 1];
            if (
              b.h !== p.h ||
              b.x - a.x !== dx ||
              b.z - a.z !== dz ||
              ((await d.block({ x: b.x, y: b.h - 1, z: b.z })) === 5) !== water
            )
              break;
            end++;
          }
        }
        const arrived = await d.walk(
          route[end].x + 0.5,
          route[end].z + 0.5,
          p.h > current.position.y + 0.1 ||
            water ||
            (await d.block({
              x: Math.floor(current.position.x),
              y: Math.floor(current.position.y + 0.4),
              z: Math.floor(current.position.z),
            })) === 5 ||
            (await d.block({
              x: Math.floor(current.position.x),
              y: Math.floor(current.position.y + current.eye),
              z: Math.floor(current.position.z),
            })) === 5,
          0.25,
          0,
        );
        if (!arrived) break;
        index = end;
      }
    }
    throw new Error("surface route limit");
  }
  async function enterStronghold({ stopOutside = false } = {}) {
    const { stronghold: c, entrance } = await adventure();
    const p = (await d.info()).position;
    const nearRoom = Math.abs(p.x - c.x) < 4.5 && Math.abs(p.z - c.z) < 4.5;
    if (nearRoom && p.y >= c.y && p.y <= c.y + 5.1) {
      // A normal save can have the player on the roof. Dig into the room.
      if (p.y > c.y + 3) {
        await d.equip("iron_pick");
        await d.mine({ x: Math.floor(p.x), y: Math.floor(p.y) - 1, z: Math.floor(p.z) });
        await wait(1000);
      }
    } else {
      // Approach the open end of the stair tunnel, rather than its roof.
      await surfaceTo({ x: entrance.x, z: entrance.z + 2 });
      for (let step = 0; step < 6 && (await d.info()).position.y > entrance.y + 1; step++) {
        await d.center();
        const p = (await d.info()).position;
        await d.equip("iron_pick");
        await d.mine({ x: Math.floor(p.x), y: Math.round(p.y) - 1, z: Math.floor(p.z) });
        await wait(700);
      }
      await move(entrance.x + 0.5, entrance.z + 1.5, true);
      await move(entrance.x + 0.5, entrance.z + 0.5, true);
      for (let t = entrance.y - c.y - 1; t >= 0; t--) await move(c.x + 0.5, c.z + 4 + t + 0.5);
      await move(c.x + 0.5, c.z + 3.5);
    }
    await move(c.x + 0.5, c.z + (stopOutside ? 3.5 : 0.5), true);
    assert.ok(
      Math.abs((await d.info()).position.y - c.y) < 1,
      "enter the stronghold through normal movement",
    );
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
      await page.locator(`[data-area="chest"][data-slot="${i}"]`).click();
      await page.locator(`[data-area="inventory"][data-slot="${free}"]`).click();
    }
    await d.close();
  }
  async function eat() {
    const hunger = await page.$eval("#hunger", (el) =>
      Number(el.textContent.match(/食料 (\d+)/)?.[1]),
    );
    const health = (await d.info()).health;
    const values = { fish: 2, rawMeat: 2, apple: 4, bread: 5, cookedFish: 6, meat: 8 };
    const available = [];
    for (const id of Object.keys(values)) if (await d.count(id)) available.push(id);
    const eligible = available.filter((id) =>
      health < 20 ? hunger < 18 : values[id] <= 20 - hunger,
    );
    eligible.sort((a, b) => values[a] - values[b]);
    const food = eligible[0];
    if (food) {
      await d.equip(food);
      const s = await d.info();
      await d.aim({ x: s.position.x, y: s.position.y + 20, z: s.position.z - 1 });
      await right();
      return true;
    }
    return false;
  }
  let alternateGuard = null;
  const setGuard = (fn) => {
    alternateGuard = fn;
    d.setThreatHandler(fn ?? guard);
  };
  let guarding = false;
  const combatStats = { interruptions: 0, melee: 0, ranged: 0, retreats: 0 };
  async function threat(meleeRange = 5) {
    const s = await d.info(),
      mobs = (await adventure()).creatures;
    const points = [];
    for (const m of mobs) {
      const dx = m.position.x - s.position.x,
        dy = m.position.y - s.position.y,
        dz = m.position.z - s.position.z;
      if (Math.hypot(dx, dy, dz) > 14) continue;
      const length = Math.hypot(dx, dy - 0.4, dz);
      for (let t = 0.2; t < length - 0.3; t += 0.25)
        points.push([
          Math.floor(s.position.x + (dx * t) / length),
          Math.floor(s.position.y + 1.4 + ((dy - 0.4) * t) / length),
          Math.floor(s.position.z + (dz * t) / length),
        ]);
    }
    const entries = await page.evaluate(
      (points) => points.map((p) => [p.join(","), window.__mc.blockAt(...p)]),
      points,
    );
    const blocks = new Map(entries);
    return chooseThreat(
      s.position,
      mobs,
      (x, y, z) => blocks.get(`${x},${y},${z}`) ?? 0,
      meleeRange,
    );
  }
  async function guard() {
    if (alternateGuard) return await alternateGuard();
    if (guarding) return false;
    let target = await threat();
    if (!target) {
      const snapshot = await d.info();
      if (
        snapshot.health < 18 &&
        (await page.evaluate(
          () =>
            window.__mc.mode() === "pointer" && document.querySelector("#inventory-panel").hidden,
        ))
      ) {
        const hungry = await page.$eval(
          "#hunger",
          (el) => Number(el.textContent.match(/食料 (\d+)/)?.[1]) < 18,
        );
        if (hungry && (await d.count("bread"))) {
          const selected = await page.$eval(
              "#hotbar .selected .hotbar-key",
              (el) => Number(el.textContent) - 1,
            ),
            held = snapshot.inventory[selected]?.id;
          await d.releaseAttack();
          await page.keyboard.up("KeyW");
          await page.keyboard.up("Space");
          await eat();
          if (held && (await d.count(held))) await d.equip(held);
          return true;
        }
      }
      return false;
    }
    guarding = true;
    combatStats.interruptions++;
    d.narrate("敵が近づいたので、作業を中断して応戦します。", 2);
    const saved = await d.info(),
      ui = await page.evaluate(() => ({
        open: !document.querySelector("#inventory-panel").hidden,
        title: document.querySelector("#inventory-panel h2")?.textContent,
        target: window.__mc.target(),
        selected: Number(document.querySelector("#hotbar .selected .hotbar-key")?.textContent) - 1,
      }));
    const held = saved.inventory[ui.selected]?.id;
    await d.releaseAttack();
    await page.keyboard.up("KeyW");
    await page.keyboard.up("Space");
    if (ui.open) await d.close();
    try {
      const until = Date.now() + 90000;
      let defended = false;
      let returned = false;
      while (!returned && Date.now() < until) {
        target = await threat(defended ? 14 : 5);
        while (target && Date.now() < until) {
          let s = await d.info();
          assert.ok(s.health > 0, "survive reactive combat");
          const nearby = (await adventure()).creatures.filter(
            (m) =>
              hostile(m) &&
              Math.hypot(
                m.position.x - s.position.x,
                m.position.y - s.position.y,
                m.position.z - s.position.z,
              ) < 4.5,
          ).length;
          if (s.health <= 14 || nearby >= 2) {
            const cells = await page.evaluate(() => {
              const p = window.__mc.position(),
                r = [];
              for (let x = Math.floor(p.x) - 3; x <= Math.floor(p.x) + 3; x++)
                for (let z = Math.floor(p.z) - 3; z <= Math.floor(p.z) + 3; z++)
                  for (let y = Math.floor(p.y) - 3; y <= Math.floor(p.y) + 3; y++)
                    r.push([`${x},${y},${z}`, window.__mc.blockAt(x, y, z)]);
              return r;
            });
            const map = new Map(cells),
              retreat = safeRetreat(
                s.position,
                target.position,
                (x, y, z) => map.get(`${x},${y},${z}`) ?? 0,
              );
            if (retreat) {
              await d.aim({ x: retreat.x, y: s.position.y + s.eye, z: retreat.z }, 0);
              await page.keyboard.down("ControlLeft");
              await page.keyboard.down("KeyW");
              if (retreat.jump) await page.keyboard.down("Space");
              await wait(350);
              await page.keyboard.up("KeyW");
              await page.keyboard.up("ControlLeft");
              await page.keyboard.up("Space");
              defended = true;
              combatStats.retreats++;
              d.narrate("囲まれる前に、距離を取って応戦します。", 2);
              await eat();
              s = await d.info();
              target = await threat(14);
              if (!target) break;
            }
          }
          if (canMelee(s.position, s.eye, target.position)) {
            const sword = s.inventory.some((item) => item?.id === "iron_sword");
            if (sword) await d.equip("iron_sword");
            else {
              const pick = s.inventory.findIndex((item) => item?.id === "stone_pick");
              if (pick >= 0) await d.equip("stone_pick");
            }
            await d.aim({ ...target.position, y: target.position.y + 1 }, 0);
            await page.mouse.down();
            await wait(420);
            await page.mouse.up();
            combatStats.melee++;
            d.narrate("近づいた敵を、近接攻撃で倒します。", 1);
          } else if (
            (await d.count("bow")) &&
            (await d.count("arrow")) > 0 &&
            ((await d.count("arrow")) > 10 || target.distance < 5 || defended)
          ) {
            await d.equip("bow");
            const t = target.distance / 22;
            await d.aim(
              {
                x: target.position.x + target.velocity.x * t,
                y: target.position.y + 1 + 1.2 * t * t,
                z: target.position.z + target.velocity.z * t,
              },
              0,
            );
            await right();
            await wait(550);
            combatStats.ranged++;
            d.narrate("近接攻撃の届かない敵には、弓を使います。", 1);
          } else {
            await d.aim({ ...target.position, y: target.position.y + 1 });
            const front = await page.evaluate(() => {
              const p = window.__mc.position(),
                yaw = window.__mc.yaw(),
                x = Math.floor(p.x - Math.sin(yaw) * 0.8),
                z = Math.floor(p.z - Math.cos(yaw) * 0.8),
                y = Math.floor(p.y);
              return {
                floor: window.__mc.blockAt(x, y - 1, z),
                feet: window.__mc.blockAt(x, y, z),
                head: window.__mc.blockAt(x, y + 1, z),
              };
            });
            if ([0, 26].includes(front.floor) || front.feet === 26) break;
            await page.keyboard.down("ControlLeft");
            await page.keyboard.down("KeyW");
            if (solid(front.feet) && !solid(front.head)) await page.keyboard.down("Space");
            await wait(160);
            await page.keyboard.up("KeyW");
            await page.keyboard.up("Space");
            await page.keyboard.up("ControlLeft");
          }
          target = await threat(defended ? 14 : 5);
        }
        assert.ok(!(await threat()), "finish or safely escape the current combat encounter");
        d.narrate("敵への対応を終えたので、元の作業に戻ります。", 2);
        returned = await d.walk(saved.position.x, saved.position.z, false, 0.35, 150, async () =>
          Boolean(await threat(14)),
        );
        if (!returned) defended = true;
      }
      assert.ok(returned, "finish combat and return without ignoring newly approaching enemies");
      if (ui.open) {
        if (ui.title !== "所持品" && ui.target) {
          if (await d.count("iron_sword")) await d.equip("iron_sword");
          await useAt(ui.target);
          await page.waitForSelector("#inventory-panel:not([hidden])");
        } else await d.open();
      } else if (held && (await d.count(held))) await d.equip(held);
      return true;
    } finally {
      guarding = false;
    }
  }
  d.setThreatHandler(guard);
  async function waitSafe(ms) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      await d.checkThreat();
      await wait(Math.max(1, Math.min(200, until - Date.now())));
    }
  }
  async function recover(target = 18) {
    if ((await d.info()).health < target) d.narrate("食料を補給して、体力の回復を待ちます。", 1);
    const until = Date.now() + 100000;
    while ((await d.info()).health < target && Date.now() < until) {
      await guard();
      await eat();
      await waitSafe(4000);
    }
    assert.ok((await d.info()).health >= target, "recover through ordinary food and regeneration");
  }
  async function harvest(village, needed = 144, replant = true) {
    await eat();
    for (let pass = 0; pass < 3 && (await d.count("wheat")) < needed; pass++) {
      let found = 0;
      for (let x = -7; x <= 7 && (await d.count("wheat")) < needed; x++)
        for (let z = -6; z <= -3 && (await d.count("wheat")) < needed; z++) {
          const p = { x: village.x + x, y: village.y, z: village.z + z };
          if ((await d.block(p)) !== 23) continue;
          await guard();
          const current = (await d.info()).position;
          const crossesWater =
            (current.x < village.x && p.x > village.x) ||
            (current.x > village.x + 1 && p.x < village.x);
          await move(p.x + 0.5, p.z + 0.5, current.y < village.y - 0.1 || crossesWater);
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
    d.setGoal("村人を探し、小麦と交換してパールを手に入れます。");
    await surfaceTo({ x: village.x + 3, z: village.z });
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
          await surfaceTo({ x: Math.floor(near.position.x), z: Math.floor(near.position.z) });
        const current = (await adventure()).creatures.find((m) => m.id === near.id);
        if (!current) continue;
        if (
          Math.hypot(
            current.position.x - (await d.info()).position.x,
            current.position.z - (await d.info()).position.z,
          ) > 3
        )
          continue;
        await d.equip("iron_sword");
        await d.aim({ ...current.position, y: current.position.y + 1 });
        await right();
        if (await page.$('[data-action="sell-wheat"]')) break;
      }
      await wait(500);
    }
    await page.waitForSelector('[data-action="sell-wheat"]');
    while ((await d.count("wheat")) >= 12 && (await d.count("emerald")) < 12)
      await page.locator('[data-action="sell-wheat"]').click();
    while ((await d.count("emerald")) >= 3 && (await d.count("enderPearl")) < 4)
      await page.locator('[data-action="buy-pearl"]').click();
    await d.close();
    assert.ok((await d.count("enderPearl")) >= 4, "trade for four ender pearls");
  }
  async function travel(destination, p) {
    d.narrate(
      {
        nether: "ゲートを使って、ネザーへ入ります。",
        end: "ゲートを開けました。エンドへ進みます。",
        overworld: "帰還ゲートを使って、通常世界へ戻ります。",
      }[destination],
      2,
    );
    await d.equip((await d.count("iron_sword")) ? "iron_sword" : "iron_pick");
    await useAt(p);
    await page.waitForFunction(
      (d) => window.__mc?.adventure().dimension === d,
      { timeout: 120000 },
      destination,
    );
    await boot();
    await page.select("#render-scale", process.env.RECORDING_RENDER_SCALE ?? "0.5");
    await page.locator("#play-button").click();
    await page.waitForFunction(() => window.__mc.mode() === "pointer");
  }
  async function shootCrystal(p) {
    d.narrate("塔のクリスタルを狙って、矢を放ちます。", 1);
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
      await page.waitForFunction(() => window.__mc.adventure().shots.length === 0, {
        timeout: 12000,
      });
      await wait(100);
    }
    assert.equal(await d.block(p), 0, "destroy crystal with an actual arrow");
  }
  async function defeatDragon({ timeoutMs = 240000 } = {}) {
    await move(0.5, 10);
    const crystals = Array.from({ length: 6 }, (_, i) => ({
      x: Math.round(Math.cos((i * Math.PI) / 3) * 16),
      z: Math.round(Math.sin((i * Math.PI) / 3) * 16),
      y: 39 + (i % 3) * 2,
    }));
    for (const p of crystals) {
      if ((await d.block(p)) === 0) continue;
      const s = await d.info(),
        start = Math.atan2(s.position.z, s.position.x),
        goal = Math.atan2(p.z, p.x) + Math.PI + 0.6;
      const delta = Math.atan2(Math.sin(goal - start), Math.cos(goal - start)),
        steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.25));
      for (let j = 1; j <= steps; j++) {
        const a = start + (delta * j) / steps;
        await move(Math.cos(a) * 12, Math.sin(a) * 12);
      }
      await shootCrystal(p);
      await d.report(`Destroyed end crystal at ${p.x},${p.y},${p.z}`);
    }
    await eat();
    d.setGoal("クリスタルを6個破壊。降りてきたドラゴンを剣で攻撃します。");
    await move(0.5, 4);
    await d.equip("iron_sword");
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const a = await adventure();
      if (a.dragon.defeated) break;
      const health = (await d.info()).health;
      assert.ok(health > 0, "survive dragon combat");
      if (health <= 11) {
        d.narrate("体力が減ったので、距離を取って食料で回復します。", 2);
        await move(0.5, 11);
        await eat();
        await recover(18);
        await move(0.5, 4);
      }
      await d.equip("iron_sword");
      await d.aim((await adventure()).dragonPosition);
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
    enterStronghold,
    useAt,
    takeChest,
    eat,
    combatStats,
    setGuard,
    waitSafe,
    guard,
    recover,
    harvest,
    tradePearls,
    travel,
    shootCrystal,
    defeatDragon,
  };
}
