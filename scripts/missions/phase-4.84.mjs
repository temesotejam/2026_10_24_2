import { run as refresh } from "./phase-4.81.mjs";
export async function run(ctx) {
  ctx.a.setGuard(async () => false);
  if ((await ctx.d.info()).position.y < 34.9) await ctx.a.pillarTo(35);
  await refresh({ ...ctx, foodTargetUnits: 0 });
}
