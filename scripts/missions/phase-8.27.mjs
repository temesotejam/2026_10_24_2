/** Trade genuinely caught renewable fish for food with an actual village merchant. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { hostile } from "../lib/combat-policy.mjs";
import { mobAimHeight } from "../lib/mob-aim.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  const guard = async () => {
    const p = (await d.info()).position;
    const t = (await a.adventure()).creatures.find(
      (m) =>
        m.hp > 0 &&
        hostile(m) &&
        Math.hypot(m.position.x - p.x, m.position.y - p.y, m.position.z - p.z) <
          (m.species === "skeleton" ? 18 : 9),
    );
    if (t) throw Error(`Safety checkpoint: ${t.species} near merchant`);
    return false;
  };
  a.setGuard(guard);
  d.setThreatHandler(guard);
  const fish = await d.count("fish"),
    bread = await d.count("bread"),
    start = Date.now();
  assert.ok(fish >= 6, "own real fish for this trade");
  d.setGoal("村人に釣った魚６匹を渡し、食料との交換を試します。");
  for (let i = 0; i < 8; i++) {
    await guard();
    const p = (await d.info()).position;
    const people = (await a.adventure()).creatures
      .filter((m) => m.species === "villager" && m.hp > 0)
      .sort(
        (x, y) =>
          Math.hypot(x.position.x - p.x, x.position.y - p.y, x.position.z - p.z) -
          Math.hypot(y.position.x - p.x, y.position.y - p.y, y.position.z - p.z),
      );
    const person = people[0];
    assert.ok(person, "find an actual living villager");
    const dist = Math.hypot(person.position.x - p.x, person.position.z - p.z);
    if (dist > 2.5) {
      const dx = (p.x - person.position.x) / dist,
        dz = (p.z - person.position.z) / dist;
      await a.surfaceTo({
        x: Math.floor(person.position.x + dx * 1.5),
        z: Math.floor(person.position.z + dz * 1.5),
      });
      continue;
    }
    await d.equip("stick");
    await d.aim({ ...person.position, y: person.position.y + mobAimHeight(person) });
    await a.right();
    if (await page.$('[data-action="sell-fish"]')) break;
    await wait(300);
  }
  await page.waitForSelector('[data-action="sell-fish"]', { timeout: 3000 });
  await page.locator('[data-action="sell-fish"]').click();
  await page.locator('[data-action="buy-bread"]').click();
  await d.close();
  assert.equal(await d.count("fish"), fish - 6, "pay six actually caught fish");
  assert.equal(await d.count("bread"), bread + 6, "receive six real bread");
  meta.livingTrade = {
    fishPaid: 6,
    breadReceived: 6,
    fishRemaining: await d.count("fish"),
    seconds: (Date.now() - start) / 1000,
    health: (await d.info()).health,
  };
  flush();
  console.log("Living actual trade", JSON.stringify(meta.livingTrade));
  await chapter("釣った魚を村人と交換し、燃料を使わずパンを備蓄", 9);
}
