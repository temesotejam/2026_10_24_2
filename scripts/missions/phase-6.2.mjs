/** Real basic-tool recovery from the previously stocked village chest. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { stashVillage } from "../lib/modern-storage.mjs";
export async function run({ page, d, a, meta, chapter }) {
  const v = meta.village,
    chest = { x: v.x - 7, y: v.y, z: v.z + 5 };
  assert.equal((await a.adventure()).dimension, "overworld");
  a.setGuard(async () => false);
  d.setGoal("チェストに残した道具と食料で、装備を回収する準備をします。");
  const p = (await d.info()).position;
  if (Math.hypot(p.x - chest.x - 0.5, p.z - chest.z - 0.5) > 2) {
    await a.surfaceTo({ x: v.x - 6, z: v.z + 1 });
    await a.move(v.x - 5.5, v.z + 3.5, true);
    await a.move(v.x - 5.5, v.z + 5.5, true);
  }
  await a.useAt(chest);
  await page.waitForSelector('[data-area="chest"]');
  for (const [id, name] of [
    ["wood_pick", "木のツルハシ"],
    ["apple", "りんご"],
  ]) {
    if (await d.count(id)) continue;
    const slot = await page.$$eval(
      '[data-area="chest"]',
      (els, name) => els.findIndex((el) => el.querySelector("img")?.alt === name),
      name,
    );
    assert.ok(slot >= 0, `use the actually stored ${name}`);
    const free = (await d.info()).inventory.findIndex((s) => s === null);
    await page.locator(`[data-area="chest"][data-slot="${slot}"]`).click();
    await page.locator(`[data-area="inventory"][data-slot="${free}"]`).click();
  }
  await d.close();
  await d.equip("wood_pick");
  const h = createModernHunting(page, d, a);
  h.activate();
  await h.guard();
  const until = Date.now() + 150000;
  while ((await d.info()).health < 20) {
    assert.ok(Date.now() < until, "recover with stored apples after defending the village");
    const hunger = await page.$eval("#hunger", (el) =>
      Number(el.textContent.match(/食料 (\d+)/)?.[1]),
    );
    if (hunger < 18 && (await d.count("apple"))) {
      await d.equip("apple");
      const s = (await d.info()).position;
      await d.aim({ x: s.x, y: s.y + 20, z: s.z - 1 });
      await a.right();
      await d.equip("wood_pick");
    }
    await a.waitSafe(500);
  }
  await a.move(v.x - 5.5, v.z + 2.7, true);
  for (let attempt = 0; (await d.count("planks")) < 5 && attempt < 20; attempt++) {
    const block = await page.evaluate((v) => {
      const p = window.__mc.position(),
        list = [];
      for (let x = v.x - 8; x <= v.x - 4; x++)
        for (let z = v.z + 2; z <= v.z + 6; z++)
          for (let y = v.y; y < v.y + 3; y++)
            if (window.__mc.blockAt(x, y, z) === 10)
              list.push({
                x,
                y,
                z,
                d: Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y - 1.62, z + 0.5 - p.z),
              });
      return list.filter((b) => b.d < 4.4).sort((a, b) => a.d - b.d)[0];
    }, v);
    assert.ok(block);
    await d.mine(block);
    await wait(650);
  }
  const minePaths = async (target) => {
    for (let z = v.z - 1; z <= v.z + 1 && (await d.count("cobble")) < target; z++)
      for (let x = v.x - 9; x <= v.x + 10 && (await d.count("cobble")) < target; x++) {
        const block = { x, y: v.y - 1, z };
        if ((await d.block(block)) !== 11) continue;
        await a.surfaceTo({ x, z: z - 1 });
        await d.mine(block);
        await a.move(x + 0.5, z + 0.5, true);
        await wait(500);
      }
    await d.collect("cobble", target);
  };
  const tableUI = async () => {
    await a.surfaceTo({ x: v.x - 6, z: v.z + 1 });
    await a.move(v.x - 5.5, v.z + 3.5, true);
    await a.move(v.x - 4.5, v.z + 3.5, true);
    await a.useAt({ x: v.x - 5, y: v.y, z: v.z + 5 });
    await page.waitForSelector('[data-recipe="sticks"]');
  };
  await minePaths(3);
  await tableUI();
  await d.make("sticks");
  await d.make("stone_pick");
  await d.close();
  await d.equip("stone_pick");
  await minePaths(34);
  await tableUI();
  await d.make("stone_sword");
  await d.close();
  await stashVillage(page, d, a, v, [
    "wood_pick",
    "stone_pick",
    "stick",
    "planks",
    "apple",
    "string",
  ]);
  await d.equip("stone_sword");
  assert.ok((await d.count("cobble")) >= 32);
  await chapter("石の剣と丸石の足場を実際に作り、回収の準備を完了", 6);
}
