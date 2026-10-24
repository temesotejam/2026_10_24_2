/** Real-browser survival input, crafting, IndexedDB and backup regression. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
const args = process.argv.slice(2);
const url = new URL(args[args.indexOf("--url") + 1] || "http://localhost:4173/");
url.searchParams.set("seed", "2026");
url.searchParams.set("mode", "survival");
const out = path.resolve("visual-check/survival");
mkdirSync(out, { recursive: true });
let passed = 0;
const check = (name, value) => {
  assert.ok(value, name);
  passed++;
  console.log(`PASS ${name}`);
};
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--window-size=1280,720"],
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const client = await page.createCDPSession();
  await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: out });
  const boot = async () => {
    await page.waitForFunction(() => window.__mc?.meshedChunks() >= 60, { timeout: 120000 });
  };
  const has = async (id) =>
    page.evaluate(
      (item) =>
        window.__mc
          .inventory()
          .filter((s) => s?.id === item)
          .reduce((sum, s) => sum + s.count, 0),
      id,
    );
  const stored = () =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = window.indexedDB.open("classic-voxel-survival", 1);
          r.onsuccess = () => {
            const db = r.result;
            const get = db.transaction("worlds").objectStore("worlds").get("2026:survival");
            get.onsuccess = () => {
              resolve(get.result);
              db.close();
            };
            get.onerror = () => reject(get.error);
          };
          r.onerror = () => reject(r.error);
        }),
    );
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await boot();
  check(
    "new survival world starts with 36 empty slots",
    await page.evaluate(
      () =>
        window.__mc.gameMode() === "survival" &&
        window.__mc.inventory().length === 36 &&
        window.__mc.inventory().every((s) => s === null),
    ),
  );
  await page.click("#play-button");
  await page.waitForFunction(() => window.__mc.mode() === "pointer");
  await page.evaluate(() =>
    document.dispatchEvent(new MouseEvent("mousemove", { movementX: 0, movementY: 1500 })),
  );
  await wait(300);
  await page.mouse.down();
  await wait(1100);
  await page.mouse.up();
  await page.waitForFunction(() => window.__mc.inventory().some((s) => s?.id === "dirt"), {
    timeout: 15000,
  });
  check("held left mouse mines terrain and collects finite dirt", (await has("dirt")) > 0);
  await page.keyboard.press("KeyE");
  await page.waitForSelector("#inventory-panel:not([hidden])");
  check(
    "E opens all 36 inventory slots",
    await page.$$eval('[data-area="inventory"]', (els) => els.length === 36),
  );
  const dirtIndex = await page.evaluate(() =>
    window.__mc.inventory().findIndex((s) => s?.id === "dirt"),
  );
  await page.click(`[data-area="inventory"][data-slot="${dirtIndex}"]`);
  await page.click('[data-area="craft"][data-slot="0"]');
  check("invalid recipe has no craft output", await page.$eval("#craft-output", (b) => b.disabled));
  await page.keyboard.press("KeyE");
  await page.waitForSelector("#inventory-panel[hidden]");
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => window.__mc.mode() === "idle");
  await page.click("#save-button");
  await page.waitForFunction(
    () => document.querySelector("#save-status").textContent === "保存済み",
  );
  const saved = await stored();
  check(
    "IndexedDB stores edits and inventory",
    saved.inventory.some((s) => s?.id === "dirt") && Object.keys(saved.edits).length > 0,
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await boot();
  check(
    "reload restores inventory and player position",
    (await has("dirt")) ===
      saved.inventory.filter((s) => s?.id === "dirt").reduce((n, s) => n + s.count, 0) &&
      (await page.evaluate(
        (p) =>
          Math.hypot(
            window.__mc.position().x - p.x,
            window.__mc.position().y - p.y,
            window.__mc.position().z - p.z,
          ) < 0.01,
        saved.position,
      )),
  );
  await page.click("#export-button");
  const backupPath = path.join(out, "voxel-2026-survival.json");
  for (let i = 0; i < 40 && !existsSync(backupPath); i++) await wait(100);
  check(
    "backup exports a complete versioned world",
    existsSync(backupPath) && JSON.parse(readFileSync(backupPath, "utf8")).version === 1,
  );
  const badPath = path.join(out, "invalid.json");
  writeFileSync(badPath, '{"version":999}');
  await (await page.$("#import-file")).uploadFile(badPath);
  await page.waitForFunction(() => document.querySelector("#toast").textContent.includes("不正"));
  check(
    "invalid import preserves the previous world",
    (await stored()).seed === 2026 && (await has("dirt")) > 0,
  );
  // An explicit fixture isolates browser crafting from travel to a distant tree.
  const fixture = await stored();
  fixture.inventory = Array.from({ length: 36 }, () => null);
  fixture.inventory[0] = { id: "log", count: 3 };
  fixture.selected = 0;
  fixture.vitals.hunger = 10;
  const fixturePath = path.join(out, "craft-fixture.json");
  writeFileSync(fixturePath, JSON.stringify(fixture));
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded" });
  await (await page.$("#import-file")).uploadFile(fixturePath);
  await navigation;
  await boot();
  check(
    "valid backup restores items and hunger",
    (await has("log")) === 3 &&
      (await page.$eval("#hunger", (e) => e.textContent.includes("10/20"))),
  );
  await page.click("#play-button");
  await page.waitForFunction(() => window.__mc.mode() === "pointer");
  await page.keyboard.press("KeyE");
  await page.waitForSelector("#inventory-panel:not([hidden])");
  async function make(id) {
    await page.$eval("details", (d) => {
      d.open = true;
    });
    await page.click(`[data-recipe="${id}"]`);
    await page.click("#craft-output");
  }
  for (let i = 0; i < 3; i++) await make("planks");
  check(
    "2x2 recipe book crafts twelve planks from three logs",
    (await has("planks")) === 12 && (await has("log")) === 0,
  );
  await make("table");
  await make("sticks");
  check(
    "2x2 crafting produces a table and sticks",
    (await has("table")) === 1 && (await has("stick")) === 4,
  );
  check(
    "3x3 tools cannot be crafted in the pocket grid",
    (await page.$('[data-recipe="wood_pick"]')) === null,
  );
  await page.keyboard.press("KeyE");
  await page.waitForFunction(() => window.__mc.mode() === "pointer");
  const tableIndex = await page.evaluate(() =>
    window.__mc.inventory().findIndex((s) => s?.id === "table"),
  );
  assert.ok(tableIndex < 9);
  await page.keyboard.press(`Digit${tableIndex + 1}`);
  const neighbor = await page.evaluate(() => {
    const p = window.__mc.position();
    const x = Math.floor(p.x) + 1,
      z = Math.floor(p.z);
    let y = Math.floor(p.y) + 2;
    while (y > 0 && window.__mc.blockAt(x, y, z) === 0) y--;
    return { x, y, z, eye: p.y + window.__mc.eyeHeight(), yaw: 0 };
  });
  async function aim(pitch) {
    await page.evaluate((p) => {
      document.dispatchEvent(new MouseEvent("mousemove", { movementX: 0, movementY: -2000 }));
      document.dispatchEvent(
        new MouseEvent("mousemove", { movementX: 0, movementY: (Math.PI / 2 - 0.01 + p) / 0.0022 }),
      );
    }, pitch);
    await wait(350);
  }
  await page.evaluate(() =>
    document.dispatchEvent(
      new MouseEvent("mousemove", { movementX: Math.PI / 2 / 0.0022, movementY: 0 }),
    ),
  );
  await aim(Math.atan2(neighbor.eye - neighbor.y - 1, 1));
  await page.mouse.down({ button: "right" });
  await page.mouse.up({ button: "right" });
  await page.waitForFunction(
    (n) => window.__mc.blockAt(n.x, n.y + 1, n.z) === 12,
    { timeout: 10000 },
    neighbor,
  );
  check("placing a table consumes the finite inventory block", (await has("table")) === 0);
  await aim(Math.atan2(neighbor.eye - neighbor.y - 1.5, 1));
  await page.mouse.down({ button: "right" });
  await page.mouse.up({ button: "right" });
  await page.waitForFunction(
    () => document.querySelector("#inventory-panel:not([hidden]) h2")?.textContent === "作業台",
    { timeout: 10000 },
  );
  await make("wood_pick");
  check("placed workstation enables crafting a wooden pickaxe", (await has("wood_pick")) === 1);
  await page.screenshot({ path: path.join(out, "crafting.png") });
  // Resume a saved death, including a spawn point obstructed by the earlier dig/build.
  await page.keyboard.press("KeyE");
  await wait(600);
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => window.__mc.mode() === "idle");
  await page.click("#save-button");
  await page.waitForFunction(
    () => document.querySelector("#save-status").textContent === "保存済み",
  );
  const deadFixture = await stored();
  deadFixture.vitals.health = 0;
  deadFixture.inventory = Array.from({ length: 36 }, () => null);
  const deadPath = path.join(out, "death-fixture.json");
  writeFileSync(deadPath, JSON.stringify(deadFixture));
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  const deathNavigation = page.waitForNavigation({ waitUntil: "domcontentloaded" });
  await (await page.$("#import-file")).uploadFile(deadPath);
  await deathNavigation;
  await boot();
  check(
    "loading a saved death opens the respawn screen",
    (await page.$eval("#death-panel", (el) => !el.hidden)) &&
      (await page.evaluate(() => window.__mc.health() === 0)),
  );
  await page.click("#respawn");
  await page.waitForFunction(() => window.__mc.health() === 20 && window.__mc.mode() === "pointer");
  check(
    "respawn restores health and finds a supported clear position",
    await page.evaluate(() => {
      const p = window.__mc.position();
      return (
        window.__mc.blockAt(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) === 0 &&
        window.__mc.blockAt(Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z)) !== 0
      );
    }),
  );
  // Force an IDB write failure and ensure the last completed save is retained.
  await wait(600);
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => window.__mc.mode() === "idle");
  await page.click("#save-button");
  await page.waitForFunction(
    () => document.querySelector("#save-status").textContent === "保存済み",
  );
  const beforeFailure = await stored();
  await page.evaluate(() => {
    const original = window.IDBObjectStore.prototype.put;
    window.IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "worlds")
        throw new window.DOMException("injected quota failure", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page.click("#save-button");
  await page.waitForFunction(() =>
    document.querySelector("#save-status").textContent.includes("保存失敗"),
  );
  check(
    "failed save keeps the previously committed world",
    JSON.stringify(await stored()) === JSON.stringify(beforeFailure),
  );
  // The quota injection deliberately throws inside an IDB event callback.
  check(
    "no unexpected runtime errors",
    errors.filter((e) => !e.includes("injected quota failure")).length === 0,
  );
  console.log(`\n${passed}/${passed} survival checks passed`);
} finally {
  await browser.close();
}
