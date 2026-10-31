/** Fish from the dry village well rim rather than the damaged crop field. */
import assert from "node:assert/strict";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { hostile } from "../lib/combat-policy.mjs";

export async function run(context) {
  const { page, d, a, meta, flush } = context;
  const h = createModernHunting(page, d, a, { arrowReserve: 12 });
  if (meta.livingSafe) {
    const guard = async () => {
      const p = (await d.info()).position;
      const threat = (await a.adventure()).creatures.find(
        (mob) =>
          mob.hp > 0 &&
          hostile(mob) &&
          Math.hypot(mob.position.x - p.x, mob.position.y - p.y, mob.position.z - p.z) <
            (mob.species === "skeleton" ? 18 : 9),
      );
      if (threat) throw new Error(`Safety checkpoint: ${threat.species} near fishing route`);
      return false;
    };
    a.setGuard(guard);
    d.setThreatHandler(guard);
  } else h.activate();
  if ((await d.info()).position.y < meta.village.y - 0.1) await a.pillarTo(meta.village.y);
  await a.surfaceTo({ x: meta.village.x - 1, z: meta.village.z });
  await d.center();
  // Real explosions can remove the old rim. Rebuild the support under our
  // feet with carried blocks before starting the native fishing cast.
  if ((await d.info()).position.y < meta.village.y - 0.2) await a.pillarTo(meta.village.y);
  assert.ok(
    Math.abs((await d.info()).position.y - meta.village.y) < 0.2,
    "stand on the actual dry well rim",
  );
  meta.fishingSpot = { ...(await d.info()).position };
  meta.foodStrategy = "fishing";
  flush();
  const fishing = await import("./phase-4.9.mjs");
  await fishing.run(context);
}
