/** Record two simultaneous third-person views while tending the saved village. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { createDriver, wait } from "./lib/survival-driver.mjs";
import { safePath } from "./cooperation/navigation.mjs";
import { safetyStop } from "./cooperation/safety.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
};
const out = path.resolve(option("--out", "/workspace/artifacts/village-split"));
const profile = path.resolve(option("--profile", path.join(out, "profile")));
const video = path.join(out, "village-two-views.mp4");
assert.ok(existsSync(profile), "provide a copy of the prepared village browser profile");
assert.ok(!existsSync(video), "refuse to overwrite the recording");
mkdirSync(out, { recursive: true });
const url = new URL(option("--url", "http://127.0.0.1:4179/"));
url.search = "?seed=2026&mode=survival&view=third-person&coop=1&split=1";
const browser = await puppeteer.launch({
  headless: true,
  userDataDir: profile,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--window-size=1920,1080",
  ],
});
let page,
  recorder,
  failure = null;
const events = [];
try {
  page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__coop && window.__mc?.meshedChunks() >= 40, {
    timeout: 120000,
  });
  assert.equal(
    await page.evaluate(() => window.__mc.renderer()),
    "webgl",
    "split view requires WebGL",
  );
  assert.ok(
    await page.evaluate(() => document.querySelector("#app").classList.contains("split-view")),
  );
  await page.select("#render-scale", "1");
  const driver = createDriver(page, out);
  const observe = (actor) => page.evaluate((actor) => window.__coop.observe(actor), actor);
  async function guard() {
    for (const actor of ["player", "companion"]) {
      const o = await observe(actor);
      const reason = safetyStop(o);
      if (reason) throw Error(`${actor}: ${reason.type}`);
    }
  }
  const log = async (actor, action, details = {}) => {
    const s = await observe(actor);
    const event = {
      actor,
      action,
      time: s.time,
      position: s.position,
      health: s.vitals.health,
      ...details,
      at: new Date().toISOString(),
    };
    events.push(event);
    const captions = {
      "planted sapling": "苗木を植えました",
      "walking to field": "畑へ向かいます",
      "arrived at field": "実った小麦を探します",
      "harvesting ripe wheat": "小麦を収穫しています",
      "replanted wheat": "種を植え直しました",
    };
    if (captions[action])
      await page.evaluate(
        ({ actor, caption }) => {
          const element = document.querySelector(`#record-caption-${actor}`);
          if (element) element.textContent = caption;
        },
        { actor, caption: captions[action] },
      );
    console.log(JSON.stringify(event));
  };
  const block = (actor, c) =>
    page.evaluate(({ actor, c }) => window.__coop.block(actor, c.x, c.y, c.z), { actor, c });
  async function companionMove(yaw, jump, seconds) {
    await guard();
    const before = await observe("companion");
    if (
      !(await page.evaluate(
        ({ yaw, jump, seconds }) =>
          window.__coop.move({ forward: 1, right: 0, jump, yaw }, seconds),
        { yaw, jump, seconds },
      ))
    )
      return false;
    try {
      await page.waitForFunction(
        (end) => window.__mc.time() >= end,
        { timeout: 5000 },
        before.time + seconds,
      );
    } finally {
      await page.evaluate(() => window.__coop.stop());
    }
    return true;
  }
  async function companionTravel(target) {
    let route = [],
      previous = null,
      stale = 0;
    for (let n = 0; n < 120; n++) {
      await guard();
      const s = await page.evaluate(() => {
        const o = window.__coop.observe("companion"),
          p = o.position,
          base = Math.round(p.y),
          blocks = {};
        for (let x = Math.floor(p.x) - 6; x <= Math.floor(p.x) + 6; x++)
          for (let z = Math.floor(p.z) - 6; z <= Math.floor(p.z) + 6; z++)
            for (let y = base - 4; y <= base + 4; y++) {
              const b = window.__coop.block("companion", x, y, z);
              if (b !== null) blocks[`${x},${y},${z}`] = b;
            }
        return { position: p, blocks, onGround: o.onGround };
      });
      const p = s.position;
      if (Math.hypot(p.x - target.x, p.y - target.y, p.z - target.z) < 1.2) return;
      if (!s.onGround) {
        await wait(120);
        continue;
      }
      if (previous && Math.hypot(p.x - previous.x, p.y - previous.y, p.z - previous.z) < 0.02)
        stale++;
      else stale = 0;
      if (stale > 8) throw Error("companion movement blocked");
      previous = p;
      if (
        route.length &&
        Math.hypot(route[0].x + 0.5 - p.x, route[0].z + 0.5 - p.z) < 0.27 &&
        Math.abs(route[0].y - p.y) < 0.35
      )
        route.shift();
      if (!route.length) {
        const d = Math.hypot(p.x - target.x, p.y - target.y, p.z - target.z);
        for (const advance of [4, 3, 2, 1, 0.5]) {
          const r = safePath({ ...s, target, radius: Math.max(0.9, d - advance) });
          if (r?.length > 1) {
            route = r.slice(1);
            break;
          }
        }
      }
      if (!route.length) throw Error("no supported path to field");
      const next = route[0],
        dx = next.x + 0.5 - p.x,
        dz = next.z + 0.5 - p.z,
        dist = Math.hypot(dx, dz);
      if (
        !(await companionMove(
          Math.atan2(-dx, -dz),
          next.y > Math.round(p.y),
          Math.min(0.22, dist / 4.317),
        ))
      )
        throw Error("move rejected");
      await wait(70);
    }
    throw Error("field route timed out");
  }
  async function plantTree() {
    await guard();
    await page.evaluate(() =>
      window.__coop.say("player", "家の近くに苗木を植えて、木材を再生します。"),
    );
    const s = await observe("player");
    assert.ok(
      s.inventory.some((i) => i?.id === "sapling"),
      "earned sapling required",
    );
    await driver.equip("sapling");
    const cells = await page.evaluate(() => {
      const p = window.__coop.observe("player").position,
        a = [];
      for (let x = Math.floor(p.x) - 4; x <= Math.floor(p.x) + 4; x++)
        for (let z = Math.floor(p.z) - 4; z <= Math.floor(p.z) + 4; z++) {
          const y = Math.round(p.y),
            dist = Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z);
          if (dist < 2 || dist > 3.8) continue;
          if (window.__coop.block("player", x, y - 1, z) !== 1) continue;
          if (
            Array.from({ length: 5 }, (_, i) => window.__coop.block("player", x, y + i, z)).every(
              (b) => b === 0,
            )
          )
            a.push({ x, y, z, dist });
        }
      return a.sort((a, b) => a.dist - b.dist);
    });
    for (const cell of cells) {
      await guard();
      await driver.aim({ x: cell.x + 0.5, y: cell.y - 0.05, z: cell.z + 0.5 }, 80);
      const target = await page.evaluate(() => window.__mc.placementTarget());
      if (!target || target.x !== cell.x || target.y !== cell.y || target.z !== cell.z) continue;
      await page.mouse.down({ button: "right" });
      await page.mouse.up({ button: "right" });
      await wait(250);
      if ((await block("player", cell)) === 25) {
        await log("player", "planted sapling", {
          cell,
          otherActivity: (await observe("companion")).activity,
        });
        return;
      }
    }
    throw Error("no visible safe ground for the sapling");
  }
  async function tendFarm() {
    await guard();
    await page.evaluate(() =>
      window.__coop.say("companion", "畑へ行き、実った小麦を収穫して植え直します。"),
    );
    await log("companion", "walking to field");
    await companionTravel({ x: 203.5, y: 35, z: -84.5 });
    await log("companion", "arrived at field");
    const o = await observe("companion");
    assert.ok(
      o.inventory.some((i) => i?.id === "seeds"),
      "one seed is reserved for replanting",
    );
    const crops = await page.evaluate(() => {
      const p = window.__coop.observe("companion").position,
        a = [];
      for (let x = Math.floor(p.x) - 4; x <= Math.floor(p.x) + 4; x++)
        for (let z = Math.floor(p.z) - 4; z <= Math.floor(p.z) + 4; z++)
          for (let y = Math.round(p.y) - 1; y <= Math.round(p.y) + 1; y++)
            if (
              window.__coop.block("companion", x, y, z) === 23 &&
              window.__coop.block("companion", x, y - 1, z) === 21
            )
              a.push({ x, y, z, dist: Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y, z + 0.5 - p.z) });
      return a.sort((a, b) => a.dist - b.dist);
    });
    for (const cell of crops) {
      await guard();
      if (!(await page.evaluate((c) => window.__coop.mine(c.x, c.y, c.z), cell))) continue;
      await log("companion", "harvesting ripe wheat", { cell });
      const end = Date.now() + 5000;
      while ((await block("companion", cell)) === 23) {
        await guard();
        if (Date.now() > end) throw Error("harvest timed out");
        await wait(80);
      }
      assert.equal(await block("companion", cell), 0);
      const s = await observe("companion"),
        slot = s.inventory.findIndex((i, j) => j < 9 && i?.id === "seeds");
      assert.ok(slot >= 0);
      assert.ok(await page.evaluate((i) => window.__coop.select(i), slot));
      assert.ok(
        await page.evaluate((c) => window.__coop.place(c.x, c.y, c.z), cell),
        "replant harvested farmland",
      );
      assert.equal(await block("companion", cell), 22);
      await log("companion", "replanted wheat", { cell });
      return;
    }
    throw Error("no reachable ripe crop");
  }
  await page.locator("#play-button").click();
  await wait(700);
  await guard();
  // Prepare the real hotbar and step onto open supported ground before filming.
  await driver.equip("sapling");
  const start = (await observe("player")).position;
  const safeApproach = await page.evaluate((p) => {
    const y = Math.round(p.y);
    return [0.4, 0.8, 1.2, 1.6].every((offset) => {
      const x = Math.floor(p.x - offset),
        z = Math.floor(p.z);
      const below = window.__coop.block("player", x, y - 1, z);
      const lower = window.__coop.block("player", x, y - 2, z);
      const support = [1, 2, 3, 4, 9, 10, 11, 21, 24, 27, 44];
      return (
        (support.includes(below) || (below === 0 && support.includes(lower))) &&
        window.__coop.block("player", x, y, z) === 0 &&
        window.__coop.block("player", x, y + 1, z) === 0
      );
    });
  }, start);
  assert.ok(safeApproach, "approach uses supported ground with headroom");
  await driver.aim({ x: start.x - 5, y: start.y + 1.62, z: start.z }, 80);
  await page.keyboard.down("KeyW");
  await wait(300);
  await page.keyboard.up("KeyW");
  await wait(300);
  await guard();
  const openStart = (await observe("player")).position;
  const northIsSafe = await page.evaluate((p) => {
    const y = Math.round(p.y);
    return [0.4, 0.8, 1.2, 1.6, 2.0].every((offset) => {
      const x = Math.floor(p.x),
        z = Math.floor(p.z + offset);
      const below = window.__coop.block("player", x, y - 1, z);
      const lower = window.__coop.block("player", x, y - 2, z);
      const support = [1, 2, 3, 4, 9, 10, 11, 21, 24, 27, 44];
      return (
        (support.includes(below) || (below === 0 && support.includes(lower))) &&
        window.__coop.block("player", x, y, z) === 0 &&
        window.__coop.block("player", x, y + 1, z) === 0
      );
    });
  }, openStart);
  assert.ok(northIsSafe, "open area has a supported approach");
  await driver.aim({ x: openStart.x, y: openStart.y + 1.62, z: openStart.z + 5 }, 80);
  await page.keyboard.down("KeyW");
  await wait(400);
  await page.keyboard.up("KeyW");
  await wait(300);
  await guard();
  await log("player", "prepared on open ground");
  await page.evaluate(() => {
    for (const [actor, text] of [
      ["player", "苗木を植えます"],
      ["companion", "畑の手入れをします"],
    ]) {
      const caption = document.createElement("div");
      caption.id = `record-caption-${actor}`;
      caption.className = `record-caption record-caption-${actor}`;
      caption.textContent = text;
      document.querySelector("#app").append(caption);
    }
  });
  recorder = await page.screencast({
    path: video,
    format: "mp4",
    fps: 30,
    quality: 18,
    speed: 1,
    ffmpegPath: path.resolve("scripts/ffmpeg-capture.py"),
  });
  await wait(1500);
  await log("player", "start");
  await log("companion", "start");
  const results = await Promise.allSettled([plantTree(), tendFarm()]);
  const errors = results.filter((r) => r.status === "rejected");
  if (errors.length) throw Error(errors.map((e) => String(e.reason)).join("; "));
  await page.evaluate(() => window.__coop.say("player", "苗木と畑を育て、資源を再生します。"));
  await wait(4000);
  await guard();
  await page.evaluate(() => document.querySelector("#save-button").click());
  await wait(1000);
  await log("player", "finished");
  await log("companion", "finished");
  console.log("both tasks completed");
} catch (error) {
  failure = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  if (page)
    try {
      await page.keyboard.up("KeyW");
      await page.evaluate(() => {
        window.__coop.stop();
        document.querySelector("#save-button").click();
      });
      await wait(1200);
    } catch (error) {
      console.error("save", String(error));
    }
  if (recorder)
    try {
      await recorder.stop();
    } catch (error) {
      console.error("recording", String(error));
    }
  writeFileSync(
    path.join(out, "two-view-events.json"),
    JSON.stringify({ failure, events }, null, 2) + "\n",
  );
  await browser.close();
}
