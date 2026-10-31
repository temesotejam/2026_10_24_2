/** Allow the actual dawn and exposed undead burn before leaving the perch. */
import { wait } from "../lib/survival-driver.mjs";
export async function run(ctx) {
  const { page, d, a } = ctx;
  a.setGuard(async () => false);
  d.setThreatHandler(null);
  d.setGoal("足場で待ち、朝の日光で屋外の敵が減ってから素材集めを再開します。");
  while (
    await page.evaluate(() => {
      const t = window.__mc.time() % 1200;
      return t < 36 || t >= 744;
    })
  ) {
    await a.eat();
    await wait(700);
  }
  const hunt = await import("./phase-4.49.mjs");
  await hunt.run(ctx);
}
