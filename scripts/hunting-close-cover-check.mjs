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

const forced = args.includes("--force-cover");
const url = new URL(at < 0 ? "http://127.0.0.1:4173/2026_10_24_2/" : args[at + 1]);
url.searchParams.set("seed", "2026");
url.searchParams.set("mode", "survival");
const out = path.resolve(
  forced ? "visual-check/hunting-close-obstruction" : "visual-check/hunting-close-cover",
);
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
  for (let x = -2; x <= 3; x++) cover.put(x, 35, 3, 3);
  for (let x = -2; x <= 4; x++) for (let y = 35; y <= 37; y++) cover.put(x, y, 10, 3);
  cover.data.creatures = [mob(1, 0.5, 35, 4.5), mob(2, 2.5, 35, 4.5)];
  cover.data.nextId = 3;
  if (forced) {
    for (let x = -2; x <= 4; x++) for (let y = 35; y <= 38; y++) cover.put(x, y, 5, 3);
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 2; z++) cover.put(x, 37, z, 3);
    for (let z = -1; z <= 1; z++) for (const x of [-1, 1]) cover.put(x, 35, z, 3);
    for (let x = -1; x <= 1; x++) for (const z of [-1, 1]) cover.put(x, 35, z, 3);
  }

  await load(cover.data, "two-near-skeletons-low-cover");
  hunter = createModernHunting(page, d, a, {
    arrowReserve: forced ? 8 : 0,
    onEvent: (event) => trace.push(event),
  });
  if (forced) {
    const ordinaryAim = d.aim;
    d.aim = async (...args) => {
      await ordinaryAim(...args);
      trace.push({ aim: args[0], hit: await page.evaluate(() => window.__mc.target()) });
    };
  }
  hunter.activate();
  let checkpoint = null;
  try {
    await hunter.guard();
  } catch (error) {
    if (!forced) throw error;
    checkpoint = String(error);
  }
  if (forced) {
    console.log(JSON.stringify({ checkpoint, trace, stats: hunter.stats }));
    assert.ok(
      hunter.stats.closeObstructionsBroken >= 1,
      "normal-input fallback removes the actual near cover",
    );
    assert.ok((await d.info()).health > 0, "checkpoint survives the blocked withdrawal");
    for (let x = -2; x <= 4; x++)
      for (let y = 35; y <= 37; y++)
        assert.equal(await d.block({ x, y, z: 10 }), 3, "backdrop remains intact");
    for (let x = -2; x <= 4; x++)
      for (let y = 35; y <= 38; y++)
        assert.equal(
          await d.block({ x, y, z: 5 }),
          3,
          "even nearby backdrop behind the body is preserved",
        );
    results.push({
      name: "forced close obstruction in a low-ceiling enclosure",
      checkpoint,
      health: (await d.info()).health,
      stats: { ...hunter.stats },
      trace,
    });
    console.log(
      JSON.stringify({ checkpoint, health: (await d.info()).health, stats: hunter.stats, trace }),
    );
    await page.screenshot({ path: path.join(out, "checkpoint.png") });
  } else {
    assert.ok((await d.info()).health > 0, "survive two nearby skeletons over low stone cover");
    assert.ok(
      !(await a.adventure()).creatures.some((m) => m.id === 1 || m.id === 2),
      "defeat both actual fixture skeletons",
    );
    for (let x = -2; x <= 4; x++)
      for (let y = 35; y <= 37; y++)
        assert.equal(await d.block({ x, y, z: 10 }), 3, "leave backdrop behind enemies intact");
    await page.screenshot({ path: path.join(out, "victory.png") });
    results.push({
      name: "two close skeletons with low stone cover, bow8, sword and diamond pick",
      health: (await d.info()).health,
      stats: { ...hunter.stats },
      trace,
    });
    console.log(JSON.stringify(results));
  }
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
