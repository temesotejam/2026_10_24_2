import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { huntingPath } from "../lib/hunting-path.mjs";
export async function run({ page, d, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  await d.releaseAttack();
  await page.keyboard.up("Space");
  await page.keyboard.up("KeyW");
  d.setGoal("保管していた食料を食べ、崖から離れた地面に避難用の穴を掘ります。");
  console.log("Rescue starting", await d.info());
  await a.eat();
  const plan = await page.evaluate(() => {
    const p = window.__mc.position(),
      y = Math.round(p.y),
      cells = {},
      sites = [];
    for (let x = Math.floor(p.x) - 6; x <= p.x + 6; x++)
      for (let z = Math.floor(p.z) - 6; z <= p.z + 6; z++)
        for (let yy = y - 5; yy <= y + 3; yy++)
          cells[`${x},${yy},${z}`] = window.__mc.blockAt(x, yy, z);
    const b = (x, yy, z) => cells[`${x},${yy},${z}`] ?? 8,
      soil = (id) => [1, 2, 3, 9, 11].includes(id);
    for (let x = Math.floor(p.x) - 4; x <= p.x + 4; x++)
      for (let z = Math.floor(p.z) - 4; z <= p.z + 4; z++) {
        if (
          b(x, y, z) !== 0 ||
          b(x, y + 1, z) !== 0 ||
          ![1, 2, 3].every((dy) => soil(b(x, y - dy, z)))
        )
          continue;
        if (
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].every(([dx, dz]) => [y - 3, y - 2, y - 1].every((yy) => soil(b(x + dx, yy, z + dz))))
        )
          sites.push({ x: x + 0.5, y, z: z + 0.5, d: Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) });
      }
    return { p, y, cells, sites: sites.sort((a, b) => a.d - b.d) };
  });
  let selected, route;
  const blockAt = (x, y, z) => plan.cells[`${x},${y},${z}`] ?? 8;
  for (const site of plan.sites) {
    const r = huntingPath(plan.p, site, blockAt, {
      radius: 5,
      minimumY: plan.y,
      maximumY: plan.y,
      goal: (p) => Math.hypot(p.x - site.x, p.z - site.z) < 0.2,
    });
    if (r.reached) {
      selected = site;
      route = r;
      break;
    }
  }
  assert.ok(selected, "find a nearby safe supported well with intact natural side walls");
  for (const q of route.path) await d.walk(q.x, q.z, false, 0.16, 0);
  await d.walk(selected.x, selected.z, false, 0.1, 0);
  await wait(300);
  const x = Math.floor(selected.x),
    z = Math.floor(selected.z),
    top = plan.y;
  for (let i = 1; i <= 3; i++) {
    await d.mine({ x, y: top - i, z });
    await wait(200);
  }
  await wait(350);
  const p = (await d.info()).position,
    roof = { x, y: Math.round(p.y) + 2, z };
  const material = await d.chooseMaterial();
  await d.equip(material.id);
  await d.aim({ x: x + 1.001, y: roof.y + 0.5, z: z + 0.5 });
  await a.right();
  assert.equal(await d.block(roof), material.block, "seal the well with an actually mined block");
  meta.rescueWell = { x, y: Math.round(p.y), z, top, roof };
  flush();
  const until = Date.now() + 150000;
  while ((await d.info()).health < 20) {
    assert.ok((await d.info()).health > 0, "survive inside the sealed natural well");
    assert.ok(Date.now() < until, "heal using the stored real food");
    await a.eat();
    await wait(700);
  }
  console.log("Well healed", await d.info());
  await chapter("保管していた食料で、ふさいだ避難穴の中から体力を回復", 4.66);
}
