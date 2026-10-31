/** Prioritize remaining genuine pearls; keep arrows for the later End preflight. */
export async function run(ctx) {
  const hunt = await import("./phase-4.mjs");
  await hunt.run(ctx, { enderPearl: 12, string: 0, ammo: 12 });
}
