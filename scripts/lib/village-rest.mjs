/** Use the actual village bed through ordinary movement and right-click. */
import assert from "node:assert/strict";
import { wait } from "./survival-driver.mjs";

export async function restInVillage(page, d, a, village, meta, flush = () => undefined) {
  const bed = await ensureVillageBed(page, d, a, village, meta, flush);
  d.setGoal("準備中の夜は村のベッドで休み、遠征前の消耗を減らします。");
  if (meta.bedLocation) {
    await a.surfaceTo({ x: bed.x + 1, z: bed.z });
  } else {
    await a.surfaceTo({ x: village.x + 7, z: village.z + 1 });
    await a.move(village.x + 7.5, village.z + 2.5, true);
    await a.move(village.x + 7.5, village.z + 4.5, true);
  }
  await d.equip((await d.count("iron_sword")) ? "iron_sword" : "iron_pick");
  const before = await page.evaluate(() => window.__mc.time());
  await a.useAt(bed);
  await wait(600);
  const after = await page.evaluate(() => ({
    time: window.__mc.time(),
    notice: document.querySelector("#toast")?.textContent,
  }));
  const slept = after.time - before > 10;
  (meta.bedVisits ??= []).push({ before, after: after.time, slept, notice: after.notice });
  meta.bedSet = true;
  flush();
  if (slept) d.narrate("ベッドで夜を飛ばしました。明るいうちに準備を進めます。", 2);
  else
    d.narrate(
      after.notice?.includes("敵")
        ? "近くに敵がいて眠れません。家を拠点に安全を確かめます。"
        : "ベッドで復活地点を設定しました。夜の準備ではここで休みます。",
      2,
    );
  console.log("Native village bed", JSON.stringify({ before, ...after, slept }));
  return slept;
}

/** Replace a destroyed bed with an actually carried bed on supported clear ground. */
export async function ensureVillageBed(page, d, a, village, meta, flush = () => undefined) {
  const old = meta.bedLocation ?? { x: village.x + 6, y: village.y, z: village.z + 5 };
  if ((await d.block(old)) === 15) return old;
  assert.ok(await d.count("bed"), "carry a real replacement for the destroyed bed");
  const site = await page.evaluate((v) => {
    const mc = window.__mc,
      options = [];
    for (let x = v.x; x <= v.x + 10; x++)
      for (let z = v.z; z <= v.z + 9; z++) {
        if (![1, 2, 3, 4, 9, 10, 11, 36].includes(mc.blockAt(x, v.y - 1, z))) continue;
        if ([0, 1, 2].some((dy) => mc.blockAt(x, v.y + dy, z) !== 0)) continue;
        options.push({ x, y: v.y, z, score: Math.hypot(x - (v.x + 6), z - (v.z + 5)) });
      }
    return options.sort((a, b) => a.score - b.score)[0];
  }, village);
  assert.ok(site, "find supported clear ground for the paid replacement bed");
  d.setGoal("壊れたベッドの代わりに、持参したベッドを村の足場へ置き直します。");
  if ((await d.info()).position.y < site.y - 0.2) await a.pillarTo(site.y + 1);
  await a.surfaceTo({ x: site.x + 1, z: site.z });
  if ((await d.info()).position.y < site.y - 0.2) await a.pillarTo(site.y);
  await d.equip("iron_pick");
  for (let i = 0; i < 8; i++) {
    await d.aim({ x: site.x + 0.5, y: site.y - 0.1, z: site.z + 0.5 });
    const hit = await page.evaluate(() => window.__mc.target());
    assert.ok(hit, "see the actual bed foundation");
    if (hit.x === site.x && hit.y === site.y - 1 && hit.z === site.z) break;
    assert.ok(![8, 12, 13, 14, 15, 28, 31, 38, 39, 40].includes(await d.block(hit)));
    await d.mine(hit);
  }
  await d.equip("bed");
  await d.aim({ x: site.x + 0.5, y: site.y - 0.01, z: site.z + 0.5 });
  await a.right();
  assert.equal(await d.block(site), 15, "place a carried replacement bed");
  meta.bedLocation = { x: site.x, y: site.y, z: site.z };
  (meta.rebuiltBeds ??= []).push({ ...meta.bedLocation });
  flush();
  return meta.bedLocation;
}
