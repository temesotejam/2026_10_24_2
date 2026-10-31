/** Run two independent worker policies against one live cooperative world. */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { clearTimeout } from "node:timers";
import puppeteer from "puppeteer";
import { createDriver, wait } from "./lib/survival-driver.mjs";
import { safePath } from "./cooperation/navigation.mjs";
import { canPlantSapling } from "./cooperation/renewal.mjs";
import { safetyStop } from "./cooperation/safety.mjs";
import { hasParallelMining } from "./cooperation/overlap.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
};
const out = path.resolve(option("--out", `artifacts/cooperative-agents-${Date.now()}`));
if (["events.json", "autonomous-cooperation.mp4"].some((file) => existsSync(path.join(out, file))))
  throw Error(`出力先に既存の実験結果があります。別のフォルダを指定してください: ${out}`);
const url = new URL(option("--url", "http://127.0.0.1:5173/"));
url.search = `?seed=${Number(option("--seed", "80"))}&mode=survival&view=third-person&coop=1`;
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(path.join(os.tmpdir(), "coop-agents-"));
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
const workers = [];
const events = [];
let recorder;
let page;
try {
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__mc?.meshedChunks() >= 40 && window.__coop, {
    timeout: 120000,
  });
  const driver = createDriver(page, out);
  const observe = (actor) => page.evaluate((actor) => window.__coop.observe(actor), actor);
  let playerMining = false;
  let playerMiningTarget = null;
  for (const actor of ["player", "companion"]) {
    const s = await observe(actor);
    assert.ok(
      s.inventory.every((item) => item === null),
      "use a fresh survival world",
    );
  }
  recorder = await page.screencast({
    path: path.join(out, "autonomous-cooperation.mp4"),
    format: "mp4",
    fps: 30,
    quality: 18,
    speed: 1,
    ffmpegPath: path.resolve("scripts/ffmpeg-capture.py"),
  });
  await page.locator("#play-button").click();
  await wait(700);
  async function scan(actor) {
    return page.evaluate((actor) => {
      const o = window.__coop.observe(actor),
        p = o.position,
        wood = [],
        leaves = [],
        ground = [],
        beds = [];
      for (let x = Math.floor(p.x) - 7; x <= Math.floor(p.x) + 7; x++)
        for (let z = Math.floor(p.z) - 7; z <= Math.floor(p.z) + 7; z++) {
          const y = Math.floor(p.y);
          const below = window.__coop.block(actor, x, y - 1, z),
            above = window.__coop.block(actor, x, y, z);
          if ([1, 2, 3, 4, 9, 11, 44].includes(below) && above === 0)
            ground.push({ x, y: y - 1, z, support: below });
          for (let by = y - 3; by <= y + 3; by++) {
            const id = window.__coop.block(actor, x, by, z);
            if (id === 6) wood.push({ x, y: by, z });
            if (id === 7) leaves.push({ x, y: by, z });
            if (id === 15) beds.push({ x, y: by, z });
          }
        }
      const dist = (a) => Math.hypot(a.x + 0.5 - p.x, a.y + 0.5 - p.y, a.z + 0.5 - p.z);
      return {
        wood: wood.sort((a, b) => dist(a) - dist(b)),
        leaves: leaves.sort((a, b) => dist(a) - dist(b)),
        ground: ground.sort((a, b) => dist(a) - dist(b)),
        beds,
      };
    }, actor);
  }
  async function safeMove(actor, input, seconds) {
    if (
      !Number.isFinite(seconds) ||
      seconds <= 0 ||
      seconds > 0.5 ||
      input.forward !== 1 ||
      input.right !== 0 ||
      typeof input.jump !== "boolean"
    )
      return false;
    const safe = await page.evaluate(
      ({ actor, input, seconds }) => {
        const p = window.__coop.observe(actor).position,
          y = Math.round(p.y);
        const dx = -Math.sin(input.yaw) * 4.317 * seconds,
          dz = -Math.cos(input.yaw) * 4.317 * seconds;
        for (const t of [0.25, 0.5, 0.75, 1]) {
          const x = Math.floor(p.x + dx * t),
            z = Math.floor(p.z + dz * t);
          const below = window.__coop.block(actor, x, y - 1, z),
            feet = window.__coop.block(actor, x, y, z),
            head = window.__coop.block(actor, x, y + 1, z);
          const support = [1, 2, 3, 4, 9, 10, 11, 21, 24, 27, 44];
          const lower = window.__coop.block(actor, x, y - 2, z);
          const top = window.__coop.block(actor, x, y + 2, z);
          const level = support.includes(below) && feet === 0 && head === 0;
          const down = support.includes(lower) && below === 0 && feet === 0 && head === 0;
          const up = input.jump && support.includes(feet) && head === 0 && top === 0;
          if (!level && !down && !up) return false;
          if (input.jump && top !== 0) return false;
        }
        return true;
      },
      { actor, input, seconds },
    );
    if (!safe) return false;
    if (actor === "companion") {
      const start = (await observe(actor)).time;
      const accepted = await page.evaluate(
        ({ input, seconds }) => window.__coop.move(input, seconds),
        { input, seconds },
      );
      if (accepted) {
        try {
          await page.waitForFunction(
            (end) => window.__mc.time() >= end,
            { timeout: 5000 },
            start + seconds,
          );
        } catch {
          await page.evaluate(() => window.__coop.stop());
          return false;
        }
      }
      return accepted;
    }
    const p = (await observe(actor)).position;
    await driver.aim({
      x: p.x - Math.sin(input.yaw) * 5,
      y: p.y + 1.62,
      z: p.z - Math.cos(input.yaw) * 5,
    });
    if (input.jump) await page.keyboard.down("Space");
    const start = (await observe(actor)).time;
    await page.keyboard.down("KeyW");
    try {
      await page.waitForFunction(
        (end) => window.__mc.time() >= end,
        { timeout: 5000 },
        start + seconds,
      );
    } catch {
      return false;
    } finally {
      await page.keyboard.up("KeyW");
      if (input.jump) await page.keyboard.up("Space");
    }
    return true;
  }
  async function minePlayerLeaf(target) {
    if (!target || ![target.x, target.y, target.z].every(Number.isInteger)) return false;
    if ((await page.evaluate((p) => window.__coop.block("player", p.x, p.y, p.z), target)) !== 7)
      return false;
    const p = (await observe("player")).position;
    const points = [
      { x: target.x + 0.5, y: target.y + 0.5, z: target.z + 0.5 },
      {
        x: Math.max(target.x + 0.05, Math.min(target.x + 0.95, p.x)),
        y: target.y + 0.5,
        z: Math.max(target.z + 0.05, Math.min(target.z + 0.95, p.z)),
      },
    ];
    for (const point of points) {
      await driver.aim(point, 75);
      const hit = await page.evaluate(() => window.__mc.target());
      if (!hit || hit.x !== target.x || hit.y !== target.y || hit.z !== target.z) continue;
      const deadline = Date.now() + 5000;
      playerMining = true;
      playerMiningTarget = target;
      try {
        await page.mouse.down();
        const peer = await observe("companion");
        events.push({
          actor: "player",
          method: "mining-start",
          target,
          peerActivity: peer.activity,
          at: new Date().toISOString(),
        });
        while (Date.now() < deadline) {
          if (safetyStop(await observe("player"))) return false;
          const current = await page.evaluate(() => window.__mc.target());
          if (
            !current ||
            current.x !== target.x ||
            current.y !== target.y ||
            current.z !== target.z
          )
            return (
              (await page.evaluate((p) => window.__coop.block("player", p.x, p.y, p.z), target)) ===
              0
            );
          if (
            (await page.evaluate((p) => window.__coop.block("player", p.x, p.y, p.z), target)) === 0
          )
            return true;
          await wait(60);
        }
      } finally {
        await page.mouse.up();
        events.push({
          actor: "player",
          method: "mining-end",
          target,
          at: new Date().toISOString(),
        });
        playerMining = false;
        playerMiningTarget = null;
      }
      return false;
    }
    return false;
  }
  async function navigate(actor, target) {
    if (!target || ![target.x, target.y, target.z].every(Number.isFinite)) return false;
    const snapshot = await page.evaluate((actor) => {
      const p = window.__coop.observe(actor).position,
        blocks = {},
        base = Math.round(p.y);
      for (let x = Math.floor(p.x) - 6; x <= Math.floor(p.x) + 6; x++)
        for (let z = Math.floor(p.z) - 6; z <= Math.floor(p.z) + 6; z++)
          for (let y = base - 4; y <= base + 4; y++) {
            const block = window.__coop.block(actor, x, y, z);
            if (block !== null) blocks[`${x},${y},${z}`] = block;
          }
      return { position: p, blocks, onGround: window.__coop.observe(actor).onGround };
    }, actor);
    const route = safePath({ position: snapshot.position, target, blocks: snapshot.blocks });
    if (!route || route.length < 2 || !snapshot.onGround) return false;
    const next = route[1],
      p = snapshot.position;
    const dx = next.x + 0.5 - p.x,
      dz = next.z + 0.5 - p.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.03) return false;
    const input = { forward: 1, right: 0, jump: next.y > route[0].y, yaw: Math.atan2(-dx, -dz) };
    return safeMove(actor, input, Math.min(0.25, distance / 4.317));
  }
  async function place(actor, item, ground) {
    if (item === "sapling") {
      if (actor === "companion" && playerMining) return false;
      const cells = await page.evaluate(
        ({ actor, ground }) => {
          const cells = [];
          for (let y = ground.y; y <= ground.y + 5; y++)
            cells.push(window.__coop.block(actor, ground.x, y, ground.z));
          return cells;
        },
        { actor, ground },
      );
      if (!canPlantSapling(cells)) return false;
    }
    if (actor === "companion" && item === "sapling" && playerMining) return false;
    if (actor === "companion")
      return page.evaluate((g) => window.__coop.place(g.x, g.y + 1, g.z), ground);
    if (!(await observe("player")).inventory.some((s) => s?.id === item)) return false;
    await driver.equip(item);
    await driver.aim({ x: ground.x + 0.5, y: ground.y + 0.9, z: ground.z + 0.5 });
    const hit = await page.evaluate(() => window.__mc.target());
    if (!hit || hit.x !== ground.x || hit.y !== ground.y || hit.z !== ground.z) return false;
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
    await wait(160);
    const expected = item === "sapling" ? 25 : item === "planks" ? 10 : null;
    return (
      expected !== null &&
      (await page.evaluate((g) => window.__coop.block("player", g.x, g.y + 1, g.z), ground)) ===
        expected
    );
  }
  async function runAction(actor, method, params) {
    switch (method) {
      case "observe":
        return observe(actor);
      case "scan":
        return scan(actor);
      case "block":
        return page.evaluate(({ actor, params }) => window.__coop.block(actor, ...params), {
          actor,
          params,
        });
      case "say":
        return page.evaluate(({ actor, text }) => window.__coop.say(actor, text), {
          actor,
          text: params[0],
        });
      case "move":
        return safeMove(actor, params[0], params[1]);
      case "navigate":
        return navigate(actor, params[0]);
      case "look": {
        if (actor !== "player") return false;
        const target = params[0],
          p = (await observe(actor)).position;
        if (
          !target ||
          ![target.x, target.y, target.z].every(Number.isFinite) ||
          Math.hypot(target.x - p.x, target.y - p.y, target.z - p.z) > 24
        )
          return false;
        await driver.aim({ x: target.x, y: target.y + 1.1, z: target.z });
        return true;
      }
      case "stop":
        if (actor === "player") {
          await page.keyboard.up("KeyW");
          await page.mouse.up();
        } else await page.evaluate(() => window.__coop.stop());
        return true;
      case "select":
        return (
          actor === "companion" && page.evaluate((slot) => window.__coop.select(slot), params[0])
        );
      case "mine":
        return actor === "companion"
          ? page.evaluate((p) => window.__coop.mine(p.x, p.y, p.z), params[0])
          : minePlayerLeaf(params[0]);
      case "blockingLeaf":
        return (
          actor === "companion" &&
          page.evaluate((p) => window.__coop.blockingLeaf(p.x, p.y, p.z), params[0])
        );
      case "peerBusy": {
        if (actor !== "companion" || !playerMining) return false;
        const self = await observe(actor);
        return self.other !== null;
      }
      case "craft":
        return actor === "companion" && page.evaluate((id) => window.__coop.craft(id), params[0]);
      case "give":
        return page.evaluate(({ actor, slot, count }) => window.__coop.give(actor, slot, count), {
          actor,
          slot: params[0],
          count: params[1],
        });
      case "place":
        return place(actor, params[0], params[1]);
      case "attack":
        return actor === "companion" && page.evaluate((id) => window.__coop.attack(id), params[0]);
      case "sleep": {
        const bed = params[0];
        if (actor === "companion")
          return page.evaluate((p) => window.__coop.sleep(p.x, p.y, p.z), bed);
        const before = await page.evaluate(() => window.__mc.time());
        const pos = (await observe("player")).position;
        const points = [
          { x: bed.x + 0.5, y: bed.y + 0.5, z: bed.z + 0.5 },
          {
            x: Math.max(bed.x + 0.05, Math.min(bed.x + 0.95, pos.x)),
            y: bed.y + 0.5,
            z: Math.max(bed.z + 0.05, Math.min(bed.z + 0.95, pos.z)),
          },
        ];
        for (const point of points) {
          await driver.aim(point);
          const hit = await page.evaluate(() => window.__mc.target());
          if (!hit || hit.x !== bed.x || hit.y !== bed.y || hit.z !== bed.z) continue;
          await page.mouse.down({ button: "right" });
          await page.mouse.up({ button: "right" });
          await wait(250);
          return (await page.evaluate(() => window.__mc.time())) - before > 10;
        }
        return false;
      }
      default:
        throw Error(`Unknown action ${method}`);
    }
  }
  let finished = 0,
    settled = false;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(Error("cooperative run timed out"));
      }
    }, 360000);
    for (const actor of ["player", "companion"]) {
      const worker = new Worker(new URL("./cooperation/policy-worker.mjs", import.meta.url), {
        workerData: { actor },
      });
      workers.push(worker);
      worker.on("message", async (msg) => {
        if (msg.type === "request") {
          try {
            const startedAt = new Date().toISOString();
            const result = await runAction(actor, msg.method, msg.args);
            if (msg.method === "observe" || msg.method === "scan") {
              events.push({ actor, method: msg.method, result, at: new Date().toISOString() });
            } else if (msg.method !== "block" && msg.method !== "peerBusy") {
              events.push({
                actor,
                method: msg.method,
                args: msg.args,
                result,
                startedAt,
                ...(actor === "companion" && msg.method === "mine"
                  ? { peerMining: playerMiningTarget }
                  : {}),
                at: new Date().toISOString(),
              });
              console.log(actor, msg.method, JSON.stringify({ args: msg.args, result }));
            }
            worker.postMessage({ id: msg.id, result });
          } catch (error) {
            worker.postMessage({ id: msg.id, error: String(error) });
          }
        } else if (msg.type === "complete") {
          events.push({ actor, method: "complete", elapsedMs: msg.elapsedMs });
          finished++;
          if (finished === 2 && !settled) {
            settled = true;
            clearTimeout(timeout);
            resolve();
          }
        } else if (msg.type === "failed" && !settled) {
          settled = true;
          clearTimeout(timeout);
          reject(Error(`${actor}: ${msg.error}`));
        }
      });
      worker.on("error", (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(error);
        }
      });
      worker.on("exit", (code) => {
        if (code && !settled) {
          settled = true;
          clearTimeout(timeout);
          reject(Error(`${actor} exited ${code}`));
        }
      });
    }
  });
  const final = { player: await observe("player"), companion: await observe("companion") };
  assert.ok(
    final.player.vitals.health > 0 && final.companion.vitals.health > 0,
    "both agents survive",
  );
  assert.equal(events.filter((e) => e.method === "complete").length, 2);
  assert.ok(events.some((e) => e.actor === "player" && e.method === "place" && e.result));
  assert.ok(events.some((e) => e.actor === "companion" && e.method === "place" && e.result));
  assert.ok(events.some((e) => e.actor === "companion" && e.method === "give" && e.result));
  const simultaneousMining = hasParallelMining(events);
  if (args.includes("--require-overlap"))
    assert.ok(simultaneousMining, "verify that both actors actually work at the same time");
  const planting = events.find(
    (e) =>
      e.method === "say" &&
      e.result &&
      typeof e.args?.[0] === "string" &&
      JSON.parse(e.args[0]).type === "replanted",
  );
  assert.ok(planting, "actually plant a replacement sapling before completing");
  const sapling = JSON.parse(planting.args[0]).position;
  const planted = await page.evaluate(
    ({ actor, sapling }) => window.__coop.block(actor, sapling.x, sapling.y, sapling.z),
    { actor: planting.actor, sapling },
  );
  assert.equal(planted, 25, "replacement sapling remains in the shared world");
  await wait(1000);
  await recorder.stop();
  recorder = null;
  writeFileSync(
    path.join(out, "events.json"),
    JSON.stringify(
      {
        seed: Number(url.searchParams.get("seed")),
        controller: "two separate rule-policy worker threads",
        events,
        final,
        simultaneousMining,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Both independent policies completed",
    JSON.stringify({
      health: [final.player.vitals.health, final.companion.vitals.health],
      simultaneousMining,
      out,
    }),
  );
} catch (error) {
  const final = page
    ? await page
        .evaluate(
          () =>
            window.__coop && {
              player: window.__coop.observe("player"),
              companion: window.__coop.observe("companion"),
            },
        )
        .catch(() => null)
    : null;
  writeFileSync(
    path.join(out, "events.json"),
    JSON.stringify(
      {
        seed: Number(url.searchParams.get("seed")),
        controller: "two separate rule-policy worker threads",
        error: String(error),
        events,
        final,
      },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  for (const worker of workers) await worker.terminate();
  if (recorder) await recorder.stop();
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
