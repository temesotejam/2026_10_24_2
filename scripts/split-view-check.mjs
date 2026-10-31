/** Exercise both live cameras in one shared world, including real companion motion. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer";
import { wait } from "./lib/survival-driver.mjs";
const args = process.argv.slice(2),
  i = args.indexOf("--url");
const url = new URL(i < 0 ? "http://127.0.0.1:4179/" : args[i + 1]);
url.search = "?seed=80&mode=survival&coop=1&split=1";
const profile = mkdtempSync(path.join(os.tmpdir(), "split-view-check-"));
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
try {
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 720 });
  await p.goto(url.href, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => window.__mc?.meshedChunks() >= 40 && window.__coop, {
    timeout: 120000,
  });
  assert.equal(await p.evaluate(() => window.__mc.renderer()), "webgl");
  assert.deepEqual(
    await p.evaluate(() =>
      [...document.querySelectorAll(".split-label")].map((e) => e.textContent),
    ),
    ["プレイヤー１", "プレイヤー２"],
  );
  await p.locator("#play-button").click();
  await wait(1800);
  const before = await p.evaluate(() => ({
    view: window.__mc.splitView(),
    one: window.__coop.observe("player"),
    two: window.__coop.observe("companion"),
  }));
  assert.equal(before.view.enabled, true);
  assert.equal(before.one.time, before.two.time);
  assert.ok(before.view.playerCamera && before.view.companionCamera);
  const option = await p.evaluate(() => {
    const c = window.__coop.observe("companion").position,
      other = window.__coop.observe("player").position,
      y = Math.round(c.y);
    for (const [dx, dz, yaw] of [
      [1, 0, -Math.PI / 2],
      [-1, 0, Math.PI / 2],
      [0, 1, Math.PI],
      [0, -1, 0],
    ]) {
      const x = Math.floor(c.x + dx),
        z = Math.floor(c.z + dz),
        floor = window.__coop.block("companion", x, y - 1, z),
        feet = window.__coop.block("companion", x, y, z),
        head = window.__coop.block("companion", x, y + 1, z);
      if (
        [1, 2, 3, 4, 9, 10, 11, 21, 24, 27, 44].includes(floor) &&
        feet === 0 &&
        head === 0 &&
        Math.hypot(x + 0.5 - other.x, z + 0.5 - other.z) > 1.5
      )
        return yaw;
    }
    return null;
  });
  assert.notEqual(option, null, "find a supported open step");
  assert.ok(
    await p.evaluate(
      (yaw) => window.__coop.move({ forward: 1, right: 0, jump: false, yaw }, 0.45),
      option,
    ),
  );
  await wait(850);
  await p.evaluate(() => window.__coop.stop());
  await wait(600);
  const after = await p.evaluate(() => ({
    view: window.__mc.splitView(),
    one: window.__coop.observe("player"),
    two: window.__coop.observe("companion"),
  }));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  assert.ok(
    distance(before.two.position, after.two.position) > 0.2,
    "second body physically moved",
  );
  assert.ok(
    distance(before.view.companionCamera, after.view.companionCamera) > 0.1,
    "second camera followed its body",
  );
  assert.equal(after.one.time, after.two.time, "both views observe the same simulation time");
  assert.ok(after.one.vitals.health > 0 && after.two.vitals.health > 0);
  console.log("PASS split view follows both live actors in the same simulation frame");
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
