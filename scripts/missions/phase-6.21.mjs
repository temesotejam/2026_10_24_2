import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a }) {
  a.setGuard(async () => false);
  d.setGoal("追ってきた敵に素手で応戦し、村で立て直します。");
  await page.keyboard.down("Space");
  try {
    for (let i = 0; i < 80; i++) {
      const s = await d.info();
      if (s.health <= 0) throw new Error("defeated while defending without recovered equipment");
      const m = (await a.adventure()).creatures
        .filter((m) => m.species === "spider")
        .sort(
          (x, y) =>
            Math.hypot(x.position.x - s.position.x, x.position.z - s.position.z) -
            Math.hypot(y.position.x - s.position.x, y.position.z - s.position.z),
        )[0];
      if (!m) return;
      if (Math.hypot(m.position.x - s.position.x, m.position.z - s.position.z) > 3) return;
      await d.aim({ ...m.position, y: m.position.y + 0.7 });
      await page.mouse.down();
      await wait(400);
      await page.mouse.up();
    }
  } finally {
    await page.keyboard.up("Space");
  }
}
