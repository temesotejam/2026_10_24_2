/** Reproducible measurements; cloud software rendering is not a PC performance certificate. */
import assert from "node:assert/strict";
import { performance as nodePerformance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer";
const args = process.argv.slice(2);
const value = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
const seconds = Number(value("--seconds", "20"));
assert.ok(seconds >= 5 && seconds <= 7200);
const seeds = value("--seeds", "1,2026,-987654321").split(",").map(Number);
assert.ok(seeds.every(Number.isInteger));
const base = new URL(value("--url", "http://localhost:4173/"));
mkdirSync("visual-check/performance", { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--window-size=1280,720"],
});
const results = [];
try {
  for (const seed of seeds) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const url = new URL(base);
    url.searchParams.set("seed", String(seed));
    url.searchParams.set("mode", "creative");
    const start = nodePerformance.now();
    await page.goto(url.href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__mc?.meshedChunks() >= 60, { timeout: 120000 });
    const readyMs = nodePerformance.now() - start;
    await page.click("#play-button");
    const metrics = await page.evaluate(
      (duration) =>
        new Promise((resolve) => {
          const frames = [];
          const begin = window.performance.now();
          let last = begin;
          const frame = (now) => {
            frames.push(now - last);
            last = now;
            if (now - begin < duration * 1000) {
              window.requestAnimationFrame(frame);
              return;
            }
            frames.sort((a, b) => a - b);
            const elapsed = now - begin;
            resolve({
              seconds: elapsed / 1000,
              fps: (frames.length * 1000) / elapsed,
              frameMsMedian: frames[Math.floor(frames.length / 2)],
              frameMsP95: frames[Math.floor(frames.length * 0.95)],
              loaded: window.__mc.loadedChunks(),
              meshed: window.__mc.meshedChunks(),
              position: window.__mc.position(),
              heapBytes: window.performance.memory?.usedJSHeapSize ?? null,
            });
          };
          window.requestAnimationFrame(frame);
        }),
      seconds,
    );
    assert.equal(errors.length, 0, errors.join("\n"));
    assert.ok(metrics.loaded <= 121);
    assert.ok(Number.isFinite(metrics.position.y) && metrics.position.y > 0);
    await page.screenshot({ path: `visual-check/performance/seed-${seed}.png` });
    results.push({ seed, readyMs, ...metrics });
    console.log(JSON.stringify(results.at(-1)));
    await page.close();
  }
  writeFileSync(
    "visual-check/performance/results.json",
    JSON.stringify(
      { viewport: [1280, 720], radius: 4, renderer: "Chromium / SwiftShader", results },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
