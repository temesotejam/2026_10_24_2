/** Refresh End supplies from the real camp cache after the pearl hunt.
 * Every transfer, smelt, craft and harvest uses the ordinary game UI. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { stashVillage } from "../lib/modern-storage.mjs";
import { smeltIron, stockVillageFood, carriedFoodUnits } from "../lib/modern-resources.mjs";

export async function run({ page, d, a, meta, chapter, flush = () => undefined }) {
  assert.equal((await a.adventure()).dimension, "overworld", "refresh supplies before entering End");
  const village = meta.village;
  assert.ok(village?.cacheChest, "know the actual replacement camp cache");
  assert.ok((await d.count("enderPearl")) + (await d.count("enderEye")) >= 12,
    "finish the real pearl hunt before this supply refresh");
  const h = createModernHunting(page, d, a, { arrowReserve: 24 });
  h.activate();
  await a.eat();
  const bestSword = async () => (await d.info()).inventory
    .filter((slot) => slot?.id === "iron_sword")
    .sort((left, right) => (right.durability ?? 0) - (left.durability ?? 0))[0];
  const makeRoom = async () => {
    if ((await d.info()).inventory.filter((slot) => slot === null).length < 5)
      await stashVillage(page, d, a, village,
        ["sapling", "snow", "sand", "wool", "bone", "powder", "wood_pick"]);
    assert.ok((await d.info()).inventory.filter((slot) => slot === null).length >= 3,
      "space for cached ore, smelted iron and the spare sword");
  };
  if (((await bestSword())?.durability ?? 0) < 250) {
    d.setGoal("村に保管した鉄鉱石を取り出し、エンド用の新品の剣を作ります。");
    await makeRoom();
    const chest = village.cacheChest;
    await a.surfaceTo({ x: chest.x - 1, z: chest.z });
    assert.equal(await d.block(chest), 14, "use the existing camp cache, not the destroyed house chest");
    await a.useAt(chest);
    await page.waitForSelector('[data-area="chest"]');
    const slots = await page.$$eval('[data-area="chest"]', (els) => els.map((el, index) => ({
      index, name: el.querySelector("img")?.alt,
      count: el.querySelector("img") ? Number(el.querySelector(".item-count")?.textContent) || 1 : 0,
    })));
    console.log("Actual cached iron ore", slots.filter((slot) => slot.name === "鉄鉱石"));
    for (const slot of slots.filter((slot) => slot.name === "鉄鉱石")) {
      const inventory = (await d.info()).inventory;
      let target = inventory.findIndex((item) => item?.id === "ironOre" && item.count + slot.count <= 64);
      if (target < 0) target = inventory.findIndex((item) => item === null);
      assert.ok(target >= 0, "room for genuinely stored iron ore");
      await page.locator(`[data-area="chest"][data-slot="${slot.index}"]`).click();
      await page.locator(`[data-area="inventory"][data-slot="${target}"]`).click();
    }
    await d.close();
    assert.ok((await d.count("ironOre")) + (await d.count("iron")) >= 2,
      "recover actual ore or resume with its already smelted iron");
    if (await d.count("ironOre")) {
      assert.equal((await d.info()).inventory.filter((slot) => slot?.id === "ironOre").length, 1,
        "existing smeltIron processes one merged ore stack");
      assert.ok((await d.count("coal")) || (await d.count("planks")), "carry real smelting fuel");
      await smeltIron(d, page);
    }
    assert.ok((await d.count("iron")) >= 2, "two real ingots for the replacement sword");
    const table = await d.station("table");
    if (!(await d.count("stick"))) {
      while ((await d.count("planks")) < 2) {
        if (await d.count("log")) await d.make("planks");
        else {
          assert.ok(await d.count("birchLog"), "own wood for the sword handle");
          await d.make("birch_planks");
        }
      }
      await d.make("sticks");
    }
    await d.make("iron_sword");
    // Use only carried flint/feathers; this refresh does not start another hunt.
    while ((await d.count("arrow")) < 32 && (await d.count("feather")) && (await d.count("flint"))) {
      if (!(await d.count("stick"))) {
        if ((await d.count("planks")) < 2) break;
        await d.make("sticks");
      }
      await d.make("arrow");
    }
    await d.close();
    await d.equip("iron_pick"); // Driver falls back to the carried diamond/stone pick.
    await d.mine(table);
    await wait(700);
    await d.collect("table", 1);
    assert.ok(((await bestSword())?.durability ?? 0) >= 250, "carry a genuinely new iron sword");
    meta.endSwordRefreshed = true;
    flush();
  }
  if ((await carriedFoodUnits(d)) < 40)
    await stockVillageFood(d, page, a, village,
      { breadTarget: 9, waitForGrowth: true, timeoutMs: 600000 });
  assert.ok((await carriedFoodUnits(d)) >= 40, "carry actual End food reserves");
  await a.eat();
  await a.recover(20);
  const sword = await bestSword();
  assert.ok((sword?.durability ?? 0) >= 250, "preserve the fresh End sword through preparation");
  meta.endSupplyRefresh = {
    swordDurability: sword.durability,
    arrows: await d.count("arrow"), foodUnits: await carriedFoodUnits(d),
    iron: await d.count("iron"), cacheChest: { ...village.cacheChest },
  };
  flush();
  console.log("Real End supply refresh", meta.endSupplyRefresh);
  await chapter("保管した鉄を精錬して新品の剣を作り、エンドの食料を準備", 7);
}
