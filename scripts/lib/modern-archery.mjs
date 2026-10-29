import assert from "node:assert/strict";
import { wait } from "./survival-driver.mjs";
export async function craftArchery(d, target = 36) {
  const table = await d.station("table");
  while ((await d.count("stick")) < 12) await d.make("sticks");
  if (!(await d.count("bow"))) await d.make("bow");
  while (
    (await d.count("arrow")) < target &&
    (await d.count("feather")) &&
    (await d.count("flint"))
  ) {
    if (!(await d.count("stick"))) await d.make("sticks");
    await d.make("arrow");
  }
  await d.close();
  await d.equip("iron_pick");
  await d.mine(table);
  await wait(600);
  await d.collect("table", 1);
  assert.ok(await d.count("bow"), "craft bow from actual collected string");
  assert.ok((await d.count("arrow")) >= target - 3, "craft arrows from actual flint and feathers");
}
