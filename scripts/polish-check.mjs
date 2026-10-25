/** Real UI and audio output checks for the changes measured against Classic. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer";
const args = process.argv.slice(2),
  at = args.indexOf("--url");
const url = new URL(at >= 0 ? args[at + 1] : "http://localhost:4173/");
url.searchParams.set("seed", "2026");
url.searchParams.set("mode", "creative");
const out = "visual-check/polish";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--window-size=1280,720",
  ],
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let activePage;
try {
  const page = await browser.newPage();
  activePage = page;
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const boot = () =>
    page.waitForFunction(() => window.__mc?.meshedChunks() >= 60, { timeout: 120000 });
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await boot();
  assert.equal(
    await page.evaluate(() => window.__mc.renderer()),
    "webgl",
    "fragment rendering requires WebGL",
  );
  assert.equal(await page.evaluate(() => window.__mc.cameraFov()), 70);
  assert.equal(await page.$eval("#fps", (el) => el.hidden), true);
  await page.click("#overlay-content h1");
  await page.keyboard.press("F3");
  assert.equal(await page.$eval("#fps", (el) => el.hidden), false);
  assert.equal(await page.$eval("#debug-info", (el) => el.checked), true);
  await page.keyboard.press("F3");
  assert.equal(await page.$eval("#fps", (el) => el.hidden), true);
  await page.select("#render-scale", "0.25");
  const sizes = [];
  for (const [width, height, expected] of [
    [1280, 720, 552],
    [800, 600, 552],
    [1920, 1080, 552],
    [640, 480, 368],
  ]) {
    await page.setViewport({ width, height });
    await page.waitForFunction(
      (expected) =>
        Math.round(document.querySelector("#hotbar").getBoundingClientRect().width) === expected,
      {},
      expected,
    );
    sizes.push({
      width,
      height,
      hotbarWidth: await page.$eval("#hotbar", (el) => el.getBoundingClientRect().width),
    });
  }
  await page.setViewport({ width: 1280, height: 720 });
  await page.select("#render-scale", "1");
  await page.click("#play-button");
  await page.waitForFunction(() => window.__mc.mode() === "pointer");
  await page.waitForFunction(() => window.__mc.effects().soundReady);
  await wait(350);
  await page.screenshot({ path: `${out}/playing.png` });
  async function aim(p) {
    const s = await page.evaluate(() => ({
      position: window.__mc.position(),
      eye: window.__mc.eyeHeight(),
      yaw: window.__mc.yaw(),
      pitch: window.__mc.pitch(),
    }));
    const dx = p.x - s.position.x,
      dz = p.z - s.position.z;
    await page.evaluate(
      ({ x, y }) =>
        document.dispatchEvent(new MouseEvent("mousemove", { movementX: x, movementY: y })),
      {
        x: -(Math.atan2(-dx, -dz) - s.yaw) / 0.0022,
        y: -(Math.atan2(p.y - s.position.y - s.eye, Math.hypot(dx, dz)) - s.pitch) / 0.0022,
      },
    );
    await wait(100);
  }
  const pos = await page.evaluate(() => window.__mc.position());
  const ground = { x: Math.floor(pos.x) + 1, y: Math.floor(pos.y) - 1, z: Math.floor(pos.z) };
  await page.keyboard.press("Digit2");
  await aim({ x: ground.x + 0.5, y: ground.y + 0.9, z: ground.z + 0.5 });
  await page.mouse.down({ button: "right" });
  await page.mouse.up({ button: "right" });
  await page.waitForFunction(() => window.__mc.effects().soundCounts.place > 0);
  const placed = { ...ground, y: ground.y + 1 };
  assert.equal(
    await page.evaluate((p) => window.__mc.blockAt(p.x, p.y, p.z), placed),
    2,
    "the chosen dirt block was placed",
  );
  await aim({ x: placed.x + 0.5, y: placed.y + 0.5, z: placed.z + 0.5 });
  assert.deepEqual(
    await page.evaluate(() => window.__mc.target()),
    placed,
    "crosshair aims at the placed block",
  );
  // Observe the short-lived effect during the click, before CDP/screenshot delays.
  const observedFragments = page.evaluate(
    () =>
      new Promise((resolve) => {
        const start = window.performance.now();
        function sample(now) {
          const effects = window.__mc.effects();
          if (effects.fragments > 0) {
            resolve(effects.fragments);
            return;
          }
          if (now - start > 5000) {
            resolve(0);
            return;
          }
          window.requestAnimationFrame(sample);
        }
        window.requestAnimationFrame(sample);
      }),
  );
  await page.mouse.down();
  await wait(120);
  await page.mouse.up();
  assert.ok(await observedFragments, "render frames observed fragments during the click");
  assert.equal(
    await page.evaluate((p) => window.__mc.blockAt(p.x, p.y, p.z), placed),
    0,
    "the targeted block was removed",
  );
  await page.screenshot({ path: `${out}/fragments.png` });
  await page.waitForFunction(() => window.__mc.effects().soundPeak > 0);
  const audible = await page.evaluate(() => window.__mc.effects());
  assert.equal(
    await page.evaluate(() =>
      document.querySelector("#app > canvas").getContext("webgl2").isContextLost(),
    ),
    false,
  );
  assert.equal(audible.soundCounts.break, 1, "a short creative click breaks exactly one block");
  assert.ok(audible.soundCounts.place > 0);
  assert.ok(audible.fragments <= 128);
  await wait(900);
  assert.equal(await page.evaluate(() => window.__mc.effects().fragments), 0);
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => window.__mc.mode() === "idle");
  await page.click("#sound-enabled");
  await page.click("#debug-info");
  assert.equal(await page.evaluate(() => window.__mc.effects().soundEnabled), false);
  await page.reload({ waitUntil: "domcontentloaded" });
  await boot();
  assert.equal(await page.$eval("#sound-enabled", (el) => el.checked), false);
  assert.equal(await page.$eval("#debug-info", (el) => el.checked), true);
  assert.equal(await page.$eval("#fps", (el) => el.hidden), false);
  await page.click("#play-button");
  await page.waitForFunction(() => window.__mc.mode() === "pointer");
  await aim({ x: ground.x + 0.5, y: ground.y + 0.5, z: ground.z + 0.5 });
  const groundBefore = await page.evaluate((g) => window.__mc.blockAt(g.x, g.y, g.z), ground);
  assert.notEqual(groundBefore, 0);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction(
    ({ g, id }) => window.__mc.blockAt(g.x, g.y, g.z) !== id,
    {},
    { g: ground, id: groundBefore },
  );
  await wait(150);
  const muted = await page.evaluate(() => window.__mc.effects());
  assert.equal(muted.soundsPlayed, 0);
  assert.equal(muted.soundEnabled, false);
  assert.equal(errors.length, 0, errors.join("\n"));
  writeFileSync(
    `${out}/results.json`,
    JSON.stringify({ completed: true, fov: 70, sizes, audible, muted }, null, 2),
  );
  console.log(
    "PASS Classic comparison polish: FOV, responsive HUD, F3, fragments, real audio output, mute and preference reload",
  );
} catch (error) {
  let state;
  try {
    state = await activePage?.evaluate(() => ({
      renderer: window.__mc?.renderer(),
      mode: window.__mc?.mode(),
      position: window.__mc?.position(),
      target: window.__mc?.target(),
      effects: window.__mc?.effects(),
    }));
    writeFileSync(`${out}/failure.json`, JSON.stringify(state, null, 2));
    await activePage?.screenshot({ path: `${out}/failure.png` });
  } catch {
    /* Preserve the original failure if browser diagnostics are unavailable. */
  }
  if (process.env.GITHUB_ACTIONS)
    console.log(
      `::error title=Classic polish verification failed::${String(error?.stack ?? error)
        .concat("\nState: ", JSON.stringify(state))
        .replaceAll("%", "%25")
        .replaceAll("\r", "%0D")
        .replaceAll("\n", "%0A")}`,
    );
  throw error;
} finally {
  await browser.close();
}
