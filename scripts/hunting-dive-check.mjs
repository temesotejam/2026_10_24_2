/** Imported regression fixtures, never mixed into the ordinary survival film. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { createDriver } from "./lib/survival-driver.mjs";
import { createAdventureDriver } from "./lib/adventure-driver.mjs";
import { run as diveMission } from "./missions/phase-4.85.mjs";
const angry = process.argv.includes("--angry");
const args = process.argv.slice(2),
  at = args.indexOf("--url");

const url = new URL(at < 0 ? "http://127.0.0.1:4173/2026_10_24_2/" : args[at + 1]);
url.searchParams.set("seed", "2026");
url.searchParams.set("mode", "survival");
const out = path.resolve(angry ? "visual-check/hunting-dive-angry" : "visual-check/hunting-dive");
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const page = await browser.newPage(),
  d = createDriver(page, out),
  a = createAdventureDriver(page, d),
  results = [];

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
  for (let x = -12; x <= 12; x++)
    for (let z = -12; z <= 12; z++)
      for (let y = 25; y <= 35; y++)
        cover.put(
          x,
          y,
          z,
          y <= 27 ? 3 : y <= 32 ? (Math.abs(x) <= 3 && Math.abs(z) <= 3 ? 5 : 3) : 0,
        );
  cover.data.position = { x: 0.5, y: 33, z: -4.5 };
  cover.data.spawn = { ...cover.data.position };
  cover.data.inventory[5] = { id: "enderPearl", count: 11 };
  const wanderer = mob(1, 0.5, 28, 0.5);
  wanderer.species = "wanderer";
  if (angry) {
    for (let x = -3; x <= 3; x++)
      for (let z = -3; z <= 3; z++) for (let y = 28; y <= 31; y++) cover.put(x, y, z, 3);
    cover.data.vitals.health = 17;
    wanderer.position = { x: 0.5, y: 32, z: -2.5 };
    wanderer.hp = 10;
    wanderer.fuse = 2;
  }
  cover.data.creatures = [wanderer];
  cover.data.nextId = 2;
  await load(cover.data, "shallow-water-wanderer");
  const meta = {};
  await diveMission({ page, d, a, meta });
  const info = await d.info();
  assert.ok(
    !(await a.adventure()).creatures.some((m) => m.id === 1),
    "defeat the genuinely submerged fixture wanderer using ordinary inputs",
  );
  assert.ok(info.health >= 12, "return above water alive");
  assert.ok(
    meta.shallowWaterHunt.events.some((e) =>
      angry
        ? e.name === "direct nearby self-defense"
        : e.name === "controlled dive complete" && e.defeated,
    ),
  );
  if (angry)
    assert.ok(info.health >= 17, "defend before exposing the injured player to a full-health wait");
  results.push({ fixtureBased: true, info, meta });
  console.log(
    JSON.stringify({
      health: info.health,
      position: info.position,
      events: meta.shallowWaterHunt.events,
    }),
  );
  await page.screenshot({ path: path.join(out, "surfaced.png") });
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
        stats: null,
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
