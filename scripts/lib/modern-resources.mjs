/** Generation-3 progression helpers. Every change uses normal input/UI;
 * world and inventory inspection is read-only. No fixtures or state setters. */
import assert from "node:assert/strict";
import { wait } from "./survival-driver.mjs";

export async function gatherOre(d, blockId, itemId, targetCount, { maxAttempts = 40 } = {}) {
  for (let attempt = 0; (await d.count(itemId)) < targetCount && attempt < maxAttempts; attempt++) {
    await d.checkThreat();
    assert.ok((await d.info()).health > 0, `survive gathering ${itemId}`);
    const target = await d.findOre(blockId);
    if (!target) {
      const p = (await d.info()).position;
      await d.tunnelTo({ x: Math.floor(p.x) + 5, z: Math.floor(p.z) + (attempt % 2 ? 3 : -3) });
      continue;
    }
    const p = (await d.info()).position;
    await d.tunnelTo({ x: target.x + (target.x > p.x ? -1 : 1), z: target.z });
    if ((await d.block(target)) !== 0) await d.mine(target);
    await wait(900);
  }
  await d.collect(itemId, targetCount);
}

async function moveInventoryStack(page, d, id, area, slot) {
  const index = (await d.info()).inventory.findIndex((s) => s?.id === id);
  assert.ok(index >= 0, `own ${id} before moving it to ${area}`);
  await page.locator(`[data-area="inventory"][data-slot="${index}"]`).click();
  await page.locator(`[data-area="${area}"][data-slot="${slot}"]`).click();
}

export async function smeltIron(d, page) {
  const ore = await d.count("ironOre");
  if (!ore) return;
  const before = await d.count("iron");
  const furnace = await d.station("furnace");
  await moveInventoryStack(page, d, "ironOre", "furnace", 0);
  await moveInventoryStack(page, d, (await d.count("coal")) ? "coal" : "planks", "furnace", 1);
  const until = Date.now() + ore * 8000 + 45000;
  while (true) {
    const finished = await page.$eval('[data-area="furnace"][data-slot="2"]', (el) =>
      el.querySelector("img") ? Number(el.querySelector(".item-count")?.textContent) || 1 : 0,
    );
    if (finished >= ore) break;
    assert.ok(Date.now() < until, "smelt real iron ore with consumed fuel");
    await d.checkThreat();
    await wait(300);
  }
  await page.locator('[data-area="furnace"][data-slot="2"]').click();
  const inventory = (await d.info()).inventory;
  const destination = inventory.findIndex((s) => s?.id === "iron" && s.count + ore <= 64);
  const free = destination >= 0 ? destination : inventory.findIndex((s) => s === null);
  assert.ok(free >= 0, "room for actual smelted ingots");
  await page.locator(`[data-area="inventory"][data-slot="${free}"]`).click();
  await d.close();
  await d.equip((await d.count("stone_pick")) ? "stone_pick" : "iron_pick");
  await d.mine(furnace);
  await wait(700);
  await d.collect("iron", before + ore);
  await d.collect("furnace", 1);
}

/** Starting after the first natural diamond at y11, gather the remaining
 * diamonds and iron, then craft real tools at a placed crafting table.
 * ironTarget is the total uncommitted ingots + ore to gather (default9).
 * A sword(2), bucket(3), flintSteel(1) need6;9 leaves a spare pick reserve. */
export async function prepareUnderground(
  d,
  page,
  a,
  { diamondTarget = 3, ironTarget = 9, coalTarget = 3 } = {},
) {
  void a;
  d.setGoal("ダイヤのツルハシとゲートの準備のため、自然の鉱石を採掘します。");
  await d.equip("iron_pick");
  if (!(await d.count("diamond_pick"))) await gatherOre(d, 20, "diamond", diamondTarget);
  await gatherOre(d, 17, "coal", coalTarget);
  await gatherOre(d, 18, "ironOre", Math.max(0, ironTarget - (await d.count("iron"))));
  d.setGoal("採掘した鉄を、燃料を使って精錬します。");
  await smeltIron(d, page);
  const table = await d.station("table");
  const neededSticks =
    ((await d.count("diamond_pick")) ? 0 : 2) + ((await d.count("iron_sword")) ? 0 : 1);
  while ((await d.count("stick")) < neededSticks) {
    assert.ok((await d.count("planks")) >= 2, "own gathered wood for tool handles");
    await d.make("sticks");
  }
  if (!(await d.count("diamond_pick"))) await d.make("diamond_pick");
  if (!(await d.count("iron_sword"))) await d.make("iron_sword");
  if (!(await d.count("bucket")) && !(await d.count("waterBucket"))) await d.make("bucket");
  if (!(await d.count("flintSteel")) && (await d.count("flint"))) await d.make("flintSteel");
  await d.close();
  await d.equip("iron_pick");
  await d.mine(table);
  await wait(600);
  await d.collect("table", 1);
  assert.ok(await d.count("diamond_pick"), "actually craft the diamond pickaxe");
  assert.ok(await d.count("iron_sword"), "actually craft a sword");
  assert.ok((await d.count("bucket")) || (await d.count("waterBucket")), "actually craft a bucket");
  await d.report("自然のダイヤ3個からツルハシを作り、鉄を精錬して剣とバケツを準備");
  return { inventory: (await d.info()).inventory };
}

