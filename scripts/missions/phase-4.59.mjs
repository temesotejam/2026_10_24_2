/** Finish only the real ammunition shortfall required by the End preflight. */
import assert from "node:assert/strict";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { prepareArchery } from "../lib/modern-archery.mjs";
import { stashVillage } from "../lib/modern-storage.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  const events = (meta.huntingEvents ??= []);
  const h = createModernHunting(page, d, a, {
    arrowReserve: 12,
    onEvent: async (e) => {
      events.push(e);
      flush();
      if (e.name === "mob-defeated")
        console.log(
          "End ammo hunt",
          e.species,
          "arrows",
          await d.count("arrow"),
          "feathers",
          await d.count("feather"),
        );
    },
  });
  h.activate();
  if ((await d.info()).inventory.filter((s) => s === null).length < 3)
    await stashVillage(page, d, a, meta.village, [
      "sapling",
      "seeds",
      "bone",
      "dirt",
      "stoneBrick",
      "rawMeat",
    ]);
  d.setGoal("エンドのクリスタル6個と撃ち直しに備え、足りない矢の材料だけを集めます。");
  if ((await d.count("arrow")) < 12)
    meta.finalAmmoHunt = await h.collectAmmo(12, {
      timeoutMs: 900000,
      patrol: false,
      avoidWaterTargets: true,
      collectSpecies: ["chicken", "skeleton"],
      arrowReserve: Infinity,
    });
  if ((await d.info()).inventory.filter((s) => s === null).length < 2)
    await stashVillage(page, d, a, meta.village, [
      "sapling",
      "seeds",
      "bone",
      "dirt",
      "stoneBrick",
      "rawMeat",
      "wool",
    ]);
  await a.surfaceTo({ x: meta.village.x - 6, z: meta.village.z + 1 });
  await prepareArchery(page, d, a, 12);
  assert.ok((await d.count("arrow")) >= 12, "carry actual crystal-shot and retry arrows");
  await chapter(`実際に集めた羽根と火打ち石でエンド用の矢${await d.count("arrow")}本を確保`, 7);
}
