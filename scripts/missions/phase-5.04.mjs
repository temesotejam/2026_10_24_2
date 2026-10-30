/** Recover the already dropped feathers, place a permanent cache, craft real arrows. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, meta, flush = () => undefined }) {
  a.setGuard(async () => false);
  d.setGoal("落とした羽根を回収し、チェストを残して弓矢を仕上げます。");
  await a.surfaceTo({ x: 150, z: -92 });
  await a.move(150.048, -91.372);
  await wait(700);
  console.log(
    "FEATHER_PICKUP",
    JSON.stringify({
      feathers: await d.count("feather"),
      fish: await d.count("fish"),
      health: (await d.info()).health,
    }),
  );
  assert.ok(
    (await d.count("feather")) >= 3,
    "recover the existing feather drops into the existing stack",
  );
  await d.center();
  const chest = await page.evaluate(() => {
    const p = window.__mc.position(),
      y = Math.round(p.y);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = Math.floor(p.x) + dx,
        z = Math.floor(p.z) + dz;
      if (
        [1, 2, 3, 4, 9, 11].includes(window.__mc.blockAt(x, y - 1, z)) &&
        window.__mc.blockAt(x, y, z) === 0 &&
        window.__mc.blockAt(x, y + 1, z) === 0
      )
        return { x, y, z };
    }
    return null;
  });
  assert.ok(chest);
  await d.equip("chest");
  await d.aim({ x: chest.x + 0.5, y: chest.y - 0.01, z: chest.z + 0.5 });
  await a.right();
  assert.equal(await d.block(chest), 14);
  await a.useAt(chest);
  await page.waitForSelector('[data-area="chest"]');
  const junk = new Set([
    "dirt",
    "sand",
    "gravel",
    "bone",
    "string",
    "stone_hoe",
    "stone_sword",
    "apple",
    "birchLog",
    "wheat",
    "ironOre",
    "furnace",
  ]);
  let cobbleKept = false;
  for (let index = 0; index < 36; index++) {
    const item = (await d.info()).inventory[index];
    if (!item) continue;
    let store = junk.has(item.id);
    if (item.id === "cobble") {
      if (!cobbleKept) {
        cobbleKept = true;
      } else store = true;
    }
    if (!store) continue;
    const free = await page.$$eval('[data-area="chest"]', (els) =>
      els.findIndex((e) => !e.querySelector("img")),
    );
    assert.ok(free >= 0);
    await page.locator(`[data-area="inventory"][data-slot="${index}"]`).click();
    await page.locator(`[data-area="chest"][data-slot="${free}"]`).click();
  }
  await d.close();
  meta.remoteCaches ??= [];
  meta.remoteCaches.push(chest);
  flush();
  await d.open();
  await d.make("table");
  await d.close();
  const table = await d.station("table");
  while ((await d.count("stick")) < 3) await d.make("sticks");
  while ((await d.count("arrow")) < 12 && (await d.count("feather")) && (await d.count("flint")))
    await d.make("arrow");
  if ((await d.count("iron")) >= 2) {
    if (!(await d.count("stick"))) await d.make("sticks");
    await d.make("iron_sword");
  }
  await d.close();
  // Leave the real workstation and storage intact. Do not mine through one to
  // retrieve another: preserving these blocks is safer than recovering scraps.
  await d.equip("iron_sword");
  assert.ok((await d.count("arrow")) >= 12);
  meta.finalCamp = { chest, table };
  flush();
  console.log(
    "ARCHERY_READY",
    JSON.stringify({
      arrows: await d.count("arrow"),
      feathers: await d.count("feather"),
      pearls: await d.count("enderPearl"),
      fish: await d.count("fish"),
      health: (await d.info()).health,
      free: (await d.info()).inventory.filter((s) => s === null).length,
    }),
  );
  await a.save(false);
}
