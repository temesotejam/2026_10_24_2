import { stashVillage } from "../lib/modern-storage.mjs";
/** Check direction early and retain any eye the native game actually returns. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  d.setThreatHandler(null);
  if (
    !(await d.count("enderEye")) &&
    (await d.info()).inventory.filter((s) => s === null).length < 2
  ) {
    d.setGoal("採取した砂と生肉を村のチェストに保管し、アイを作る空きを確保します。");
    await page.keyboard.down("ControlLeft");
    try {
      await stashVillage(page, d, a, meta.village, ["sand", "rawMeat"]);
    } finally {
      await page.keyboard.up("ControlLeft");
    }
  }
  d.setGoal("実際のロッドとパールでアイを作り、遺跡の方向を確認します。");
  if (!(await d.count("enderEye"))) {
    await d.open();
    if (!(await d.count("blazePowder"))) await d.make("blazePowder");
    await d.make("enderEye");
    await d.close();
  }
  if (!((await a.adventure()).eyeThrows > 0)) {
    await d.equip("enderEye");
    const p = (await d.info()).position,
      c = (await a.adventure()).entrance;
    await d.aim({ x: c.x + 0.5, y: p.y + 3, z: c.z + 0.5 });
    await a.right();
    await wait(600);
  }
  const actual = await a.adventure();
  assert.ok(actual.eyeThrows > 0, "make a native directional throw");
  meta.endMission ??= {};
  meta.endMission.directionChecked = true;
  meta.endMission.eyesAfterDirection = await d.count("enderEye");
  meta.earlyEye = {
    eyeThrows: actual.eyeThrows,
    remainingEyes: await d.count("enderEye"),
    notice: await page.$eval("#toast", (e) => e.textContent),
  };
  flush();
  console.log("Native early eye", JSON.stringify(meta.earlyEye));
  await chapter("エンダーアイを実際に使って遺跡の方向を確認し、返ったアイを保持", 4);
}
