/** Place actual blocks while continuously jumping; do not wait exposed in the pit. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  d.setThreatHandler(null);
  const s = await d.info(),
    base = {
      x: Math.floor(s.position.x),
      y: Math.round(s.position.y),
      z: Math.floor(s.position.z),
    };
  d.setGoal("敵から離れるため、ジャンプしながら手持ちの土を足元に積みます。");
  await d.equip("dirt");
  await page.keyboard.down("Space");
  try {
    for (let step = 0; step < 2; step++) {
      const cell = { ...base, y: base.y + step };
      await d.aim({ x: cell.x + 0.5, y: cell.y - 0.5, z: cell.z + 0.5 }, 0);
      const until = Date.now() + 5000;
      while ((await d.block(cell)) !== 2) {
        assert.ok((await d.info()).health > 0, "survive actual jump placement");
        assert.ok(Date.now() < until, "place each actual dirt block");
        await a.right();
        await wait(25);
      }
    }
  } finally {
    await page.keyboard.up("Space");
  }
  await wait(100);
  await a.eat();
  assert.ok(
    (await d.count("enderEye")) >= 1,
    "use the eye already crafted before the previous death",
  );
  await d.equip("enderEye");
  const p = (await d.info()).position,
    c = (await a.adventure()).entrance;
  await d.aim({ x: c.x + 0.5, y: p.y + 3, z: c.z + 0.5 }, 0);
  await a.right();
  const actual = await a.adventure();
  assert.ok(actual.eyeThrows > 0, "make the native direction check");
  meta.endMission ??= {};
  meta.endMission.directionChecked = true;
  meta.endMission.eyesAfterDirection = await d.count("enderEye");
  meta.earlyEye = {
    eyeThrows: actual.eyeThrows,
    remainingEyes: await d.count("enderEye"),
    notice: await page.$eval("#toast", (e) => e.textContent),
  };
  flush();
  console.log("Native actual eye", JSON.stringify(meta.earlyEye));
  await chapter("実際に土を積んで敵から離れ、エンダーアイで遺跡の方向を確認", 4);
}