export async function gatherFlint(
  d,
  page,
  a,
  { targetCount = 1, maxAttempts = 160, radius = 32 } = {},
) {
  d.setGoal("自然の砂利を掘り、火打ち石と矢の材料を集めます。");
  if (
    !(await d.count("stone_shovel")) &&
    (await d.count("table")) &&
    (await d.count("cobble")) &&
    (await d.count("stick")) >= 2
  ) {
    const table = await d.station("table");
    await d.make("stone_shovel");
    await d.close();
    await d.equip("iron_pick");
    await d.mine(table);
    await wait(500);
    await d.collect("table", 1);
  }

  const skipped = [];
  for (
    let attempt = 0;
    (await d.count("flint")) < targetCount && attempt < maxAttempts;
    attempt++
  ) {
    await d.checkThreat();
    const gravel = await page.evaluate(
      ({ radius, skipped }) => {
        const mc = window.__mc,
          p = mc.position(),
          candidates = [];
        for (let x = Math.floor(p.x) - radius; x <= Math.floor(p.x) + radius; x++)
          for (let z = Math.floor(p.z) - radius; z <= Math.floor(p.z) + radius; z++)
            for (let y = 70; y >= 8; y--)
              if (
                mc.blockAt(x, y, z) === 44 &&
                mc.blockAt(x, y + 1, z) === 0 &&
                mc.blockAt(x, y + 2, z) === 0 &&
                !skipped.includes(`${x},${y},${z}`)
              ) {
                candidates.push({
                  x,
                  y,
                  z,
                  d: Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) + Math.abs(y + 1 - p.y) * 2,
                });
                break;
              }
        return candidates.sort((a, b) => a.d - b.d)[0];
      },
      { radius, skipped },
    );
    assert.ok(gravel, "discover more exposed natural gravel");
    await a.surfaceTo(gravel);
    await wait(350);
    const p = await d.info();
    if (
      Math.hypot(
        gravel.x + 0.5 - p.position.x,
        gravel.y + 0.5 - p.position.y - p.eye,
        gravel.z + 0.5 - p.position.z,
      ) > 4.25
    ) {
      skipped.push(`${gravel.x},${gravel.y},${gravel.z}`);
      continue;
    }
    if (await d.count("stone_shovel")) await d.equip("stone_shovel");
    else if (await d.count("stick")) await d.equip("stick");
    else if (await d.count("gravel")) await d.equip("gravel");
    await d.mine(gravel);
    await wait(650);
  }
  await d.collect("flint", targetCount);
  await d.report(`天然の砂利から火打石${targetCount}個を採取`);
}

export async function craftFlintSteel(d) {
  if (await d.count("flintSteel")) return;
  assert.ok(
    (await d.count("flint")) >= 1 && (await d.count("iron")) >= 1,
    "own real flint and smelted iron",
  );
  await d.open();
  await d.make("flintSteel");
  await d.close();
  await d.collect("flintSteel", 1);
}

/** The field has56 crops;24bread can require another180s growth cycle.
 * waitForGrowth:false harvests/crafts the currently available crop and returns
 * complete:false, letting the caller gather flint/wood before revisiting. */
export async function stockVillageFood(
  d,
  page,
  a,
  village,
  { breadTarget = 24, waitForGrowth = true, timeoutMs = 420000 } = {},
) {
  const until = Date.now() + timeoutMs;
  while ((await d.count("bread")) < breadTarget) {
    assert.ok(Date.now() < until, "grow enough real wheat for expedition food");
    await a.eat();
    const neededWheat = 3 * Math.max(0, breadTarget - (await d.count("bread")));
    if ((await d.count("wheat")) < neededWheat) {
      d.setGoal("村の畑を収穫して植え直し、遠征の食料を準備します。");
      await a.surfaceTo({ x: village.x, z: village.z - 3 });
      await a.harvest(village, neededWheat, true);
    }
    if ((await d.count("wheat")) >= 3) {
      await a.surfaceTo({ x: village.x - 6, z: village.z + 1 });
      await d.walk(village.x - 5.5, village.z + 2.7, false, 0.3, 80);
      await d.walk(village.x - 4.5, village.z + 3.5, false, 0.3, 80);
      await d.equip((await d.count("iron_sword")) ? "iron_sword" : "iron_pick");
      await a.useAt({ x: village.x - 5, y: village.y, z: village.z + 5 });
      await page.waitForSelector('[data-recipe="bread"]');
      while ((await d.count("bread")) < breadTarget && (await d.count("wheat")) >= 3)
        await d.make("bread");
      await d.close();
    }
    if (!waitForGrowth || (await d.count("bread")) >= breadTarget) break;
    d.setGoal("小麦の生長を待ちながら、周囲の安全を確かめます。");
    await a.waitSafe(5000);
  }
  const bread = await d.count("bread");
  return { bread, target: breadTarget, complete: bread >= breadTarget };
}
