/** Emergency archery from an already paused game. Normal inputs only. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, meta, flush = () => undefined }) {
  a.setGuard(async () => false);
  const observe = () =>
    page.evaluate(() => ({
      p: window.__mc.position(),
      health: window.__mc.health(),
      mobs: window.__mc.adventure().creatures,
      inventory: window.__mc.inventory(),
    }));
  const release = async () => {
    await d.releaseAttack();
    for (const key of ["Space", "KeyA", "KeyD", "KeyW", "KeyS"]) await page.keyboard.up(key);
  };
  const before = await observe(),
    skeleton = before.mobs
      .filter((m) => m.species === "skeleton" && m.hp > 0)
      .sort(
        (a, b) =>
          Math.hypot(a.position.x - before.p.x, a.position.z - before.p.z) -
          Math.hypot(b.position.x - before.p.x, b.position.z - before.p.z),
      )[0];
  assert.ok(before.health > 0 && skeleton, "prepare the observed emergency archer before resuming");
  assert.equal(
    before.inventory[0]?.id,
    "bow",
    "the actual equipped hotbar bow is ready without opening inventory",
  );
  assert.ok(
    before.inventory.filter((s) => s?.id === "arrow").reduce((n, s) => n + s.count, 0) >= 2,
  );
  const northSafe = await page.evaluate((p) => {
    const pass = [0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43];
    for (let dz = 0; dz <= 1; dz += 0.2) {
      const z = Math.floor(p.z - dz),
        x = Math.floor(p.x);
      if (
        [Math.round(p.y) - 1, Math.round(p.y)].every((y) =>
          pass.includes(window.__mc.blockAt(x, y, z)),
        )
      )
        return false;
    }
    return true;
  }, before.p);
  assert.ok(northSafe, "the short northward sidestep has actual supporting ground");
  d.setGoal("矢を避けながら弓を二度撃ち、近くのスケルトンを先に倒します。");
  let shots = 0,
    lastShot = -Infinity;
  try {
    // Everything above runs paused. No inventory interaction occurs while the
    // archer is alive. Turn while beginning the jump, then strafe north briefly.
    if (await page.evaluate(() => window.__mc.mode() === "idle"))
      await page.locator("#play-button").click();
    await page.keyboard.press("Digit1");
    await page.keyboard.down("Space");
    const initial = await observe();
    await d.aim({ x: skeleton.position.x, y: skeleton.position.y + 1, z: skeleton.position.z }, 0);
    await page.keyboard.down("KeyA");
    const started = Date.now();
    void wait(220).then(() => page.keyboard.up("KeyA"));
    while (Date.now() - started < 1800) {
      const s = await observe();
      assert.ok(s.health > 0, "survive the emergency archer encounter");
      const mob = s.mobs.find((m) => m.id === skeleton.id);
      if (!mob) break;
      // One supported step, never a long sidestep off the village edge.
      if (Date.now() - started >= 220 || s.p.z <= initial.p.z - 0.95)
        await page.keyboard.up("KeyA");
      if (Date.now() - lastShot >= 560 && shots < 3) {
        const t =
          Math.hypot(mob.position.x - s.p.x, mob.position.y - s.p.y, mob.position.z - s.p.z) / 22;
        await d.aim(
          {
            x: mob.position.x + mob.velocity.x * t,
            y: mob.position.y + 1 + 1.2 * t * t,
            z: mob.position.z + mob.velocity.z * t,
          },
          0,
        );
        await a.right();
        shots++;
        lastShot = Date.now();
      }
      await wait(25);
    }
    assert.ok(
      !(await observe()).mobs.some((m) => m.id === skeleton.id),
      "confirm the archer is dead before opening inventory",
    );
    await release();
    // Equip the freshest owned sword through actual inventory clicks.
    const inv = (await observe()).inventory,
      sword = inv
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s?.id === "iron_sword")
        .sort((a, b) => (b.s.durability ?? 0) - (a.s.durability ?? 0))[0];
    assert.ok(sword, "retain the actually crafted rescue sword");
    let index = sword.i;
    if (index >= 9) {
      await d.open();
      await page.locator(`[data-area="inventory"][data-slot="${index}"]`).click();
      await page.locator('[data-area="inventory"][data-slot="7"]').click();
      if (inv[7]) await page.locator(`[data-area="inventory"][data-slot="${index}"]`).click();
      await d.close();
      index = 7;
    }
    await page.keyboard.press(`Digit${index + 1}`);
    // Only immediate, genuinely hittable melee threats; never chase a spider
    // onto the hillside while critically injured.
    const defenseUntil = Date.now() + 1200;
    while (Date.now() < defenseUntil) {
      const s = await observe();
      assert.ok(s.health > 0, "survive after removing the archer");
      const mob = s.mobs.find(
        (m) =>
          ["spider", "zombie", "skeleton"].includes(m.species) &&
          Math.hypot(
            m.position.x - s.p.x,
            m.position.y + 0.7 - s.p.y - 1.62,
            m.position.z - s.p.z,
          ) < 2.8,
      );
      if (!mob) break;
      const body = { x: mob.position.x, y: mob.position.y + 0.7, z: mob.position.z };
      const visible = await page.evaluate(
        ({ p, body }) => {
          const eye = { ...p, y: p.y + 1.62 },
            length = Math.hypot(body.x - eye.x, body.y - eye.y, body.z - eye.z);
          for (let t = 0.1; t < length; t += 0.1) {
            const f = t / length;
            if (
              ![0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43].includes(
                window.__mc.blockAt(
                  Math.floor(eye.x + (body.x - eye.x) * f),
                  Math.floor(eye.y + (body.y - eye.y) * f),
                  Math.floor(eye.z + (body.z - eye.z) * f),
                ),
              )
            )
              return false;
          }
          return true;
        },
        { p: s.p, body },
      );
      if (!visible) break;
      await d.aim(body, 0);
      await d.releaseAttack();
      await page.mouse.down();
      await wait(420);
      await d.releaseAttack();
    }
    meta.emergencyArcher = {
      shots,
      archerId: skeleton.id,
      beforeHealth: before.health,
      after: await observe(),
    };
    flush();
    console.log(
      "EMERGENCY_ARCHER",
      JSON.stringify({ shots, health: (await observe()).health, position: (await observe()).p }),
    );
  } finally {
    await release();
    await a.save(false);
  }
}
