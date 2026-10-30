/** Fish from the dry village well rim rather than the damaged crop field. */
import assert from "node:assert/strict";
import { createModernHunting } from "../lib/modern-hunting.mjs";

export async function run(context) {
  const { page, d, a, meta, flush } = context;
  const h = createModernHunting(page, d, a, { arrowReserve: 12 });
  h.activate();
  if ((await d.info()).position.y < meta.village.y - 0.1) await a.pillarTo(meta.village.y);
  await a.surfaceTo({ x: meta.village.x - 1, z: meta.village.z });
  await d.center();
  assert.ok(
    Math.abs((await d.info()).position.y - meta.village.y) < 0.2,
    "stand on the actual dry well rim",
  );
  meta.foodStrategy = "fishing";
  flush();
  const fishing = await import("./phase-4.9.mjs");
  await fishing.run(context);
}
