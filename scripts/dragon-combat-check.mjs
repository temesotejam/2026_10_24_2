/** Explicit End fixtures test combat regressions using real browser controls.
 * These imports are never represented as zero-item survival playthroughs. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { createDriver, wait } from "./lib/survival-driver.mjs";
import { createAdventureDriver } from "./lib/adventure-driver.mjs";
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const url = new URL(option("--url", "http://127.0.0.1:4173/2026_10_24_2/"));
url.searchParams.set("seed", "2026");
url.searchParams.set("mode", "survival");
const out = path.resolve(option("--out", "visual-check/dragon-combat"));
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
  await page.setViewport({ width: 960, height: 540 });
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
  const put = (data, x, y, z, id) => {
    const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
    const index = (y * 16 + (((z % 16) + 16) % 16)) * 16 + (((x % 16) + 16) % 16);
    (data.edits[key] ??= {})[index] = id;
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
  const shelter = fixture();
  for (let x = -2; x <= 2; x++) for (let y = 34; y <= 38; y++) put(shelter, x, y, 2, 3);
  await load(shelter, "dragon-shelter-fixture");
  await wait(2200);
  assert.equal((await d.info()).health, 20, "a solid wall blocks the dragon attack");
  await page.screenshot({ path: path.join(out, "sheltered.png") });
  await d.equip("iron_pick");
  await d.mine({ x: 0, y: 35, z: 2 });
  await page.waitForFunction(() => window.__mc.health() < 20, { timeout: 8000 });
  report("dragon attack is blocked by shelter and resumes after mining an opening");

  const removeCrystals = (data) => {
    for (let index = 0; index < 6; index++)
      put(
        data,
        Math.round(Math.cos((index * Math.PI) / 3) * 16),
        39 + (index % 3) * 2,
        Math.round(Math.sin((index * Math.PI) / 3) * 16),
        0,
      );
  };
  const behind = fixture();
  removeCrystals(behind);
  put(behind, 0, 35, -1, 3);
  await load(behind, "wall-behind-dragon-fixture");
  await d.equip("iron_sword");
  await d.aim({ x: 0, y: 35.5, z: 0 });
  await page.mouse.down();
  await wait(150);
  await page.mouse.up();
  assert.ok(
    (await a.adventure()).dragon.health === maximum - 6,
    "a wall behind contact does not block a valid swing",
  );
  report("normal melee hits the dragon when a wall is behind its visible body");

  const far = fixture();
  removeCrystals(far);
  far.position.z = 5.6;
  far.spawn = { ...far.position };
  await load(far, "out-of-melee-reach-fixture");
  await d.equip("iron_sword");
  await d.aim({ x: 0, y: 35.5, z: 0 });
  await page.mouse.down();
  await wait(150);
  await page.mouse.up();
  assert.equal(
    (await a.adventure()).dragon.health,
    maximum,
    "melee cannot exceed three blocks to contact",
  );
  report("a sword swing beyond actual melee reach does not damage the dragon");

  const flight = fixture();
  flight.adventure.dragon.phase = 8.8;
  flight.position = { x: 24, y: 34, z: 0 };
  flight.spawn = { ...flight.position };
  await load(flight, "continuous-landing-fixture");
  const samples = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const samples = [],
          start = window.performance.now();
        function frame(time) {
          samples.push({ time: time / 1000, p: window.__mc.adventure().dragonPosition });
          if (time - start >= 6500) resolve(samples);
          else window.requestAnimationFrame(frame);
        }
        window.requestAnimationFrame(frame);
      }),
  );
  const speeds = samples.slice(1).map((sample, i) => {
    const prev = samples[i];
    return (
      Math.hypot(sample.p.x - prev.p.x, sample.p.y - prev.p.y, sample.p.z - prev.p.z) /
      (sample.time - prev.time)
    );
  });
  assert.ok(samples.length > 20, "observe actual rendered landing frames");
  assert.ok(
    Math.max(...speeds) < 22,
    `no landing teleport; observed maximum speed ${Math.max(...speeds)}`,
  );
  await page.screenshot({ path: path.join(out, "landed.png") });
  report("observed landing stays continuous in the real browser simulation");
  let fullBattle;
  if (args.includes("--full-battle")) {
    const battle = fixture();
    battle.position = { x: 0.5, y: 34, z: 10 };
    battle.spawn = { ...battle.position };
    battle.adventure.dragon.phase = 0;
    battle.inventory[2] = { id: "bow", count: 1, durability: 385 };
    battle.inventory[3] = { id: "arrow", count: 24 };
    battle.inventory[4] = { id: "bread", count: 12 };
    await load(battle, "full-dragon-battle-fixture");
    await a.defeatDragon();
    fullBattle = {
      maximumHealth: maximum,
      finalHealth: (await d.info()).health,
      dragon: (await a.adventure()).dragon,
      eggCount: await d.count("dragonEgg"),
      arrowsConsumed: 24 - (await d.count("arrow")),
    };
    assert.ok(
      fullBattle.finalHealth > 0 && fullBattle.dragon.defeated && fullBattle.eggCount === 1,
    );
    assert.ok(fullBattle.arrowsConsumed >= 6);
    await page.screenshot({ path: path.join(out, "full-battle-victory.png") });
    report(
      "normal-input survival battle destroys six crystals, recovers with food and defeats the full-health dragon",
    );
  }
  writeFileSync(
    path.join(out, "proof.json"),
    JSON.stringify(
      {
        fixtureBased: true,
        fullBattle,
        checks,
        landingSamples: samples.length,
        maximumLandingSpeed: Math.max(...speeds),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
