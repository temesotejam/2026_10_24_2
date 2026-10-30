/** Chop naturally grown trees and craft planks using ordinary inputs. */
import assert from "node:assert/strict";
import { wait } from "./survival-driver.mjs";
export async function gatherWood(page, d, a, targetPlanks = 48) {
  d.setGoal("弓や矢、予備の道具に使う木材を集めます。");
  if ((await d.count("log")) || (await d.count("birchLog"))) {
    await d.open();
    while (await d.count("log")) await d.make("planks");
    while (await d.count("birchLog")) await d.make("birch_planks");
    await d.close();
  }
  for (let tree = 0; tree < 20 && (await d.count("planks")) < targetPlanks; tree++) {
    const t = await page.evaluate(() => {
      const p = window.__mc.position(),
        found = [];
      for (let x = Math.floor(p.x) - 28; x <= p.x + 28; x++)
        for (let z = Math.floor(p.z) - 28; z <= p.z + 28; z++)
          for (let y = Math.max(2, Math.floor(p.y) - 12); y < Math.min(90, p.y + 12); y++) {
            const id = window.__mc.blockAt(x, y, z);
            if (
              (id === 6 || id === 27) &&
              [1, 2, 3, 4].includes(window.__mc.blockAt(x, y - 1, z))
            ) {
              found.push({ x, y, z, id, d: Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) });
              break;
            }
          }
      return found.sort((a, b) => a.d - b.d)[0];
    });
    assert.ok(t, "find natural tree for wood");
    await a.surfaceTo({ x: t.x + 1, z: t.z });
    await d.equip(
      (await d.count("stone_axe")) ? "stone_axe" : (await d.count("stick")) ? "stick" : "wood_pick",
    );
    for (let dy = 0; dy < 4; dy++)
      if ([6, 27].includes(await d.block({ ...t, y: t.y + dy }))) {
        const p = (await d.info()).position;
        if (Math.hypot(p.x - t.x - 0.5, p.y + 1.62 - t.y - dy - 0.5, p.z - t.z - 0.5) < 4.5)
          await d.mine({ ...t, y: t.y + dy });
      }
    await wait(800);
    await a.move(t.x + 0.5, t.z + 0.5, (await d.info()).position.y < t.y - 0.1);
    await d.open();
    while (await d.count("log")) await d.make("planks");
    while (await d.count("birchLog")) await d.make("birch_planks");
    await d.close();
  }
  assert.ok((await d.count("planks")) >= targetPlanks, "own gathered timber");
  await d.report("自然の木を切り、弓・矢・予備道具用の木材を補充");
}
