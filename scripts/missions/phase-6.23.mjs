import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, chapter }) {
  a.setGuard(async () => false);
  d.setGoal("りんごを食べ、足場の上で体力を回復します。");
  await d.equip("apple");
  const p = (await d.info()).position;
  await d.aim({ x: p.x, y: p.y + 20, z: p.z - 1 });
  await a.right();
  const s = await d.info();
  console.log("emergency", JSON.stringify({ s, mobs: (await a.adventure()).creatures }));
  await a.pillarTo(Math.round(s.position.y) + 3);
  for (let i = 0; i < 120 && (await d.info()).health < 20; i++) {
    const hunger = await page.$eval("#hunger", (e) =>
      Number(e.textContent.match(/食料 (\d+)/)?.[1]),
    );
    if (hunger < 18 && (await d.count("apple"))) {
      await d.equip("apple");
      const p = (await d.info()).position;
      await d.aim({ x: p.x, y: p.y + 20, z: p.z - 1 });
      await a.right();
    }
    await wait(1000);
  }
  await chapter("足場の上でりんごを食べて回復", 6.22);
}
