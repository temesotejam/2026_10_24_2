import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { stashVillage } from "../lib/modern-storage.mjs";
import { stockVillageFood, carriedFoodUnits } from "../lib/modern-resources.mjs";
import { chooseHuntingCamp } from "../lib/modern-camp.mjs";
import { prepareArchery } from "../lib/modern-archery.mjs";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, meta, flush, chapter, out }) {
  const v = meta.village,
    events = (meta.huntingEvents ??= []);
  const targets = { enderPearl: 12, string: (await d.count("bow")) ? 0 : 3, ammo: 32 };

  const h = createModernHunting(page, d, a, {
    arrowReserve: 0,
    onEvent: async (e) => {
      events.push(e);
      if (e.name === "mob-defeated")
        console.log(
          "Hunt",
          e.species,
          "pearls",
          await d.count("enderPearl"),
          "arrows",
          await d.count("arrow"),
        );
      writeFileSync(`${out}/hunting-events.json`, JSON.stringify(events, null, 2));
      flush();
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
      if (
        !state.inventory.some(
          (slot) => slot?.id === "iron_sword" && (slot.durability ?? 0) >= 80,
        ) &&
        (await d.count("iron")) >= 2
      ) {
        d.setGoal("消耗した剣の代わりに、採掘済みの鉄で新しい剣を作ります。");
        const table = await d.station("table");
        if (!(await d.count("stick"))) await d.make("sticks");
        await d.make("iron_sword");
        await d.close();
        await d.mine(table);
        await wait(500);
        await d.collect("table", 1);
      }
      if (state.inventory.filter((slot) => slot === null).length < 4)
        if ((await d.info()).inventory.filter((s) => s === null).length < 6)
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
      if ((await carriedFoodUnits(d)) < 20)
        await stockVillageFood(d, page, a, v, { breadTarget: 8, waitForGrowth: false });
      // Spend an early daytime interval on real portal construction while
      // waiting for naturally spawning night creatures, using this same input loop.
      if (
        !meta.portal &&
        state.time % 1200 < 240 &&
        !state.creatures.some((m) => m.species === "wanderer" && m.hp > 0) &&
        (await d.count("arrow")) + 4 * (await d.count("feather")) >= 36
      ) {
        const construction = await import("./phase-5.mjs");
        await construction.run({ page, d, a, meta, flush, chapter, out });
        h.activate();
        d.setGoal("夜の敵との戦いに戻り、残りのエンダーパールを集めます。");
      }
      d.setGoal("夜の敵と戦い、エンダーパールと矢の材料を集めます。");
      const dayTime = await page.evaluate(() => window.__mc.time() % 1200);
      if (
        dayTime >= 24 &&
        dayTime < 600 &&
        (await d.count("arrow")) < 24 &&
        !state.creatures.some((m) => m.species === "wanderer" && m.hp > 0) &&
        (await d.count("arrow")) + 4 * (await d.count("feather")) >= 36
      ) {
        d.setGoal("昼の間に砂利から火打ち石を集め、次の戦闘に使う矢を作ります。");
        await prepareArchery(page, d, a, 36);
        h.activate();
      }
      if (
        meta.portal &&
        (await d.count("blazeRod")) < 7 &&
        dayTime >= 24 &&
        dayTime < 600 &&
        !state.creatures.some((m) => m.species === "wanderer" && m.hp > 0) &&
        (await d.count("arrow")) + 4 * (await d.count("feather")) >= 36 &&
        (await d.count("string")) >= 3
      ) {
        await prepareArchery(page, d, a, 36);
        targets.string = 0;
        const expedition = await import("./phase-6.mjs");
        await expedition.run({ page, d, a, meta, flush, chapter, out });
        h.activate();
        d.setGoal("ネザーから戻りました。残りのエンダーパールを集めます。");
      }
    },
    recover: async (target) => {
      if ((await carriedFoodUnits(d)) < 20)
        await stockVillageFood(d, page, a, v, { breadTarget: 8, waitForGrowth: false });
      await a.eat();
      await a.recover(target);
    },
  });
  if (!(await d.count("diamond_pick"))) {
    d.setThreatHandler(null);
    d.setGoal("復活地点から村へ戻り、落とした装備と素材を回収します。");
    await page.keyboard.down("ControlLeft");
    try {
      await a.surfaceTo(meta.lastDeath);
      await a.move(meta.lastDeath.x, meta.lastDeath.z);
    } finally {
      await page.keyboard.up("ControlLeft");
    }
    await wait(1000);
    assert.ok(
      await d.count("diamond_pick"),
      "recover the actual equipment dropped during the night battle",
    );
  }
  h.activate();
  await h.guard();
  await a.eat();
  if (await carriedFoodUnits(d)) await a.recover(18);
  if (
    !v.cacheChest &&
    meta.remoteCacheChest &&
    Math.hypot(meta.remoteCacheChest.x - v.x, meta.remoteCacheChest.z - v.z) < 24 &&
    (await d.block(meta.remoteCacheChest)) === 14
  )
    v.cacheChest = { ...meta.remoteCacheChest };
  const stashPosition = (await d.info()).position;
  if (
    !v.cacheChest ||
    Math.hypot(stashPosition.x - v.cacheChest.x, stashPosition.z - v.cacheChest.z) < 24
  )
    await stashVillage(page, d, a, v, [
      "sapling",
      "snow",
      "sand",
      "wood_pick",
      "stone_pick",
      "seeds",
      "apple",
      "netherrack",
      "bone",
      "rawMeat",
      "stoneBrick",
      "goldOre",
      "ironOre",
    ]);
  flush();
  if (
    v.cacheChest &&
    Math.hypot(
      (meta.huntingCamp?.x ?? 0) - v.cacheChest.x,
      (meta.huntingCamp?.z ?? 0) - v.cacheChest.z,
    ) > 48
  ) {
    meta.huntingCamp = (await chooseHuntingCamp(page, d, a, v.cacheChest, { radius: 32 })) ?? {
      x: v.cacheChest.x,
      y: v.cacheChest.y,
      z: v.cacheChest.z - 4,
    };
    flush();
  }
  if (!meta.huntingCamp) {
    meta.huntingCamp = (await chooseHuntingCamp(page, d, a, v, { radius: 40 })) ?? {
      x: v.x,
      y: v.y,
      z: v.z - 6,
    };
    console.log("Hunting camp", meta.huntingCamp);
    flush();
  }
  d.setGoal("見通しのよい場所へ移り、敵の素材を集めます。");
  const currentPosition = (await d.info()).position;
  if (
    Math.hypot(currentPosition.x - meta.huntingCamp.x, currentPosition.z - meta.huntingCamp.z) > 96
  ) {
    await a.surfaceTo(meta.huntingCamp);
    await a.reachSurface();
  } else if (
    Math.hypot(currentPosition.x - meta.huntingCamp.x, currentPosition.z - meta.huntingCamp.z) < 24
  ) {
    await a.surfaceTo(meta.huntingCamp);
    if ((await d.info()).position.y < meta.huntingCamp.y - 0.2)
      await a.pillarTo(meta.huntingCamp.y);
  }
  d.setGoal("夜の敵と戦い、エンダーパール・弓の糸・矢の材料を集めます。");
  meta.hunting = await h.gather(targets, {
    timeoutMs: 3000000,
    patrol: false,
    collectSpecies: ["wanderer", "skeleton", "chicken", "ember"],
    arrowReserve: 0,
    home: meta.huntingCamp.position ?? meta.huntingCamp,
  });
  await a.surfaceTo({ x: v.x - 6, z: v.z + 1 });
  await prepareArchery(
    page,
    d,
    a,
    Math.min(36, (await d.count("arrow")) + 4 * (await d.count("feather"))),
  );
  if ((await carriedFoodUnits(d)) < 40)
    await stockVillageFood(d, page, a, v, { breadTarget: 9, waitForGrowth: true });
  flush();
  await chapter("戦闘でエンダーパールと糸を集め、弓と矢を製作", 5);
}
