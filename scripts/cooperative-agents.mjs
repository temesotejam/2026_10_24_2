/** Run two independent worker policies against one live cooperative world. */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { clearTimeout } from "node:timers";
import puppeteer from "puppeteer";
import { createDriver, wait } from "./lib/survival-driver.mjs";

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
        ground = [],
        beds = [];
      for (let x = Math.floor(p.x) - 7; x <= Math.floor(p.x) + 7; x++)
        for (let z = Math.floor(p.z) - 7; z <= Math.floor(p.z) + 7; z++) {
          const y = Math.floor(p.y);
          const below = window.__coop.block(actor, x, y - 1, z),
            above = window.__coop.block(actor, x, y, z);
          if ([1, 2, 3, 4, 9, 11, 44].includes(below) && above === 0)
            ground.push({ x, y: y - 1, z });
          for (let by = y - 3; by <= y + 3; by++) {
            const id = window.__coop.block(actor, x, by, z);
            if (id === 6) wood.push({ x, y: by, z });
            if (id === 15) beds.push({ x, y: by, z });
          }
        }
      const dist = (a) => Math.hypot(a.x + 0.5 - p.x, a.y + 0.5 - p.y, a.z + 0.5 - p.z);
      return {
        wood: wood.sort((a, b) => dist(a) - dist(b)),
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
      input.jump
    )
      return false;
    const safe = await page.evaluate(
      ({ actor, input, seconds }) => {
        const p = window.__coop.observe(actor).position,
          y = Math.floor(p.y);
        const dx = -Math.sin(input.yaw) * 4.317 * seconds,
          dz = -Math.cos(input.yaw) * 4.317 * seconds;
        for (const t of [0.25, 0.5, 0.75, 1]) {
          const x = Math.floor(p.x + dx * t),
            z = Math.floor(p.z + dz * t);
          const below = window.__coop.block(actor, x, y - 1, z),
            feet = window.__coop.block(actor, x, y, z),
            head = window.__coop.block(actor, x, y + 1, z);
          if (![1, 2, 3, 4, 9, 10, 11, 21, 24, 27, 44].includes(below) || feet !== 0 || head !== 0)
            return false;
        }
        return true;
      },
      { actor, input, seconds },
    );
    if (!safe) return false;
    if (actor === "companion") {
      const accepted = await page.evaluate(
        ({ input, seconds }) => window.__coop.move(input, seconds),
        { input, seconds },
      );
      if (accepted) await wait(seconds * 1000 + 180);
      return accepted;
    }
    const p = (await observe(actor)).position;
    await driver.aim({
      x: p.x - Math.sin(input.yaw) * 5,
      y: p.y + 1.62,
      z: p.z - Math.cos(input.yaw) * 5,
    });
    await page.keyboard.down("KeyW");
    try {
      await wait(seconds * 1000);
    } finally {
      await page.keyboard.up("KeyW");
    }
    return true;
  }
  async function place(actor, item, ground) {
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
    return (
      (await page.evaluate((g) => window.__coop.block("player", g.x, g.y + 1, g.z), ground)) === 10
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
        return (
          actor === "companion" &&
          page.evaluate((p) => window.__coop.mine(p.x, p.y, p.z), params[0])
        );
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
    }, 100000);
    for (const actor of ["player", "companion"]) {
      const worker = new Worker(new URL("./cooperation/policy-worker.mjs", import.meta.url), {
        workerData: { actor },
      });
      workers.push(worker);
      worker.on("message", async (msg) => {
        if (msg.type === "request") {
          try {
            const result = await runAction(actor, msg.method, msg.args);
            if (msg.method === "observe" || msg.method === "scan") {
              events.push({ actor, method: msg.method, result, at: new Date().toISOString() });
            } else if (msg.method !== "block") {
              events.push({
                actor,
                method: msg.method,
                args: msg.args,
                result,
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
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Both independent policies completed",
    JSON.stringify({ health: [final.player.vitals.health, final.companion.vitals.health], out }),
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
