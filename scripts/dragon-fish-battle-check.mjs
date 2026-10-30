/** Explicit End fixtures test combat regressions using real browser controls.
 * These imports are never represented as zero-item survival playthroughs. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { setInterval, clearInterval } from "node:timers";
import { createDriver } from "./lib/survival-driver.mjs";
import { createAdventureDriver } from "./lib/adventure-driver.mjs";
import { createModernHunting } from "./lib/modern-hunting.mjs";
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const url = new URL(option("--url", "http://127.0.0.1:4173/2026_10_24_2/"));
url.searchParams.set("seed", "2026");
url.searchParams.set("mode", "survival");
const out = path.resolve(option("--out", "visual-check/dragon-fish-battle"));
const ammunition = Number(option("--arrows", "24"));
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const page = await browser.newPage();
const d = createDriver(page, out),
  a = createAdventureDriver(page, d);
const checks = [];
const report = (name) => {
  checks.push(name);
  console.log(`PASS ${name}`);
};
const realmFields = [
  "position",
  "spawn",
  "yaw",
  "pitch",
  "edits",
  "chests",
  "furnaces",
  "growth",
  "creatures",
  "loot",
  "arrows",
  "fluidLevels",
  "nextId",
];
try {
  await page.setViewport({ width: 640, height: 360 });
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await a.boot();
  await page.locator("#save-button").click();
  await page.waitForFunction(
    () => document.querySelector("#save-status").textContent === "保存済み",
  );
  const base = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = window.indexedDB.open("classic-voxel-survival", 1);
        request.onsuccess = () => {
          const db = request.result;
          const get = db.transaction("worlds").objectStore("worlds").get("2026:survival");
          get.onsuccess = () => {
            resolve(get.result);
            db.close();
          };
          get.onerror = () => reject(get.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
  const maximum = base.generator >= 3 ? 200 : 120;
  assert.equal(maximum, 200, "test the current generator3 two-hundred-HP boss");
  const fixture = () => {
    const data = globalThis.structuredClone(base);
    data.adventure.realms.overworld = Object.fromEntries(
      realmFields.map((key) => [key, globalThis.structuredClone(data[key])]),
    );
    data.adventure.dimension = "end";
    data.adventure.dragon = { health: maximum, phase: 13, defeated: false };
    data.position = { x: 0.5, y: 34, z: 4.5 };
    data.spawn = { ...data.position };
    data.yaw = 0;
    data.pitch = 0;
    data.inventory = Array.from({ length: 36 }, () => null);
    data.inventory[0] = { id: "iron_sword", count: 1, durability: 251 };
    data.inventory[1] = { id: "iron_pick", count: 1, durability: 251 };
    data.creatures = [];
    data.loot = [];
    data.arrows = [];
    data.edits = {};
    data.time = 300;
    return data;
  };
  async function load(data, name) {
    if (await page.evaluate(() => window.__mc.mode() !== "idle")) {
      await page.evaluate(() => document.exitPointerLock());
      await page.waitForFunction(() => window.__mc.mode() === "idle");
    }
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
  const battle = fixture();
  battle.position = { x: 0.5, y: 34, z: 10 };
  battle.spawn = { ...battle.position };
  battle.adventure.dragon.phase = 0;
  battle.inventory[0] = { id: "iron_sword", count: 1, durability: 161 };
  battle.inventory[1] = { id: "diamond_pick", count: 1, durability: 800 };
  battle.inventory[2] = { id: "bow", count: 1, durability: 287 };
  battle.inventory[3] = { id: "arrow", count: ammunition };
  battle.inventory[4] = { id: "fish", count: 20 };
  await load(battle, "full-boss-raw-fish-fixture");
  const hunter = createModernHunting(page, d, a);
  hunter.activate();
  const samples = [],
    started = Date.now();
  let lastHealth = 201;
  const timer = setInterval(async () => {
    try {
      const info = await d.info(),
        state = await a.adventure();
      samples.push({
        elapsed: Date.now() - started,
        health: info.health,
        dragon: state.dragon,
        position: info.position,
        fish: await d.count("fish"),
        creatures: state.creatures.length,
      });
      writeFileSync(path.join(out, "progress.json"), JSON.stringify(samples, null, 2));
      if (state.dragon.health !== lastHealth) {
        lastHealth = state.dragon.health;
        console.log(JSON.stringify(samples.at(-1)));
      }
    } catch {
      /* Allow samples to skip navigation boundaries. */
    }
  }, 2000);
  try {
    await a.defeatDragon({ timeoutMs: 600000 });
    const info = await d.info(),
      state = await a.adventure();
    const result = {
      fixtureBased: true,
      elapsed: Date.now() - started,
      health: info.health,
      dragon: state.dragon,
      egg: await d.count("dragonEgg"),
      fishConsumed: 20 - (await d.count("fish")),
      arrowsConsumed: ammunition - (await d.count("arrow")),
      inventory: info.inventory,
      hunterStats: hunter.stats,
      samples,
    };
    assert.ok(info.health > 0 && state.dragon.defeated && result.egg === 1);
    assert.ok(result.arrowsConsumed >= 6 && result.arrowsConsumed <= ammunition);
    await page.screenshot({ path: path.join(out, "victory.png") });
    writeFileSync(path.join(out, "proof.json"), JSON.stringify(result, null, 2));
    report("200HP full battle with raw fish20, sword161, bow287 and arrows24");
    console.log(JSON.stringify({ ...result, samples: undefined }));
  } catch (error) {
    writeFileSync(
      path.join(out, "failure.json"),
      JSON.stringify(
        { error: String(error), info: await d.info(), adventure: await a.adventure(), samples },
        null,
        2,
      ),
    );
    await page.screenshot({ path: path.join(out, "failure.png") });
    throw error;
  } finally {
    clearInterval(timer);
  }
} finally {
  await browser.close();
}
