/** Aim at the observed body rather than a human-height point above small mobs.
 * This only chooses where normal mouse input points; it changes no game state. */
export function mobAimHeight(mob) {
  const center = {
    pig: 0.7,
    cow: 0.9,
    sheep: 0.85,
    chicken: 0.6,
    spider: 0.4,
    zombie: 1.05,
    skeleton: 1.05,
    mossling: 1.1,
    villager: 1.3,
    wanderer: 1.35,
    ember: 1.2,
  };
  return (center[mob.species] ?? 1) * (mob.age < 0 ? 0.6 : 1);
}
