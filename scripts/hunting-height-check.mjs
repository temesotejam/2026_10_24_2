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
const out = path.resolve("visual-check/hunting-height");
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
    data.inventory[2] = { id: "cobble", count: 24 };
    data.inventory[4] = { id: "iron_pick", count: 1, durability: 251 };
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
    species: "chicken",
    position: { x, y, z },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    hp: 4,
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
  for (const scenario of [
    "under-two-block-floor",
    "above-four-block-platform",
    "under-unsafe-eight-block-drop",
  ]) {
    const f = fixture();
    const unsafe = scenario.includes("unsafe");
    const y = unsafe ? 27 : scenario.startsWith("under") ? 33 : 39;
    if (scenario.startsWith("under")) {
      // Last descent has dy=-2; one overhead block and a one-block cavity.
      for (let x = -3; x <= 3; x++)
        for (let z = -3; z <= 3; z++) {
          f.put(x, y - 1, z, 3);
          for (let air = y; air <= 33; air++)
            f.put(x, air, z, Math.abs(x) === 3 || Math.abs(z) === 3 ? 3 : 0);
        }
    } else {
      for (let x = -2; x <= 2; x++)
        for (let z = -2; z <= 2; z++) {
          f.put(x, 38, z, 3);
          if (Math.abs(x) === 2 || Math.abs(z) === 2)
            for (let wall = 39; wall <= 41; wall++) f.put(x, wall, z, 3);
        }
    }
    f.data.creatures = [mob(1, 0.5, y, 0.5), mob(2, 1.5, y, 0.5), mob(3, -0.5, y, 0.5)];
    f.data.nextId = 4;
    await load(f.data, scenario);
    hunter = createModernHunting(page, d, a, {
      arrowReserve: Infinity,
      debugNavigation: true,
      onEvent: (event) => {
        trace.push(event);
      },
    });
    const start = Date.now();
    if (unsafe) {
      await assert.rejects(
        hunter.gather({ feather: 1 }, { timeoutMs: 5000, cullForSpawns: false }),
        /natural-spawn hunting timed out/,
      );
      assert.equal(await d.block({ x: 0, y: 34, z: 0 }), 3);
      assert.equal((await d.info()).position.y, 35);
      assert.equal((await d.info()).health, 20);
      results.push({
        scenario,
        elapsedMs: Date.now() - start,
        safelySkipped: true,
        info: await d.info(),
        stats: hunter.stats,
      });
      await page.screenshot({ path: path.join(out, `${scenario}.png`) });
      console.log(`PASS ${scenario}: floor intact, safe timeout`);
      continue;
    }
    const gathered = await hunter.gather(
      { feather: 1 },
      { timeoutMs: 120000, cullForSpawns: false },
    );
    assert.ok((await d.info()).health > 0);
    assert.ok((await d.count("feather")) >= 1);
    await page.screenshot({ path: path.join(out, `${scenario}.png`) });
    results.push({ scenario, elapsedMs: Date.now() - start, gathered, info: await d.info() });
    writeFileSync(
      path.join(out, "progress.json"),
      JSON.stringify({ fixtureBased: true, results }, null, 2),
    );
    console.log(`PASS ${scenario}`);
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
