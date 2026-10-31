/** Return to the known village bed after the second wood harvest. */
import assert from "node:assert/strict";
import { hostile } from "../lib/combat-policy.mjs";

export async function run({ page, d, a, meta, flush, chapter }) {
  assert.ok(meta.livingWood?.replanted, "finish replanting before leaving");
  const guard = async () => {
    const p = (await d.info()).position;
    const threat = (await a.adventure()).creatures.find(
      (m) =>
        m.hp > 0 &&
        hostile(m) &&
        Math.hypot(m.position.x - p.x, m.position.y - p.y, m.position.z - p.z) <
          (m.species === "skeleton" ? 18 : 9),
    );
    if (threat) throw Error(`Safety checkpoint: ${threat.species} near the route`);
    return false;
  };
  a.setGuard(guard);
  d.setThreatHandler(guard);
  const pickBefore = (await d.info()).inventory.find((s) => s?.id === "diamond_pick")?.durability;
  d.setGoal("植え直しを終えたので、暗くなる前に寝床へ戻ります。");
  await a.surfaceTo({ x: 203, z: -72 });
  assert.equal(await d.block({ x: 202, y: 35, z: -72 }), 15, "existing village bed");
  meta.livingReturn = {
    time: await page.evaluate(() => window.__mc.time()),
    health: (await d.info()).health,
    pickBefore,
    pickAfter: (await d.info()).inventory.find((s) => s?.id === "diamond_pick")?.durability,
  };
  flush();
  console.log("Living return to bed", JSON.stringify(meta.livingReturn));
  await chapter("暗くなる前に寝床へ戻る", 9);
}
