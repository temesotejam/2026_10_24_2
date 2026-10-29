import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { createModernHunting } from "../lib/modern-hunting.mjs";
export async function run({ page, d, a, meta, chapter }) {
  a.setGuard(async () => false);
  await a.eat();
  assert.ok((await d.info()).health >= 18);
  d.setGoal("回復できました。崖の高さを確認し、落とした装備を拾いに戻ります。");
  await d.mine(meta.rescueWell.roof);
  await a.pillarTo(meta.rescueWell.top);
  const p = (await d.info()).position,
    goal = meta.lastDeath;
  const grid = await page.evaluate(
    ({ p, goal }) => {
      const cells = {},
        minX = Math.floor(Math.min(p.x, goal.x)) - 6,
        maxX = Math.ceil(Math.max(p.x, goal.x)) + 6,
        minZ = Math.floor(Math.min(p.z, goal.z)) - 6,
        maxZ = Math.ceil(Math.max(p.z, goal.z)) + 6;
      for (let x = minX; x <= maxX; x++)
        for (let z = minZ; z <= maxZ; z++)
          for (let y = 70; y > 1; y--)
            if (
              [1, 2, 3, 4, 9, 10, 11, 17, 18, 19, 20, 21, 36, 44].includes(
                window.__mc.blockAt(x, y, z),
              ) &&
              [0, 16, 22, 23, 25].includes(window.__mc.blockAt(x, y + 1, z)) &&
              [0, 16, 22, 23, 25].includes(window.__mc.blockAt(x, y + 2, z))
            ) {
              cells[`${x},${z}`] = { x: x + 0.5, y: y + 1, z: z + 0.5 };
              break;
            }
      return cells;
    },
    { p, goal },
  );
  const key = (q) => `${Math.floor(q.x)},${Math.floor(q.z)}`,
    start = grid[key(p)];
  assert.ok(start);
  const queue = [{ q: start, cost: 0, damage: 0, path: [] }],
    best = new Map([[key(start), 0]]);
  let selected;
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const n = queue.shift();
    if (key(n.q) === key(goal)) {
      selected = n;
      break;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const q = grid[`${Math.floor(n.q.x) + dx},${Math.floor(n.q.z) + dz}`];
      if (!q || q.y - n.q.y > 1) continue;
      const damage = n.damage + Math.max(0, n.q.y - q.y - 3),
        cost = n.cost + 1 + Math.max(0, n.q.y - q.y - 3) * 0.2;
      if (damage > 12 || (best.get(key(q)) ?? Infinity) <= cost) continue;
      best.set(key(q), cost);
      queue.push({ q, cost, damage, path: [...n.path, q] });
    }
  }
  assert.ok(selected, "find a dry route whose real fall damage leaves a health reserve");
  console.log("Recovery route", selected);
  await page.keyboard.down("ControlLeft");
  try {
    for (const q of selected.path) {
      const at = (await d.info()).position;
      await d.walk(q.x, q.z, q.y > at.y + 0.1, 0.18, 0);
      await a.eat();
      assert.ok((await d.info()).health > 0);
    }
  } finally {
    await page.keyboard.up("ControlLeft");
  }
  await wait(700);
  await a.move(goal.x, goal.z);
  await wait(600);
  assert.ok(await d.count("diamond_pick"), "recover the actual diamond pickaxe");
  assert.ok((await d.count("enderPearl")) >= 8);
  assert.ok((await d.count("blazeRod")) >= 14);
  const h = createModernHunting(page, d, a, { arrowReserve: 0 });
  h.activate();
  await a.eat();
  await h.guard();
  console.log("Gear recovered", await d.info());
  await chapter("落としたパール8個・ロッド14本・道具を回収", 4.6);
}
