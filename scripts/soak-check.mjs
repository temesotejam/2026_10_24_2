/** Real elapsed-time rendered exploration, saves and reloads. Never advances game time artificially. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance as clock } from "node:perf_hooks";
import puppeteer from "puppeteer";
const args = process.argv.slice(2);
const option = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
const duration = Number(option("--seconds", "7200"));
const reloadSeconds = Number(option("--reload-seconds", "300"));
assert.ok(Number.isInteger(reloadSeconds) && reloadSeconds >= 10 && reloadSeconds <= 300);
assert.ok(Number.isInteger(duration) && duration >= 30 && duration <= 7200);
const url = new URL(option("--url", "http://localhost:4173/"));
url.searchParams.set("seed", "2026");
url.searchParams.set("mode", "creative");
const out = "visual-check/soak";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--disable-background-timer-throttling",
    "--window-size=1280,720",
  ],
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const samples = [];
let reloads = 0;
let edits = 0;
const report = {
  url: url.href,
  durationRequested: duration,
  mode: "creative",
  viewport: [1280, 720],
  startedAt: new Date().toISOString(),
  samples,
  reloads,
  edits,
  completed: false,
};
const persist = () =>
  writeFileSync(`${out}/results.json`, JSON.stringify({ ...report, reloads, edits }, null, 2));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const boot = async () => {
    await page.waitForFunction(() => window.__mc?.meshedChunks() >= 60, { timeout: 120000 });
  };
  const play = async () => {
    await page.click("#play-button");
    await page.waitForFunction(() => window.__mc.mode() !== "idle");
  };
  const stop = async () => {
    for (const key of ["KeyW", "KeyS", "Space"]) await page.keyboard.up(key);
    await page.evaluate(() => {
      if (document.pointerLockElement) document.exitPointerLock();
    });
    await page.waitForFunction(() => window.__mc.mode() === "idle");
  };
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await boot();
  await play();
  const client = await page.createCDPSession();
  const start = clock.now();
  let lastSample = -60000,
    lastReload = start,
    lastEdit = start;
  let held = "";
  while (clock.now() - start < duration * 1000) {
    assert.equal(errors.length, 0, errors.join("\n"));
    const elapsed = clock.now() - start;
    const direction = Math.floor(elapsed / 120000) % 2 === 0 ? "KeyW" : "KeyS";
    if (direction !== held) {
      if (held) await page.keyboard.up(held);
      await page.keyboard.down(direction);
      await page.keyboard.down("Space");
      held = direction;
    }
    if (clock.now() - lastEdit > 30000) {
      await page.keyboard.up(held);
      await page.keyboard.up("Space");
      held = "";
      await page.evaluate(() =>
        document.dispatchEvent(new MouseEvent("mousemove", { movementX: 0, movementY: 2000 })),
      );
      const target = await page.evaluate(() => window.__mc.target());
      if (target) {
        const before = await page.evaluate((t) => window.__mc.blockAt(t.x, t.y, t.z), target);
        await page.mouse.down();
        await page.mouse.up();
        await wait(200);
        const after = await page.evaluate((t) => window.__mc.blockAt(t.x, t.y, t.z), target);
        if (before !== after) edits++;
      }
      await page.evaluate(() => {
        document.dispatchEvent(new MouseEvent("mousemove", { movementX: 0, movementY: -2000 }));
        document.dispatchEvent(new MouseEvent("mousemove", { movementX: 0, movementY: 710 }));
      });
      lastEdit = clock.now();
    }
    if (clock.now() - lastReload > reloadSeconds * 1000) {
      await stop();
      held = "";
      await page.click("#save-button");
      await page.waitForFunction(
        () => document.querySelector("#save-status").textContent === "保存済み",
      );
      const before = await page.evaluate(() => ({
        position: window.__mc.position(),
        inventory: window.__mc.inventory(),
        time: window.__mc.time(),
      }));
      await page.reload({ waitUntil: "domcontentloaded" });
      await boot();
      const after = await page.evaluate(() => ({
        position: window.__mc.position(),
        inventory: window.__mc.inventory(),
        time: window.__mc.time(),
      }));
      assert.deepEqual(after.inventory, before.inventory);
      assert.ok(
        Math.hypot(
          after.position.x - before.position.x,
          after.position.y - before.position.y,
          after.position.z - before.position.z,
        ) < 0.01,
      );
      assert.ok(Math.abs(after.time - before.time) < 0.1);
      reloads++;
      lastReload = clock.now();
      await play();
    }
    if (elapsed - lastSample >= 60000) {
      const metrics = await page.evaluate(() => ({
        position: window.__mc.position(),
        loaded: window.__mc.loadedChunks(),
        meshed: window.__mc.meshedChunks(),
        heap: window.performance.memory?.usedJSHeapSize ?? null,
        time: window.__mc.time(),
      }));
      assert.ok(
        Number.isFinite(metrics.position.y) && metrics.position.y >= 0 && metrics.position.y < 96,
        "player remains in world",
      );
      assert.ok(metrics.loaded <= 196, "loaded chunks stay bounded");
      if (metrics.heap !== null)
        assert.ok(metrics.heap < 256 * 1024 * 1024, "JS heap stays below 256 MB");
      const sample = { elapsedSeconds: elapsed / 1000, ...metrics };
      samples.push(sample);
      console.log(JSON.stringify(sample));
      lastSample = elapsed;
      persist();
      if (samples.length % 10 === 0) {
        await page.screenshot({ path: `${out}/minute-${Math.floor(elapsed / 60000)}.png` });
        await client.send("HeapProfiler.collectGarbage");
      }
    }
    await wait(500);
  }
  await stop();
  await page.click("#save-button");
  await page.waitForFunction(
    () => document.querySelector("#save-status").textContent === "保存済み",
  );
  assert.equal(errors.length, 0);
  if (duration >= reloadSeconds * 2) assert.ok(reloads > 0);
  if (duration >= 120) assert.ok(edits > 0);
  report.elapsedSeconds = (clock.now() - start) / 1000;
  report.completed = true;
  report.finishedAt = new Date().toISOString();
  persist();
  await page.screenshot({ path: `${out}/final.png` });
  console.log(
    `PASS rendered soak: ${report.elapsedSeconds.toFixed(1)}s, ${reloads} reloads, ${edits} edits`,
  );
} finally {
  persist();
  await browser.close();
}
