/** Controlled shallow-water rescue hunt. Only observations and ordinary inputs. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { createModernHunting } from "../lib/modern-hunting.mjs";
export async function run({ page, d, a, meta, flush = () => undefined, chapter }) {
  const h = createModernHunting(page, d, a, { arrowReserve: 12 });
  const visited = new Set(),
    events = [];
  meta.shallowWaterHunt = { visited: [], events };
  const record = async (name, extra = {}) => {
    events.push({ name, ...extra, position: (await d.info()).position });
    flush();
  };
  const observe = () =>
    page.evaluate(() => {
      const p = window.__mc.position(),
        text = document.querySelector("#hunger")?.textContent ?? "";
      return {
        p,
        health: window.__mc.health(),
        eye: window.__mc.eyeHeight(),
        headWet:
          window.__mc.blockAt(
            Math.floor(p.x),
            Math.floor(p.y + window.__mc.eyeHeight()),
            Math.floor(p.z),
          ) === 5,
        air: Number(text.match(/呼吸\s*(\d+)/)?.[1] ?? 10),
        creatures: window.__mc.adventure().creatures,
      };
    });
  const release = async () => {
    await d.releaseAttack();
    for (const key of ["KeyW", "KeyS", "KeyA", "KeyD", "Space", "ControlLeft"])
      await page.keyboard.up(key);
  };
  async function ascend() {
    await release();
    if (!(await observe()).headWet) return true;
    const until = Date.now() + 4500;
    await page.keyboard.down("Space");
    try {
      while (Date.now() < until) {
        const s = await observe();
        assert.ok(s.health > 0, "survive the controlled shallow dive");
        if (!s.headWet) {
          await wait(200);
          return true;
        }
        await wait(80);
      }
      return false;
    } finally {
      await page.keyboard.up("Space");
    }
  }
  // This guard only preserves breathing during the staged land approach.
  // Normal combat/automatic air routines are suspended for the controlled dive.
  async function approachGuard() {
    const s = await observe();
    if (s.headWet) {
      await ascend();
      return true;
    }
    return false;
  }
  async function bestSword() {
    const inv = (await d.info()).inventory;
    const ids = [
      "enchanted_diamond_sword",
      "diamond_sword",
      "enchanted_iron_sword",
      "iron_sword",
      "stone_sword",
    ];
    let index = -1;
    for (const id of ids) {
      const candidates = inv
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s?.id === id && (s.durability ?? 0) >= 8)
        .sort((a, b) => b.s.durability - a.s.durability);
      if (candidates.length) {
        index = candidates[0].i;
        break;
      }
    }
    assert.ok(index >= 0, "carry an actual sword with enough durability for the dive");
    if (index >= 9) {
      await d.open();
      await page.locator(`[data-area="inventory"][data-slot="${index}"]`).click();
      await page.locator('[data-area="inventory"][data-slot="0"]').click();
      if (inv[0]) await page.locator(`[data-area="inventory"][data-slot="${index}"]`).click();
      await d.close();
      index = 0;
    }
    await page.keyboard.press(`Digit${index + 1}`);
  }
  async function targets() {
    return page.evaluate(() => {
      const mc = window.__mc,
        p = mc.position(),
        list = [],
        observations = [];
      for (const m of mc.adventure().creatures) {
        if (m.species !== "wanderer" || m.hp <= 0) continue;
        const x = Math.floor(m.position.x),
          z = Math.floor(m.position.z),
          bottom = Math.floor(m.position.y + 0.4);
        const observed = {
          id: m.id,
          position: m.position,
          feetBlock: mc.blockAt(x, bottom, z),
          headBlock: mc.blockAt(x, Math.floor(m.position.y + 1.62), z),
          contiguousWaterTop: null,
          depth: null,
          openAscent: false,
          rejection: null,
        };
        observations.push(observed);
        if (observed.feetBlock !== 5) {
          observed.rejection = "feet are not in water (possibly a cave)";
          continue;
        }
        let top = bottom;
        while (top < bottom + 8 && mc.blockAt(x, top + 1, z) === 5) top++;
        observed.contiguousWaterTop = top;
        observed.depth = top + 1 - m.position.y;
        if (observed.depth > 6 || top >= bottom + 8) {
          observed.rejection = "water deeper than six blocks";
          continue;
        }
        let clear = true;
        for (let y = bottom; y <= top + 2; y++)
          if (![0, 5].includes(mc.blockAt(x, y, z))) clear = false;
        observed.openAscent = clear;
        if (!clear) {
          observed.rejection = "solid ceiling above the water";
          continue;
        }
        // Select a real low bank that can also be climbed after surfacing.
        const banks = [];
        for (let bx = x - 9; bx <= x + 9; bx++)
          for (let bz = z - 9; bz <= z + 9; bz++)
            for (let y = top; y <= top + 1; y++)
              if (
                [1, 2, 3, 4, 9, 11].includes(mc.blockAt(bx, y - 1, bz)) &&
                mc.blockAt(bx, y, bz) === 0 &&
                mc.blockAt(bx, y + 1, bz) === 0
              )
                banks.push({
                  x: bx + 0.5,
                  y,
                  z: bz + 0.5,
                  score:
                    Math.hypot(bx + 0.5 - m.position.x, bz + 0.5 - m.position.z) +
                    Math.hypot(bx + 0.5 - p.x, bz + 0.5 - p.z) * 0.1,
                });
        const shore = banks.sort((a, b) => a.score - b.score)[0];
        if (!shore) observed.rejection = "no verified low return bank";
        if (shore)
          list.push({
            id: m.id,
            position: m.position,
            top,
            surfaceY: top + 1,
            shore,
            distance: Math.hypot(m.position.x - p.x, m.position.z - p.z),
          });
      }
      return { candidates: list.sort((a, b) => a.distance - b.distance), observations };
    });
  }
  async function surfaceSwim(destination, timeout = 10000) {
    const deadline = Date.now() + timeout;
    let best = Infinity,
      lastProgress = Date.now();
    await release();
    try {
      await page.keyboard.down("Space");
      while (Date.now() < deadline) {
        const s = await observe();
        assert.ok(s.health >= 12, "abort swimming before critical health");
        const length = Math.hypot(destination.x - s.p.x, destination.z - s.p.z);
        if (length < 0.35) {
          await page.keyboard.up("KeyW");
          return true;
        }
        if (length < best - 0.12) {
          best = length;
          lastProgress = Date.now();
        }
        if (Date.now() - lastProgress > 2200) return false;
        await d.aim({ x: destination.x, y: s.p.y + s.eye, z: destination.z }, 0);
        await page.keyboard.down("KeyW");
        await wait(100);
      }
      return false;
    } finally {
      await page.keyboard.up("KeyW");
      await page.keyboard.up("Space");
    }
  }
  try {
    assert.equal((await a.adventure()).dimension, "overworld");
    while ((await d.count("enderPearl")) < 12) {
      const observed = await targets();
      console.log("UNDERWATER_WANDERER_OBSERVATIONS", JSON.stringify(observed.observations));
      const target = observed.candidates.find((t) => !visited.has(t.id));
      if (!target) {
        await record("no unvisited verified open-water candidates", {
          observations: observed.observations,
        });
        break;
      }
      visited.add(target.id);
      meta.shallowWaterHunt.visited = [...visited];
      flush();
      a.setGuard(approachGuard);
      d.setGoal("浅い水中にいる敵へ近づき、浮上して戻れる岸を確かめます。");
      try {
        await a.surfaceTo({ x: Math.floor(target.shore.x), z: Math.floor(target.shore.z) });
      } catch (error) {
        await ascend();
        await record("shore approach blocked", { id: target.id, error: String(error) });
        continue;
      }
      await a.eat();
      // Regeneration takes place at the verified dry bank, before entering water.
      const until = Date.now() + 120000;
      while ((await d.info()).health < 20 && Date.now() < until) {
        await a.eat();
        await wait(1000);
      }
      assert.equal((await d.info()).health, 20, "start each shallow dive at full natural health");
      await bestSword();
      a.setGuard(async () => false);
      let lastMob = (await a.adventure()).creatures.find((m) => m.id === target.id);
      if (!lastMob) continue;
      let success = false;
      const reached = await surfaceSwim(lastMob.position);
      if (!reached) {
        await ascend();
        await surfaceSwim(target.shore);
        await record("surface path blocked", { id: target.id });
        continue;
      }
      await release();
      d.setGoal("息を確認しながら自然に潜り、剣で敵を倒して落とした物を拾います。");
      const diveStart = Date.now();
      let corpse = null;
      try {
        while (Date.now() - diveStart < 5000) {
          const s = await observe();
          if (s.air <= 3 || s.health < 12) break;
          const mob = s.creatures.find((m) => m.id === target.id);
          if (!mob) {
            corpse = { ...lastMob.position };
            success = true;
            break;
          }
          lastMob = mob;
          const dx = mob.position.x - s.p.x,
            dz = mob.position.z - s.p.z;
          if (Math.hypot(dx, dz) > 0.65) {
            await d.aim({ x: mob.position.x, y: s.p.y + s.eye, z: mob.position.z }, 0);
            await page.keyboard.down("KeyW");
          } else await page.keyboard.up("KeyW");
          const body = { x: mob.position.x, y: mob.position.y + 0.7, z: mob.position.z };
          const distance = Math.hypot(dx, dz, body.y - s.p.y - s.eye);
          if (distance < 2.9) {
            const visible = await page.evaluate(
              ({ p, eye, body, distance }) => {
                for (let t = 0.1; t < distance; t += 0.08) {
                  const f = t / distance;
                  if (
                    ![0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43].includes(
                      window.__mc.blockAt(
                        Math.floor(p.x + (body.x - p.x) * f),
                        Math.floor(p.y + eye + (body.y - p.y - eye) * f),
                        Math.floor(p.z + (body.z - p.z) * f),
                      ),
                    )
                  )
                    return false;
                }
                return true;
              },
              { p: s.p, eye: s.eye, body, distance },
            );
            if (visible) {
              await d.aim(body, 0);
              await d.releaseAttack();
              await page.mouse.down();
            } else await d.releaseAttack();
          } else await d.releaseAttack();
          await wait(70);
        }
        await d.releaseAttack();
        await page.keyboard.up("KeyW");
        // A real drop is picked up by proximity, including any pearl. Never
        // assume that a defeated wanderer necessarily dropped one.
        while (corpse && Date.now() - diveStart < 5000) {
          const s = await observe();
          if (s.air <= 3 || s.health < 12) break;
          const length = Math.hypot(corpse.x - s.p.x, corpse.z - s.p.z);
          if (length < 0.45 && Math.abs(corpse.y - s.p.y) < 1.3) {
            await wait(250);
            break;
          }
          await d.aim({ x: corpse.x, y: s.p.y + s.eye, z: corpse.z }, 0);
          await page.keyboard.down("KeyW");
          await wait(70);
        }
      } finally {
        await release();
        assert.ok(await ascend(), "surface through the previously observed clear water column");
      }
      await record("controlled dive complete", {
        id: target.id,
        defeated: success,
        elapsed: Date.now() - diveStart,
        pearls: await d.count("enderPearl"),
      });
      const returned = await surfaceSwim(target.shore);
      if (!returned) {
        await ascend();
        await record("bank return blocked; stop afloat", { id: target.id });
        break;
      }
      await wait(300);
    }
  } finally {
    await release();
    await ascend();
    a.setGuard(h.guard);
  }
  await record("shallow hunt stopped", { pearls: await d.count("enderPearl") });
  if (chapter) await chapter("浅い水中の敵を通常操作で討伐し、実際のドロップを回収", 4);
}
