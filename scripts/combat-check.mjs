/** Explicit enemy fixtures test interruptions. Never used as the recorded zero-item run. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { createDriver } from "./lib/survival-driver.mjs";
import { createAdventureDriver } from "./lib/adventure-driver.mjs";
const args = process.argv.slice(2),
  at = args.indexOf("--url");
const url = new URL(at >= 0 ? args[at + 1] : "http://127.0.0.1:4173/");
url.searchParams.set("seed", "2026");
url.searchParams.set("mode", "survival");
const out = path.resolve("visual-check/combat");
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540 });
const d = createDriver(page, out),
  a = createAdventureDriver(page, d);
try {
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await a.boot();
  await page.locator("#save-button").click();
  await page.waitForFunction(
    () => document.querySelector("#save-status").textContent === "保存済み",
  );
  const fixture = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = window.indexedDB.open("classic-voxel-survival", 1);
        r.onsuccess = () => {
          const db = r.result,
            g = db.transaction("worlds").objectStore("worlds").get("2026:survival");
          g.onsuccess = () => {
            resolve(g.result);
            db.close();
          };
          g.onerror = () => reject(g.error);
        };
        r.onerror = () => reject(r.error);
      }),
  );
  fixture.inventory = Array.from({ length: 36 }, () => null);
  fixture.inventory[0] = { id: "iron_sword", count: 1, durability: 251 };
  fixture.inventory[1] = { id: "bow", count: 1, durability: 385 };
  fixture.inventory[2] = { id: "arrow", count: 32 };
  fixture.inventory[3] = { id: "planks", count: 4 };
  fixture.inventory[4] = { id: "bread", count: 4 };
  fixture.position = { x: 0.5, y: 34, z: 4.5 };
  fixture.spawn = { ...fixture.position };
  fixture.yaw = 0;
  fixture.pitch = 0;
  fixture.time = 900;
  fixture.edits = {};
  const put = (x, y, z, id) => {
    const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`,
      index = (y * 16 + (((z % 16) + 16) % 16)) * 16 + (((x % 16) + 16) % 16);
    (fixture.edits[key] ??= {})[index] = id;
  };
  for (let x = -12; x <= 12; x++)
    for (let z = -12; z <= 12; z++) for (let y = 33; y <= 40; y++) put(x, y, z, y === 33 ? 3 : 0);
  for (const [x, z] of [
    [-5, 0],
    [5, 0],
    [0, 7],
  ])
    put(x, 34, z, 16);
  const mob = (id, species, x, z) => ({
    id,
    species,
    position: { x, y: 34, z },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    hp: 16,
    age: 0,
    cooldown: 0,
    intent: 0,
    love: 0,
  });
  async function load(name, creatures) {
    const data = globalThis.structuredClone(fixture);
    data.creatures = creatures;
    data.nextId = creatures.length + 1;
    const file = path.join(out, `${name}.json`);
    writeFileSync(file, JSON.stringify(data));
    page.once("dialog", (dialog) => {
      void dialog.accept();
    });
    const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded" });
    await (await page.$("#import-file")).uploadFile(file);
    await navigation;
    await a.boot();
    await page.select("#render-scale", "0.25");
    await page.locator("#play-button").click();
    await page.waitForFunction(() => window.__mc.mode() === "pointer");
  }
  await load("craft-interruption", [mob(1, "mossling", -2.5, 2.5), mob(2, "skeleton", 7.5, -2.5)]);
  await d.open();
  await d.make("sticks");
  assert.ok((await d.count("stick")) === 4, "craft resumes after combat");
  assert.ok(
    await page.$("#inventory-panel:not([hidden])"),
    "inventory restored after interruption",
  );
  assert.ok(
    (await a.adventure()).creatures.every((m) => m.id !== 1 && m.id !== 2),
    "real enemies were defeated",
  );
  assert.ok(
    a.combatStats.interruptions > 0 && a.combatStats.melee > 0 && a.combatStats.ranged > 0,
    "melee and ranged reactions occurred",
  );
  assert.ok((await d.info()).health > 0, "survived real-time enemy attacks");
  console.log(
    "PASS craft interrupted for live melee/ranged enemies, combat completed, UI restored and craft resumed",
  );
  await d.close();
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => window.__mc.mode() === "idle");
  const before = a.combatStats.interruptions;
  await load("movement-interruption", [mob(1, "mossling", 8.5, 4.5)]);
  await d.walk(10.5, 4.5, false, 0.3, 200);
  assert.ok(
    a.combatStats.interruptions > before,
    "movement was interrupted for an approaching enemy",
  );
  assert.ok(
    Math.hypot((await d.info()).position.x - 10.5, (await d.info()).position.z - 4.5) < 0.3,
    "movement goal reached after combat",
  );
  assert.ok(
    (await a.adventure()).creatures.every((m) => m.id !== 1),
    "approaching enemy defeated",
  );
  assert.ok((await d.info()).health > 0, "survived while moving");
  console.log(
    "PASS approaching enemy interrupted travel and the original movement goal was reached afterwards",
  );
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => window.__mc.mode() === "idle");
  await load("continuous-walking", []);
  await page.evaluate(() => {
    window.__walkingTrace = [];
    let last = 0;
    const sample = (time) => {
      if (time - last >= 40) {
        window.__walkingTrace.push(window.__mc.position());
        last = time;
      }
      window.__walkingTimer = window.requestAnimationFrame(sample);
    };
    window.__walkingTimer = window.requestAnimationFrame(sample);
  });
  await d.walk(10.5, 4.5, false, 0.3, 0);
  const trace = await page.evaluate(() => {
    window.cancelAnimationFrame(window.__walkingTimer);
    return window.__walkingTrace;
  });
  const interior = trace.slice(3, -2);
  const pauses = interior
    .slice(1)
    .filter((p, i) => Math.hypot(p.x - interior[i].x, p.z - interior[i].z) < 0.005).length;
  assert.ok(interior.length > 15, "observe enough walking frames");
  assert.ok(
    pauses / (interior.length - 1) < 0.2,
    "walk continuously instead of pulsing forward and stopping",
  );
  console.log(`PASS continuous walking: ${pauses}/${interior.length - 1} stationary samples`);
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => window.__mc.mode() === "idle");
  for (let x = -12; x < 0; x++) for (let z = -12; z <= 12; z++) put(x, 33, z, 0);
  fixture.position = { x: -0.2919, y: 34, z: 4.5 };
  await load("supported-ledge", []);
  const planksBefore = await d.count("planks");
  await d.tunnelTo({ x: -1, z: 4 });
  assert.equal(
    await d.block({ x: -1, y: 33, z: 4 }),
    10,
    "build the missing block under an overhanging center",
  );
  assert.equal(await d.count("planks"), planksBefore - 1, "consume a real building block");
  assert.ok(Math.abs((await d.info()).position.x + 0.5) < 0.21);
  assert.ok((await d.info()).health > 0);
  console.log(
    "PASS bridge from the actual supporting ledge even when the center is already over the target cell",
  );
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => window.__mc.mode() === "idle");
  fixture.position = { x: 0.5, y: 34, z: 4.5 };
  for (let x = -12; x < 0; x++) for (let z = -12; z <= 12; z++) put(x, 33, z, 3);
  fixture.inventory[2].count = 10;
  for (let x = 2; x <= 5; x++)
    for (let z = 3; z <= 6; z++) {
      put(x, 32, z, 3);
      put(x, 33, z, 0);
    }
  const rangedBefore = a.combatStats.ranged;
  await load("ledge-interruption", [
    { ...mob(1, "ember", 3.5, 4.5), position: { x: 3.5, y: 33, z: 4.5 } },
  ]);
  await a.guard();
  assert.ok(
    a.combatStats.ranged > rangedBefore,
    "use reserve arrows for an enemy beyond vertical melee reach",
  );
  assert.ok(
    (await a.adventure()).creatures.every((m) => m.id !== 1),
    "ledge enemy defeated",
  );
  assert.ok((await d.info()).health > 0);
  console.log(
    "PASS enemy on a lower ledge is defeated with reserve arrows instead of repeating out-of-range melee",
  );
  await page.screenshot({ path: path.join(out, "reactive-combat.png") });
  writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify(
      {
        completed: true,
        fixtureBased: true,
        stats: a.combatStats,
        health: (await d.info()).health,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await page.screenshot({ path: path.join(out, "failure.png") });
  const state = { info: await d.info(), adventure: await a.adventure(), stats: a.combatStats };
  writeFileSync(path.join(out, "failure.json"), JSON.stringify(state, null, 2));
  if (process.env.GITHUB_ACTIONS)
    console.log(
      `::error title=Reactive combat failed::${String(error?.stack ?? error)
        .concat("\nState: ", JSON.stringify({ info: state.info, stats: state.stats }))
        .replaceAll("%", "%25")
        .replaceAll("\r", "%0D")
        .replaceAll("\n", "%0A")}`,
    );
  throw error;
} finally {
  await browser.close();
}
