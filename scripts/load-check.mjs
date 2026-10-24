/** Synthetic upper-load fixture, imported through the normal backup UI.
 * This is not a claim that its blocks/items were gathered by normal play. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
const args = process.argv.slice(2);
const at = args.indexOf("--url");
const url = new URL(at >= 0 ? args[at + 1] : "http://localhost:4173/");
url.searchParams.set("seed", "2026");
url.searchParams.set("mode", "creative");
const out = path.resolve("visual-check/load");
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--window-size=1280,720"],
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const boot = () =>
    page.waitForFunction(() => window.__mc?.meshedChunks() >= 60, { timeout: 120000 });
  const stored = () =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = window.indexedDB.open("classic-voxel-survival", 1);
          r.onerror = () => reject(r.error);
          r.onsuccess = () => {
            const db = r.result;
            const get = db.transaction("worlds").objectStore("worlds").get("2026:creative");
            get.onsuccess = () => {
              resolve(get.result);
              db.close();
            };
            get.onerror = () => {
              reject(get.error);
              db.close();
            };
          };
        }),
    );
  const save = async () => {
    await page.click("#save-button");
    await page.waitForFunction(
      () => document.querySelector("#save-status").textContent === "保存済み",
    );
  };
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await boot();
  await save();
  const fixture = await stored();
  fixture.inventory = Array.from({ length: 36 }, () => ({ id: "stone", count: 64 }));
  fixture.position = { x: 0.5, y: 35, z: 0.5 };
  fixture.spawn = { ...fixture.position };
  fixture.creatures = [];
  fixture.loot = Array.from({ length: 10000 }, (_, i) => ({
    id: i + 1,
    position: { x: 4.5, y: 35, z: 4.5 },
    stack: { id: "dirt", count: 1 },
    age: 0,
  }));
  fixture.nextId = 10001;
  fixture.edits = {};
  // Historical excavations outside the current stream must stay sparse.
  for (let cx = 100; cx < 200; cx++)
    fixture.edits[`${cx},100`] = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [i, 0]));
  // A small controlled arena keeps this load test independent of natural hills.
  for (let x = -8; x <= 8; x++)
    for (let z = -8; z <= 8; z++)
      for (let y = 34; y < 40; y++) {
        const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
        const index = (y * 16 + (((z % 16) + 16) % 16)) * 16 + (((x % 16) + 16) % 16);
        (fixture.edits[key] ??= {})[index] = y === 34 ? 1 : 0;
      }
  const editCount = Object.values(fixture.edits).reduce(
    (n, cells) => n + Object.keys(cells).length,
    0,
  );
  const fixturePath = path.join(out, "load-fixture.json");
  writeFileSync(fixturePath, JSON.stringify(fixture));
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded" });
  await (await page.$("#import-file")).uploadFile(fixturePath);
  await navigation;
  await boot();
  await page.click("#play-button");
  await page.waitForFunction(() => window.__mc.mode() === "pointer");
  const begin = await page.evaluate(() => window.__mc.time());
  const samples = [];
  for (let i = 0; i < 12; i++) {
    await wait(1500);
    const sample = await page.evaluate(() => ({
      loaded: window.__mc.loadedChunks(),
      time: window.__mc.time(),
      mode: window.__mc.mode(),
      heap: window.performance.memory?.usedJSHeapSize ?? null,
    }));
    assert.equal(sample.mode, "pointer");
    assert.ok(sample.loaded <= 196);
    if (sample.heap !== null) assert.ok(sample.heap < 256 * 1024 * 1024);
    samples.push(sample);
  }
  assert.ok(samples.at(-1).time - begin > 10, "simulation keeps advancing under load");
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => window.__mc.mode() === "idle");
  await save();
  const before = await stored();
  assert.equal(before.loot.length, 10000);
  assert.equal(
    before.loot.reduce((n, l) => n + l.stack.count, 0),
    10000,
  );
  assert.equal(
    Object.values(before.edits).reduce((n, cells) => n + Object.keys(cells).length, 0),
    editCount,
  );
  for (let i = 0; i < 3; i++) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await boot();
    assert.deepEqual(await page.evaluate(() => window.__mc.inventory()), fixture.inventory);
    const after = await stored();
    assert.deepEqual(after.loot, before.loot);
    assert.deepEqual(after.edits, before.edits);
    assert.equal(await page.evaluate(() => window.__mc.blockAt(0, 34, 0)), 1);
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  await page.screenshot({ path: path.join(out, "restored.png") });
  writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify({ completed: true, editCount, loot: 10000, reloads: 3, samples }, null, 2),
  );
  console.log(`PASS synthetic load: ${editCount} edits, 10000 dropped items, 3 reloads`);
} catch (error) {
  if (process.env.GITHUB_ACTIONS)
    console.log(
      `::error title=Load verification failed::${String(error?.stack ?? error)
        .replaceAll("%", "%25")
        .replaceAll("\r", "%0D")
        .replaceAll("\n", "%0A")}`,
    );
  throw error;
} finally {
  await browser.close();
}
