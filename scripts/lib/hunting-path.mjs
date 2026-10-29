/** Local dry-ground combat routes. Every edge checks the whole 0.6×1.8
 * player body, including its sweep past corners, rather than one center cell. */
import { clearSight, solid } from "./combat-policy.mjs";
const HAZARDS = new Set([5, 26, 43]);
const EPS = 1e-4;
const key = (p) => `${Math.floor(p.x)},${p.y},${Math.floor(p.z)}`;

export function bodyClear(p, blockAt) {
  for (let x = Math.floor(p.x - 0.3 + EPS); x <= Math.floor(p.x + 0.3 - EPS); x++)
    for (let z = Math.floor(p.z - 0.3 + EPS); z <= Math.floor(p.z + 0.3 - EPS); z++)
      for (let y = Math.floor(p.y + EPS); y <= Math.floor(p.y + 1.8 - EPS); y++) {
        const id = blockAt(x, y, z);
        if (solid(id) || HAZARDS.has(id)) return false;
      }
  return true;
}
const supported = (p, blockAt) => {
  for (let x = Math.floor(p.x - 0.3 + EPS); x <= Math.floor(p.x + 0.3 - EPS); x++)
    for (let z = Math.floor(p.z - 0.3 + EPS); z <= Math.floor(p.z + 0.3 - EPS); z++) {
      const id = blockAt(x, Math.round(p.y) - 1, z);
      if (solid(id) && !HAZARDS.has(id)) return true;
    }
  return false;
};
export function drySweep(from, to, blockAt) {
  const rise = to.y - from.y;
  if (rise > 1.05 || rise < -1.05) return false;
  const height = Math.max(from.y, to.y);
  // For an upward step, the controller jumps before moving horizontally.
  if (!bodyClear({ ...from, y: height }, blockAt)) return false;
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.12));
  for (let i = 1; i <= steps; i++) {
    const p = {
      x: from.x + ((to.x - from.x) * i) / steps,
      y: height,
      z: from.z + ((to.z - from.z) * i) / steps,
    };
    if (!bodyClear(p, blockAt)) return false;
    if (Math.abs(rise) < 0.1 && !supported(p, blockAt)) return false;
  }
  return supported(to, blockAt) && bodyClear(to, blockAt);
}

export function huntingPath(player, target, blockAt, options = {}) {
  const radius = options.radius ?? 14,
    minimumY = options.minimumY ?? Math.round(player.y) - 3,
    maximumY = options.maximumY ?? Math.round(player.y) + 3;
  const start = {
    x: Math.floor(player.x) + 0.5,
    y: Math.round(player.y),
    z: Math.floor(player.z) + 0.5,
  };
  const startKey = key(start),
    queue = [start],
    previous = new Map([[startKey, null]]),
    nodes = new Map([[startKey, start]]);
  const inMelee = (p) =>
    Math.hypot(p.x - target.x, p.y + 1.62 - target.y - 1, p.z - target.z) <= 2.65 &&
    clearSight({ ...p, y: p.y + 1.62 }, { ...target, y: target.y + 1 }, blockAt);
  const score =
    options.score ??
    ((p) => Math.hypot(p.x - target.x, p.z - target.z) + Math.abs(p.y - target.y) * 0.5);
  const goal = options.goal ?? inMelee;
  let best = start,
    reached = false;
  for (let index = 0; index < queue.length; index++) {
    const p = queue[index];
    if (score(p) < score(best)) best = p;
    if (goal(p) && (!options.skipStartGoal || index > 0)) {
      best = p;
      reached = true;
      break;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = p.x + dx,
        z = p.z + dz;
      if (Math.abs(x - start.x) > radius || Math.abs(z - start.z) > radius) continue;
      for (const y of [p.y, p.y + 1, p.y - 1]) {
        if (y < minimumY || y > maximumY) continue;
        const n = { x, y, z },
          id = key(n);
        if (previous.has(id) || !supported(n, blockAt) || !bodyClear(n, blockAt)) continue;
        const from = index === 0 ? { ...player } : p;
        if (!drySweep(from, n, blockAt)) {
          // Off-center feet can touch a house corner. First center in the
          // current cell, then follow a valid cardinal route around it.
          if (index !== 0 || !drySweep(from, start, blockAt) || !drySweep(start, n, blockAt))
            continue;
        }
        previous.set(id, key(p));
        nodes.set(id, n);
        queue.push(n);
      }
    }
  }
  const path = [];
  for (let p = best; key(p) !== startKey; p = nodes.get(previous.get(key(p)))) path.push(p);
  path.reverse();
  if (path.length && !drySweep(player, path[0], blockAt) && drySweep(player, start, blockAt))
    path.unshift(start);
  return { path, reached, visited: previous.size };
}

export function huntingCoverPath(player, enemies, blockAt, options = {}) {
  if (!enemies.length) return { path: [], reached: true, visited: 0 };
  const visible = (p, enemy) =>
    clearSight({ ...enemy.position, y: enemy.position.y + 1.2 }, { ...p, y: p.y + 1 }, blockAt);
  return huntingPath(player, enemies[0].position, blockAt, {
    ...options,
    goal: (p) =>
      enemies.every(
        (enemy) =>
          Math.hypot(p.x - enemy.position.x, p.y - enemy.position.y, p.z - enemy.position.z) > 15 ||
          !visible(p, enemy),
      ),
    score: (p) =>
      -Math.min(
        ...enemies.map((enemy) => Math.hypot(p.x - enemy.position.x, p.z - enemy.position.z)),
      ),
  });
}

/** A/D are perpendicular to the current aim; keep the complete movement
 * corridor dry and supported before issuing either ordinary key input. */
export function perpendicularStrafe(player, target, blockAt, preferred = 1, length = 1.8) {
  const dx = target.x - player.x,
    dz = target.z - player.z,
    range = Math.hypot(dx, dz);
  if (range < 0.01) return null;
  for (const side of [preferred, -preferred]) {
    const to = {
      x: player.x - (dz / range) * length * side,
      y: player.y,
      z: player.z + (dx / range) * length * side,
    };
    if (drySweep(player, to, blockAt)) return { key: side === 1 ? "KeyD" : "KeyA", side, to };
  }
  return null;
}
