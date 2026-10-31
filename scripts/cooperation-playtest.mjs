/** Two independent rule-based controllers cooperate in an ordinary, fresh world. */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer";
import { createDriver, wait } from "./lib/survival-driver.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const out = path.resolve(option("--out", "artifacts/cooperation-playtest"));
const base = option("--url", "http://127.0.0.1:5173/");
const url = new URL(base);
url.search = "?seed=80&mode=survival&view=third-person&coop=1";
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(path.join(os.tmpdir(), "coop-profile-"));
const events = [];
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
let recorder;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__mc?.meshedChunks() >= 40 && window.__coop, {
    timeout: 120000,
  });
  const d = createDriver(page, out);
  const observe = (actor) => page.evaluate((actor) => window.__coop.observe(actor), actor);
  const say = (actor, text) =>
    page.evaluate(({ actor, text }) => window.__coop.say(actor, text), { actor, text });
  const report = async (label) => {
    const a = await observe("player"),
      b = await observe("companion");
    assert.ok(a.vitals.health > 0 && b.vitals.health > 0, "both actors stay alive");
    events.push({ label, time: a.time, player: a, companion: b });
    console.log(
      label,
      JSON.stringify({
        time: a.time,
        playerHealth: a.vitals.health,
        companionHealth: b.vitals.health,
      }),
    );
  };
  const a0 = await observe("player"),
    b0 = await observe("companion");
  assert.ok(
    a0.inventory.every((item) => item === null) && b0.inventory.every((item) => item === null),
    "fresh empty inventories",
  );
  recorder = await page.screencast({
    path: path.join(out, "cooperation.mp4"),
    format: "mp4",
    fps: 30,
    quality: 18,
    speed: 1,
    ffmpegPath: path.resolve("scripts/ffmpeg-capture.py"),
  });
  await page.locator("#play-button").click();
  await wait(800);
  await report("start");

  // Scout independently finds a nearby tree using only the bounded observation API.
  const target = await page.evaluate(() => {
    const me = window.__coop.observe("player"),
      other = me.other,
      found = [];
    if (!other) return null;
    for (let x = Math.floor(me.position.x) - 7; x <= Math.floor(me.position.x) + 7; x++)
      for (let z = Math.floor(me.position.z) - 7; z <= Math.floor(me.position.z) + 7; z++)
        for (let y = Math.floor(me.position.y) - 3; y <= Math.floor(me.position.y) + 3; y++)
          if (window.__coop.block("player", x, y, z) === 6)
            found.push({
              x,
              y,
              z,
              distance: Math.hypot(x + 0.5 - other.x, y + 0.5 - other.y, z + 0.5 - other.z),
            });
    return found.sort((a, b) => a.distance - b.distance)[0] ?? null;
  });
  assert.ok(target, "scout actually observes a nearby tree");
  assert.ok(
    await say("player", `木を発見 ${target.x},${target.y},${target.z}。採取をお願いします。`),
  );
  await d.aim({ x: target.x + 0.5, y: target.y + 1.5, z: target.z + 0.5 });
  await report("scout reports the observed tree");
  await wait(1000);

  // Gatherer reads the scout's message and chooses an action from its own state.
  const message = (await observe("companion")).messages.at(-1)?.text ?? "";
  const match = /木を発見 (-?\d+),(-?\d+),(-?\d+)/.exec(message);
  assert.ok(match, "gatherer received the scout's location");
  const wood = { x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) };
  assert.equal(
    await page.evaluate((p) => window.__coop.block("companion", p.x, p.y, p.z), wood),
    6,
  );
  const b = await observe("companion");
  const yaw = Math.atan2(-(wood.x + 0.5 - b.position.x), -(wood.z + 0.5 - b.position.z));
  assert.ok(await say("companion", "了解。周囲を確認して木を採ります。"));
  assert.ok(
    await page.evaluate(
      (yaw) => window.__coop.move({ forward: 1, right: 0, jump: false, yaw }, 0.4),
      yaw,
    ),
  );
  await wait(650);
  assert.ok(
    await page.evaluate((p) => window.__coop.mine(p.x, p.y, p.z), wood),
    "begin mining an accessible real tree",
  );
  await page.waitForFunction(
    (p) => window.__coop.block("companion", p.x, p.y, p.z) === 0,
    { timeout: 20000 },
    wood,
  );
  assert.equal(
    await page.evaluate((p) => window.__coop.block("companion", p.x, p.y, p.z), wood),
    0,
  );
  assert.ok(
    await page.evaluate(
      (yaw) => window.__coop.move({ forward: 1, right: 0, jump: false, yaw }, 0.35),
      yaw,
    ),
  );
  await page.waitForFunction(
    () => window.__coop.observe("companion").inventory.some((item) => item?.id === "log"),
    { timeout: 15000 },
  );
  const harvested = await observe("companion");
  assert.ok(
    harvested.inventory.some((item) => item?.id === "log"),
    "collect real dropped wood",
  );
  assert.ok(
    await page.evaluate(() => window.__coop.craft("planks")),
    "craft with actually held wood",
  );
  const supplies = await observe("companion");
  const slot = supplies.inventory.findIndex((item) => item?.id === "planks" && item.count >= 2);
  assert.ok(slot >= 0);
  assert.ok(
    await page.evaluate((slot) => window.__coop.give("companion", slot, 2), slot),
    "hand supplies to nearby scout",
  );
  assert.ok(await say("companion", "木材に加工して２個渡しました。"));
  await report("gatherer harvests, crafts and hands over planks");
  await wait(1000);

  // Scout uses the received material via the regular player UI.
  assert.ok((await observe("player")).messages.some((m) => m.text.includes("２個渡しました")));
  await d.equip("planks");
  const grounds = await page.evaluate(() => {
    const me = window.__coop.observe("player").position,
      other = window.__coop.observe("companion").position,
      result = [];
    for (let x = Math.floor(me.x) - 2; x <= Math.floor(me.x) + 2; x++)
      for (let z = Math.floor(me.z) - 2; z <= Math.floor(me.z) + 2; z++) {
        const y = Math.floor(me.y);
        if (
          [1, 2, 3, 4].includes(window.__coop.block("player", x, y - 1, z)) &&
          window.__coop.block("player", x, y, z) === 0 &&
          Math.hypot(x + 0.5 - me.x, z + 0.5 - me.z) > 0.8 &&
          Math.hypot(x + 0.5 - other.x, z + 0.5 - other.z) > 1
        )
          result.push({ x, y: y - 1, z });
      }
    return result;
  });
  let placed = null;
  for (const ground of grounds) {
    await d.aim({ x: ground.x + 0.5, y: ground.y + 0.9, z: ground.z + 0.5 });
    const hit = await page.evaluate(() => window.__mc.target());
    if (!hit || hit.x !== ground.x || hit.y !== ground.y || hit.z !== ground.z) continue;
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
    await wait(250);
    if (
      (await page.evaluate((g) => window.__coop.block("player", g.x, g.y + 1, g.z), ground)) === 10
    ) {
      placed = { ...ground, y: ground.y + 1 };
      break;
    }
  }
  assert.ok(placed, "scout places the received planks with ordinary controls");
  assert.equal(
    await page.evaluate((p) => window.__coop.block("companion", p.x, p.y, p.z), placed),
    10,
    "both see the same placed block",
  );
  assert.ok(await say("player", "受け取った木材を設置できました。"));
  await report("scout places shared material in the common world");
  await wait(1800);
  await recorder.stop();
  recorder = null;
  await page.evaluate(() => document.querySelector("#save-button").click());
  await page.waitForFunction(
    () => document.querySelector("#save-status")?.textContent === "保存済み",
    { timeout: 30000 },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__mc?.meshedChunks() >= 40 && window.__coop, {
    timeout: 120000,
  });
  assert.equal(
    await page.evaluate((p) => window.__coop.block("player", p.x, p.y, p.z), placed),
    10,
    "shared block survives reload",
  );
  assert.ok(
    (await observe("player")).inventory.some((item) => item?.id === "planks" && item.count === 1),
  );
  assert.ok(
    (await observe("companion")).inventory.some(
      (item) => item?.id === "planks" && item.count === 2,
    ),
  );
  await report("shared world and separate inventories restored after reload");
  const solo = new URL(url.href);
  solo.searchParams.delete("coop");
  await page.goto(solo.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__mc?.meshedChunks() >= 40, { timeout: 120000 });
  assert.equal(await page.evaluate(() => !!window.__coop), false, "solo mode has no companion");
  assert.ok(
    (await d.info()).inventory.every((item) => item === null),
    "cooperative save is separate from solo",
  );
  assert.equal(await d.block(placed), 0, "cooperative world edit is separate from solo");
  console.log("ordinary solo save remains separate from the cooperative world");
  writeFileSync(
    path.join(out, "events.json"),
    JSON.stringify({ seed: 80, controllers: "two rule-based policies", events, placed }, null, 2) +
      "\n",
  );
  console.log(`Recording and event log: ${out}`);
} finally {
  if (recorder) await recorder.stop();
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
