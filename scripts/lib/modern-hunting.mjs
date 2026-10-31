import { mobAimHeight } from "./mob-aim.mjs";
/** Normal-input mob hunting for the generation-3 survival recording.
 * Observations are read-only. No imports, spawns, teleport, time or item setters.
 * Desired quantities are total inventory counts, not an assumed number of kills. */
import assert from "node:assert/strict";
import { wait } from "./survival-driver.mjs";
import { huntingCoverPath, huntingPath, perpendicularStrafe } from "./hunting-path.mjs";
import { canMelee, clearSight, hostile, safeRetreat } from "./combat-policy.mjs";

const DROPS = {
  rawMeat: ["cow", "pig", "sheep", "chicken"],
  enderPearl: ["wanderer"],
  string: ["spider"],
  feather: ["chicken"],
  arrow: ["skeleton"],
  blazeRod: ["ember"],
  ammo: ["chicken", "skeleton"],
};
const LABELS = {
  rawMeat: "生肉",
  enderPearl: "エンダーパール",
  string: "糸",
  feather: "羽根",
  arrow: "矢",
  blazeRod: "ブレイズロッド",
  ammo: "矢と矢の材料",
};
const FRIENDLY = ["pig", "cow", "sheep", "chicken"];
const SWORDS = [
  "enchanted_diamond_sword",
  "diamond_sword",
  "enchanted_iron_sword",
  "iron_sword",
  "stone_sword",
  "wood_sword",
  "iron_axe",
  "stone_axe",
  "iron_pick",
  "stone_pick",
];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const nightAt = (time) => ((time % 1200) + 1200) % 1200 >= 720;

/** True only when the aimed voxel begins before the creature hit sphere.
 * A raycast can otherwise report terrain behind an unobstructed creature. */
