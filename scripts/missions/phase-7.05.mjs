/** Cook the genuinely carried fish with gathered coal before entering the End. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { carriedFoodUnits } from "../lib/modern-resources.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  d.setThreatHandler(null);
  d.setGoal("回収した魚を石炭とかまどで焼き、最終戦の回復量を確保します。");
  // Merge only ordinary stackable dirt through the normal inventory slots.
  let inv = (await d.info()).inventory;
  const dirt = inv.map((s, i) => ({ s, i })).filter(({ s }) => s?.id === "dirt");
  if (dirt.length > 1 && dirt[0].s.count + dirt[1].s.count <= 64) {
    await d.open();
    await page.locator(`[data-area="inventory"][data-slot="${dirt[1].i}"]`).click();
    await page.locator(`[data-area="inventory"][data-slot="${dirt[0].i}"]`).click();
    await d.close();
  }
  assert.ok(
    (await d.info()).inventory.some((s) => s === null),
    "space for actual cooking stations",
  );
  let table;
  if (!(await d.count("furnace"))) {
    table = await d.station("table");
    await d.make("furnace");
    await d.close();
  }
  const amount = await d.count("fish");
  assert.ok(amount >= 7, "carry enough genuinely caught fish to cook");
  const furnace = await d.station("furnace");
  async function put(id, n) {
    const index = (await d.info()).inventory.findIndex((s) => s?.id === id);
    assert.ok(index >= 0);
    await page.locator(`[data-area="inventory"][data-slot="${index}"]`).click();
    await page.locator(`[data-area="furnace"][data-slot="${n}"]`).click();
  }
  await put("fish", 0);
  await put("coal", 1);
  const until = Date.now() + amount * 9000 + 60000;
  while (true) {
    const cooked = await page.$eval('[data-area="furnace"][data-slot="2"]', (e) =>
      e.querySelector("img") ? Number(e.querySelector(".item-count")?.textContent) || 1 : 0,
    );
    if (cooked >= amount) break;
    assert.ok(Date.now() < until, "cook actual fish with consumed coal");
    assert.ok((await d.info()).health > 0);
    await wait(500);
  }
  for (const n of [2, 1]) {
    const present = await page.$eval(
      `[data-area="furnace"][data-slot="${n}"]`,
      (e) => !!e.querySelector("img"),
    );
    if (!present) continue;
    const free = (await d.info()).inventory.findIndex((s) => s === null);
    assert.ok(free >= 0);
    await page.locator(`[data-area="furnace"][data-slot="${n}"]`).click();
    await page.locator(`[data-area="inventory"][data-slot="${free}"]`).click();
  }
  await d.close();
  await d.mine(furnace);
  await wait(500);
  await d.collect("furnace", 1);
  if (table) {
    await d.mine(table);
    await wait(500);
    await d.collect("table", 1);
  }
  assert.ok((await carriedFoodUnits(d)) >= 40, "carry cooked food for the actual End preflight");
  meta.endCooking = {
    fishCooked: amount,
    foodUnits: await carriedFoodUnits(d),
    health: (await d.info()).health,
  };
  flush();
  await chapter(`釣った魚${amount}匹を燃料を使って焼き、エンド遠征用に携行`, 7);
}
