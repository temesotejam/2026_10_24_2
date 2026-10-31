/** The direction check is already complete; gather only the actual missing eyes. */
export async function run(ctx) {
  const hunt = await import("./phase-4.mjs");
  const eyes = await ctx.d.count("enderEye");
  await hunt.run(ctx, { enderPearl: Math.max(0, 11 - eyes), string: 0, ammo: 12 });
}