export function blockBeforeTargetSphere(eye, center, block, radius = 0.55) {
  const delta = { x: center.x - eye.x, y: center.y - eye.y, z: center.z - eye.z };
  const length = Math.hypot(delta.x, delta.y, delta.z);
  if (length <= radius) return false;
  let entry = 0,
    exit = Infinity;
  for (const axis of ["x", "y", "z"]) {
    const direction = delta[axis] / length;
    if (Math.abs(direction) < 1e-9) {
      if (eye[axis] < block[axis] || eye[axis] > block[axis] + 1) return false;
      continue;
    }
    const a = (block[axis] - eye[axis]) / direction,
      b = (block[axis] + 1 - eye[axis]) / direction;
    entry = Math.max(entry, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
  }
  return exit >= entry && entry < length - radius - 0.03;
}

/** Preserve urgent nearby threats, but do not chase an unreachable lower
 * spider/zombie while a visible shooter is already within a real sword ray. */
export function prioritizeReachableSkeleton(state, candidates, blockAt) {
  const nearest = candidates[0];
  if (!nearest) return null;
  const eye = { ...state.position, y: state.position.y + state.eye };
  const reachable = (mob) => {
    const body = { ...mob.position, y: mob.position.y + mobAimHeight(mob) };
    return distance(eye, body) <= 2.95 && clearSight(eye, body, blockAt);
  };
  if (
    !["spider", "zombie"].includes(nearest.species) ||
    Math.abs(nearest.position.y - state.position.y) < 0.75 ||
    reachable(nearest)
  )
    return nearest;
  return (
    candidates.find(
      (m) => m.species === "skeleton" && m.visibleToPlayer !== false && reachable(m),
    ) ?? nearest
  );
}

export function createModernHunting(page, d, a, options = {}) {
  const stats = {
    kills: {},
    meleeSwings: 0,
    arrowsSpent: 0,
    patrols: 0,
    waits: 0,
    swims: 0,
    blockedTargets: 0,
    pathPlans: 0,
    terrainFallbacks: 0,
    shootingStrafes: 0,
    closeObstructionsBroken: 0,
    wanderersLured: 0,
  };
  const ignored = new Map();
  const corpses = [];
  let focus = null,
    fighting = false,
    active = false;
  let guarding = false;
  let currentConfig = {};
  let permanentGuard = false;
  let strafeSide = 1;
  const countResource = async (id) =>
    id === "ammo" ? (await d.count("arrow")) + 4 * (await d.count("feather")) : d.count(id);
  const record = async (name, detail = {}) => {
    if (options.onEvent) await options.onEvent({ name, ...detail, at: new Date().toISOString() });
  };
  const release = async () => {
    await d.releaseAttack();
    for (const key of ["KeyW", "KeyS", "KeyA", "KeyD", "Space", "ControlLeft"])
      await page.keyboard.up(key);
  };
  // Limit the local terrain copy to the player's immediate walking/retreat area.
  const observe = () =>
    page.evaluate(() => {
      const p = window.__mc.position(),
        state = window.__mc.adventure(),
        cells = [];
      for (let x = Math.floor(p.x) - 3; x <= Math.floor(p.x) + 3; x++)
        for (let z = Math.floor(p.z) - 3; z <= Math.floor(p.z) + 3; z++)
          for (let y = Math.floor(p.y) - 3; y <= Math.floor(p.y) + 3; y++)
            cells.push([`${x},${y},${z}`, window.__mc.blockAt(x, y, z)]);
      return {
        position: p,
        eye: window.__mc.eyeHeight(),
        eyeBlock: window.__mc.blockAt(
          Math.floor(p.x),
          Math.floor(p.y + window.__mc.eyeHeight()),
          Math.floor(p.z),
        ),
        health: window.__mc.health(),
        time: window.__mc.time(),
        dimension: state.dimension,
        creatures: state.creatures.map((mob) => {
          const from = { ...mob.position, y: mob.position.y + 1.2 },
            to = { ...p, y: p.y + 1 };
          const dx = to.x - from.x,
            dy = to.y - from.y,
            dz = to.z - from.z,
            length = Math.hypot(dx, dy, dz);
          let visibleToPlayer = true;
          if (length <= 16)
            for (let t = 0.15; t < length - 0.2; t += 0.2) {
              const id = window.__mc.blockAt(
                Math.floor(from.x + (dx * t) / length),
                Math.floor(from.y + (dy * t) / length),
                Math.floor(from.z + (dz * t) / length),
              );
              if (![0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43].includes(id)) {
                visibleToPlayer = false;
                break;
              }
            }
          return {
            ...mob,
            visibleToPlayer,
            inWater:
              window.__mc.blockAt(
                Math.floor(mob.position.x),
                Math.floor(mob.position.y + 0.1),
                Math.floor(mob.position.z),
              ) === 5,
          };
        }),
        inventory: window.__mc.inventory(),
        cells,
      };
    });
  async function surfaceForAir(state) {
    // A surface route already swims with Space held. Do not redirect it back
    // to a nearby bank on every step while the player's head is in open air.
    if (state.eyeBlock !== 5) return false;
    const shore = await page.evaluate((p) => {
      const mc = window.__mc;
      if (mc.blockAt(Math.floor(p.x), Math.floor(p.y + 0.1), Math.floor(p.z)) !== 5) return null;
      let waterTop = Math.floor(p.y + 0.1);
      while (mc.blockAt(Math.floor(p.x), waterTop + 1, Math.floor(p.z)) === 5) waterTop++;
      const sites = [];
      for (let x = Math.floor(p.x) - 10; x <= p.x + 10; x++)
        for (let z = Math.floor(p.z) - 10; z <= p.z + 10; z++)
          for (let y = Math.floor(p.y); y <= waterTop + 2; y++) {
            if (
              [1, 2, 3, 4, 9, 11].includes(mc.blockAt(x, y - 1, z)) &&
              mc.blockAt(x, y, z) === 0 &&
              mc.blockAt(x, y + 1, z) === 0
            )
              sites.push({
                x: x + 0.5,
                y,
                z: z + 0.5,
                d: Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) + 2 * Math.abs(y - p.y),
              });
          }
      return sites.sort((a, b) => a.d - b.d)[0] ?? null;
    }, state.position);
    if (state.eyeBlock !== 5 && !shore) return false;
    const open = await page.evaluate(() => !document.querySelector("#inventory-panel").hidden);
    if (open) await d.close();
    await release();
    d.narrate("水中なので、作業より先に水面へ泳いで息をします。", 2);
    try {
      if (shore) {
        await d.aim({ x: shore.x, y: state.position.y + state.eye, z: shore.z }, 0);
        await page.keyboard.down("KeyW");
      }
      await page.keyboard.down("Space");
      await wait(shore ? 450 : 1000);
      stats.swims++;
    } finally {
      await page.keyboard.up("Space");
      await page.keyboard.up("KeyW");
    }
    return true;
  }
  const blockQuery = (state) => {
    const cells = new Map(state.cells);
    return (x, y, z) => cells.get(`${x},${y},${z}`) ?? 0;
  };
  const alive = (state) => state.creatures.filter((m) => m.hp > 0);
  const nearestDanger = (state) => {
    const candidates = alive(state)
      .filter(
        (m) =>
          hostile(m) &&
          m.visibleToPlayer !== false &&
          (m.species === "skeleton" ||
            (ignored.get(m.id) ?? 0) < Date.now() ||
            canMelee(state.position, state.eye, m.position)) &&
          distance(m.position, state.position) < (m.species === "skeleton" ? 14 : 5.5),
      )
      .sort((x, y) => distance(x.position, state.position) - distance(y.position, state.position));
    return prioritizeReachableSkeleton(state, candidates, blockQuery(state));
  };
  const rangedVisible = (state, mob) =>
    page.evaluate(
      ({ from, to }) => {
        const dx = to.x - from.x,
          dy = to.y - from.y,
          dz = to.z - from.z,
          length = Math.hypot(dx, dy, dz);
        for (let t = 0.2; t < length - 0.4; t += 0.2) {
          const id = window.__mc.blockAt(
            Math.floor(from.x + (dx * t) / length),
            Math.floor(from.y + (dy * t) / length),
            Math.floor(from.z + (dz * t) / length),
          );
          if (![0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43].includes(id)) return false;
        }
        return true;
      },
      {
        from: { ...state.position, y: state.position.y + state.eye },
        to: { ...mob.position, y: mob.position.y + mobAimHeight(mob) },
      },
    );
  const chooseWeapon = async (state) => {
    const usableSword = (state) =>
      SWORDS.find(
        (id) =>
          id.endsWith("_sword") &&
          state.inventory.some((stack) => stack?.id === id && (stack.durability ?? 1) >= 4),
      );
    let id = usableSword(state);
    if (!id && options.ensureWeapon && (!fighting || !nearestDanger(state))) {
      await release();
      await options.ensureWeapon(state);
      state = await observe();
      id = usableSword(state);
    }
    id ??= SWORDS.find((id) => state.inventory.some((stack) => stack?.id === id));
    if (id) await d.equip(id);
    else {
      const empty = state.inventory.slice(0, 9).findIndex((stack) => stack === null);
      await page.keyboard.press(`Digit${Math.max(0, empty) + 1}`);
    }
  };
  const enqueueKill = async (mob, state) => {
    if (alive(state).some((m) => m.id === mob.id)) return false;
    if (corpses.some((p) => p.id === mob.id)) return true;
    corpses.push({ id: mob.id, species: mob.species, position: { ...mob.position } });
    stats.kills[mob.species] = (stats.kills[mob.species] ?? 0) + 1;
    await record("mob-defeated", { id: mob.id, species: mob.species, position: mob.position });
    return true;
  };
  let terrainCache = null;
  async function combatTerrain(state) {
    const p = state.position;
    if (
      !terrainCache ||
      Date.now() - terrainCache.at > 400 ||
      Math.hypot(p.x - terrainCache.player.x, p.z - terrainCache.player.z) > 1.5 ||
      Math.abs(p.y - terrainCache.player.y) > 1
    ) {
      const grid = await page.evaluate(
        ({ p, ys }) => {
          const minX = Math.floor(p.x) - 14,
            minZ = Math.floor(p.z) - 14,
            minY = Math.max(1, Math.floor(Math.min(p.y - 4, ...ys.map((y) => y - 1)))),
            maxY = Math.min(95, Math.floor(Math.max(p.y + 6, ...ys.map((y) => y + 3)))),
            blocks = [];
          for (let y = minY; y <= maxY; y++)
            for (let z = minZ; z < minZ + 29; z++)
              for (let x = minX; x < minX + 29; x++) blocks.push(window.__mc.blockAt(x, y, z));
          return { minX, minZ, minY, maxY, blocks };
        },
        {
          p,
          ys: state.creatures
            .filter((mob) => distance(mob.position, p) <= 16)
            .map((mob) => mob.position.y),
        },
      );
      terrainCache = { at: Date.now(), player: { ...p }, grid };
    }
    const grid = terrainCache.grid;
    return {
      minimumY: grid.minY + 1,
      maximumY: grid.maxY - 2,
      blockAt: (x, y, z) =>
        x < grid.minX ||
        x >= grid.minX + 29 ||
        z < grid.minZ ||
        z >= grid.minZ + 29 ||
        y < grid.minY ||
        y > grid.maxY
          ? 8
          : grid.blocks[((y - grid.minY) * 29 + z - grid.minZ) * 29 + x - grid.minX],
    };
  }
  async function stepToward(state, target, away = false, reposition = false) {
    const at = state.position;
    if (away) {
      const retreat = safeRetreat(at, target.position, blockQuery(state));
      if (!retreat) return false;
      await d.aim({ x: retreat.x, y: at.y + state.eye, z: retreat.z }, 0);
      await page.keyboard.down("ControlLeft");
      await page.keyboard.down("KeyW");
      if (retreat.jump) await page.keyboard.down("Space");
      await wait(280);
      await release();
      return true;
    }
    const terrain = await combatTerrain(state);
    const plan = huntingPath(at, target.position, terrain.blockAt, {
      ...terrain,
      radius: 14,
      skipStartGoal: reposition,
    });
    stats.pathPlans++;
    if (options.debugNavigation)
      await record("combat-navigation-plan", {
        player: at,
        target: target.position,
        next: plan.path[0],
        reached: plan.reached,
        visited: plan.visited,
        path: plan.path.slice(0, 4),
      });
    const next = plan.path[0];
    if (!next) return false;
    return walkWaypoint(state, next);
  }
  async function walkWaypoint(state, next) {
    const at = state.position,
      travel = Math.hypot(next.x - at.x, next.z - at.z);
    if (travel < 0.12 && Math.abs(next.y - at.y) < 0.2) return false;
    await d.aim({ x: next.x, y: at.y + state.eye, z: next.z }, 0);
    if (next.y > at.y + 0.2) {
      await page.keyboard.down("Space");
      await wait(160);
    }
    await page.keyboard.down("ControlLeft");
    await page.keyboard.down("KeyW");
    await wait(Math.max(35, Math.min(140, (travel / 5.6) * 850)));
    await release();
    return true;
  }
  const shootingEnemies = (state) =>
    alive(state).filter(
      (mob) =>
        mob.species === "skeleton" &&
        mob.visibleToPlayer !== false &&
        distance(mob.position, state.position) < 15,
    );
  async function takeCover(state) {
    const until = Date.now() + 6500;
    while (Date.now() < until) {
      const shooters = shootingEnemies(state);
      if (!shooters.length) return true;
      const terrain = await combatTerrain(state);
      const route = huntingCoverPath(state.position, shooters, terrain.blockAt, {
        ...terrain,
        radius: 14,
      });
      if (!route.path.length) break;
      if (!(await walkWaypoint(state, route.path[0]))) break;
      state = await observe();
      assert.ok(state.health > 0, "survive withdrawal from ranged enemies");
    }
    return !shootingEnemies(await observe()).length;
  }
  async function shoot(_state, mob) {
    await release();
    const before = await d.count("arrow");
    await d.equip("bow");
    // Reobserve after equipping and after every previous sidestep. Never aim
    // from the position the player occupied at the start of the encounter.
    const state = await observe();
    mob = alive(state).find((candidate) => candidate.id === mob.id);
    if (!mob) return;
    const range = distance(mob.position, state.position),
      t = range / 22;
    const aim = {
      x: mob.position.x + mob.velocity.x * t,
      y: mob.position.y + mobAimHeight(mob) + 1.2 * t * t,
      z: mob.position.z + mob.velocity.z * t,
    };
    await d.aim(aim, 0);
    await a.right();
    const firedAt = Date.now();
    const terrain = await combatTerrain(state);
    const strafe = perpendicularStrafe(state.position, aim, terrain.blockAt, strafeSide);
    if (strafe) {
      strafeSide = -strafe.side;
      try {
        await page.keyboard.down(strafe.key);
        await wait(300);
        stats.shootingStrafes++;
      } finally {
        await page.keyboard.up(strafe.key);
      }
    }
    await wait(Math.max(0, 550 - (Date.now() - firedAt)));
    stats.arrowsSpent += Math.max(0, before - (await d.count("arrow")));
    await enqueueKill(mob, await observe());
  }
  async function terrainStep(state, mob) {
    // A closed doorway can require real digging. Limit fallback to the next
    // column; never hand a long pursuit to an unobserved blocking operation.
    const p = state.position,
      dx = mob.position.x - p.x,
      dz = mob.position.z - p.z;
    const next = { x: Math.floor(p.x), z: Math.floor(p.z) };
    if (Math.abs(dx) >= Math.abs(dz)) next.x += Math.sign(dx);
    else next.z += Math.sign(dz);
    stats.terrainFallbacks++;
    await a.surfaceTo(next);
    terrainCache = null;
  }
  async function fight(id) {
    if (fighting) return false;
    fighting = true;
    const until = Date.now() + (currentConfig.fightTimeoutMs ?? 15000);
    let bestRange = Infinity,
      lastProgress = Date.now(),
      failedSwings = 0,
      previousPosition = null;
    try {
      await release();
      while (Date.now() < until) {
        const state = await observe();
        assert.ok(state.health > 0, "survive ordinary-input hunting combat");
        if (await surfaceForAir(state)) continue;
        const primary = alive(state).find((m) => m.id === id);
        if (!primary) return true;
        const danger = nearestDanger(state);
        const mob =
          danger &&
          distance(danger.position, state.position) < 2.5 &&
          distance(primary.position, state.position) > 2.8
            ? danger
            : primary;
        const range = distance(mob.position, state.position);
        if (range < bestRange - 0.15) {
          bestRange = range;
          lastProgress = Date.now();
        }
        const surrounded =
          alive(state).filter(
            (other) => hostile(other) && distance(other.position, state.position) < 4.5,
          ).length >= 2;
        if (state.health <= 8 && surrounded) {
          await stepToward(state, mob, true);
          await a.eat();
        }
        const reserve = currentConfig.arrowReserve ?? options.arrowReserve ?? 32;
        const arrows = state.inventory
          .filter((stack) => stack?.id === "arrow")
          .reduce((n, stack) => n + stack.count, 0);
        const bowReady = state.inventory.some((stack) => stack?.id === "bow") && arrows > reserve;
        const rangedTarget = ["skeleton", "ember"].includes(mob.species);
        if (
          rangedTarget &&
          (range > 3 || Math.abs(mob.position.y - state.position.y) > 1) &&
          bowReady &&
          (await rangedVisible(state, mob))
        ) {
          await shoot(state, mob);
          lastProgress = Date.now();
          continue;
        }
        await chooseWeapon(state);
        if (
          canMelee(state.position, state.eye, mob.position) &&
          failedSwings < 2 &&
          clearSight(
            { ...state.position, y: state.position.y + state.eye },
            { ...mob.position, y: mob.position.y + mobAimHeight(mob) },
            blockQuery(state),
          )
        ) {
          await d.aim({ ...mob.position, y: mob.position.y + mobAimHeight(mob) }, 0);
          await page.mouse.down();
          await wait(450);
          await d.releaseAttack();
          stats.meleeSwings++;
          const after = await observe();
          await enqueueKill(mob, after);
          const remaining = alive(after).find((candidate) => candidate.id === mob.id);
          if (!remaining || remaining.hp < mob.hp) {
            lastProgress = Date.now();
            failedSwings = 0;
          } else failedSwings++;
          if (!alive(after).some((m) => m.id === id)) return true;
        } else {
          const reserve = currentConfig.arrowReserve ?? options.arrowReserve ?? 32;
          const arrows = state.inventory
            .filter((s) => s?.id === "arrow")
            .reduce((n, s) => n + s.count, 0);
          if (
            Date.now() - lastProgress > 2200 &&
            range < 16 &&
            arrows > reserve &&
            state.inventory.some((s) => s?.id === "bow") &&
            (await rangedVisible(state, mob))
          ) {
            await shoot(state, mob);
            lastProgress = Date.now();
          } else {
            const moved = await stepToward(state, mob, false, failedSwings >= 2);
            if (moved) {
              if (previousPosition && distance(state.position, previousPosition) > 0.15)
                failedSwings = 0;
              previousPosition = { ...state.position };
            }
            if (!moved || Date.now() - lastProgress > 2500) {
              const latest = await observe();
              if (shootingEnemies(latest).length) {
                // A nearby enemy may see the player over a block while our
                // approach or body-level attack is obstructed. Break that one
                // real cover block quickly, using the owned pickaxe, before
                // abandoning an otherwise reachable close encounter.
                if (distance(mob.position, latest.position) < 6 && latest.health >= 6) {
                  const currentMob = alive(latest).find((candidate) => candidate.id === mob.id);
                  if (!currentMob) continue;
                  const body = {
                    ...currentMob.position,
                    y: currentMob.position.y + mobAimHeight(currentMob),
                  };
                  await d.aim(body, 0);
                  const hit = await page.evaluate(() => window.__mc.target());
                  if (
                    hit &&
                    blockBeforeTargetSphere(
                      { ...latest.position, y: latest.position.y + latest.eye },
                      body,
                      hit,
                    ) &&
                    Math.hypot(
                      hit.x + 0.5 - latest.position.x,
                      hit.y + 0.5 - latest.position.y - latest.eye,
                      hit.z + 0.5 - latest.position.z,
                    ) < 4.4 &&
                    ![0, 5, 8, 12, 13, 14, 15, 26, 28, 31, 34, 35, 38, 39, 40, 43].includes(
                      await d.block(hit),
                    )
                  ) {
                    await d.mine(hit);
                    stats.closeObstructionsBroken++;
                    await record("removed-close-obstruction", {
                      block: hit,
                      species: currentMob.species,
                    });
                    lastProgress = Date.now();
                    failedSwings = 0;
                    terrainCache = null;
                    continue;
                  }
                }
                // Dry-ground BFS cannot start during a fall. Let physics
                // establish real support before declaring withdrawal impossible.
                const terrain = blockQuery(latest),
                  p = latest.position;
                const pass = [0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43];
                let supported = false;
                for (let x = Math.floor(p.x - 0.3 + 1e-4); x <= Math.floor(p.x + 0.3 - 1e-4); x++)
                  for (let z = Math.floor(p.z - 0.3 + 1e-4); z <= Math.floor(p.z + 0.3 - 1e-4); z++)
                    if (!pass.includes(terrain(x, Math.floor(p.y - 0.05), z))) supported = true;
                const feetWet =
                  terrain(Math.floor(p.x), Math.floor(p.y + 0.4), Math.floor(p.z)) === 5;
                if (!supported && !feetWet && latest.eyeBlock !== 5) {
                  await release();
                  await wait(120);
                  continue;
                }
                const covered = await takeCover(latest);
                if (!covered)
                  throw new Error(
                    "Cannot safely reach or shelter from ranged enemies; checkpoint before further work",
                  );
                ignored.set(id, Date.now() + 20000);
                await record("withdrew-for-ranged-equipment", { species: mob.species });
                return false;
              }
              await terrainStep(latest, mob);
              failedSwings = 0;
              lastProgress = Date.now();
            }
          }
        }
      }
      const remaining = alive(await observe()).find((mob) => mob.id === id);
      if (remaining?.species !== "skeleton") ignored.set(id, Date.now() + 30000);
      stats.blockedTargets++;
      return false;
    } finally {
      await release();
      fighting = false;
    }
  }
  async function huntingGuard() {
    if (fighting || guarding) return false;
    const pickTarget = (state) => {
      const danger = nearestDanger(state);
      const selected =
        focus &&
        alive(state).find(
          (m) =>
            m.id === focus.id &&
            distance(m.position, state.position) < 4.5 &&
            ((ignored.get(m.id) ?? 0) < Date.now() ||
              (m.visibleToPlayer !== false && canMelee(state.position, state.eye, m.position))),
        );
      return danger ?? selected;
    };
    const saved = await observe();
    if (await surfaceForAir(saved)) return true;
    let target = pickTarget(saved);
    if (!target) {
      const idle = await page.evaluate(() => ({
        open: !document.querySelector("#inventory-panel").hidden,
        mode: window.__mc.mode(),
        hunger: Number(document.querySelector("#hunger").textContent.match(/食料 (\d+)/)?.[1]),
        selected: Number(document.querySelector("#hotbar .selected .hotbar-key")?.textContent) - 1,
      }));
      // Leave crafting grids alone. The runner restores food before starting a job.
      if (idle.open || idle.mode !== "pointer") return false;
      if (
        idle.hunger < 18 &&
        saved.inventory.some(
          (stack) =>
            stack && ["meat", "bread", "cookedFish", "apple", "rawMeat", "fish"].includes(stack.id),
        )
      ) {
        guarding = true;
        const held = saved.inventory[idle.selected]?.id;
        try {
          await release();
          await a.eat();
          if (held && (await d.count(held))) await d.equip(held);
          else {
            const now = await d.info();
            const empty = now.inventory.slice(0, 9).findIndex((stack) => stack === null);
            if (empty >= 0) await page.keyboard.press(`Digit${empty + 1}`);
          }
          return true;
        } finally {
          await release();
          guarding = false;
        }
      }
      if (saved.dimension !== "end" && saved.health < 16 && idle.hunger >= 18) {
        await release();
        await wait(1000);
        return true;
      }
      return false;
    }
    guarding = true;
    const ui = await page.evaluate(() => ({
      open: !document.querySelector("#inventory-panel").hidden,
      title: document.querySelector("#inventory-panel h2")?.textContent,
      station: window.__mc.target(),
      selected: Number(document.querySelector("#hotbar .selected .hotbar-key")?.textContent) - 1,
    }));
    const held = saved.inventory[ui.selected]?.id;
    try {
      await release();
      if (ui.open) await d.close();
      await fight(target.id);
      // Normal work must resume at its original mining/crafting position.
      // During the hunt itself, staying by the defeated target helps collect loot.
      if (!active || ui.open) {
        let returned = false;
        const until = Date.now() + 90000;
        while (!returned && Date.now() < until) {
          target = pickTarget(await observe());
          if (target) await fight(target.id);
          const returnState = await observe();
          returned = await d.walk(
            saved.position.x,
            saved.position.z,
            saved.position.y > returnState.position.y + 0.2,
            0.35,
            80,
            async () => Boolean(pickTarget(await observe())),
          );
        }
        assert.ok(returned, "return safely to interrupted work after hunting guard combat");
      }
      if (ui.open) {
        if (ui.title !== "所持品" && ui.station) {
          const now = await observe();
          const tool = SWORDS.find((id) => now.inventory.some((stack) => stack?.id === id));
          if (tool) await d.equip(tool);
          else {
            const empty = now.inventory.slice(0, 9).findIndex((stack) => stack === null);
            await page.keyboard.press(`Digit${Math.max(0, empty) + 1}`);
          }
          await a.useAt(ui.station);
          await page.waitForSelector("#inventory-panel:not([hidden])", { timeout: 5000 });
        } else await d.open();
      } else if (held && (await d.count(held))) await d.equip(held);
      return true;
    } finally {
      await release();
      guarding = false;
    }
  }
  async function collectDrops() {
    const species = currentConfig.collectSpecies ?? options.collectSpecies;
    const allowed = species === undefined ? null : new Set(species);
    let visits = 0;
    while (corpses.length && visits < 8) {
      const drop = corpses.shift();
      // Discard only the controller's visit request. Native world drops remain
      // where the creature died and can still be collected by ordinary motion.
      if (allowed && !allowed.has(drop.species)) continue;
      visits++;
      const here = (await d.info()).position;
      if (Math.hypot(drop.position.x - here.x, drop.position.z - here.z) > 32) continue;
      await a.surfaceTo({ x: Math.floor(drop.position.x), z: Math.floor(drop.position.z) });
      await wait(300);
      await record("visited-drop-position", { species: drop.species, position: drop.position });
    }
  }
  async function patrol(home, index) {
    const state = await observe();
    const angle = (index * Math.PI) / 4;
    const wanted = {
      x: Math.floor(home.x + Math.cos(angle) * 12),
      z: Math.floor(home.z + Math.sin(angle) * 12),
    };
    await a.surfaceTo(wanted);
    stats.patrols++;
    await wait(500);
    assert.ok((await d.info()).health > 0, "survive hunting patrol");
    return state;
  }
  async function gather(targets, config = {}) {
    assert.ok(!active, "do not run two hunts on the same browser concurrently");
    for (const [item, count] of Object.entries(targets)) {
      assert.ok(DROPS[item], `unsupported hunting resource ${item}`);
      assert.ok(Number.isInteger(count) && count >= 0, `valid desired total for ${item}`);
    }
    assert.ok(
      config.collectSpecies === undefined ||
        (Array.isArray(config.collectSpecies) &&
          config.collectSpecies.every((species) => typeof species === "string")),
      "collectSpecies is an optional list of creature species",
    );
    active = true;
    currentConfig = config;
    const start = await observe(),
      home = config.home ?? { ...start.position };
    const expectedDimension =
      config.dimension ??
      (Object.keys(targets).every((k) => k === "blazeRod") ? "nether" : "overworld");
    const until = Date.now() + (config.timeoutMs ?? options.timeoutMs ?? 1800000);
    let idle = 0,
      patrolIndex = 0;
    d.setThreatHandler(huntingGuard);
    try {
      await release();
      while (true) {
        let state = await observe();
        assert.equal(state.dimension, expectedDimension, "hunt in the expected realm");
        assert.ok(state.health > 0, "survive hunting expedition");
        const missing = [];
        for (const [item, total] of Object.entries(targets))
          if ((await countResource(item)) < total) missing.push(item);
        if (!missing.length)
          return {
            counts: Object.fromEntries(
              await Promise.all(
                Object.keys(targets).map(async (id) => [id, await countResource(id)]),
              ),
            ),
            stats,
          };
        assert.ok(Date.now() < until, `natural-spawn hunting timed out: ${missing.join(", ")}`);
        if (options.maintain && !nearestDanger(state)) {
          await options.maintain(state);
          state = await observe();
          assert.equal(
            state.dimension,
            expectedDimension,
            "maintenance stays in the hunting realm",
          );
          assert.ok(state.health > 0, "survive normal-input hunting maintenance");
        }
        if (
          options.ensureWeapon &&
          !nearestDanger(state) &&
          !state.inventory.some(
            (stack) => stack?.id.endsWith("_sword") && (stack.durability ?? 1) >= 4,
          )
        )
          await chooseWeapon(state);
        if (state.health < 13 && !nearestDanger(state)) {
          await collectDrops();
          if (options.recover) await options.recover(18);
          else {
            await a.eat();
            await a.recover(18);
          }
          continue;
        }
        await huntingGuard();
        await collectDrops();
        const latest = await observe();
        const candidates = alive(latest)
          .filter((m) => missing.some((item) => DROPS[item].includes(m.species)))
          .filter((m) => !config.avoidWaterTargets || !m.inWater)
          .filter(
            (m) =>
              (ignored.get(m.id) ?? 0) < Date.now() ||
              (m.visibleToPlayer !== false && distance(m.position, latest.position) < 3),
          )
          .sort((x, y) => {
            const priority = (mob) =>
              missing.findIndex((item) => DROPS[item].includes(mob.species));
            return (
              priority(x) - priority(y) ||
              distance(x.position, latest.position) +
                (x.inWater ? 30 : 0) -
                distance(y.position, latest.position) -
                (y.inWater ? 30 : 0)
            );
          });
        focus = candidates[0] ?? null;
        if (!focus && config.cullForSpawns !== false) {
          const population = alive(latest);
          const night = expectedDimension === "nether" || nightAt(latest.time);
          const crowded =
            population.filter((m) =>
              night
                ? !FRIENDLY.includes(m.species) && m.species !== "villager"
                : missing.some((item) =>
                    DROPS[item].some((species) => FRIENDLY.includes(species)),
                  ) && FRIENDLY.includes(m.species),
            ).length >= 10;
          if (crowded)
            focus =
              population
                .filter(
                  (m) =>
                    m.species !== "villager" &&
                    (!config.avoidWaterTargets || !m.inWater) &&
                    (ignored.get(m.id) ?? 0) < Date.now() &&
                    (night ? !FRIENDLY.includes(m.species) : FRIENDLY.includes(m.species)),
                )
                .sort(
                  (x, y) =>
                    distance(x.position, latest.position) +
                    (x.inWater ? 30 : 0) -
                    distance(y.position, latest.position) -
                    (y.inWater ? 30 : 0),
                )[0] ?? null;
        }
        if (focus) {
          idle = 0;
          const desired = missing.find((item) => DROPS[item].includes(focus.species));
          if (desired) d.narrate(`${LABELS[desired]}を集めるため、見つけた生物に近づきます。`, 1);
          // Terrain movement still reacts to hostile danger, but must not
          // re-enter combat with this unreachable gathering target mid-approach.
          const chosen = focus;
          // One normal arrow turns a passive wanderer hostile. Keep our
          // supported position while it approaches, rather than crossing an
          // entire hillside/coast just to deliver the first melee hit.
          const reserve =
            config.lureReserve ?? Math.max(12, config.arrowReserve ?? options.arrowReserve ?? 12);
          const arrows = latest.inventory
            .filter((stack) => stack?.id === "arrow")
            .reduce((n, stack) => n + stack.count, 0);
          const ground = blockQuery(latest),
            p = latest.position;
          const pass = [0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43];
          let supported = false;
          if (Math.abs(p.y - Math.round(p.y)) < 0.05)
            for (let x = Math.floor(p.x - 0.3 + 1e-4); x <= Math.floor(p.x + 0.3 - 1e-4); x++)
              for (let z = Math.floor(p.z - 0.3 + 1e-4); z <= Math.floor(p.z + 0.3 - 1e-4); z++)
                if (!pass.includes(ground(x, Math.round(p.y) - 1, z))) supported = true;
          if (
            chosen.species === "wanderer" &&
            chosen.fuse !== 2 &&
            supported &&
            distance(chosen.position, p) > 3 &&
            distance(chosen.position, p) <= 16 &&
            arrows > reserve &&
            latest.inventory.some((stack) => stack?.id === "bow") &&
            (await rangedVisible(latest, chosen))
          ) {
            const beforeLureConfig = currentConfig;
            currentConfig = { ...currentConfig, arrowReserve: reserve };
            try {
              await shoot(latest, chosen);
              stats.wanderersLured++;
              await record("wanderer-lure-shot", {
                id: chosen.id,
                position: chosen.position,
                reserve,
              });
              const lureDeadline = Date.now() + 15000;
              let engaged = false;
              while (Date.now() < lureDeadline) {
                const now = await observe(),
                  target = alive(now).find((m) => m.id === chosen.id);
                assert.ok(now.health > 0, "survive while the normally shot wanderer approaches");
                if (!target) {
                  await enqueueKill(chosen, now);
                  engaged = true;
                  break;
                }
                if (distance(target.position, now.position) <= 4.2) {
                  await huntingGuard();
                  engaged = true;
                  break;
                }
                const otherDanger = nearestDanger(now);
                if (otherDanger && otherDanger.id !== chosen.id) await huntingGuard();
                else await wait(250);
              }
              if (!engaged) ignored.set(chosen.id, Date.now() + 10000);
              await collectDrops();
              focus = null;
              continue;
            } finally {
              currentConfig = beforeLureConfig;
            }
          }
          focus = null;
          try {
            await a.surfaceTo({
              x: Math.floor(chosen.position.x),
              z: Math.floor(chosen.position.z),
            });
            // Reaching the same map column can still leave the animal on a
            // different cave/terrain level. Resolve that real height difference
            // with ordinary building or one-block descent, rather than spinning.
            const at = await observe();
            const target = alive(at).find((mob) => mob.id === chosen.id);
            if (
              target &&
              Math.hypot(target.position.x - at.position.x, target.position.z - at.position.z) < 1.6
            ) {
              const dy = target.position.y - at.position.y;
              const supported = await page.evaluate((p) => {
                if (Math.abs(p.y - Math.round(p.y)) > 0.1) return false;
                const pass = [0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43];
                for (let x = Math.floor(p.x - 0.3); x <= Math.floor(p.x + 0.3); x++)
                  for (let z = Math.floor(p.z - 0.3); z <= Math.floor(p.z + 0.3); z++)
                    if (!pass.includes(window.__mc.blockAt(x, Math.round(p.y) - 1, z))) return true;
                return false;
              }, at.position);
              if (!supported) ignored.set(target.id, Date.now() + 30000);
              else if (dy > 1.2) {
                await a.pillarTo(Math.round(target.position.y));
              } else if (dy < -1.2) {
                await d.center();
                const p = (await d.info()).position;
                const floor = { x: Math.floor(p.x), y: Math.round(p.y) - 1, z: Math.floor(p.z) };
                const id = await d.block(floor);
                const landing = await page.evaluate((floor) => {
                  const pass = [0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43];
                  for (let y = floor.y - 1; y >= Math.max(0, floor.y - 8); y--)
                    if (!pass.includes(window.__mc.blockAt(floor.x, y, floor.z))) return y + 1;
                  return -Infinity;
                }, floor);
                if (![0, 5, 8, 26, 28, 31, 38, 39, 40, 43].includes(id) && p.y - landing <= 3.1) {
                  await d.mine(floor);
                  await wait(600);
                } else ignored.set(target.id, Date.now() + 30000);
              }
            }
          } finally {
            focus = chosen;
          }
          await huntingGuard();
          await collectDrops();
        } else {
          idle++;
          stats.waits++;
          const waitingForNight =
            expectedDimension === "overworld" &&
            !nightAt(latest.time) &&
            missing.every((item) => DROPS[item].every((species) => !FRIENDLY.includes(species)));
          if (waitingForNight) {
            d.narrate("夜に出現する敵を待ち、食料と装備を温存しています。", 1);
            await a.eat();
            await a.waitSafe(5000);
          } else if (config.patrol !== false && idle % 6 === 0) await patrol(home, patrolIndex++);
          else {
            await a.eat();
            await wait(1000);
          }
        }
      }
    } finally {
      focus = null;
      active = false;
      await release();
      d.setThreatHandler(permanentGuard ? huntingGuard : (options.restoreGuard ?? a.guard));
    }
  }
  const one = (item, count, config) => gather({ [item]: count }, config);
  return {
    guard: huntingGuard,
    gather,
    activate: () => {
      permanentGuard = true;
      if (a.setGuard) a.setGuard(huntingGuard);
      else d.setThreatHandler(huntingGuard);
    },
    deactivate: () => {
      permanentGuard = false;
      if (a.setGuard) a.setGuard(null);
      else d.setThreatHandler(options.restoreGuard ?? a.guard);
    },
    stats,
    collectDrops,
    collectPearls: (count = 13, config = {}) => one("enderPearl", count, config),
    collectString: (count = 3, config = {}) => one("string", count, config),
    collectFeathers: (count = 8, config = {}) => one("feather", count, config),
    collectArrows: (count = 32, config = {}) =>
      one("arrow", count, { arrowReserve: Infinity, ...config }),
    collectAmmo: (count = 32, config = {}) =>
      one("ammo", count, { arrowReserve: Infinity, ...config }),
    collectRods: (count = 7, config = {}) =>
      one("blazeRod", count, { dimension: "nether", ...config }),
  };
}
