/** Place the carried stations as a real Nether outpost to make room for loot. */
import assert from "node:assert/strict";
export async function run(ctx) {
  const { d, a, meta, flush } = ctx;
  assert.equal((await a.adventure()).dimension, "nether");
  a.setGuard(async () => false);
  d.setGoal("持参した作業台とかまどを置き、ロッドを拾うための所持品の空きを作ります。");
  meta.netherStations ??= [];
  for (const id of ["table", "furnace"])
    if (await d.count(id)) {
      const p = await d.station(id);
      await d.close();
      meta.netherStations.push({ id, position: p });
      flush();
    }
  const state = await d.info();
  assert.ok(
    state.inventory.some((s) => s === null) || (await d.count("blazeRod")) > 0,
    "room for earned rods or the rod stack already collected",
  );
  const expedition = await import("./phase-6.mjs");
  await expedition.run(ctx);
}
