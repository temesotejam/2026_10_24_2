/** Take real underground cover and wait for the actual dawn during the End journey. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  d.setThreatHandler(null);
  d.setGoal("夜の射線を避け、足元を掘って待避します。食事で回復して朝を待ちます。");
  const p = (await d.info()).position,
    base = { x: Math.floor(p.x), y: Math.round(p.y), z: Math.floor(p.z) };
  // Refuse caves and water below the proposed pit before removing support.
  for (let y = base.y - 1; y >= base.y - 4; y--)
    assert.ok(
      ![0, 5, 26].includes(await d.block({ ...base, y })),
      "choose dry solid ground for a covered shelter; do not open a water column",
    );
  await d.center();
  for (let i = 1; i <= 3; i++) {
    const cell = { ...base, y: base.y - i };
    await d.mine(cell);
    await page.waitForFunction(
      (y) => window.__mc.position().y <= y + 0.1,
      { timeout: 5000 },
      cell.y,
    );
  }
  assert.ok(
    Math.abs((await d.info()).position.y - (base.y - 3)) < 0.25,
    "only cover the expected dry shelter floor",
  );
  const lid = { ...base, y: base.y - 1 };
  await d.equip("dirt");
  await d.aim({ x: base.x + 1.01, y: lid.y + 0.5, z: base.z + 0.5 }, 0);
  await a.right();
  assert.equal(await d.block(lid), 2, "place a real dirt ceiling above the shelter");
  assert.ok((await d.info()).health > 0, "survive reaching actual cover");
  meta.endShelter = {
    base,
    health: (await d.info()).health,
    before: await page.evaluate(() => window.__mc.time()),
  };
  flush();
  while (
    await page.evaluate(() => {
      const t = window.__mc.time() % 1200;
      return t < 36 || t >= 744;
    })
  ) {
    await a.eat();
    await wait(750);
  }
  await a.recover(20);
  await d.mine(lid);
  for (let y = base.y - 3; y < base.y; y++) {
    const material = await d.chooseMaterial();
    await d.equip(material.id);
    await d.aim({ x: base.x + 0.5, y: y - 0.5, z: base.z + 0.5 }, 0);
    await page.keyboard.down("Space");
    try {
      const until = Date.now() + 6000;
      while ((await d.block({ ...base, y })) !== material.block) {
        assert.ok(Date.now() < until, "jump-place exit block");
        await a.right();
        await wait(25);
      }
    } finally {
      await page.keyboard.up("Space");
    }
  }
  meta.endShelter.after = await page.evaluate(() => window.__mc.time());
  flush();
  await chapter("地形を掘って射線を遮り、通常の食事と朝待ちで回復", 7);
}
