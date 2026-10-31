/** During daylight, include shallow-water wanderers whose drops are at the surface. */
export async function run(ctx) {
  const hunt = await import("./phase-4.mjs");
  await hunt.run(
    ctx,
    { enderPearl: Math.max(0, 11 - (await ctx.d.count("enderEye"))), string: 0, ammo: 12 },
    { allowShallowWaterWanderers: true },
  );
}
