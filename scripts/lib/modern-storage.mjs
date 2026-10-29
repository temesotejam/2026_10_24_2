/** Put surplus items into the discovered village chest through its normal UI. */
import assert from "node:assert/strict";
export async function stashVillage(
  page,
  d,
  a,
  v,
  ids = ["sapling", "snow", "sand", "wood_pick", "stone_pick", "seeds", "apple"],
) {
  await a.surfaceTo({ x: v.x - 6, z: v.z + 1 });
  await a.move(v.x - 5.5, v.z + 2.7);
  await d.equip("iron_pick");
  await a.useAt({ x: v.x - 7, y: v.y, z: v.z + 5 });
  await page.waitForSelector('[data-area="chest"]');
  for (let n = 0; n < 36; n++) {
    const inv = (await d.info()).inventory,
      index = inv.findIndex((s) => s && ids.includes(s.id));
    if (index < 0) break;
    const slot = await page.$$eval('[data-area="chest"]', (els) =>
      els.findIndex((el) => !el.querySelector("img")),
    );
    assert.ok(slot >= 0, "room in discovered chest for surplus");
    await page.locator(`[data-area="inventory"][data-slot="${index}"]`).click();
    await page.locator(`[data-area="chest"][data-slot="${slot}"]`).click();
  }
  await d.close();
}
