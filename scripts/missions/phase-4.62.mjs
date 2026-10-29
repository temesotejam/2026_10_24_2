import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
export async function run({ page, d, a, chapter }) {
  a.setGuard(async () => false);
  await d.releaseAttack();
  await page.keyboard.down("ShiftLeft");
  d.setGoal("地下へ退避して入口をふさぎ、りんごで体力を回復します。");
  let p = (await d.info()).position;
  const x = Math.floor(p.x),
    z = Math.floor(p.z),
    top = Math.round(p.y);
  console.log(
    "Shelter floor",
    await page.evaluate(
      ({ x, z, top }) =>
        Array.from({ length: 5 }, (_, i) => window.__mc.blockAt(x, top - i - 1, z)),
      { x, z, top },
    ),
  );
  const landing = await page.evaluate(
    ({ x, z, top }) => {
      for (let y = top - 2; y >= top - 5; y--)
        if (![0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43].includes(window.__mc.blockAt(x, y, z)))
          return y + 1;
      return -Infinity;
    },
    { x, z, top },
  );
  assert.ok(top - landing <= 3.1, "the thin surface roof opens onto a safe three-block landing");
  await d.equip("diamond_pick");
  for (let i = 1; i <= 3; i++) {
    if ((await d.block({ x, y: top - i, z })) !== 0) await d.mine({ x, y: top - i, z });
    await wait(120);
  }
  await wait(300);
  p = (await d.info()).position;
  const roof = { x, y: Math.round(p.y) + 2, z };
  const side = await page.evaluate((roof) => {
    const solid = (id) => ![0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43].includes(id);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      if (solid(window.__mc.blockAt(roof.x + dx, roof.y, roof.z + dz))) return { dx, dz };
    return null;
  }, roof);
  assert.ok(side, "attach the shelter cover to a real solid wall");
  await d.equip("cobble");
  await d.aim({ x: x + 0.5 + side.dx * 0.501, y: roof.y + 0.5, z: z + 0.5 + side.dz * 0.501 });
  await a.right();
  assert.equal(await d.block(roof), 11, "place the owned cobble cover over the shaft");
  await page.keyboard.up("ShiftLeft");
  const foot = Math.round((await d.info()).position.y);
  // Close the side openings too, with the real cobblestone carried from mining.
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const q = { x: x + dx, y: foot, z: z + dz };
    if ((await d.block(q)) === 0) {
      assert.ok(
        ![0, 5, 26].includes(await d.block({ ...q, y: foot - 1 })),
        "a real floor supports the shelter wall",
      );
      await d.equip("cobble");
      await d.aim({ x: q.x + 0.5, y: foot - 0.01, z: q.z + 0.5 });
      await a.right();
    }
    if ((await d.block({ ...q, y: foot + 1 })) === 0) {
      await d.equip("cobble");
      await d.aim({ x: q.x + 0.5, y: foot + 0.99, z: q.z + 0.5 });
      await a.right();
    }
    assert.ok(
      ![0, 5].includes(await d.block(q)) && ![0, 5].includes(await d.block({ ...q, y: foot + 1 })),
      "seal both heights of each side wall",
    );
  }
  if (await d.count("torch")) {
    await d.equip("torch");
    await d.aim({ x: x + 0.999, y: foot + 1.5, z: z + 0.5 });
    await a.right();
  }
  const until = Date.now() + 150000;
  while ((await d.info()).health < 20) {
    assert.ok(Date.now() < until, "heal normally with the actually carried apples");
    assert.ok((await d.info()).health > 0, "survive the covered shelter");
    await a.eat();
    await wait(700);
  }
  console.log("Shelter recovered", await d.info());
  await chapter("地下の避難所でりんごを食べ、体力を回復", 4.63);
}
