/** Ordinary shelter rest; world time advances normally, never by a setter. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, meta, flush = () => undefined }) {
  a.setGuard(async () => false);
  const well = meta.rescueWell;
  assert.ok(well && Math.abs((await d.info()).position.y - well.y) < 0.2);
  assert.ok(
    ![0, 5, 26].includes(await d.block(well.roof)),
    "the actually placed shelter roof remains sealed",
  );
  d.setGoal("夜が明けるまで避難穴の中で休み、魚を食べて体力を戻します。");
  const until = Date.now() + 360000;
  while (true) {
    const s = await d.info(),
      time = await page.evaluate(() => window.__mc.time());
    assert.ok(s.health > 0 && Date.now() < until, "remain alive in the sealed shelter");
    await a.eat();
    if (s.health === 20 && time % 1200 >= 24 && time % 1200 < 700) break;
    await wait(700);
  }
  d.setGoal("朝になったので、自分で置いた屋根と足場を掘って地上へ戻ります。");
  await d.equip("diamond_pick");
  await d.mine(well.roof);
  await a.pillarTo(well.top);
  meta.shelterMorning = {
    time: await page.evaluate(() => window.__mc.time()),
    health: (await d.info()).health,
  };
  flush();
  console.log(
    "SHELTER_MORNING",
    JSON.stringify({
      ...meta.shelterMorning,
      position: (await d.info()).position,
      fish: await d.count("fish"),
      pearls: await d.count("enderPearl"),
    }),
  );
  await a.save(false);
}
