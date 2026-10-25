/** Original browser-bot policy; architecture references are in docs/BOT-REFERENCES.md. */
const passable = new Set([0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43]);
export const solid = (id) => !passable.has(id);
export function hostile(m) {
  return (
    ["zombie", "skeleton", "mossling", "spider", "ember"].includes(m.species) ||
    (m.species === "wanderer" && m.fuse === 2)
  );
}
export function clearSight(from, to, blockAt) {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    dz = to.z - from.z,
    length = Math.hypot(dx, dy, dz);
  for (let t = 0.2; t < length - 0.3; t += 0.25)
    if (
      solid(
        blockAt(
          Math.floor(from.x + (dx * t) / length),
          Math.floor(from.y + (dy * t) / length),
          Math.floor(from.z + (dz * t) / length),
        ),
      )
    )
      return false;
  return true;
}
export function chooseThreat(player, mobs, blockAt) {
  const eye = { ...player, y: player.y + 1.4 };
  return (
    mobs
      .filter((m) => hostile(m) && m.hp > 0)
      .map((m) => {
        const distance = Math.hypot(
          player.x - m.position.x,
          player.y - m.position.y,
          player.z - m.position.z,
        );
        const visible = clearSight(eye, { ...m.position, y: m.position.y + 1 }, blockAt);
        const range = m.species === "skeleton" ? 14 : 5;
        const priority =
          (m.species === "mossling" && distance < 4
            ? 1000
            : distance < 2.5
              ? 800
              : m.species === "skeleton"
                ? 600
                : 300) -
          distance * 20;
        return { ...m, distance, visible, range, priority };
      })
      .filter((m) => m.distance <= m.range && m.visible)
      .sort((a, b) => b.priority - a.priority)[0] ?? null
  );
}
export function safeRetreat(player, target, blockAt) {
  const y = Math.floor(player.y),
    options = [];
  for (let i = 0; i < 8; i++) {
    const dx = Math.cos((i * Math.PI) / 4),
      dz = Math.sin((i * Math.PI) / 4);
    let safe = true;
    for (let d = 0.5; d <= 2.5; d += 0.5) {
      const x = Math.floor(player.x + dx * d),
        z = Math.floor(player.z + dz * d);
      if (
        !solid(blockAt(x, y - 1, z)) ||
        solid(blockAt(x, y, z)) ||
        solid(blockAt(x, y + 1, z)) ||
        [5, 26, 43].includes(blockAt(x, y, z))
      )
        safe = false;
    }
    const p = { x: player.x + dx * 2.5, y: player.y, z: player.z + dz * 2.5 };
    const distance = Math.hypot(p.x - target.x, p.z - target.z);
    if (safe) options.push({ ...p, distance });
  }
  return options.sort((a, b) => b.distance - a.distance)[0] ?? null;
}
