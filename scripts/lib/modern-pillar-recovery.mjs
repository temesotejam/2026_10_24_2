/** Normal-input Nether recovery. No game setters, save imports or source changes. */
import assert from "node:assert/strict";
import { wait } from "./survival-driver.mjs";
export function createPillarRecovery(page, d, a, options = {}) {
  const stats = { hitsAttempted: 0, elapsed: 0 };
  async function inspectSite(p) {
    return page.evaluate(
      ({ p }) => {
        const pass = new Set([0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43]);
        const errors = [];
        for (let dx = -1; dx <= 1; dx++)
          for (let dz = -1; dz <= 1; dz++) {
            if (pass.has(window.__mc.blockAt(p.x + dx, p.y - 1, p.z + dz)))
              errors.push("unsupported floor");
            for (let dy = 0; dy < 5; dy++)
              if (window.__mc.blockAt(p.x + dx, p.y + dy, p.z + dz) !== 0)
                errors.push("uneven terrain or headroom");
          }
        for (let dx = -4; dx <= 4; dx++)
          for (let dz = -4; dz <= 4; dz++)
            if (Math.hypot(dx, dz) < 2.7)
              for (let dy = -1; dy <= 5; dy++)
                if ([28, 31].includes(window.__mc.blockAt(p.x + dx, p.y + dy, p.z + dz)))
                  errors.push("portal/frame too close");
        return { site: p, safe: errors.length === 0, errors: [...new Set(errors)] };
      },
      { p },
    );
  }
  async function sites(radius = 6) {
    const s = await d.info(),
      y = Math.round(s.position.y),
      results = [];
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++) {
        const site = { x: Math.floor(s.position.x) + dx, y, z: Math.floor(s.position.z) + dz };
        const check = await inspectSite(site);
        if (check.safe)
          results.push({
            ...site,
            distance: Math.hypot(site.x + 0.5 - s.position.x, site.z + 0.5 - s.position.z),
          });
      }
    return results.sort((a, b) => a.distance - b.distance);
  }
  async function buildHere() {
    const s = await d.info(),
      site = {
        x: Math.floor(s.position.x),
        y: Math.round(s.position.y),
        z: Math.floor(s.position.z),
      };
    const check = await inspectSite(site);
    assert.ok(check.safe, `unsafe recovery pillar: ${check.errors.join(", ")}`);
    // The caller suspends its usual threat handler throughout construction and turret work.
    await a.pillarTo(site.y + 3);
    return site;
  }
  async function standAndFight(site, config = {}) {
    const started = Date.now(),
      deadline = started + (config.timeout ?? options.timeout ?? 90000);
    let focus = null,
      quietSince = null;
    const initial = new Set(
      (await a.adventure()).creatures
        .filter(
          (m) =>
            m.species === "ember" &&
            Math.hypot(m.position.x - site.x - 0.5, m.position.z - site.z - 0.5) < 16,
        )
        .map((m) => m.id),
    );
    await d.releaseAttack();
    await page.keyboard.down("ShiftLeft");
    try {
      await d.equip("stone_sword");
      while (Date.now() < deadline) {
        const s = await d.info();
        assert.ok(s.health > 0, "survive pillar recovery");
        assert.ok(Math.abs(s.position.y - site.y - 3) < 0.15, "stay atop the recovery pillar");
        const mobs = (await a.adventure()).creatures.filter(
          (m) =>
            m.species === "ember" &&
            m.hp > 0 &&
            Math.hypot(m.position.x - site.x - 0.5, m.position.z - site.z - 0.5) < 16,
        );
        if (initial.size > 0 && !mobs.some((m) => initial.has(m.id))) {
          return {
            cleared: true,
            initialCleared: true,
            initialCount: initial.size,
            nearbyRemaining: mobs
              .filter(
                (m) =>
                  Math.hypot(
                    m.position.x - s.position.x,
                    m.position.y - s.position.y,
                    m.position.z - s.position.z,
                  ) < 5,
              )
              .map((m) => ({ id: m.id, position: m.position, hp: m.hp })),
            stats: { ...stats, elapsed: Date.now() - started },
          };
        }
        if (!mobs.length) {
          quietSince ??= Date.now();
          if (Date.now() - quietSince > 600)
            return {
              cleared: true,
              initialCount: initial.size,
              stats: { ...stats, elapsed: Date.now() - started },
            };
          await wait(80);
          continue;
        }
        quietSince = null;
        focus =
          mobs.find((m) => m.id === focus?.id) ??
          mobs
            .filter((m) => initial.has(m.id))
            .sort(
              (a, b) =>
                Math.hypot(a.position.x - s.position.x, a.position.z - s.position.z) -
                Math.hypot(b.position.x - s.position.x, b.position.z - s.position.z),
            )[0] ??
          mobs[0];
        const dx = focus.position.x - site.x - 0.5,
          dz = focus.position.z - site.z - 0.5,
          len = Math.hypot(dx, dz) || 1;
        const perch = { x: site.x + 0.5 - (dx / len) * 0.3, z: site.z + 0.5 - (dz / len) * 0.3 };
        if (Math.hypot(s.position.x - perch.x, s.position.z - perch.z) > 0.07) {
          await d.releaseAttack();
          await d.walk(perch.x, perch.z, false, 0.05, 0);
          continue;
        }
        const target = { x: focus.position.x, y: focus.position.y + 1.4, z: focus.position.z },
          eye = { x: s.position.x, y: s.position.y + s.eye, z: s.position.z };
        const distance = Math.hypot(target.x - eye.x, target.y - eye.y, target.z - eye.z);
        let visible = distance < 3 && focus.position.y > site.y + 1.0;
        if (visible)
          visible = await page.evaluate(
            ({ eye, target, distance }) => {
              const pass = [0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43];
              for (let r = 0.1; r < distance; r += 0.06) {
                const f = r / distance;
                if (
                  !pass.includes(
                    window.__mc.blockAt(
                      Math.floor(eye.x + (target.x - eye.x) * f),
                      Math.floor(eye.y + (target.y - eye.y) * f),
                      Math.floor(eye.z + (target.z - eye.z) * f),
                    ),
                  )
                )
                  return false;
              }
              return true;
            },
            { eye, target, distance },
          );
        if (visible) {
          await d.aim(target, 0);
          await page.mouse.down();
          await wait(90);
          await page.mouse.up();
          stats.hitsAttempted++;
        } else await wait(40);
      }
      return {
        cleared: false,
        reason: "deadline",
        initialCount: initial.size,
        stats: { ...stats, elapsed: Date.now() - started },
      };
    } finally {
      await d.releaseAttack();
      await page.keyboard.up("KeyW");
      stats.elapsed = Date.now() - started;
    }
    // Shift intentionally remains held: descending/releasing it belongs to the caller.
  }
  return { inspectSite, sites, buildHere, standAndFight, stats };
}
