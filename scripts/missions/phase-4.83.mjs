import assert from "node:assert/strict";
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { cookCarriedMeat } from "../lib/modern-resources.mjs";
export async function run({ page, d, a, chapter }) {
  a.setGuard(async () => false);
  d.setGoal("食料を確保するため、近くの牛から肉を集めて調理します。");
  if ((await d.info()).position.y < 34.9) await a.pillarTo(35);
  const h = createModernHunting(page, d, a, { arrowReserve: 10 });
  h.activate();
  await h.gather(
    { rawMeat: 3 },
    {
      timeoutMs: 120000,
      arrowReserve: 10,
      patrol: false,
      collectSpecies: ["cow", "pig", "sheep", "chicken"],
    },
  );
  await cookCarriedMeat(d, page, a, { count: 3 });
  assert.ok((await d.count("meat")) >= 2, "cook real food for farm repair");
  await a.eat();
  await chapter("近くの家畜から得た肉をかまどで調理", 4.82);
}
