/** A legitimately crafted travel bed; sleeping uses the normal block interaction. */
import assert from "node:assert/strict";
import { wait } from "./survival-driver.mjs";
export async function craftPortableBed(d) {
  if (await d.count("bed")) return true;
  const wool = await d.count("wool"),
    strings = await d.count("string");
  if (wool + Math.floor(strings / 4) < 3 || (await d.count("planks")) < 3) return false;
  const table = await d.station("table");
  while ((await d.count("wool")) < 3) await d.make("wool");
  await d.make("bed");
  await d.close();
  await d.equip("iron_pick");
  await d.mine(table);
  await wait(500);
  await d.collect("table", 1);
  assert.ok(await d.count("bed"));
  return true;
}
export async function restWithPortableBed(page, d, a, meta, flush) {
  if ((await a.adventure()).dimension !== "overworld" || !(await d.count("bed"))) return false;
  const time = await page.evaluate(() => window.__mc.time() % 1200);
  if (time >= 24 && time < 744) return false;
  await d.center();
  let site = await page.evaluate(() => {
    const mc = window.__mc,
      p = mc.position(),
      y = Math.round(p.y);
    const pass = [0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = Math.floor(p.x) + dx,
        z = Math.floor(p.z) + dz;
      if (
        !pass.includes(mc.blockAt(x, y - 1, z)) &&
        mc.blockAt(x, y, z) === 0 &&
        mc.blockAt(x, y + 1, z) === 0
      )
        return { x, y, z };
    }
    return null;
  });
  if (!site) {
    const alcove = await page.evaluate(() => {
      const mc = window.__mc,
        p = mc.position(),
        y = Math.round(p.y);
      const safe = [0, 1, 2, 3, 9, 11, 17, 18, 19, 20, 21];
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const x = Math.floor(p.x) + dx,
          z = Math.floor(p.z) + dz;
        if (
          ![0, 5, 26].includes(mc.blockAt(x, y - 1, z)) &&
          safe.includes(mc.blockAt(x, y, z)) &&
          safe.includes(mc.blockAt(x, y + 1, z))
        )
          return { x, y, z };
      }
      return null;
    });
    if (alcove) {
      d.setGoal("地下の壁に小さなくぼみを掘り、自作ベッドを置く場所を作ります。");
      await d.equip("diamond_pick");
      for (const dy of [1, 0]) await d.mine({ ...alcove, y: alcove.y + dy });
      if ((await d.block(alcove)) === 0 && (await d.block({ ...alcove, y: alcove.y + 1 })) === 0)
        site = alcove;
    }
  }
  if (!site) return false;
  d.setGoal("地下の安全な場所に自作ベッドを置き、夜を越してから地上へ戻ります。");
  await d.equip("bed");
  await d.aim({ x: site.x + 0.5, y: site.y - 0.01, z: site.z + 0.5 });
  await a.right();
  assert.equal(await d.block(site), 15, "place the bed crafted from earned wool and planks");
  await d.equip((await d.count("iron_sword")) ? "iron_sword" : "iron_pick");
  const before = await page.evaluate(() => window.__mc.time());
  await a.useAt(site);
  await wait(600);
  const after = await page.evaluate(() => ({
    time: window.__mc.time(),
    notice: document.querySelector("#toast")?.textContent,
  }));
  const slept = after.time - before > 10;
  (meta.portableBedVisits ??= []).push({
    site,
    before,
    after: after.time,
    slept,
    notice: after.notice,
  });
  flush();
  if (slept) d.narrate("自作ベッドで夜を越しました。朝になったので地上へ戻ります。", 2);
  console.log("Native portable bed", JSON.stringify({ site, before, ...after, slept }));
  await d.equip("iron_pick");
  await d.mine(site);
  await wait(500);
  await d.collect("bed", 1);
  return slept;
}
