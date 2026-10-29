/** Render the real third-person camera and verify that toggling preserves aim. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer";
const out = "visual-check/third-person";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://127.0.0.1:4173/2026_10_24_2/?seed=2026&mode=survival&view=third-person");
  await page.waitForFunction(() => window.__mc?.meshedChunks() >= 60, { timeout: 120000 });
  await page.select("#render-scale", "1");
  await page.locator("#play-button").click();
  await page.waitForFunction(() => window.__mc.mode() === "pointer");
  const info = () =>
    page.evaluate(() => ({
      position: window.__mc.position(),
      eye: window.__mc.eyeHeight(),
      yaw: window.__mc.yaw(),
      pitch: window.__mc.pitch(),
      target: window.__mc.target(),
      camera: window.__mc.cameraView(),
    }));
  const third = await info();
  await page.screenshot({ path: `${out}/behind.png` });
  await page.keyboard.press("F5");
  await new Promise((r) => setTimeout(r, 300));
  const front = await info();
  await page.screenshot({ path: `${out}/front.png` });
  await page.keyboard.press("F5");
  await new Promise((r) => setTimeout(r, 300));
  const first = await info();
  assert.equal(third.camera.perspective, 1);
  assert.equal(front.camera.perspective, 2);
  assert.equal(first.camera.perspective, 0);
  assert.equal(third.eye, first.eye);
  assert.equal(front.yaw, first.yaw);
  assert.deepEqual(third.target, first.target);
  await page.keyboard.press("F5");
  await page.keyboard.down("KeyW");
  await new Promise((r) => setTimeout(r, 450));
  await page.screenshot({ path: `${out}/walking.png` });
  await page.keyboard.up("KeyW");
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/results.json`, JSON.stringify({ third, front, first, errors }, null, 2));
  console.log(
    "PASS third-person/front/first-person preserve physical eye and targeting; screenshots saved",
  );
} finally {
  await browser.close();
}
