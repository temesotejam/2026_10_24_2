import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { stashVillage } from "../lib/modern-storage.mjs";
import { stockVillageFood } from "../lib/modern-resources.mjs";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, meta, flush, chapter, out }) {
  const v = meta.village,
    events = (meta.huntingEvents ??= []);

  const h = createModernHunting(page, d, a, {
    onEvent: async (e) => {
      events.push(e);
      writeFileSync(`${out}/hunting-events.json`, JSON.stringify(events, null, 2));
    },
    ensureWeapon: async () => {
      const table = await d.station("table");
      if (!(await d.count("stick"))) await d.make("sticks");
      await d.make((await d.count("iron")) >= 2 ? "iron_sword" : "stone_sword");
      await d.close();
      await d.equip("iron_pick");
      await d.mine(table);
      await wait(400);
      await d.collect("table", 1);
    },
    maintain: async (state) => {
      if (state.inventory.filter((slot) => slot === null).length < 4)
        await stashVillage(page, d, a, v, [
          "sapling",
          "snow",
          "sand",
          "wood_pick",
          "stone_pick",
          "seeds",
          "apple",
          "rawMeat",
          "wool",
          "bone",
          "powder",
          "dirt",
        ]);
      if ((await d.count("bread")) < 3)
        await stockVillageFood(d, page, a, v, { breadTarget: 18, waitForGrowth: true });
    },
    recover: async (target) => {
      if ((await d.count("bread")) < 3)
        await stockVillageFood(d, page, a, v, { breadTarget: 18, waitForGrowth: true });
      await a.eat();
      await a.recover(target);
    },
  });
  a.setGuard(h.guard);
  await stashVillage(page, d, a, v);
  d.setGoal("夜の敵と戦い、エンダーパール・弓の糸・矢の材料を集めます。");
  meta.hunting = await h.gather(
    { enderPearl: 13, string: 3, ammo: 36 },
    { timeoutMs: 3000000, arrowReserve: Infinity, home: { x: v.x, y: v.y, z: v.z } },
  );
  await a.surfaceTo({ x: v.x - 6, z: v.z + 1 });
  const table = await d.station("table");
  while ((await d.count("stick")) < 12) await d.make("sticks");
  if (!(await d.count("bow"))) await d.make("bow");
  while ((await d.count("arrow")) < 36 && (await d.count("feather")) && (await d.count("flint"))) {
    if (!(await d.count("stick"))) await d.make("sticks");
    await d.make("arrow");
  }
  await d.close();
  await d.equip("iron_pick");
  await d.mine(table);
  await wait(600);
  await d.collect("table", 1);
  assert.ok((await d.count("arrow")) >= 32, "carry actual arrows for Nether and End");
  await stockVillageFood(d, page, a, v, { breadTarget: 24, waitForGrowth: true });
  flush();
  await chapter("戦闘でエンダーパールと糸を集め、弓と矢を製作", 5);
}
