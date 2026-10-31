const hostile = (mob) =>
  ["zombie", "skeleton", "mossling", "spider", "ember"].includes(mob.species) ||
  (mob.species === "wanderer" && mob.fuse === 2);

/** Check actual observations before each autonomous decision. */
export function safetyStop(observation) {
  if (observation.vitals.health <= 0) return { type: "dead" };
  const p = observation.position;
  const threat = observation.creatures
    .filter((mob) => mob.hp > 0 && hostile(mob))
    .map((mob) => ({
      mob,
      distance: Math.hypot(mob.position.x - p.x, mob.position.y - p.y, mob.position.z - p.z),
    }))
    .filter(({ mob, distance }) => distance < (mob.species === "skeleton" ? 18 : 10))
    .sort((a, b) => a.distance - b.distance)[0];
  if (threat) return { type: "threat", ...threat };
  if (observation.night || observation.time % 1200 >= 620) return { type: "bedtime" };
  return null;
}
