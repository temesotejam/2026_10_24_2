/** Prepare two beds using resources already earned in a copied survival save. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { createDriver, wait } from "./lib/survival-driver.mjs";
import { hostile } from "./lib/combat-policy.mjs";

const args = process.argv.slice(2);
const option = (key, fallback) => {
  const i = args.indexOf(key);
  return i < 0 ? fallback : args[i + 1];
};
const profile = path.resolve(option("--profile", "/workspace/artifacts/village-coop/profile"));
const out = path.resolve(option("--out", "/workspace/artifacts/village-coop"));
const url = new URL(option("--url", "http://127.0.0.1:4179/"));
url.search = "?seed=2026&mode=survival&view=third-person&coop=1";
assert.ok(existsSync(profile), "use the copied real survival profile");
mkdirSync(out, { recursive: true });
const video = path.join(out, "village-preparation.mp4");
assert.ok(!existsSync(video), "do not overwrite a previous recording");
const browser = await puppeteer.launch({
  headless: true,
  userDataDir: profile,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--window-size=1280,720",
  ],
});
const events = [];
let page,
  recorder,
  failure = null;
try {
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__mc?.meshedChunks() >= 40 && window.__coop, {
    timeout: 120000,
  });
  const d = createDriver(page, out);
  const obs = (actor) => page.evaluate((actor) => window.__coop.observe(actor), actor);
  const log = async (name) => {
    const player = await obs("player"),
      companion = await obs("companion");
    events.push({ name, time: player.time, player, companion, at: new Date().toISOString() });
    console.log(
      name,
      JSON.stringify({
        time: player.time,
        health: [player.vitals.health, companion.vitals.health],
        hunger: [player.vitals.hunger, companion.vitals.hunger],
      }),
    );
  };
  const guard = async () => {
    for (const actor of ["player", "companion"]) {
      const o = await obs(actor);
      assert.ok(o.vitals.health > 0, `${actor} stays alive`);
      const near = o.creatures.find(
        (m) =>
          m.hp > 0 &&
          hostile(m) &&
          Math.hypot(
            m.position.x - o.position.x,
            m.position.y - o.position.y,
            m.position.z - o.position.z,
          ) < (m.species === "skeleton" ? 18 : 9),
      );
      if (near) throw Error(`safety stop: ${near.species} near ${actor}`);
    }
  };
  const give = async (id, count) => {
    await guard();
    const a = await obs("player"),
      index = a.inventory.findIndex((i) => i?.id === id && i.count >= count);
    assert.ok(index >= 0, `earned ${id}`);
    assert.ok(
      await page.evaluate(({ index, count }) => window.__coop.give("player", index, count), {
        index,
        count,
      }),
      `transfer ${id}`,
    );
  };
  const select = async (id) => {
    const s = await obs("companion"),
      i = s.inventory.findIndex((v, j) => j < 9 && v?.id === id);
    assert.ok(i >= 0, `companion has ${id} in hotbar`);
    assert.ok(await page.evaluate((i) => window.__coop.select(i), i));
  };
  const craft = (id) => page.evaluate((id) => window.__coop.craft(id), id);
  const put = async (id, block) => {
    await select(id);
    const o = await obs("companion"),
      p = o.position;
    const cells = await page.evaluate(
      ({ p }) => {
        const a = [];
        let y = Math.round(p.y);
        for (let dx = -3; dx <= 3; dx++)
          for (let dz = -3; dz <= 3; dz++) {
            let x = Math.floor(p.x) + dx,
              z = Math.floor(p.z) + dz,
              g = window.__coop.block("companion", x, y - 1, z),
              f = window.__coop.block("companion", x, y, z),
              h = window.__coop.block("companion", x, y + 1, z);
            if (
              [1, 2].includes(g) &&
              f === 0 &&
              h === 0 &&
              Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) > 0.8
            )
              a.push({ x, y, z, dist: Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) });
          }
        return a.sort((x, y) => x.dist - y.dist);
      },
      { p },
    );
    for (const cell of cells) {
      await guard();
      if (await page.evaluate((c) => window.__coop.place(c.x, c.y, c.z), cell)) {
        assert.equal(
          await page.evaluate((c) => window.__coop.block("companion", c.x, c.y, c.z), cell),
          block,
        );
        return { x: cell.x, y: cell.y, z: cell.z };
      }
    }
    throw Error(`no safe reachable ground to place ${id}`);
  };
  const save = async () => {
    await page.evaluate(() => document.querySelector("#save-button").click());
    await page.waitForFunction(
      () => document.querySelector("#save-status")?.textContent === "保存済み",
      { timeout: 30000 },
    );
  };
  recorder = await page.screencast({
    path: video,
    format: "mp4",
    fps: 30,
    quality: 18,
    speed: 1,
    ffmpegPath: path.resolve("scripts/ffmpeg-capture.py"),
  });
  await page.locator("#play-button").click();
  await wait(500);
  await log("start with real copied survival save");
  await guard();
  const oldBed = { x: 202, y: 35, z: -72 };
  assert.equal(
    await page.evaluate((p) => window.__mc.blockAt(p.x, p.y, p.z), oldBed),
    15,
    "existing village bed",
  );
  await page.evaluate(() =>
    window.__coop.say("player", "村づくりの前に、もう一つ寝床を用意します。"),
  );
  await give("string", 4);
  await give("wool", 2);
  await give("planks", 3);
  await give("table", 1);
  await page.evaluate(() =>
    window.__coop.say("companion", "材料を受け取りました。ベッドを作ります。"),
  );
  assert.ok(await craft("wool"), "craft wool from four earned string");
  const table = await put("table", 12);
  await log("placed real shared crafting table");
  assert.ok(
    await page.evaluate((p) => window.__coop.craft("bed", p), table),
    "craft bed at the real table",
  );
  const newBed = await put("bed", 15);
  assert.notDeepEqual(newBed, oldBed);
  await log("crafted and placed second bed");
  await page.evaluate(() =>
    window.__coop.say("companion", "２つ目のベッドができました。夜に備えます。"),
  );
  await d.equip("bread");
  await d.aim({
    x: (await d.info()).position.x,
    y: (await d.info()).position.y + 10,
    z: (await d.info()).position.z - 2,
  });
  await page.mouse.down({ button: "right" });
  await page.mouse.up({ button: "right" });
  await wait(500);
  await guard();
  await save();
  await log("saved two beds and ate safely");
  // Locate the real old bed without mining or teleporting; fail safely if it is obstructed.
  const p = (await d.info()).position;
  const aimPoints = [
    { x: oldBed.x + 0.5, y: oldBed.y + 0.5, z: oldBed.z + 0.5 },
    {
      x: Math.max(oldBed.x + 0.05, Math.min(oldBed.x + 0.95, p.x)),
      y: oldBed.y + 0.5,
      z: Math.max(oldBed.z + 0.05, Math.min(oldBed.z + 0.95, p.z)),
    },
  ];
  let canReach = false;
  for (const aim of aimPoints) {
    await d.aim(aim);
    const hit = await page.evaluate(() => window.__mc.target());
    if (hit && hit.x === oldBed.x && hit.y === oldBed.y && hit.z === oldBed.z) {
      canReach = true;
      break;
    }
  }
  assert.ok(canReach, "stand where the original bed is actually visible");
  const end = Date.now() + 240000;
  let lastNotice = 0;
  while (true) {
    await guard();
    const o = await obs("player");
    if (o.night) break;
    if (Date.now() > end) throw Error("bedtime did not arrive");
    if (Date.now() - lastNotice > 30000) {
      console.log(
        "waiting for natural night",
        JSON.stringify({ time: o.time, health: o.vitals.health }),
      );
      lastNotice = Date.now();
    }
    await wait(300);
  }
  await guard();
  const before = (await obs("player")).time;
  assert.ok(
    await page.evaluate((p) => window.__coop.sleep(p.x, p.y, p.z), newBed),
    "companion enters the actual second bed",
  );
  await page.evaluate(() =>
    window.__coop.say("companion", "ベッドに入りました。あなたも休んでください。"),
  );
  await page.mouse.down({ button: "right" });
  await page.mouse.up({ button: "right" });
  await wait(600);
  const after = await obs("player");
  assert.ok(after.time - before > 10, "actual world time advances to morning");
  await log("both slept in distinct real beds");
  await save();
  writeFileSync(
    path.join(out, "preparation.json"),
    JSON.stringify(
      {
        source: "copy of prior real survival save",
        oldBed,
        newBed,
        table,
        before,
        after: after.time,
        events,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PREPARATION COMPLETE",
    JSON.stringify({ oldBed, newBed, table, before, after: after.time }),
  );
} catch (e) {
  failure = String(e);
  console.error(e);
  process.exitCode = 1;
} finally {
  if (page) {
    try {
      try {
        await page.mouse.up();
      } catch {
        /* Mouse was not held. */
      }
      await page.keyboard.up("KeyW");
      await page.evaluate(() => document.querySelector("#save-button").click());
      await wait(1200);
      const state = await page.evaluate(
        () =>
          window.__coop && {
            player: window.__coop.observe("player"),
            companion: window.__coop.observe("companion"),
          },
      );
      writeFileSync(
        path.join(out, "preparation-last-state.json"),
        JSON.stringify({ failure, state, events }, null, 2) + "\n",
      );
    } catch (e) {
      console.error("final save or observation failed", String(e));
    }
  }
  if (recorder)
    try {
      await recorder.stop();
    } catch (e) {
      console.error("recording stop", String(e));
    }
  await browser.close();
}
