/** Check the actual MP4 through the same browser player used by the viewer. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer";

const at = process.argv.indexOf("--url");
const url = at >= 0 ? process.argv[at + 1] : "http://127.0.0.1:4173/2026_10_24_2/watch/";
const out = "visual-check/video";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => document.querySelector("video").readyState >= 1, {
    timeout: 120000,
  });
  const duration = await page.$eval("video", (video) => video.duration);
  assert.ok(Math.abs(duration - 1265.288889) < 1, `complete video duration: ${duration}`);
  await page.locator('[data-time="0"]').click();
  await page.waitForFunction(
    () => {
      const v = document.querySelector("video");
      return !v.paused && v.currentTime > 1 && v.videoWidth === 960 && v.error === null;
    },
    { timeout: 120000 },
  );
  await page.screenshot({ path: `${out}/playing.png` });
  await page.$eval("video", (video) => {
    video.currentTime = 1261;
  });
  await page.waitForFunction(
    () => {
      const v = document.querySelector("video");
      return v.currentTime >= 1261 && v.readyState >= 2 && !v.seeking && v.error === null;
    },
    { timeout: 120000 },
  );
  await page.$eval("video", (video) => video.pause());
  await page.screenshot({ path: `${out}/victory.png` });
  assert.equal(errors.length, 0, errors.join("\n"));
  const proof = { url, duration, playbackVerified: true, seekToVictoryVerified: true, errors };
  writeFileSync(`${out}/proof.json`, JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
} finally {
  await browser.close();
}
