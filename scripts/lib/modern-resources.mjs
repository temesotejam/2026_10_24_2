/** Generation-3 progression helpers. Every change uses normal input/UI;
 * world and inventory inspection is read-only. No fixtures or state setters. */
import assert from "node:assert/strict";
import { wait } from "./survival-driver.mjs";

export async function carriedFoodUnits(d) {
  const values = { fish: 2, meat: 8, bread: 5, cookedFish: 6, apple: 4, rawMeat: 2 };
  return (await d.info()).inventory.reduce(
    (total, slot) => total + (slot ? (values[slot.id] ?? 0) * slot.count : 0),
    0,
  );
}

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

/** Cook only carried, genuine meat using normal furnace-slot clicks.
 * Returns the number cooked, even if the guard eats some during the wait.
 * Call from a sheltered, supported site with a pick and a carried furnace. */
export async function cookCarriedMeat(d, page, a, { count = 8 } = {}) {
  assert.ok(Number.isInteger(count) && count > 0 && count <= 64, "valid cooking batch");
  const amount = Math.min(count, await d.count("rawMeat"));
  if (!amount) return { cooked: 0, remainingRaw: 0 };
  const fuelId = (await d.count("coal")) ? "coal" : "planks";
  const fuelCount = Math.ceil((amount * 8) / (fuelId === "coal" ? 80 : 15));
  assert.ok((await d.count(fuelId)) >= fuelCount, "own enough real cooking fuel");
  assert.ok(await d.count("furnace"), "carry the recovered furnace before cooking");
  const inventory = (await d.info()).inventory;
  assert.ok(
    inventory.some((s) => s === null || (s?.id === "meat" && s.count + amount <= 64)) ||
      (await d.count("rawMeat")) === amount ||
      (await d.count(fuelId)) === fuelCount,
    "leave space for both cooked meat and the recovered furnace",
  );
  let pick = null;
  for (const id of ["stone_pick", "iron_pick", "diamond_pick", "wood_pick"])
    if (await d.count(id)) {
      pick = id;
      break;
    }
  assert.ok(pick, "own a pick to recover the furnace");
  d.setGoal("回収した生肉をかまどで焼き、遠征用の食料を補充します。");
  await d.checkThreat();
  const home = (await d.info()).position;
  const furnace = await d.station("furnace");
  const slot = (index) => page.locator(`[data-area="furnace"][data-slot="${index}"]`);
  const readSlot = (index) =>
    page.$eval(`[data-area="furnace"][data-slot="${index}"]`, (el) =>
      el.querySelector("img") ? Number(el.querySelector(".item-count")?.textContent) || 1 : 0,
    );
  const putExact = async (id, index, n) => {
    while (n > 0) {
      const inventory = (await d.info()).inventory;
      const source = inventory.findIndex((s) => s?.id === id);
      assert.ok(source >= 0, `own ${id} for actual furnace input`);
      const moved = Math.min(n, inventory[source].count);
      const button = page.locator(`[data-area="inventory"][data-slot="${source}"]`);
      await button.click();
      for (let i = 0; i < moved; i++) await slot(index).click({ button: "right" });
      // A split transfer keeps the source selected until its stack is empty.
      if (moved < inventory[source].count) await button.click();
      n -= moved;
    }
  };
  const take = async (index, id) => {
    const n = await readSlot(index);
    if (!n) return 0;
    const inventory = (await d.info()).inventory;
    let destination = inventory.findIndex((s) => s?.id === id && s.count + n <= 64);
    if (destination < 0) destination = inventory.findIndex((s) => s === null);
    assert.ok(destination >= 0, `inventory room for cooked food / unused ${id}`);
    await slot(index).click();
    await page.locator(`[data-area="inventory"][data-slot="${destination}"]`).click();
    return n;
  };
  assert.equal(await readSlot(0), 0, "placed furnace has no old input");
  assert.equal(await readSlot(1), 0, "placed furnace has no old fuel");
  assert.equal(await readSlot(2), 0, "placed furnace has no old output");
  await putExact("rawMeat", 0, amount);
  await putExact(fuelId, 1, fuelCount);
  await d.close();
  let cooked = 0;
  const until = Date.now() + amount * 8000 + 120000;
  while (cooked < amount) {
    await d.checkThreat();
    if (a?.eat) await a.eat();
    assert.ok((await d.info()).health > 0, "survive actual meat cooking");
    assert.ok(Date.now() < until, "finish cooking with actual consumed fuel");
    await wait(4000);
    const p = (await d.info()).position;
    if (Math.hypot(p.x - home.x, p.z - home.z) > 1.5 && a?.surfaceTo)
      await a.surfaceTo({ x: Math.floor(home.x), z: Math.floor(home.z) });
    const current = await d.info();
    assert.ok(
      Math.hypot(
        furnace.x + 0.5 - current.position.x,
        furnace.y + 0.5 - current.position.y - current.eye,
        furnace.z + 0.5 - current.position.z,
      ) < 4.4,
      "return within normal furnace interaction reach",
    );
    await d.aim({ x: furnace.x + 0.5, y: furnace.y + 0.5, z: furnace.z + 0.5 });
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
    await page.waitForSelector('[data-area="furnace"][data-slot="2"]');
    cooked += await take(2, "meat");
    if (cooked === amount) {
      await take(0, "rawMeat");
      await take(1, fuelId);
    }
    await d.close();
  }
  await d.equip(pick);
  await d.mine(furnace);
  await wait(700);
  await d.collect("furnace", 1);
  await d.report(`回収した生肉${cooked}個を実際の燃料で焼き、かまどを回収`);
  return { cooked, carriedMeat: await d.count("meat"), remainingRaw: await d.count("rawMeat") };
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

  // Reuse gravel already mined in this survival run, as in ordinary flint
  // farming: every placed block is consumed and each drop uses native RNG.
  if (await d.count("gravel")) d.setGoal("採掘した砂利を置き直して掘り、火打ち石を集めます。");
  for (
    let attempt = 0;
    attempt < maxAttempts && (await d.count("gravel")) && (await d.count("flint")) < targetCount;
    attempt++
  ) {
    await d.checkThreat();
    const site = await page.evaluate(() => {
      const p = window.__mc.position(),
        y = Math.round(p.y);
      const solid = (id) => ![0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43].includes(id);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const x = Math.floor(p.x) + dx,
          z = Math.floor(p.z) + dz;
        const support = window.__mc.blockAt(x, y - 1, z);
        if (
          solid(support) &&
          ![12, 13, 14, 15, 28, 34, 35, 38, 39].includes(support) &&
          window.__mc.blockAt(x, y, z) === 0 &&
          window.__mc.blockAt(x, y + 1, z) === 0
        )
          return { x, y, z };
      }
      return null;
    });
    if (!site) break;
    await d.equip("gravel");
    await d.aim({ x: site.x + 0.5, y: site.y - 0.01, z: site.z + 0.5 });
    await a.right();
    if ((await d.block(site)) !== 44) break;
    if (await d.count("stone_shovel")) await d.equip("stone_shovel");
    else if (await d.count("stick")) await d.equip("stick");
    await d.mine(site);
    await wait(450);
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
                // Surface navigation cannot descend into a buried cave merely
                // because a gravel block has two air cells above it.
                let openSky = true;
                for (let above = y + 3; above < 96; above++) {
                  const block = mc.blockAt(x, above, z);
                  if (![0, 5, 16, 22, 23, 25, 31, 33, 40, 43].includes(block)) {
                    openSky = false;
                    break;
                  }
                }
                if (!openSky) continue;
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
    const beforeApproach = await d.info();
    const alreadyReachable =
      Math.hypot(
        gravel.x + 0.5 - beforeApproach.position.x,
        gravel.y + 0.5 - beforeApproach.position.y - beforeApproach.eye,
        gravel.z + 0.5 - beforeApproach.position.z,
      ) <= 4.25;
    if (!alreadyReachable) await a.surfaceTo(gravel);
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
      let portableTable;
      if (!(await d.count("table")) && (await d.count("planks")) >= 4) {
        await d.open();
        await d.make("table");
        await d.close();
      }
      if (await d.count("table")) {
        await a.surfaceTo({ x: village.x - 8, z: village.z - 1 });
        if ((await d.info()).position.y < village.y - 0.1) await a.pillarTo(village.y);
        portableTable = await d.station("table");
      } else {
        await a.surfaceTo({ x: village.x - 6, z: village.z + 1 });
        await d.walk(village.x - 5.5, village.z + 2.7, true, 0.3, 80);
        await d.walk(village.x - 4.5, village.z + 3.5, true, 0.3, 80);
        await a.useAt({ x: village.x - 5, y: village.y, z: village.z + 5 });
      }
      await page.waitForSelector('[data-recipe="bread"]');
      while ((await d.count("bread")) < breadTarget && (await d.count("wheat")) >= 3)
        await d.make("bread");
      await d.close();
      if (portableTable) {
        await d.mine(portableTable);
        await wait(600);
        await d.collect("table", 1);
      }
    }
    if (!waitForGrowth || (await d.count("bread")) >= breadTarget) break;
    d.setGoal("小麦の生長を待ちながら、周囲の安全を確かめます。");
    await a.waitSafe(5000);
  }
  const bread = await d.count("bread");
  return { bread, target: breadTarget, complete: bread >= breadTarget };
}
