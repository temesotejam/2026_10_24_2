/** Explicit imported combat fixture, never part of the survival recording. */
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import puppeteer from "puppeteer";
import { createDriver, wait } from "./lib/survival-driver.mjs";
import { createAdventureDriver } from "./lib/adventure-driver.mjs";
import { createPillarRecovery } from "./lib/modern-pillar-recovery.mjs";
const surround = process.argv.includes("--surround");
const out = surround ? "/tmp/ember-pillar-surround" : "/tmp/ember-pillar-check";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const page = await browser.newPage(),
  d = createDriver(page, out),
  a = createAdventureDriver(page, d);
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
const results = [];
try {
  await page.setViewport({ width: 640, height: 360 });
  await page.goto("http://127.0.0.1:4173/2026_10_24_2/?seed=2026&mode=survival");
  await a.boot();
  await page.locator("#save-button").click();
  await page.waitForFunction(
    () => document.querySelector("#save-status").textContent === "保存済み",
  );
  const base = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = window.indexedDB.open("classic-voxel-survival", 1);
        r.onsuccess = () => {
          const db = r.result,
            g = db.transaction("worlds").objectStore("worlds").get("2026:survival");
          g.onsuccess = () => {
            resolve(g.result);
            db.close();
          };
        };
      }),
  );
  for (const build of surround ? [false] : [false, true]) {
    const data = globalThis.structuredClone(base);
    data.adventure.realms.overworld = Object.fromEntries(
      fields.map((k) => [k, globalThis.structuredClone(data[k])]),
    );
    data.adventure.dimension = "nether";
    data.edits = {};
    data.creatures = [];
    data.loot = [];
    data.arrows = [];
    data.fluidLevels = {};
    data.time = 300;
    data.position = { x: build ? 0.5 : 0.2, y: build ? 26 : 29, z: 0.5 };
    data.spawn = { ...data.position };
    data.vitals.health = 20;
    data.vitals.hunger = 20;
    data.inventory = Array.from({ length: 36 }, () => null);
    data.inventory[0] = { id: "stone_sword", count: 1, durability: 132 };
    data.inventory[1] = { id: "cobble", count: 3 };
    function put(x, y, z, id) {
      const k = `${Math.floor(x / 16)},${Math.floor(z / 16)}`,
        i = (y * 16 + (((z % 16) + 16) % 16)) * 16 + (((x % 16) + 16) % 16);
      (data.edits[k] ??= {})[i] = id;
    }
    for (let x = -12; x <= 12; x++)
      for (let z = -12; z <= 12; z++) for (let y = 25; y < 96; y++) put(x, y, z, y === 25 ? 29 : 0);
    if (!build) for (let y = 26; y <= 28; y++) put(0, y, 0, 3);
    for (let i = 1; i <= 8; i++)
      data.creatures.push({
        id: i,
        species: "ember",
        position: { x: build ? 8 + i * 0.2 : 2 + i * 0.2, y: 26, z: 0.5 },
        velocity: { x: 0, y: 0, z: 0 },
        onGround: true,
        hp: 16,
        age: 0,
        cooldown: 0,
        intent: 0,
        love: 0,
      });
    if (surround)
      for (const m of data.creatures) {
        const angle = (m.id * Math.PI) / 4;
        m.position.x = 0.5 + Math.cos(angle) * 5;
        m.position.z = 0.5 + Math.sin(angle) * 5;
      }
    data.nextId = 9;
    if (await page.evaluate(() => window.__mc.mode() !== "idle")) {
      await page.evaluate(() => document.exitPointerLock());
      await page.waitForFunction(() => window.__mc.mode() === "idle");
    }
    const file = `${out}/${build ? "build" : "standing"}.json`;
    writeFileSync(file, JSON.stringify(data));
    page.once("dialog", (x) => x.accept());
    const nav = page.waitForNavigation({ waitUntil: "domcontentloaded" });
    await (await page.$("#import-file")).uploadFile(file);
    await nav;
    await a.boot();
    await page.select("#render-scale", "0.25");
    await page.locator("#play-button").click();
    await page.waitForFunction(() => window.__mc.mode() === "pointer");
    a.setGuard(async () => false);
    const started = Date.now(),
      trace = [];
    console.log("Starting case", build);
    if (build) {
      await a.pillarTo(29);
      await d.aim({ x: 8, y: 30.62, z: 0.5 }, 0);
      await page.keyboard.down("ShiftLeft");
      await page.keyboard.down("KeyS");
      await wait(230);
      await page.keyboard.up("KeyS");
    } else await page.keyboard.down("ShiftLeft");
    await d.equip("stone_sword");
    if (surround) {
      const recovery = createPillarRecovery(page, d, a);
      console.log(await recovery.standAndFight({ x: 0, y: 26, z: 0 }, { timeout: 60000 }));
    }
    while (!surround && Date.now() - started < 45000) {
      const s = await page.evaluate(() => {
        const p = window.__mc.position(),
          eye = { x: p.x, y: p.y + window.__mc.eyeHeight(), z: p.z };
        return {
          health: window.__mc.health(),
          p,
          creatures: window.__mc.adventure().creatures,
          eye,
        };
      });
      if (!s.health || !s.creatures.some((m) => m.id <= 8)) {
        trace.push(s);
        break;
      }
      const candidates = s.creatures
        .filter((m) => m.id <= 8)
        .sort((a, b) => b.position.y - a.position.y);
      let target = null;
      for (const m of candidates) {
        const t = { x: m.position.x, y: m.position.y + 1.1, z: m.position.z },
          len = Math.hypot(t.x - s.eye.x, t.y - s.eye.y, t.z - s.eye.z);
        if (len > 3 || m.position.y < 26.7) continue;
        const visible = await page.evaluate(
          ({ eye, t, len }) => {
            for (let r = 0.1; r < len; r += 0.08) {
              const f = r / len,
                b = window.__mc.blockAt(
                  Math.floor(eye.x + (t.x - eye.x) * f),
                  Math.floor(eye.y + (t.y - eye.y) * f),
                  Math.floor(eye.z + (t.z - eye.z) * f),
                );
              if (![0, 5, 26, 31, 40].includes(b)) return false;
            }
            return true;
          },
          { eye: s.eye, t, len },
        );
        if (visible) {
          target = t;
          break;
        }
      }
      if (target) {
        await d.aim(target, 0);
        await page.mouse.down();
        await wait(90);
        await page.mouse.up();
      } else await wait(40);
      if (trace.length === 0 || Date.now() - trace.at(-1).at > 1000)
        trace.push({ at: Date.now(), ...s });
    }
    await page.keyboard.up("ShiftLeft");
    await d.releaseAttack();
    const result = {
      build,
      elapsed: Date.now() - started,
      info: await d.info(),
      adventure: await a.adventure(),
      trace,
    };
    assert.equal(result.info.health, 20, "the flat three-high pillar prevents ember melee damage");
    assert.equal(
      result.adventure.creatures.filter((m) => m.id <= 8).length,
      0,
      "all eight initial embers were defeated using normal attacks",
    );
    results.push(result);
    writeFileSync(`${out}/results.json`, JSON.stringify({ fixtureBased: true, results }, null, 2));
    await page.screenshot({ path: `${out}/${build ? "build" : "standing"}.png` });
    console.log(
      JSON.stringify({
        build,
        elapsed: result.elapsed,
        health: result.info.health,
        position: result.info.position,
        originalSurvivors: result.adventure.creatures
          .filter((m) => m.id <= 8)
          .map((m) => ({ id: m.id, hp: m.hp, y: m.position.y })),
        inventory: result.info.inventory.filter(Boolean),
      }),
    );
  }
} finally {
  await browser.close();
}
