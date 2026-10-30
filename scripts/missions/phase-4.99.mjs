/** Return to the actual village canal for native fishing, without ranged pursuit. */
import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { run as fish } from "./phase-4.9.mjs";
export async function run(ctx) {
  const { page, d, a } = ctx;
  a.setGuard(async () => false);
  d.setGoal("村の畑のそばへ戻り、釣りで体力と食料を立て直します。");
  try {
    await a.surfaceTo({ x: 191, z: -82 });
    await wait(300);
    assert.ok((await d.info()).health > 0);
    console.log(
      "CANAL_ARRIVAL",
      JSON.stringify({ position: (await d.info()).position, health: (await d.info()).health }),
    );
    await fish(ctx);
  } finally {
    await page.keyboard.up("Space");
    await page.keyboard.up("KeyW");
    await a.save(false);
  }
}
