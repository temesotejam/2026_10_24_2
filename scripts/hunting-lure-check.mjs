/** Imported regression fixtures, never mixed into the ordinary survival film. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { createDriver } from "./lib/survival-driver.mjs";
import { createAdventureDriver } from "./lib/adventure-driver.mjs";
import { createModernHunting } from "./lib/modern-hunting.mjs";
const args = process.argv.slice(2),
  at = args.indexOf("--url");

const url = new URL(at < 0 ? "http://127.0.0.1:4173/2026_10_24_2/" : args[at + 1]);
url.searchParams.set("seed", "2026");
url.searchParams.set("mode", "survival");
const out = path.resolve("visual-check/hunting-lure");
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
    data.inventory[2] = { id: "arrow", count: 8 };
    data.inventory[3] = { id: "bread", count: 12 };
    data.inventory[4] = { id: "diamond_pick", count: 1, durability: 1562 };
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
  const cover = fixture();
  cover.data.inventory[2].count = 26;
  const wanderer = mob(1, 0.5, 35, 12.5);
  wanderer.species = "wanderer";
  cover.data.creatures = [wanderer];
  cover.data.nextId = 2;
  await load(cover.data, "passive-wanderer-twelve-meters");
  hunter = createModernHunting(page, d, a, { onEvent: (event) => trace.push(event) });
  hunter.activate();
  let noPearlTimeout = false;
  try {
    await hunter.gather(
      { enderPearl: 1 },
      { timeoutMs: 18000, arrowReserve: 12, patrol: false, cullForSpawns: false },
    );
  } catch (error) {
    if (!String(error).includes("natural-spawn hunting timed out")) throw error;
    noPearlTimeout = true;
  }
  const info = await d.info();
  assert.ok(
    !(await a.adventure()).creatures.some((m) => m.id === 1),
    "the normally shot wanderer approaches and is defeated",
  );
  assert.equal(hunter.stats.wanderersLured, 1);
  assert.equal(hunter.stats.arrowsSpent, 1, "only the aggro arrow is spent");
  assert.equal(hunter.stats.patrols, 0, "patrol:false keeps the waiting player at camp");
  assert.ok((await d.count("arrow")) >= 12, "preserve the requested reserve");
  assert.ok(
    Math.hypot(info.position.x - 0.5, info.position.z - 0.5) < 6,
    "finish near camp instead of chasing the distant spawn",
  );
  assert.equal(info.health, 20);
  results.push({ fixtureBased: true, noPearlTimeout, info, stats: { ...hunter.stats }, trace });
  console.log(
    JSON.stringify({
      health: info.health,
      position: info.position,
      stats: hunter.stats,
      noPearlTimeout,
      trace,
    }),
  );
  await page.screenshot({ path: path.join(out, "victory.png") });
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
