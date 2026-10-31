/** Continue the copied survival save using two independent builder policies. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import puppeteer from "puppeteer";
import { createDriver, wait } from "./lib/survival-driver.mjs";
import { safePath } from "./cooperation/navigation.mjs";
import { safetyStop } from "./cooperation/safety.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
};
const root = path.resolve(option("--out", "/workspace/artifacts/village-coop"));
const profile = path.resolve(option("--profile", path.join(root, "profile")));
const preparation = JSON.parse(readFileSync(path.join(root, "preparation.json"), "utf8"));
const resume = args.includes("--resume");
const video = path.resolve(
  option(
    "--recording",
    path.join(root, resume ? "village-building-continued.mp4" : "village-building.mp4"),
  ),
);
assert.ok(!existsSync(video), "do not overwrite a prior recording");
mkdirSync(root, { recursive: true });
const url = new URL(option("--url", "http://127.0.0.1:4179/"));
url.search = "?seed=2026&mode=survival&view=third-person&coop=1";
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
let page,
  recorder,
  failure = null;
const workers = [],
  events = [];
try {
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__mc?.meshedChunks() >= 40 && window.__coop, {
    timeout: 120000,
  });
  const driver = createDriver(page, root);
  const observe = (actor) => page.evaluate((actor) => window.__coop.observe(actor), actor);
  const block = (actor, p) =>
    page.evaluate(({ actor, p }) => window.__coop.block(actor, p.x, p.y, p.z), { actor, p });
  const log = (event) => {
    events.push({ ...event, at: new Date().toISOString() });
    console.log(JSON.stringify(events.at(-1)));
  };
  async function guard() {
    for (const actor of ["player", "companion"]) {
      const reason = safetyStop(await observe(actor));
      if (reason) throw Error(`safety stop for ${actor}: ${reason.type}`);
    }
  }
  async function give(id, count) {
    await guard();
    const s = await observe("player");
    const slot = s.inventory.findIndex((i) => i?.id === id && i.count >= count);
    assert.ok(slot >= 0, `missing ${id}`);
    assert.ok(
      await page.evaluate(({ slot, count }) => window.__coop.give("player", slot, count), {
        slot,
        count,
      }),
      `give ${id}`,
    );
  }
  async function move(actor, input, seconds) {
    const safe = await page.evaluate(
      ({ actor, input, seconds }) => {
        const p = window.__coop.observe(actor).position,
          y = Math.round(p.y);
        const dx = -Math.sin(input.yaw) * 4.317 * seconds,
          dz = -Math.cos(input.yaw) * 4.317 * seconds;
        for (const t of [0.25, 0.5, 0.75, 1]) {
          const x = Math.floor(p.x + dx * t),
            z = Math.floor(p.z + dz * t);
          const b = (yy) => window.__coop.block(actor, x, yy, z);
          const solid = [1, 2, 3, 4, 9, 10, 11, 21, 24, 27, 44];
          if (
            !(solid.includes(b(y - 1)) && b(y) === 0 && b(y + 1) === 0) &&
            !(solid.includes(b(y - 2)) && b(y - 1) === 0 && b(y) === 0 && b(y + 1) === 0) &&
            !(input.jump && solid.includes(b(y)) && b(y + 1) === 0 && b(y + 2) === 0)
          )
            return false;
        }
        return true;
      },
      { actor, input, seconds },
    );
    if (!safe) return false;
    const start = (await observe(actor)).time;
    if (actor === "companion") {
      if (
        !(await page.evaluate(({ input, seconds }) => window.__coop.move(input, seconds), {
          input,
          seconds,
        }))
      )
        return false;
    } else {
      const p = (await observe(actor)).position;
      await driver.aim(
        { x: p.x - Math.sin(input.yaw) * 5, y: p.y + 1.62, z: p.z - Math.cos(input.yaw) * 5 },
        25,
      );
      if (input.jump) await page.keyboard.down("Space");
      await page.keyboard.down("KeyW");
    }
    try {
      await page.waitForFunction(
        (end) => window.__mc.time() >= end,
        { timeout: 5000 },
        start + seconds,
      );
    } finally {
      if (actor === "player") {
        await page.keyboard.up("KeyW");
        if (input.jump) await page.keyboard.up("Space");
      } else await page.evaluate(() => window.__coop.stop());
    }
    return true;
  }
  const routes = new Map();
  async function navigate(actor, target) {
    const snap = await page.evaluate((actor) => {
      const o = window.__coop.observe(actor),
        p = o.position,
        blocks = {},
        base = Math.round(p.y);
      for (let x = Math.floor(p.x) - 6; x <= Math.floor(p.x) + 6; x++)
        for (let z = Math.floor(p.z) - 6; z <= Math.floor(p.z) + 6; z++)
          for (let y = base - 4; y <= base + 4; y++) {
            const b = window.__coop.block(actor, x, y, z);
            if (b !== null) blocks[`${x},${y},${z}`] = b;
          }
      return { position: p, blocks, onGround: o.onGround };
    }, actor);
    // Only a bounded neighborhood is observable. Aim for progress toward a distant
    // destination instead of demanding a path all the way outside that neighborhood.
    const distance = Math.hypot(
      snap.position.x - target.x,
      snap.position.y - target.y,
      snap.position.z - target.z,
    );
    if (!snap.onGround) {
      await wait(100);
      return true;
    }
    const destination = `${target.x},${target.y},${target.z},${target.radius}`;
    let cached = routes.get(actor);
    if (cached?.destination !== destination) cached = null;
    if (cached?.steps.length) {
      const next = cached.steps[0];
      if (
        Math.hypot(next.x + 0.5 - snap.position.x, next.z + 0.5 - snap.position.z) < 0.27 &&
        Math.abs(next.y - snap.position.y) < 0.35
      )
        cached.steps.shift();
    }
    if (!cached?.steps.length) {
      let route = null;
      for (const advance of [4, 3, 2, 1, 0.5]) {
        const candidate = safePath({
          position: snap.position,
          target,
          blocks: snap.blocks,
          radius: Math.max(target.radius ?? 1.7, distance - advance),
        });
        if (candidate && candidate.length > 1) {
          route = candidate;
          break;
        }
      }
      if (!route) {
        routes.delete(actor);
        return false;
      }
      cached = { destination, steps: route.slice(1) };
      routes.set(actor, cached);
    }
    const next = cached.steps[0],
      p = snap.position,
      dx = next.x + 0.5 - p.x,
      dz = next.z + 0.5 - p.z,
      dist = Math.hypot(dx, dz);
    if (dist < 0.03) return false;
    const moved = await move(
      actor,
      { forward: 1, right: 0, jump: next.y > Math.round(p.y), yaw: Math.atan2(-dx, -dz) },
      Math.min(0.25, dist / 4.317),
    );
    if (!moved) routes.delete(actor);
    return moved;
  }
  async function place(actor, item, cell) {
    if ((await block(actor, cell)) !== 0) return false;
    const s = await observe(actor);
    if (actor === "companion") {
      const slot = s.inventory.findIndex((v, i) => i < 9 && v?.id === item);
      if (slot < 0 || !(await page.evaluate((slot) => window.__coop.select(slot), slot)))
        return false;
      return page.evaluate((c) => window.__coop.place(c.x, c.y, c.z), cell);
    }
    if (!s.inventory.some((v) => v?.id === item)) return false;
    await driver.equip(item);
    for (const [dx, dy, dz] of [
      [0, -1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
      [0, 1, 0],
    ]) {
      const support = { x: cell.x + dx, y: cell.y + dy, z: cell.z + dz };
      const supportBlock = await block(actor, support);
      if (supportBlock === null || [0, 5, 26].includes(supportBlock)) continue;
      for (const a of [0.5, 0.1, 0.9])
        for (const b of [0.5, 0.1, 0.9]) {
          const point = {
            x: support.x + (dx ? (dx > 0 ? 0.05 : 0.95) : a),
            y: support.y + (dy ? (dy > 0 ? 0.05 : 0.95) : dx ? a : b),
            z: support.z + (dz ? (dz > 0 ? 0.05 : 0.95) : b),
          };
          if (
            Math.hypot(
              point.x - s.position.x,
              point.y - s.position.y - 1.62,
              point.z - s.position.z,
            ) > 4.5
          )
            continue;
          await driver.aim(point, 15);
          const hit = await page.evaluate(() => window.__mc.placementTarget());
          if (!hit || hit.x !== cell.x || hit.y !== cell.y || hit.z !== cell.z) continue;
          await page.mouse.down({ button: "right" });
          await page.mouse.up({ button: "right" });
          await wait(40);
          if ((await block(actor, cell)) === (item === "bed" ? 15 : 11)) return true;
        }
    }
    return false;
  }
  async function action(actor, method, values) {
    if (method !== "observe") await guard();
    if (method === "observe") return observe(actor);
    if (method === "block") return block(actor, values[0]);
    if (method === "navigate") return navigate(actor, values[0]);
    if (method === "place") {
      const ok = await place(actor, ...values);
      if (ok) log({ actor, method, item: values[0], cell: values[1] });
      return ok;
    }
    if (method === "say")
      return page.evaluate(({ actor, text }) => window.__coop.say(actor, text), {
        actor,
        text: values[0],
      });
    throw Error(`unknown action: ${method}`);
  }
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
  await guard();
  log({ phase: "begin", player: await observe("player"), companion: await observe("companion") });
  // The actors share existing materials, not injected items.
  if (!resume) {
    await give("string", 24);
    await give("planks", 6);
    await give("cobble", 32);
    for (let n = 0; n < 6; n++)
      assert.ok(await page.evaluate(() => window.__coop.craft("wool")), "craft wool");
    for (let n = 0; n < 2; n++)
      assert.ok(
        await page.evaluate((table) => window.__coop.craft("bed", table), preparation.table),
        "craft bed at table",
      );
    const companion = await observe("companion");
    const bedSlot = companion.inventory.findIndex((s) => s?.id === "bed");
    assert.ok(
      bedSlot >= 0 &&
        (await page.evaluate((slot) => window.__coop.give("companion", slot, 1), bedSlot)),
      "share one actual bed",
    );
    log({ phase: "materials shared" });
  }
  const sites = { player: { x: 198, y: 35, z: -72 }, companion: { x: 205, y: 35, z: -83 } };
  const builderResults = await Promise.allSettled(
    Object.entries(sites).map(
      ([actor, center]) =>
        new Promise((resolve, reject) => {
          const worker = new Worker(
            new URL("./cooperation/village-builder-worker.mjs", import.meta.url),
            { workerData: { actor, center } },
          );
          workers.push(worker);
          worker.on("message", async (message) => {
            if (message.type === "complete") {
              log({ phase: "builder complete", actor, plan: message.plan });
              resolve();
              return;
            }
            if (message.type === "failed") {
              reject(Error(`${actor}: ${message.error}`));
              return;
            }
            try {
              const result = await action(actor, message.method, message.args);
              worker.postMessage({ id: message.id, result });
            } catch (error) {
              worker.postMessage({ id: message.id, error: String(error) });
            }
          });
          worker.on("error", reject);
        }),
    ),
  );
  const errors = builderResults.filter((result) => result.status === "rejected");
  if (errors.length) throw Error(errors.map((error) => String(error.reason)).join("; "));
  await guard();
  await page.evaluate(() => document.querySelector("#save-button").click());
  await wait(1200);
  log({
    phase: "both builders completed",
    player: await observe("player"),
    companion: await observe("companion"),
  });
  writeFileSync(
    path.join(root, "building-events.json"),
    JSON.stringify({ sites, events }, null, 2) + "\n",
  );
} catch (error) {
  failure = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const worker of workers) await worker.terminate();
  if (page)
    try {
      await page.keyboard.up("KeyW");
      await page.keyboard.up("Space");
      try {
        await page.mouse.up();
      } catch {
        /* Mouse was not held. */
      }
      await page.evaluate(() => window.__coop.stop());
      await page.evaluate(() => document.querySelector("#save-button").click());
      await wait(1200);
      const state = await page.evaluate(() => ({
        player: window.__coop.observe("player"),
        companion: window.__coop.observe("companion"),
      }));
      writeFileSync(
        path.join(root, "building-last-state.json"),
        JSON.stringify({ failure, state, events }, null, 2) + "\n",
      );
    } catch (error) {
      console.error("final save failed", String(error));
    }
  if (recorder)
    try {
      await recorder.stop();
    } catch (error) {
      console.error(String(error));
    }
  await browser.close();
}
