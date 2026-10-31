/** Resume at the real sky-bed spawn and inspect a safe daylight descent. */
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  d.setThreatHandler(null);
  d.setGoal("水場への退避に失敗しました。復活地点で本当の朝を待ち、落とした装備を回収します。");
  while (
    await page.evaluate(() => {
      const t = window.__mc.time() % 1200;
      return t < 36 || t >= 744;
    })
  )
    await wait(700);
  meta.endRecoverySpawn = await d.info();
  flush();
  console.log(
    "Daylight descent inspection",
    JSON.stringify(
      await page.evaluate(() => {
        const p = window.__mc.position(),
          cols = [];
        for (let x = Math.floor(p.x) - 12; x <= p.x + 12; x++)
          for (let z = Math.floor(p.z) - 12; z <= p.z + 12; z++)
            for (let y = 70; y > 20; y--)
              if (![0, 5, 16, 22, 23, 25, 31, 33, 40, 43].includes(window.__mc.blockAt(x, y, z))) {
                cols.push({
                  x,
                  y,
                  z,
                  b: window.__mc.blockAt(x, y, z),
                  d: Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z),
                });
                break;
              }
        return { p, cols: cols.sort((a, b) => b.y - a.y || a.d - b.d).slice(0, 24) };
      }),
    ),
  );
  await chapter("ベッドで復活し、通常の朝まで待って回収へ備える", 7);
}
