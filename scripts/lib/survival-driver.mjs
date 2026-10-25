/** Normal-input driver. Debug handles are read-only. No save imports or state setters. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export function createDriver(page, out) {
  const events = [];
  const info = () =>
    page.evaluate(() => ({
      position: window.__mc.position(),
      eye: window.__mc.eyeHeight(),
      pitch: window.__mc.pitch(),
      yaw: window.__mc.yaw(),
      inventory: window.__mc.inventory(),
      health: window.__mc.health(),
    }));
  const count = async (id) =>
    (await info()).inventory.filter((s) => s?.id === id).reduce((n, s) => n + s.count, 0);
  const block = (p) => page.evaluate((p) => window.__mc.blockAt(p.x, p.y, p.z), p);
  const report = async (text) => {
    events.push({ text, ...(await info()) });
    writeFileSync(`${out}/progress.json`, JSON.stringify(events, null, 2));
    console.log(text);
  };
  async function aim(p) {
    const s = await info();
    const dx = p.x - s.position.x,
      dy = p.y - s.position.y - s.eye,
      dz = p.z - s.position.z;
    const nextYaw = Math.atan2(-dx, -dz),
      pitch = Math.atan2(dy, Math.hypot(dx, dz));
    await page.evaluate(
      ({ x, y }) =>
        document.dispatchEvent(new MouseEvent("mousemove", { movementX: x, movementY: y })),
      { x: -(nextYaw - s.yaw) / 0.0022, y: -(pitch - s.pitch) / 0.0022 },
    );
    await wait(120);
  }
  async function open() {
    await page.keyboard.press("KeyE");
    await page.waitForSelector("#inventory-panel:not([hidden])");
  }
  async function close() {
    await page.keyboard.press("KeyE");
    await page.waitForFunction(() => window.__mc.mode() === "pointer");
  }
  async function equip(id) {
    let index = (await info()).inventory.findIndex((s) => s?.id === id);
    assert.ok(index >= 0, `own ${id}`);
    if (index >= 9) {
      await open();
      await page.click(`[data-area="inventory"][data-slot="${index}"]`);
      await page.click('[data-area="inventory"][data-slot="0"]');
      await close();
      index = 0;
    }
    await page.keyboard.press(`Digit${index + 1}`);
  }
  async function mine(p) {
    for (let attempt = 0; attempt < 16; attempt++) {
      const original = await block(p);
      if ([0, 5, 26, 31, 40].includes(original)) return;
      assert.notEqual(original, 8, "do not mine bedrock");
      assert.ok((await info()).health > 0, "survive mining");
      await aim({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 });
      const hit = await page.evaluate(() => window.__mc.target());
      assert.ok(hit, `target ${JSON.stringify(p)}`);
      const before = await block(hit);
      assert.notEqual(before, 8, "target is not bedrock");
      await page.mouse.down();
      try {
        await page.waitForFunction(
          ({ p, id }) => window.__mc.blockAt(p.x, p.y, p.z) !== id,
          { timeout: 12000, polling: 100 },
          { p: hit, id: before },
        );
      } finally {
        await page.mouse.up();
      }
      await wait(160);
      if ((await block(p)) === 0) return;
    }
    throw new Error(`Cannot reach ${JSON.stringify(p)}`);
  }
  async function walk(x, z, jump = false, tolerance = 0.3) {
    const start = Date.now();
    let lastProgress = Date.now(),
      previous = null;
    while (true) {
      const s = await info();
      assert.ok(s.health > 0, "survive travel");
      const distance = Math.hypot(x - s.position.x, z - s.position.z);
      if (distance < tolerance) break;
      assert.ok(
        Date.now() - start < 60000,
        `travel to ${x},${z}; position=${JSON.stringify(s.position)}`,
      );
      if (previous && Math.hypot(s.position.x - previous.x, s.position.z - previous.z) > 0.04)
        lastProgress = Date.now();
      if (Date.now() - lastProgress > 1500) {
        await page.keyboard.up("KeyW");
        await page.keyboard.up("Space");
        for (let yy = Math.floor(s.position.y); yy <= Math.floor(s.position.y) + 3; yy++) {
          const cell = { x: Math.floor(x), y: yy, z: Math.floor(z) },
            id = await block(cell);
          if (id !== 0 && id !== 5 && id !== 8) await mine(cell);
        }
        lastProgress = Date.now();
      }
      previous = { ...s.position };
      await aim({ x, y: s.position.y + s.eye, z });
      await page.keyboard.down("KeyW");
      if (jump) await page.keyboard.down("Space");
      await wait(Math.max(40, Math.min(180, (distance / 4.317) * 700)));
      await page.keyboard.up("KeyW");
      await page.keyboard.up("Space");
    }
    await wait(1000);
  }
  async function center() {
    const p = (await info()).position;
    await page.keyboard.down("ShiftLeft");
    try {
      await walk(Math.floor(p.x) + 0.5, Math.floor(p.z) + 0.5, false, 0.12);
    } finally {
      await page.keyboard.up("ShiftLeft");
    }
    await wait(300);
  }
  async function make(id) {
    await page.$eval("details", (d) => {
      d.open = true;
    });
    await page.click(`[data-recipe="${id}"]`);
    await page.click("#craft-output");
  }
  async function collect(id, n) {
    await page.waitForFunction(
      ({ id, n }) =>
        window.__mc
          .inventory()
          .filter((s) => s?.id === id)
          .reduce((sum, s) => sum + s.count, 0) >= n,
      { timeout: 15000 },
      { id, n },
    );
  }
  async function light() {
    if (!(await count("torch"))) return;
    for (const id of ["iron_pick", "stone_pick", "wood_pick"])
      if (await count(id)) {
        await equip(id);
        break;
      }
    const s = await info(),
      x = Math.floor(s.position.x),
      y = Math.round(s.position.y),
      z = Math.floor(s.position.z);
    if ((await block({ x, y, z })) === 16) {
      await mine({ x, y, z });
      await wait(500);
    }
    for (const [dx, dz] of [
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const p = { x: x + dx, y, z: z + dz },
        under = await block({ ...p, y: y - 1 });
      if ([0, 5, 16, 22, 26].includes(under)) continue;
      if ([12, 13, 14, 15, 34, 35].includes(await block(p))) continue;
      for (const yy of [y + 1, y])
        if ((await block({ ...p, y: yy })) !== 0) await mine({ ...p, y: yy });
      await equip("torch");
      await aim({ x: p.x + 0.5, y: y - 0.5, z: p.z + 0.5 });
      await page.mouse.down({ button: "right" });
      await page.mouse.up({ button: "right" });
      if ((await block(p)) === 16) break;
    }
    for (const id of ["iron_pick", "stone_pick", "wood_pick"])
      if (await count(id)) {
        await equip(id);
        break;
      }
  }
  async function station(id) {
    await center();
    const s = await info();
    const x = Math.floor(s.position.x),
      y = Math.round(s.position.y),
      z = Math.floor(s.position.z);
    const cell = { x: x + 1, y, z };
    for (let dy = 0; dy < 2; dy++) {
      const p = { ...cell, y: y + dy };
      if ((await block(p)) !== 0) await mine(p);
    }
    if ((await block({ x: x + 1, y: y - 1, z })) === 0) {
      await equip("dirt");
      await aim({ x: x + 1.5, y: y - 1.5, z: z + 0.5 });
      await page.mouse.down({ button: "right" });
      await page.mouse.up({ button: "right" });
    }
    await equip(id);
    await aim({ x: x + 1.5, y: y - 0.5, z: z + 0.5 });
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
    await wait(300);
    assert.ok((await block(cell)) !== 0, `place ${id}`);
    await aim({ x: x + 1.5, y: y + 0.5, z: z + 0.5 });
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
    await page.waitForSelector("#inventory-panel:not([hidden])");
    return cell;
  }
  async function bridge(nx, cy, nz) {
    const before = await info(),
      cx = Math.floor(before.position.x),
      cz = Math.floor(before.position.z);
    const dx = Math.sign(nx - cx),
      dz = Math.sign(nz - cz);
    const selected = await page.$eval(
      "#hotbar .selected .hotbar-key",
      (el) => Number(el.textContent) - 1,
    );
    const previous = before.inventory[selected]?.id;
    const material = (await count("dirt")) > 0 ? "dirt" : "cobble";
    await equip(material);
    await page.keyboard.down("ShiftLeft");
    await aim({
      x: cx + 0.5 + dx * 2,
      y: (await info()).position.y + (await info()).eye,
      z: cz + 0.5 + dz * 2,
    });
    await page.keyboard.down("KeyW");
    try {
      const start = Date.now();
      while (true) {
        const pos = (await info()).position;
        const progress = (pos.x - cx - 0.5) * dx + (pos.z - cz - 0.5) * dz;
        if (progress >= 0.6) break;
        assert.ok(Date.now() - start < 10000, "crouch to bridge edge");
        await wait(100);
      }
    } finally {
      await page.keyboard.up("KeyW");
    }
    await aim({ x: cx + 0.5 + dx * 0.48, y: cy - 0.5, z: cz + 0.5 + dz * 0.48 });
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
    await wait(300);
    assert.notEqual(await block({ x: nx, y: cy - 1, z: nz }), 0, "placed a real bridge block");
    await page.keyboard.up("ShiftLeft");
    if (previous) await equip(previous);
  }
  async function tunnelTo(p) {
    for (const axis of ["x", "z"]) {
      while (true) {
        const s = await info();
        const cx = Math.floor(s.position.x),
          cz = Math.floor(s.position.z),
          cy = Math.round(s.position.y);
        const current = axis === "x" ? cx : cz,
          target = p[axis];
        if (current === target) break;
        const step = Math.sign(target - current);
        const nx = cx + (axis === "x" ? step : 0),
          nz = cz + (axis === "z" ? step : 0);
        for (const y of [cy + 1, cy])
          if ((await block({ x: nx, y, z: nz })) !== 0) await mine({ x: nx, y, z: nz });
        if ((await block({ x: nx, y: cy - 1, z: nz })) === 0) await bridge(nx, cy, nz);
        await walk(nx + 0.5, nz + 0.5);
      }
    }
  }
  async function findOre(id) {
    return page.evaluate((id) => {
      const p = window.__mc.position(),
        cy = Math.round(p.y);
      const candidates = [];
      for (let dx = -7; dx <= 7; dx++)
        for (let dz = -7; dz <= 7; dz++)
          for (let dy = -1; dy <= 1; dy++) {
            const x = Math.floor(p.x) + dx,
              y = cy + dy,
              z = Math.floor(p.z) + dz;
            if (window.__mc.blockAt(x, y, z) === id)
              candidates.push({ x, y, z, d: dx * dx + dz * dz + dy * dy });
          }
      return candidates.sort((a, b) => a.d - b.d)[0] ?? null;
    }, id);
  }

  return {
    info,
    count,
    block,
    report,
    aim,
    open,
    close,
    equip,
    mine,
    walk,
    center,
    make,
    collect,
    station,
    bridge,
    tunnelTo,
    findOre,
    light,
  };
}
export async function initialJourney(d, page, url, onReady) {
  const {
    info,
    count,
    block,
    report,
    open,
    close,
    equip,
    mine,
    walk,
    center,
    make,
    collect,
    station,
    tunnelTo,
    findOre,
  } = d;
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__mc?.meshedChunks() >= 60, { timeout: 120000 });
  assert.ok((await info()).inventory.every((s) => s === null));
  await onReady?.();
  await page.click("#play-button");
  await page.waitForFunction(() => window.__mc.mode() === "pointer");
  const tree = await page.evaluate(() => {
    const trees = [];
    const p = window.__mc.position();
    for (let x = -30; x <= 30; x++)
      for (let z = -30; z <= 30; z++)
        for (let y = 33; y < 65; y++) {
          const b = window.__mc.blockAt(x, y, z);
          if ((b === 6 || b === 27) && window.__mc.blockAt(x, y - 1, z) !== b)
            trees.push({ x, y, z, id: b, d: Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) });
        }
    return trees.sort((a, b) => a.d - b.d)[0];
  });
  assert.ok(tree, "find a natural tree");
  console.log("Tree", tree);
  // Plan a surface route with one-block climbs; no world edits or teleport.
  const route = await page.evaluate((tree) => {
    const mc = window.__mc,
      p = mc.position();
    const heights = new Map();
    function height(x, z) {
      const key = `${x},${z}`;
      if (heights.has(key)) return heights.get(key);
      let y = 80;
      while (y > 0 && ![1, 2, 3, 4, 9].includes(mc.blockAt(x, y, z))) y--;
      const h = y + 1;
      const clear =
        [0, 5, 7].includes(mc.blockAt(x, h, z)) && [0, 5, 7].includes(mc.blockAt(x, h + 1, z));
      const v = y > 32 && clear ? h : null;
      heights.set(key, v);
      return v;
    }
    const start = { x: Math.floor(p.x), z: Math.floor(p.z) };
    const key = (x, z) => `${x},${z}`;
    const queue = [start],
      previous = new Map([[key(start.x, start.z), null]]);
    let goal = null;
    for (const node of queue) {
      const h = height(node.x, node.z);
      if (Math.abs(node.x - tree.x) + Math.abs(node.z - tree.z) === 1) {
        goal = node;
        break;
      }
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const x = node.x + dx,
          z = node.z + dz,
          k = key(x, z);
        if (previous.has(k) || Math.abs(x) > 30 || Math.abs(z) > 30) continue;
        const hh = height(x, z);
        if (hh === null || h === null || hh - h > 2 || h - hh > 2) continue;
        previous.set(k, node);
        queue.push({ x, z });
      }
    }
    if (!goal)
      return {
        error: "route",
        visited: queue.length,
        start,
        startHeight: height(start.x, start.z),
        near: [
          [-1, 0],
          [1, 0],
          [0, 1],
          [0, -1],
        ].map(([dx, dz]) => ({
          x: start.x + dx,
          z: start.z + dz,
          h: height(start.x + dx, start.z + dz),
          feet: mc.blockAt(start.x + dx, Math.round(p.y), start.z + dz),
        })),
      };
    const result = [];
    let node = goal;
    while (node) {
      result.push({ ...node, h: height(node.x, node.z) });
      node = previous.get(key(node.x, node.z));
    }
    return result.reverse();
  }, tree);
  console.log("Route diagnostics", route);
  assert.ok(Array.isArray(route), "find walkable route to natural tree");
  console.log("Surface route", route);
  for (const point of route.slice(1)) {
    const foot = Math.min(point.h, Math.round((await info()).position.y) + 1);
    const current = (await info()).position;
    for (let y = foot; y <= Math.max(foot + 2, Math.floor(current.y) + 2); y++) {
      const obstacle = { x: point.x, y, z: point.z };
      const b = await block(obstacle);
      if (b !== 0 && b !== 5) await mine(obstacle);
    }
    await walk(point.x + 0.5, point.z + 0.5, point.h > current.y + 0.1);
  }
  for (let dy = 0; dy < 4; dy++) await mine({ x: tree.x, y: tree.y + dy, z: tree.z });
  await walk(tree.x + 0.5, tree.z + 0.5, false, 0.12);
  const log = tree.id === 27 ? "birchLog" : "log";
  await collect(log, 4);
  await report("Gathered four natural logs with empty hands");
  await open();
  for (let i = 0; i < 4; i++) await make(log === "log" ? "planks" : "birch_planks");
  await make("table");
  for (let i = 0; i < 3; i++) await make("sticks");
  await close();
  // Carve a pocket beside the player and use a genuinely placed workstation.
  let table = await station("table");
  await make("wood_pick");
  await close();
  await equip("wood_pick");
  await mine(table);
  await collect("table", 1);
  await report("Crafted wooden pickaxe at a placed table");
  await center();
  for (let i = 0; (await count("cobble")) < 11 && i < 45; i++) {
    const p = (await info()).position;
    await mine({ x: Math.floor(p.x), y: Math.round(p.y) - 1, z: Math.floor(p.z) });
    await wait(500);
  }
  await collect("cobble", 11);
  table = await station("table");
  await make("stone_pick");
  await make("furnace");
  await close();
  await equip("stone_pick");
  await mine(table);
  await collect("table", 1);
  await report("Mined stone and crafted stone tools plus a furnace");
  for (const [id, item, n] of [
    [17, "coal", 1],
    [18, "ironOre", 3],
  ]) {
    for (let attempt = 0; (await count(item)) < n && attempt < 12; attempt++) {
      const target = await findOre(id);
      assert.ok(target, `find ${item}`);
      const p = (await info()).position;
      const cy = Math.round(p.y);
      const adjacent = { ...target, x: target.x + (target.x > p.x ? -1 : 1) };
      await tunnelTo(adjacent);
      if ((await block(target)) !== 0) await mine(target);
      await wait(1000);
      await wait(600);
      if (target.y < cy) await wait(400);
    }
    await collect(item, n);
  }
  await report("Collected coal and three iron ore using a stone pickaxe");
  await finishIronDiamond(d, page);
}
export async function finishIronDiamond(d, page) {
  const { info, report, station, close, equip, mine, collect, make, center, findOre, tunnelTo } = d;
  let table;
  if (!(await d.count("torch")) && (await d.count("coal"))) {
    await d.open();
    await d.make("torch");
    await d.close();
  }
  await d.light();
  const furnace = await station("furnace");
  for (const [item, slot] of [
    ["ironOre", 0],
    [(await d.count("coal")) ? "coal" : "planks", 1],
  ]) {
    const index = (await info()).inventory.findIndex((s) => s?.id === item);
    await page.click(`[data-area="inventory"][data-slot="${index}"]`);
    await page.click(`[data-area="furnace"][data-slot="${slot}"]`);
  }
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector('[data-area="furnace"][data-slot="2"] .item-count')?.textContent,
      ) >= 3,
    { timeout: 40000 },
  );
  await page.click('[data-area="furnace"][data-slot="2"]');
  const free = (await info()).inventory.findIndex((s) => s === null);
  await page.click(`[data-area="inventory"][data-slot="${free}"]`);
  await close();
  await equip("stone_pick");
  await mine(furnace);
  await collect("iron", 3);
  table = await station("table");
  await make("iron_pick");
  await close();
  await equip("iron_pick");
  await mine(table);
  await collect("table", 1);
  await report("Smelted iron with fuel and crafted an iron pickaxe");
  await center();
  for (let i = 0; Math.round((await info()).position.y) > 11 && i < 40; i++) {
    const p = (await info()).position;
    await mine({ x: Math.floor(p.x), y: Math.round(p.y) - 1, z: Math.floor(p.z) });
    await wait(500);
  }
  await d.light();
  const diamond = await findOre(20);
  assert.ok(diamond, "find naturally generated diamond ore");
  const p = (await info()).position;
  await tunnelTo({ ...diamond, x: diamond.x + (diamond.x > p.x ? -1 : 1) });
  await mine(diamond);
  await wait(1000);
  await collect("diamond", 1);
  await report("Collected a naturally generated diamond");
}
