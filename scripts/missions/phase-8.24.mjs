/** Catch a small renewable food reserve without damaging the field. */
export async function run(ctx) {
  const { meta, flush } = ctx;
  meta.livingSafe = true;
  meta.livingFishTarget = 2;
  const before = meta.fishingFood?.caught ?? 0;
  flush();
  const fishing = await import("./phase-4.92.mjs");
  await fishing.run(ctx);
  meta.livingFishing = {
    caught: meta.fishingFood.caught - before,
    remaining: meta.fishingFood.fish,
    health: meta.fishingFood.lastHealth,
  };
  flush();
  console.log("Living fishing", JSON.stringify(meta.livingFishing));
}
