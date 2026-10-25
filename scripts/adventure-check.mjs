/** Explicit imported fixtures exercise UI and persistence. The separate recorded
 * survival playthrough starts empty and never imports these fixtures. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { createDriver } from "./lib/survival-driver.mjs";
import { createAdventureDriver } from "./lib/adventure-driver.mjs";
const args = process.argv.slice(2),
  at = args.indexOf("--url");
const url = new URL(at >= 0 ? args[at + 1] : "http://127.0.0.1:4173/");
url.searchParams.set("seed", "2026");
url.searchParams.set("mode", "survival");
const out = path.resolve("visual-check/adventure");
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage();
let checks = 0;
const check = (name, value) => {
  assert.ok(value, name);
  console.log(`PASS ${name}`);
  checks++;
};
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
try {
  await page.setViewport({ width: 960, height: 540 });
  const boot = () =>
    page.waitForFunction(
      () =>
        window.__mc?.loadedChunks() >= 60 &&
        window.__mc.meshedChunks() >= (window.__mc.adventure().dimension === "end" ? 24 : 60),
      { timeout: 120000 },
    );
  const state = () =>
    page.evaluate(() => ({
      p: window.__mc.position(),
      yaw: window.__mc.yaw(),
      pitch: window.__mc.pitch(),
      eye: window.__mc.eyeHeight(),
      inventory: window.__mc.inventory(),
      adventure: window.__mc.adventure(),
    }));
  const count = async (id) =>
    (await state()).inventory.filter((s) => s?.id === id).reduce((n, s) => n + s.count, 0);
  const pause = async () => {
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForFunction(() => window.__mc.mode() === "idle");
  };
  const play = async () => {
    await page.locator("#play-button").click();
    await page.waitForFunction(() => window.__mc.mode() === "pointer");
  };
  const right = async () => {
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
  };
  async function aim(p) {
    const s = await state(),
      dx = p.x - s.p.x,
      dz = p.z - s.p.z;
    await page.evaluate(
      ({ x, y }) =>
        document.dispatchEvent(new MouseEvent("mousemove", { movementX: x, movementY: y })),
      {
        x: -(Math.atan2(-dx, -dz) - s.yaw) / 0.0022,
        y: -(Math.atan2(p.y - s.p.y - s.eye, Math.hypot(dx, dz)) - s.pitch) / 0.0022,
      },
    );
    await wait(100);
  }
  async function equip(id) {
    let index = (await state()).inventory.findIndex((s) => s?.id === id);
    assert.ok(index >= 0, `own ${id}`);
    if (index >= 9) {
      await page.keyboard.press("KeyE");
      await page.waitForSelector("#inventory-panel:not([hidden])");
      await page.locator(`[data-area="inventory"][data-slot="${index}"]`).click();
      await page.locator('[data-area="inventory"][data-slot="0"]').click();
      await page.keyboard.press("KeyE");
      await page.waitForFunction(() => window.__mc.mode() === "pointer");
      index = 0;
    }
    await page.keyboard.press(`Digit${index + 1}`);
  }
  const stored = () =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const req = window.indexedDB.open("classic-voxel-survival", 1);
          req.onsuccess = () => {
            const db = req.result,
              get = db.transaction("worlds").objectStore("worlds").get("2026:survival");
            get.onsuccess = () => {
              resolve(get.result);
              db.close();
            };
            get.onerror = () => reject(get.error);
          };
          req.onerror = () => reject(req.error);
        }),
    );
  async function importFixture(data, name) {
    const file = path.join(out, `${name}.json`);
    writeFileSync(file, JSON.stringify(data));
    page.once("dialog", (d) => {
      void d.accept();
    });
    const nav = page.waitForNavigation({ waitUntil: "domcontentloaded" });
    await (await page.$("#import-file")).uploadFile(file);
    await nav;
    await boot();
    await page.select("#render-scale", "0.25");
  }
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await boot();
  await page.locator("#save-button").click();
  await page.waitForFunction(
    () => document.querySelector("#save-status").textContent === "保存済み",
  );
  const fixture = await stored();
  fixture.position = { x: 1.5, y: 34, z: 1.5 };
  fixture.spawn = { ...fixture.position };
  fixture.edits = {};
  fixture.inventory = Array.from({ length: 36 }, () => null);
  [
    { id: "iron_sword", count: 1, durability: 251 },
    { id: "fishingRod", count: 1, durability: 65 },
    { id: "waterBottle", count: 1 },
    { id: "netherWart", count: 1 },
    { id: "blazePowder", count: 1 },
    { id: "apple", count: 1 },
    { id: "flintSteel", count: 1, durability: 65 },
    { id: "bow", count: 1, durability: 385 },
    { id: "arrow", count: 32 },
  ].forEach((v, i) => (fixture.inventory[i] = v));
  fixture.inventory[10] = { id: "bread", count: 2 };
  fixture.vitals.hunger = 10;
  fixture.adventure.xp = 5;
  fixture.vitals.health = 8;
  const put = (x, y, z, id) => {
    const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`,
      index = (y * 16 + (((z % 16) + 16) % 16)) * 16 + (((x % 16) + 16) % 16);
    (fixture.edits[key] ??= {})[index] = id;
  };
  for (let x = -8; x <= 8; x++)
    for (let z = -8; z <= 8; z++) for (let y = 33; y <= 40; y++) put(x, y, z, y === 33 ? 3 : 0);
  put(-2, 34, 0, 34);
  put(0, 34, 0, 35);
  put(2, 34, 0, 5);
  for (let u = 0; u < 4; u++)
    for (let v = 0; v < 5; v++)
      if (u === 0 || u === 3 || v === 0 || v === 4) put(u - 1, v + 34, -4, 28);
  await importFixture(fixture, "stations-fixture");
  await play();
  await equip("fishingRod");
  await aim({ x: 2.5, y: 34.5, z: 0.5 });
  await right();
  await page.waitForFunction(() => window.__mc.adventure().cast?.elapsed >= 5, { timeout: 15000 });
  await right();
  check("fish from a real water cast and timed retrieval", (await count("fish")) === 1);
  await equip("bread");
  await aim({ x: -1.5, y: 34.5, z: 0.5 });
  await right();
  const swordIndex = (await state()).inventory.findIndex((s) => s?.id === "iron_sword");
  await page.waitForSelector(`[data-action="enchant-${swordIndex}"]`);
  check("usable stations open before eating a held food item", (await count("bread")) === 2);
  await page.locator(`[data-action="enchant-${swordIndex}"]`).click();
  check(
    "enchant station spends five XP and changes the actual tool",
    (await count("enchanted_iron_sword")) === 1 && (await state()).adventure.xp === 1,
  );
  await page.keyboard.press("KeyE");
  await page.waitForFunction(() => window.__mc.mode() === "pointer");
  await aim({ x: 0.5, y: 34.5, z: 0.5 });
  await right();
  await page.waitForSelector('[data-action="brew-healingPotion"]');
  await page.locator('[data-action="brew-healingPotion"]').click();
  await page.waitForSelector('[data-action="claim-brew"]', { timeout: 15000 });
  await page.locator('[data-action="claim-brew"]').click();
  await page.keyboard.press("KeyE");
  await page.waitForFunction(() => window.__mc.mode() === "pointer");
  await equip("healingPotion");
  await right();
  check(
    "brew, claim and drink a healing potion",
    (await page.evaluate(() => window.__mc.health() >= 16)) && (await count("bottle")) === 1,
  );
  await equip("flintSteel");
  await aim({ x: -0.5, y: 34.5, z: -3.5 });
  await right();
  console.log(
    "Portal inspection",
    await page.evaluate(() => ({
      frame: Array.from({ length: 5 }, (_, v) =>
        Array.from({ length: 4 }, (_, u) => window.__mc.blockAt(u - 1, v + 34, -4)),
      ),
      target: window.__mc.target(),
      p: window.__mc.position(),
      toast: document.querySelector("#toast").textContent,
    })),
  );
  await page.waitForFunction(() => window.__mc.blockAt(0, 35, -4) === 31);
  await equip("enchanted_iron_sword");
  await aim({ x: 0.5, y: 35.5, z: -3.5 });
  // Walk closer using normal input; portal remains beyond six blocks initially.
  await page.keyboard.down("KeyW");
  await wait(450);
  await page.keyboard.up("KeyW");
  await aim({ x: 0.5, y: 35.5, z: -3.5 });
  await right();
  await page.waitForFunction(() => window.__mc?.adventure().dimension === "nether", {
    timeout: 120000,
  });
  await boot();
  check(
    "Nether travel preserves gathered items",
    (await count("fish")) === 1 && (await count("enchanted_iron_sword")) === 1,
  );
  await play();
  await aim({ x: 0.5, y: 35.5, z: -2.5 });
  await right();
  await page.waitForFunction(() => window.__mc?.adventure().dimension === "overworld", {
    timeout: 120000,
  });
  await boot();
  check(
    "return restores independent overworld blocks",
    await page.evaluate(() => window.__mc.blockAt(0, 34, 0) === 35),
  );
  const endFixture = await stored(),
    c = (await state()).adventure.stronghold;
  const entrance = (await state()).adventure.entrance;
  endFixture.position = { x: entrance.x + 0.5, y: entrance.y, z: entrance.z + 2.5 };
  endFixture.spawn = { ...endFixture.position };
  endFixture.inventory = Array.from({ length: 36 }, () => null);
  endFixture.inventory[0] = { id: "enderEye", count: 4 };
  endFixture.inventory[1] = { id: "iron_sword", count: 1, durability: 251 };
  endFixture.inventory[2] = { id: "bow", count: 1, durability: 385 };
  endFixture.inventory[3] = { id: "arrow", count: 32 };
  endFixture.vitals.health = 20;
  endFixture.adventure.dragon.phase = 0;
  await importFixture(endFixture, "end-entry-fixture");
  await play();
  const native = createAdventureDriver(page, createDriver(page, out));
  await native.enterStronghold();
  check("walk from daylight down the enclosed stronghold stairs into the frame ring", true);
  for (const [dx, dz] of [
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
  ]) {
    await aim({ x: c.x + dx + 0.5, y: c.y + 0.5, z: c.z + dz + 0.5 });
    await right();
    await wait(150);
  }
  check(
    "four eyes activate a naturally generated twelve-frame stronghold",
    await page.evaluate((c) => window.__mc.blockAt(c.x, c.y, c.z) === 40, c),
  );
  await equip("iron_sword");
  await aim({ x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 });
  await right();
  await page.waitForFunction(() => window.__mc?.adventure().dimension === "end", {
    timeout: 120000,
  });
  await boot();
  await page.select("#render-scale", "0.25");
  await play();
  await page.keyboard.down("KeyS");
  await wait(2000);
  await page.keyboard.up("KeyS");
  await equip("bow");
  const crystals = Array.from({ length: 6 }, (_, i) => ({
    x: Math.round(Math.cos((i * Math.PI) / 3) * 16),
    z: Math.round(Math.sin((i * Math.PI) / 3) * 16),
    y: 39 + (i % 3) * 2,
  }));
  async function walkEnd(x, z) {
    for (let n = 0; n < 100; n++) {
      const s = await state(),
        distance = Math.hypot(x - s.p.x, z - s.p.z);
      if (distance < 0.3) return;
      await aim({ x, y: s.p.y + s.eye, z });
      await page.keyboard.down("KeyW");
      await wait(Math.min(140, Math.max(35, (distance / 4.317) * 600)));
      await page.keyboard.up("KeyW");
    }
    throw new Error("End walk did not reach target");
  }
  for (const p of crystals) {
    const here = await state(),
      startAngle = Math.atan2(here.p.z, here.p.x),
      goalAngle = Math.atan2(p.z, p.x) + Math.PI;
    const delta = Math.atan2(Math.sin(goalAngle - startAngle), Math.cos(goalAngle - startAngle));
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.25));
    for (let j = 1; j <= steps; j++) {
      const a = startAngle + (delta * j) / steps;
      await walkEnd(Math.cos(a) * 10, Math.sin(a) * 10);
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await page.evaluate((p) => window.__mc.blockAt(p.x, p.y, p.z) === 0, p)) break;
      const s = await state(),
        distance = Math.hypot(p.x + 0.5 - s.p.x, p.z + 0.5 - s.p.z),
        dy = p.y + 0.9 - s.p.y - s.eye;
      const velocity = 22,
        gravity = 2.4;
      const tangent =
        (velocity ** 2 -
          Math.sqrt(velocity ** 4 - gravity * (gravity * distance ** 2 + 2 * dy * velocity ** 2))) /
        (gravity * distance);
      await aim({ x: p.x + 0.5, y: s.p.y + s.eye + tangent * distance, z: p.z + 0.5 });
      await right();
      await wait(1000);
    }
    assert.equal(
      await page.evaluate((p) => window.__mc.blockAt(p.x, p.y, p.z), p),
      0,
      `physical arrow destroys crystal ${JSON.stringify(p)}`,
    );
  }
  check("bow and paid arrows destroy all six crystals", true);
  await equip("iron_sword");
  await walkEnd(0.5, 4);
  for (let i = 0; i < 90; i++) {
    const s = await state();
    if (s.adventure.dragon.defeated) break;
    assert.ok(await page.evaluate(() => window.__mc.health() > 0), "survive boss fight");
    await aim(s.adventure.dragonPosition);
    await page.mouse.down();
    await wait(450);
    await page.mouse.up();
  }
  check(
    "survival combat defeats dragon and awards a single egg",
    (await state()).adventure.dragon.defeated && (await count("dragonEgg")) === 1,
  );
  await page.screenshot({ path: path.join(out, "victory.png") });
  await pause();
  await page.locator("#save-button").click();
  await page.waitForFunction(
    () => document.querySelector("#save-status").textContent === "保存済み",
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await boot();
  check(
    "victory, crystal edits and reward survive reload",
    (await state()).adventure.dragon.defeated &&
      (await count("dragonEgg")) === 1 &&
      (await page.evaluate(() => window.__mc.blockAt(16, 39, 0) === 0)),
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify({ completed: true, fixtureBased: true, checks }, null, 2),
  );
} catch (error) {
  await page.screenshot({ path: path.join(out, "failure.png") });
  writeFileSync(
    path.join(out, "failure.json"),
    JSON.stringify(
      await page.evaluate(() => ({
        p: window.__mc?.position(),
        adventure: window.__mc?.adventure(),
        inventory: window.__mc?.inventory(),
        health: window.__mc?.health(),
        target: window.__mc?.target(),
        toast: document.querySelector("#toast")?.textContent,
      })),
      null,
      2,
    ),
  );
  if (process.env.GITHUB_ACTIONS)
    console.log(
      `::error title=Adventure UI check failed::${String(error?.stack ?? error)
        .replaceAll("%", "%25")
        .replaceAll("\r", "%0D")
        .replaceAll("\n", "%0A")}`,
    );
  throw error;
} finally {
  await browser.close();
}
