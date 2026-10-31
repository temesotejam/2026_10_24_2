/** Put valuables in the already discovered village chest using its normal UI. */
import assert from "node:assert/strict";
import { hostile } from "../lib/combat-policy.mjs";
import { stashVillage } from "../lib/modern-storage.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  const guard = async () => {
    const p = (await d.info()).position;
    const t = (await a.adventure()).creatures.find(
      (m) =>
        m.hp > 0 &&
        hostile(m) &&
        Math.hypot(m.position.x - p.x, m.position.y - p.y, m.position.z - p.z) <
          (m.species === "skeleton" ? 18 : 9),
    );
    if (t) throw Error(`Safety checkpoint: ${t.species} near storage`);
    return false;
  };
  a.setGuard(guard);
  d.setThreatHandler(guard);
  const before = (await d.info()).inventory.filter((s) => s === null).length;
  const egg = await d.count("dragonEgg");
  assert.equal(egg, 1, "begin with the actually earned egg");
  d.setGoal("大切な卵と使わない荷物を、村の既存チェストに預けます。");
  await stashVillage(page, d, a, meta.village, [
    "dragonEgg",
    "blazeRod",
    "blazePowder",
    "bone",
    "sand",
  ]);
  assert.equal(await d.count("dragonEgg"), 0, "store the actual egg in the chest");
  const after = (await d.info()).inventory.filter((s) => s === null).length;
  assert.ok(after > before, "make real space for renewable supplies");
  meta.livingStorage = {
    chest: meta.village.cacheChest ?? {
      x: meta.village.x - 7,
      y: meta.village.y,
      z: meta.village.z + 5,
    },
    freeBefore: before,
    freeAfter: after,
    health: (await d.info()).health,
  };
  flush();
  console.log("Living safe storage", JSON.stringify(meta.livingStorage));
  await chapter("既存の村のチェストへ卵と使わない荷物を預ける", 9);
}
