/** Imported regression fixtures, never mixed into the ordinary survival film. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { createDriver } from "./lib/survival-driver.mjs";
import { createAdventureDriver } from "./lib/adventure-driver.mjs";
import { run as emergency } from "./missions/phase-4.88.mjs";
const args = process.argv.slice(2),
  at = args.indexOf("--url");

const url = new URL(at < 0 ? "http://127.0.0.1:4173/2026_10_24_2/" : args[at + 1]);
url.searchParams.set("seed", "2026");
url.searchParams.set("mode", "survival");
const out = path.resolve("visual-check/emergency-archer");
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
  const cover = fixture();
  cover.data.vitals.health = 3;
  cover.data.inventory[0] = { id: "bow", count: 1, durability: 300 };
  cover.data.inventory[1] = { id: "arrow", count: 8 };
  cover.data.inventory[7] = { id: "iron_sword", count: 1, durability: 9 };
  cover.data.inventory[28] = { id: "iron_sword", count: 1, durability: 176 };
  cover.data.creatures = [mob(1, 7.5, 35, 0.5)];
  cover.data.nextId = 2;
  cover.data.arrows = [
    { position: { x: 2, y: 35.9, z: 0.5 }, velocity: { x: -10, y: 0, z: 0 }, age: 0 },
  ];
  // Load paused; the mission owns the sole Play input.
  const file = path.join(out, "three-hp-seven-meter-archer.json");
  writeFileSync(file, JSON.stringify(cover.data));
  page.once("dialog", (dialog) => void dialog.accept());
  const nav = page.waitForNavigation({ waitUntil: "domcontentloaded" });
  await (await page.$("#import-file")).uploadFile(file);
  await nav;
  await a.boot();
  await page.select("#render-scale", "0.25");
  const meta = {};
  await emergency({ page, d, a, meta });
  const info = await d.info();
  assert.ok(info.health > 0);
  assert.ok(!(await a.adventure()).creatures.some((m) => m.id === 1));
  results.push({ fixtureBased: true, info, result: meta.emergencyArcher });
  console.log(
    JSON.stringify({
      health: info.health,
      position: info.position,
      shots: meta.emergencyArcher.shots,
    }),
  );
  await page.screenshot({ path: path.join(out, "survived.png") });
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
