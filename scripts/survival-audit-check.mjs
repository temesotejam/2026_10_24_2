/** Explicit gen3 regression fixture. This is NOT a zero-inventory survival run. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { createDriver, wait } from "./lib/survival-driver.mjs";
const at = process.argv.indexOf("--url");
const url = new URL(at >= 0 ? process.argv[at + 1] : "http://127.0.0.1:4173/2026_10_24_2/");
url.searchParams.set("seed", "20261029");
url.searchParams.set("mode", "survival");
const out = path.resolve("visual-check/survival-audit");
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 540 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const d = createDriver(page, out);
  const boot = () =>
    page.waitForFunction(
      () =>
        window.__mc &&
        window.__mc.meshedChunks() >= (window.__mc.adventure().dimension === "end" ? 24 : 60),
      { timeout: 120000 },
    );
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await boot();
  assert.equal(await page.evaluate(() => window.__mc.adventure().generator), 3);
  assert.ok((await d.info()).inventory.every((s) => s === null));
  await page.locator("#save-button").click();
  await page.waitForFunction(
    () => document.querySelector("#save-status").textContent === "保存済み",
  );
  const stored = () =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = window.indexedDB.open("classic-voxel-survival", 1);
          r.onerror = () => reject(r.error);
          r.onsuccess = () => {
            const db = r.result;
            const get = db.transaction("worlds").objectStore("worlds").get("20261029:survival");
            get.onsuccess = () => {
              resolve(get.result);
              db.close();
            };
          };
        }),
    );
  const fixture = await stored();
  fixture.position = { x: 1.5, y: 34, z: 3.5 };
  fixture.spawn = { ...fixture.position };
  fixture.yaw = 0;
  fixture.pitch = 0;
  fixture.time = 300;
  fixture.creatures = [];
  fixture.loot = [];
  fixture.fluidLevels = {};
  fixture.edits = {};
  fixture.inventory = Array.from({ length: 36 }, () => null);
  fixture.inventory[0] = { id: "flintSteel", count: 1, durability: 65 };
  fixture.inventory[1] = { id: "enderEye", count: 3 };
  const put = (x, y, z, id) => {
    const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`,
      index = (y * 16 + (((z % 16) + 16) % 16)) * 16 + (((x % 16) + 16) % 16);
    (fixture.edits[key] ??= {})[index] = id;
  };
  for (let x = -5; x <= 7; x++)
    for (let z = -5; z <= 7; z++) for (let y = 33; y < 96; y++) put(x, y, z, y === 33 ? 3 : 0);
  for (let u = 0; u < 4; u++)
    for (let v = 0; v < 5; v++)
      put(u, 33 + v, 0, u === 0 || u === 3 || v === 0 || v === 4 ? 28 : 0);
  const file = path.join(out, "explicit-portal-fixture.json");
  writeFileSync(file, JSON.stringify(fixture));
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  const reload = page.waitForNavigation({ waitUntil: "domcontentloaded" });
  await (await page.$("#import-file")).uploadFile(file);
  await reload;
  await boot();
  await page.select("#render-scale", "0.25");
  await page.locator("#play-button").click();
  await page.waitForFunction(() => window.__mc.mode() === "pointer");
  const right = async () => {
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
  };
  await d.aim({ x: 0.5, y: 35, z: 0.5 });
  await right();
  assert.equal(
    await d.block({ x: 1, y: 34, z: 0 }),
    31,
    "player ignites a complete obsidian frame",
  );
  await page.keyboard.press("Digit3");
  await d.aim({ x: 1.5, y: 35, z: 0.5 });
  await right();
  await wait(600);
  assert.equal(
    await page.evaluate(() => window.__mc.adventure().dimension),
    "overworld",
    "right clicking does not teleport",
  );
  const enter = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 });
  await d.walk(1.5, 0.5, false, 0.15);
  await enter;
  await boot();
  const arrival = await page.evaluate(() => ({
    position: window.__mc.position(),
    adventure: window.__mc.adventure(),
    inventory: window.__mc.inventory(),
  }));
  assert.equal(arrival.adventure.dimension, "nether");
  assert.ok(Math.abs(arrival.position.x) < 16 && Math.abs(arrival.position.z) < 16);
  assert.equal(arrival.inventory[1]?.id, "enderEye", "paid inventory survives travel");
  await page.select("#render-scale", "0.25");
  await page.locator("#play-button").click();
  await page.waitForFunction(() => window.__mc.mode() === "pointer");
  await page.screenshot({ path: path.join(out, "arrival.png") });
  const target = await page.evaluate(() => {
    const mc = window.__mc,
      p = mc.position(),
      cells = [];
    for (let x = Math.floor(p.x) - 7; x <= Math.floor(p.x) + 7; x++)
      for (let z = Math.floor(p.z) - 7; z <= Math.floor(p.z) + 7; z++)
        for (let y = Math.floor(p.y) - 1; y <= Math.floor(p.y) + 3; y++)
          if (mc.blockAt(x, y, z) === 31) cells.push({ x, y, z });
    const bottom = Math.min(...cells.map((c) => c.y));
    return cells
      .filter((c) => c.y === bottom)
      .map((c) => ({ x: c.x + 0.5, y: c.y, z: c.z + 0.5 }))[0];
  });
  assert.ok(target, "arrival creates a real return portal after entry");
  const returning = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 });
  await d.walk(target.x, target.z, false, 0.15);
  await returning;
  await boot();
  assert.equal(await page.evaluate(() => window.__mc.adventure().dimension), "overworld");
  const back = await d.info();
  assert.ok(
    Math.abs(back.position.x - 1.5) < 3 && Math.abs(back.position.z - 0.5) < 3,
    "return reuses source frame rather than fixed origin",
  );
  await page.screenshot({ path: path.join(out, "returned.png") });
  // A separate dead-session fixture checks the real respawn button lifecycle.
  await page.locator("#save-button").click();
  await page.waitForFunction(
    () => document.querySelector("#save-status").textContent === "保存済み",
  );
  const dead = await stored();
  const fields = [
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
  dead.adventure.realms.overworld = Object.fromEntries(
    fields.map((key) => [key, globalThis.structuredClone(dead[key])]),
  );
  const nether = dead.adventure.realms.nether;
  assert.ok(nether);
  for (const key of fields) dead[key] = globalThis.structuredClone(nether[key]);
  dead.adventure.dimension = "nether";
  dead.vitals.health = 0;
  dead.inventory = Array.from({ length: 36 }, () => null);
  const deadFile = path.join(out, "explicit-dead-nether-fixture.json");
  writeFileSync(deadFile, JSON.stringify(dead));
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  const deadReload = page.waitForNavigation({ waitUntil: "domcontentloaded" });
  await (await page.$("#import-file")).uploadFile(deadFile);
  await deadReload;
  await boot();
  await page.waitForSelector("#death-panel:not([hidden])");
  const respawned = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 });
  await page.locator("#respawn").click();
  await respawned;
  await boot();
  assert.equal(await page.evaluate(() => window.__mc.adventure().dimension), "overworld");
  const restored = await d.info();
  assert.equal(restored.health, 20);
  assert.ok(restored.inventory.every((slot) => slot === null));
  assert.ok(Math.hypot(restored.position.x - 1.5, restored.position.z - 3.5) < 4);
  await page.screenshot({ path: path.join(out, "respawned-overworld.png") });
  // A low-health final-hit fixture isolates exit placement and player choice.
  await page.locator("#save-button").click();
  await page.waitForFunction(
    () => document.querySelector("#save-status").textContent === "保存済み",
  );
  const end = await stored();
  end.adventure.realms.overworld = Object.fromEntries(
    fields.map((key) => [key, globalThis.structuredClone(end[key])]),
  );
  end.adventure.dimension = "end";
  end.adventure.dragon = { health: 6, phase: 18, defeated: false };
  end.position = { x: 0.5, y: 34, z: 4 };
  end.spawn = { x: 0.5, y: 34, z: 8 };
  end.yaw = 0;
  end.pitch = 0;
  end.edits = {};
  end.chests = {};
  end.furnaces = {};
  end.growth = {};
  end.creatures = [];
  end.loot = [];
  end.arrows = [];
  end.fluidLevels = {};
  end.nextId = 1;
  end.inventory = Array.from({ length: 36 }, () => null);
  end.inventory[0] = { id: "iron_sword", count: 1, durability: 251 };
  end.selected = 0;
  for (let i = 0; i < 6; i++) {
    const x = Math.round(Math.cos((i * Math.PI) / 3) * 16),
      z = Math.round(Math.sin((i * Math.PI) / 3) * 16),
      y = 39 + (i % 3) * 2;
    const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`,
      index = (y * 16 + (((z % 16) + 16) % 16)) * 16 + (((x % 16) + 16) % 16);
    (end.edits[key] ??= {})[index] = 0;
  }
  const endFile = path.join(out, "explicit-final-hit-fixture.json");
  writeFileSync(endFile, JSON.stringify(end));
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  const endReload = page.waitForNavigation({ waitUntil: "domcontentloaded" });
  await (await page.$("#import-file")).uploadFile(endFile);
  await endReload;
  await boot();
  await page.select("#render-scale", "0.25");
  await page.locator("#play-button").click();
  await page.waitForFunction(() => window.__mc.mode() === "pointer");
  await d.aim({ x: 0, y: 35.5, z: 0 });
  await page.mouse.down();
  await wait(120);
  await page.mouse.up();
  await page.waitForFunction(() => window.__mc.adventure().dragon.defeated);
  await wait(400);
  assert.equal(
    await page.evaluate(() => window.__mc.adventure().dimension),
    "end",
    "victory does not force an automatic exit under the player",
  );
  assert.equal(await d.block({ x: 0, y: 34, z: 0 }), 40);
  assert.equal(await d.block({ x: 0, y: 34, z: 4 }), 0);
  await page.screenshot({ path: path.join(out, "chosen-exit.png") });
  await d.aim({ x: 0.5, y: 35.62, z: 0.5 });
  const exit = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 });
  await page.keyboard.down("KeyW");
  await exit;
  await page.keyboard.up("KeyW");
  await boot();
  assert.equal(await page.evaluate(() => window.__mc.adventure().dimension), "overworld");
  assert.equal(
    (await d.info()).inventory
      .filter((slot) => slot?.id === "dragonEgg")
      .reduce((sum, slot) => sum + slot.count, 0),
    1,
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify(
      {
        fixture: true,
        freshDefaultGenerator: 3,
        contactTravel: true,
        rightClickNoTeleport: true,
        deadNetherRespawnsInOverworld: true,
        victoryExitRequiresPlayerEntry: true,
        scaledArrival: arrival.position,
        returnPosition: back.position,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS revision3 fresh defaults, real ignition, contact-only Nether travel, scaled safe arrival, return-link reuse inventory preservation and Overworld respawn after Nether death (explicit fixtures)",
  );
} finally {
  await browser.close();
}
