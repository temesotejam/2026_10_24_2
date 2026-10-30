/** Use the actual village bed through ordinary movement and right-click. */
import assert from "node:assert/strict";
import { wait } from "./survival-driver.mjs";

export async function restInVillage(page, d, a, village, meta, flush = () => undefined) {
  const bed = { x: village.x + 6, y: village.y, z: village.z + 5 };
  assert.equal(await d.block(bed), 15, "use the real generated bed");
  d.setGoal("準備中の夜は村のベッドで休み、遠征前の消耗を減らします。");
  await a.surfaceTo({ x: village.x + 7, z: village.z + 1 });
  await a.move(village.x + 7.5, village.z + 2.5, true);
  await a.move(village.x + 7.5, village.z + 4.5, true);
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
