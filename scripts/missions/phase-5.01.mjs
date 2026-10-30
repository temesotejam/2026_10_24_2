/** Daytime, observed surface targets only. Real drops are inspected after saving. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { hostile } from "../lib/combat-policy.mjs";
export async function run({ page, d, a, meta, flush = () => undefined }) {
  const guard = async () => {
    const s = await d.info(),
      mob = (await a.adventure()).creatures.find(
        (m) =>
          hostile(m) &&
          m.hp > 0 &&
          Math.hypot(
            m.position.x - s.position.x,
            m.position.y + 0.7 - s.position.y - s.eye,
            m.position.z - s.position.z,
          ) < 2.95,
      );
    if (!mob) return false;
    const visible = await page.evaluate(
      ({ p, eye, m }) => {
        const body = { ...m.position, y: m.position.y + 0.7 },
          len = Math.hypot(body.x - p.x, body.y - p.y - eye, body.z - p.z);
        for (let t = 0.1; t < len; t += 0.1) {
          const f = t / len;
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
      { p: s.position, eye: s.eye, m: mob },
    );
    if (!visible) return false;
    for (const key of ["KeyW", "Space", "ControlLeft"]) await page.keyboard.up(key);
    await d.equip("iron_sword");
    await d.aim({ ...mob.position, y: mob.position.y + 0.7 }, 0);
    await d.releaseAttack();
    await page.mouse.down();
    await wait(420);
    await d.releaseAttack();
    return true;
  };
  a.setGuard(guard);
  const visited = new Set(),
    until = Date.now() + 360000;
  d.setGoal("明るいうちに地上の敵だけへ近づき、剣で羽根を集めます。");
  while ((await d.count("feather")) < 3 && Date.now() < until) {
    await a.eat();
    for (let defense = 0; defense < 4 && (await guard()); defense++) {
      /* Finish immediate melee before leaving this position. */
    }
    const target = await page.evaluate(
      (ids) => {
        const p = window.__mc.position(),
          pass = [0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43];
        return (
          window.__mc
            .adventure()
            .creatures.filter((m) => m.species === "chicken" && m.hp > 0 && !ids.includes(m.id))
            .filter((m) => {
              const x = Math.floor(m.position.x),
                z = Math.floor(m.position.z),
                y = Math.round(m.position.y);
              if (
                Math.abs(y - m.position.y) > 0.15 ||
                pass.includes(window.__mc.blockAt(x, y - 1, z))
              )
                return false;
              for (let yy = y; yy <= y + 2; yy++)
                if (![0, 16, 22, 23, 25].includes(window.__mc.blockAt(x, yy, z))) return false;
              for (let yy = y + 3; yy < 70; yy++)
                if (![...pass, 7].includes(window.__mc.blockAt(x, yy, z))) return false;
              return true;
            })
            .sort(
              (a, b) =>
                Math.hypot(a.position.x - p.x, a.position.z - p.z) -
                Math.hypot(b.position.x - p.x, b.position.z - p.z),
            )[0] ?? null
        );
      },
      [...visited],
    );
    if (!target) break;
    visited.add(target.id);
    console.log(
      "CHICKEN_TARGET",
      JSON.stringify({
        id: target.id,
        position: target.position,
        feathers: await d.count("feather"),
      }),
    );
    await a.surfaceTo({ x: Math.floor(target.position.x), z: Math.floor(target.position.z) });
    await d.equip("iron_sword");
    const combatUntil = Date.now() + 12000;
    let last = target,
      killed = false;
    try {
      while (Date.now() < combatUntil) {
        const s = await d.info(),
          mob = (await a.adventure()).creatures.find((m) => m.id === target.id);
        assert.ok(s.health > 0, "survive the observed daylight hunt");
        if (!mob) {
          killed = true;
          break;
        }
        last = mob;
        const range = Math.hypot(
          mob.position.x - s.position.x,
          mob.position.y + 0.7 - s.position.y - s.eye,
          mob.position.z - s.position.z,
        );
        if (range > 2.9) {
          await d.releaseAttack();
          await a.surfaceTo({ x: Math.floor(mob.position.x), z: Math.floor(mob.position.z) });
          continue;
        }
        await d.aim({ ...mob.position, y: mob.position.y + 0.7 }, 0);
        await d.releaseAttack();
        await page.mouse.down();
        await wait(420);
        await d.releaseAttack();
      }
    } finally {
      await d.releaseAttack();
    }
    if (killed) {
      await a.surfaceTo({ x: Math.floor(last.position.x), z: Math.floor(last.position.z) });
      await a.move(last.position.x, last.position.z);
      await wait(600);
      await a.save(false);
      const loot = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const req = window.indexedDB.open("classic-voxel-survival", 1);
            req.onsuccess = () => {
              const db = req.result,
                q = db.transaction("worlds", "readonly").objectStore("worlds").get("2026:survival");
              q.onsuccess = () => {
                resolve(
                  q.result.loot
                    .filter((l) => ["feather", "rawMeat"].includes(l.stack.id))
                    .map((l) => ({ position: l.position, count: l.stack.count })),
                );
                db.close();
              };
            };
          }),
      );
      (meta.surfaceChickenHunt ??= []).push({
        id: target.id,
        killed,
        position: last.position,
        feathers: await d.count("feather"),
        remainingLoot: loot,
      });
      flush();
      console.log("SURFACE_CHICKEN_HUNT", JSON.stringify(meta.surfaceChickenHunt.at(-1)));
      if ((await d.count("feather")) >= 3) break;
      await page.locator("#play-button").click();
      await page.waitForFunction(() => window.__mc.mode() === "pointer");
    }
  }
  console.log(
    "CHICKEN_HUNT_END",
    JSON.stringify({
      feathers: await d.count("feather"),
      health: (await d.info()).health,
      fish: await d.count("fish"),
    }),
  );
  await a.save(false);
}
