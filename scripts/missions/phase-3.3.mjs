/** Finish the current actual supplies; one earned flint is enough to light a portal. */
import assert from "node:assert/strict";
import { craftFlintSteel } from "../lib/modern-resources.mjs";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ d, a, meta, chapter }) {
  const v = meta.village;
  assert.ok(v);
  assert.ok(await d.count("flint"));
  await craftFlintSteel(d);
  d.setGoal("村の井戸から水を汲み、採掘とゲートづくりに備えます。");
  await a.surfaceTo({ x: v.x + 2, z: v.z + 1 });
  await d.equip("bucket");
  await a.useAt({ x: v.x, y: v.y - 1, z: v.z });
  await wait(400);
  assert.ok(
    await d.count("waterBucket"),
    "fill an actually crafted bucket at the real village well",
  );
  const table = await d.station("table");
  if (!(await d.count("stick"))) await d.make("sticks");
  if ((await d.count("iron")) >= 2) await d.make("iron_sword");
  await d.close();
  await d.equip("iron_pick");
  await d.mine(table);
  await wait(500);
  await d.collect("table", 1);
  assert.ok((await d.count("bread")) >= 16);
  await chapter("実際の火打ち石で着火具を製作し、水・食料・予備の剣を準備", 4);
}
