/** Imported regression fixtures, never mixed into the ordinary survival film. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { createDriver, wait } from "./lib/survival-driver.mjs";
import { createAdventureDriver } from "./lib/adventure-driver.mjs";
import { createModernHunting } from "./lib/modern-hunting.mjs";
const args = process.argv.slice(2),
  at = args.indexOf("--url");
const lowHealth = args.includes("--low-health");
const url = new URL(at < 0 ? "http://127.0.0.1:4173/2026_10_24_2/" : args[at + 1]);
url.searchParams.set("seed", "2026");
url.searchParams.set("mode", "survival");
const out = path.resolve("visual-check/hunting-navigation");
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const page = await browser.newPage(),
  d = createDriver(page, out),
  a = createAdventureDriver(page, d),
  results = [];
let hunter;
const trace = [];
try {
  await page.setViewport({ width: 640, height: 360 });
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await a.boot();
  await page.locator("#save-button").click();
  await page.waitForFunction(
    () => document.querySelector("#save-status").textContent === "保存済み",
  );
  const baseline = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = window.indexedDB.open("classic-voxel-survival", 1);
        req.onsuccess = () => {
          const db = req.result,
            get = db.transaction("worlds").objectStore("worlds").get("2026:survival");
          get.onsuccess = () => {
            resolve(get.result);
            db.close();
          };
        };
      }),
  );
  const fixture = () => {
    const data = globalThis.structuredClone(baseline);
    data.edits = {};
    data.creatures = [];
    data.loot = [];
    data.arrows = [];
    data.time = 900;
    data.position = { x: 0.5, y: 35, z: 0.5 };
    data.spawn = { ...data.position };
    data.yaw = 0;
    data.pitch = 0;
    data.vitals.health = 20;
    data.vitals.hunger = 20;
    data.inventory = Array.from({ length: 36 }, () => null);
    data.inventory[0] = { id: "iron_sword", count: 1, durability: 251 };
    data.inventory[1] = { id: "bow", count: 1, durability: 385 };
    data.inventory[2] = { id: "arrow", count: 12 };
    data.inventory[3] = { id: "bread", count: 12 };
    const put = (x, y, z, id) => {
      const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`,
        index = (y * 16 + (((z % 16) + 16) % 16)) * 16 + (((x % 16) + 16) % 16);
      (data.edits[key] ??= {})[index] = id;
    };
    for (let x = -16; x <= 16; x++)
      for (let z = -16; z <= 16; z++) for (let y = 33; y < 96; y++) put(x, y, z, y <= 34 ? 3 : 0);
    return { data, put };
  };
  const mob = (id, x, y, z) => ({
    id,
    species: "skeleton",
    position: { x, y, z },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    hp: 16,
    age: 0,
    cooldown: 0,
    intent: 0,
    love: 0,
  });
  async function load(data, name) {
    if (await page.evaluate(() => window.__mc.mode() !== "idle")) {
      await page.evaluate(() => document.exitPointerLock());
      await page.waitForFunction(() => window.__mc.mode() === "idle");
    }
    const file = path.join(out, `${name}.json`);
    writeFileSync(file, JSON.stringify(data));
    page.once("dialog", (dialog) => void dialog.accept());
    const nav = page.waitForNavigation({ waitUntil: "domcontentloaded" });
    await (await page.$("#import-file")).uploadFile(file);
    await nav;
    await a.boot();
    await page.select("#render-scale", "0.25");
    await page.locator("#play-button").click();
    await page.waitForFunction(() => window.__mc.mode() === "pointer");
  }
  if (!lowHealth) {
    const corner = fixture();
    corner.data.position.x = 0.15;
    corner.data.spawn = { ...corner.data.position };
    corner.data.vitals.health = 12;
    corner.data.inventory[1] = null;
    corner.data.inventory[2] = null;
    for (let z = 1; z <= 4; z++) for (let y = 35; y <= 38; y++) corner.put(-1, y, z, 10);
    corner.data.creatures = [mob(1, 0.5, 35, 7)];
    corner.data.nextId = 2;
    await load(corner.data, "off-center-house-corner");
    hunter = createModernHunting(page, d, a, {
      arrowReserve: Infinity,
      debugNavigation: true,
      onEvent: (event) => trace.push(event),
    });
    hunter.activate();
    await hunter.guard();
    assert.ok((await d.info()).health > 0);
    assert.ok(!(await a.adventure()).creatures.some((m) => m.id === 1));
    await page.screenshot({ path: path.join(out, "corner-melee-victory.png") });
    results.push({
      name: "off-center house corner with12HP and no bow",
      health: (await d.info()).health,
      stats: { ...hunter.stats },
    });
    console.log(
      "PASS full-body BFS centers off the corner and defeats the shooting skeleton with melee",
    );
    hunter.deactivate();
  }
  const cliffs = fixture();
  if (lowHealth) cliffs.data.vitals.health = 6;
  for (let x = 4; x <= 8; x++)
    for (let z = -1; z <= 6; z++) for (let y = 35; y <= 39; y++) cliffs.put(x, y, z, 3);
  for (let z = -1; z <= 6; z++) for (let y = 40; y <= 42; y++) cliffs.put(5, y, z, 3);
  cliffs.data.creatures = [mob(1, 4.35, 40, 0.5), mob(2, 4.35, 40, 3.5)];
  cliffs.data.nextId = 3;
  await load(cliffs.data, "two-high-ledge-skeletons");
  hunter = createModernHunting(page, d, a, { arrowReserve: 0 });
  hunter.activate();
  await hunter.guard();
  await wait(500);
  assert.ok((await d.info()).health > 0);
  assert.ok(!(await a.adventure()).creatures.some((m) => m.id === 1 || m.id === 2));
  assert.ok(hunter.stats.arrowsSpent >= 4);
  assert.ok(hunter.stats.shootingStrafes > 0, "bow shots include verified dry lateral movement");
  assert.equal(
    hunter.stats.terrainFallbacks,
    0,
    "no blocking terrain work while shooters are active",
  );
  await page.screenshot({ path: path.join(out, "ledge-bow-victory.png") });
  results.push({
    name: lowHealth
      ? "two skeletons five blocks higher, initial health6"
      : "two skeletons five blocks higher",
    health: (await d.info()).health,
    stats: { ...hunter.stats },
  });
  console.log("PASS immediate bow defeats two elevated shooters without blocking terrain mining");
  writeFileSync(
    path.join(out, "proof.json"),
    JSON.stringify({ fixtureBased: true, results }, null, 2),
  );
} catch (error) {
  await page.screenshot({ path: path.join(out, "failure.png") });
  writeFileSync(
    path.join(out, "failure.json"),
    JSON.stringify(
      {
        error: String(error),
        info: await d.info(),
        adventure: await a.adventure(),
        stats: hunter?.stats,
        trace,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
