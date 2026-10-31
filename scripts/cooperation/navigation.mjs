/** Find a short path on known, supported terrain without entering hazards. */
const SAFE_SUPPORT = new Set([1, 2, 3, 4, 9, 10, 11, 21, 24, 27, 44]);
const key = (x, y, z) => `${x},${y},${z}`;

/** Unknown cells are impassable. A step may rise or descend at most one block. */
export function safePath({ position, target, blocks, radius = 1.7 }) {
  const at = (x, y, z) => blocks[key(x, y, z)] ?? null;
  const valid = (x, y, z) =>
    SAFE_SUPPORT.has(at(x, y - 1, z)) && at(x, y, z) === 0 && at(x, y + 1, z) === 0;
  const start = { x: Math.floor(position.x), y: Math.round(position.y), z: Math.floor(position.z) };
  if (!valid(start.x, start.y, start.z)) return null;
  const queue = [start],
    visited = new Set([key(start.x, start.y, start.z)]),
    parents = new Map();
  let end = null;
  for (let i = 0; i < queue.length && i < 1500; i++) {
    const current = queue[i];
    if (
      Math.hypot(current.x + 0.5 - target.x, current.y - target.y, current.z + 0.5 - target.z) <
      radius
    ) {
      end = current;
      break;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      for (const dy of [0, -1, 1]) {
        const next = { x: current.x + dx, y: current.y + dy, z: current.z + dz };
        if (Math.abs(next.y - start.y) > 3 || !valid(next.x, next.y, next.z)) continue;
        if (dy === 1 && at(current.x, current.y + 2, current.z) !== 0) continue;
        if (dy === -1 && at(next.x, current.y + 1, next.z) !== 0) continue;
        const id = key(next.x, next.y, next.z);
        if (visited.has(id)) continue;
        visited.add(id);
        parents.set(id, current);
        queue.push(next);
      }
    }
  }
  if (!end) return null;
  const path = [end];
  while (key(path[0].x, path[0].y, path[0].z) !== key(start.x, start.y, start.z)) {
    const previous = parents.get(key(path[0].x, path[0].y, path[0].z));
    if (!previous) return null;
    path.unshift(previous);
  }
  return path;
}
