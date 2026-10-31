/** Replace the genuinely lost village bed, then resupply with native fishing. */
import { restInVillage } from "../lib/village-rest.mjs";
export async function run(ctx) {
  const { page, d, a, meta, flush } = ctx;
  a.setGuard(async () => false);
  d.setThreatHandler(null);
  await restInVillage(page, d, a, meta.village, meta, flush);
  const fishing = await import("./phase-4.92.mjs");
  await fishing.run(ctx);
}
