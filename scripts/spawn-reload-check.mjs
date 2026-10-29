/** Fresh-world movement and ordinary save/reload; no imported fixtures. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer";
import { createDriver, wait } from "./lib/survival-driver.mjs";
import { createAdventureDriver } from "./lib/adventure-driver.mjs";
const out = "visual-check/qa-independent/spawn-reload";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const d = createDriver(page, out),
    a = createAdventureDriver(page, d);
  const url = new URL(
    process.env.INDEPENDENT_PLAYTEST_URL ?? "http://127.0.0.1:4173/2026_10_24_2/",
  );
  url.searchParams.set("seed", "11031");
  url.searchParams.set("mode", "survival");
  url.searchParams.set("view", "third-person");
  await page.goto(url.href);
  await a.boot();
  await page.select("#render-scale", "0.5");
  const initial = await d.info();
  assert.ok(initial.inventory.every((s) => s === null));
  assert.equal((await a.adventure()).generator, 3);
  await page.locator("#play-button").click();
  await page.waitForFunction(() => window.__mc.mode() === "pointer");
  await page.screenshot({ path: `${out}/01-new-facing.png` });
  await page.keyboard.down("KeyW");
  await page.keyboard.down("Space");
  await wait(900);
  await page.keyboard.up("KeyW");
  await page.keyboard.up("Space");
  await wait(500);
  const walked = await d.info();
  const displacement = Math.hypot(
    walked.position.x - initial.position.x,
    walked.position.z - initial.position.z,
  );
  assert.ok(displacement > 1, "move forward from new spawn without digging");
  await d.aim({ x: walked.position.x + 3, y: walked.position.y + 2, z: walked.position.z + 1 });
  await a.save();
  const saved = await d.info();
  await page.screenshot({ path: `${out}/02-before-reload.png` });
  await page.reload({ waitUntil: "domcontentloaded" });
  await a.boot();
  const restored = await d.info();
  assert.ok(
    Math.hypot(saved.position.x - restored.position.x, saved.position.z - restored.position.z) <
      0.01,
  );
  assert.ok(
    Math.abs(Math.atan2(Math.sin(saved.yaw - restored.yaw), Math.cos(saved.yaw - restored.yaw))) <
      0.001,
  );
  assert.ok(Math.abs(saved.pitch - restored.pitch) < 0.001);
  await page.screenshot({ path: `${out}/03-restored.png` });
  const result = {
    seed: 11031,
    fixtureImports: false,
    stateMutationAPI: false,
    initial,
    walked,
    displacement,
    saved,
    restored,
    completed: true,
  };
  writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      completed: true,
      initial: initial.position,
      yaw: initial.yaw,
      displacement,
      savedYaw: saved.yaw,
      restoredYaw: restored.yaw,
    }),
  );
} finally {
  await browser.close();
}
