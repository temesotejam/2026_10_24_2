/** Explicit isolated furnace fixture; never part of the survival recording. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { createDriver } from "./lib/survival-driver.mjs";
import { createAdventureDriver } from "./lib/adventure-driver.mjs";
import { cookCarriedMeat } from "./lib/modern-resources.mjs";
const args = process.argv.slice(2);
const option = (key, fallback) => (args.includes(key) ? args[args.indexOf(key) + 1] : fallback);
const out = path.resolve(option("--out", "/tmp/cooking-check"));
const url = new URL(option("--url", "http://127.0.0.1:4173/2026_10_24_2/"));
url.searchParams.set("seed", "20261029");
url.searchParams.set("mode", "survival");
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const page = await browser.newPage();
const d = createDriver(page, out),
  a = createAdventureDriver(page, d);
const errors = [],
  snapshots = [];
page.on("pageerror", (error) => errors.push(String(error)));
try {
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await a.boot();
  await page.locator("#save-button").click();
  await page.waitForFunction(
    () => document.querySelector("#save-status").textContent === "保存済み",
  );
  const fixture = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = window.indexedDB.open("classic-voxel-survival", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const get = db.transaction("worlds").objectStore("worlds").get("20261029:survival");
          get.onsuccess = () => {
            resolve(get.result);
            db.close();
          };
        };
      }),
  );
  fixture.position = { x: 0.5, y: 34, z: 0.5 };
  fixture.spawn = { ...fixture.position };
  fixture.time = 300;
  fixture.yaw = 0;
  fixture.pitch = 0;
  fixture.creatures = [];
  fixture.loot = [];
  fixture.arrows = [];
  fixture.furnaces = {};
  fixture.edits = {};
  fixture.vitals.health = 20;
  fixture.vitals.hunger = 20;
  fixture.inventory = Array.from({ length: 36 }, () => null);
  for (const [i, item] of [
    { id: "rawMeat", count: 10 },
    { id: "coal", count: 2 },
    { id: "furnace", count: 1 },
    { id: "stone_pick", count: 1, durability: 132 },
    { id: "flint", count: 3 },
  ].entries())
    fixture.inventory[i] = item;
  const put = (x, y, z, block) => {
    const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
    const index = (y * 16 + (((z % 16) + 16) % 16)) * 16 + (((x % 16) + 16) % 16);
    (fixture.edits[key] ??= {})[index] = block;
  };
  for (let x = -7; x <= 7; x++)
    for (let z = -7; z <= 7; z++)
      for (let y = 33; y < 70; y++)
        put(
          x,
          y,
          z,
          y === 33 || y === 38 || (y < 38 && (Math.abs(x) === 7 || Math.abs(z) === 7)) ? 3 : 0,
        );
  const file = path.join(out, "explicit-cooking-fixture.json");
  writeFileSync(file, JSON.stringify(fixture));
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
  a.setGuard(async () => false);
  const originalClose = d.close;
  d.close = async () => {
    if (await page.$('[data-area="furnace"][data-slot="0"]')) {
      snapshots.push(
        await page.$$eval('[data-area="furnace"]', (els) =>
          els.map((el) => ({
            slot: el.dataset.slot,
            count: el.querySelector("img")
              ? Number(el.querySelector(".item-count")?.textContent) || 1
              : 0,
          })),
        ),
      );
    }
    return originalClose();
  };
  const before = await d.info();
  console.log("Starting isolated actual-UI cooking fixture");
  const result = await cookCarriedMeat(d, page, a, { count: 8 });
  assert.equal(result.cooked, 8);
  assert.equal(await d.count("meat"), 8);
  assert.equal(await d.count("rawMeat"), 2);
  assert.equal(await d.count("coal"), 1);
  assert.equal(await d.count("furnace"), 1);
  assert.equal(await d.count("flint"), 3);
  assert.equal(await d.block({ x: 1, y: 34, z: 0 }), 0, "retrieve placed furnace");
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(out, "cooking-complete.png") });
  writeFileSync(
    path.join(out, "report.json"),
    JSON.stringify(
      {
        explicitFixture: true,
        separateFreshBrowser: true,
        url: url.href,
        before,
        result,
        after: await d.info(),
        snapshots,
        errors,
      },
      null,
      2,
    ),
  );
  console.log("PASS 10 raw + 2 coal → 8 meat + 2 raw + 1 coal; furnace and flint retained");
} catch (error) {
  await page.screenshot({ path: path.join(out, "failure.png") });
  writeFileSync(
    path.join(out, "failure.json"),
    JSON.stringify({ error: String(error), info: await d.info(), snapshots, errors }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
