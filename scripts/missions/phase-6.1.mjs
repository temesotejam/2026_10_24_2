import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  d.setGoal("矢を追加作成して持ち物を空け、倒した敵のロッドを拾います。");
  const table = await d.station("table");
  while ((await d.count("flint")) && (await d.count("feather")) && (await d.count("stick")))
    await d.make("arrow");
  await d.close();
  await d.mine(table);
  await wait(700);
  const drops = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const q = window.indexedDB.open("classic-voxel-survival", 1);
        q.onerror = () => reject(q.error);
        q.onsuccess = () => {
          const db = q.result,
            r = db.transaction("worlds", "readonly").objectStore("worlds").getAll();
          r.onerror = () => reject(r.error);
          r.onsuccess = () => {
            const worlds = r.result
              .filter((w) => w.adventure?.dimension === "nether")
              .sort((a, b) => b.time - a.time);
            resolve(worlds[0]?.loot.filter((l) => l.stack.id === "blazeRod") ?? []);
            db.close();
          };
        };
      }),
  );
  meta.netherDropRecovery = {
    observed: drops.map((l) => ({ position: l.position, count: l.stack.count })),
    before: await d.count("blazeRod"),
  };
  flush();
  while (drops.length && (await d.count("blazeRod")) < 7) {
    const p = (await d.info()).position;
    drops.sort(
      (a, b) =>
        Math.hypot(a.position.x - p.x, a.position.y - p.y, a.position.z - p.z) -
        Math.hypot(b.position.x - p.x, b.position.y - p.y, b.position.z - p.z),
    );
    const drop = drops.shift(),
      t = drop.position;
    await a.surfaceTo({ x: Math.floor(t.x), z: Math.floor(t.z) });
    for (let step = 0; step < 6 && (await d.info()).position.y > t.y + 1.4; step++) {
      const dry = await d.block({ x: Math.floor(t.x), y: Math.floor(t.y) - 1, z: Math.floor(t.z) });
      if ([0, 5, 26].includes(dry)) break;
      await d.center();
      const s = (await d.info()).position;
      await d.mine({ x: Math.floor(s.x), y: Math.round(s.y) - 1, z: Math.floor(s.z) });
      await wait(700);
    }
    await a.move(t.x, t.z);
    await wait(800);
    console.log("Recovered blaze rods", await d.count("blazeRod"));
  }
  assert.ok(
    (await d.count("blazeRod")) >= 7,
    "pick up seven actual drops from the recorded fights",
  );
  meta.netherDropRecovery.after = await d.count("blazeRod");
  flush();
  await chapter("倒した敵が落としたロッドを7本回収", 6);
}
