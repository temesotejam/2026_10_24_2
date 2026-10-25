/** Native creative construction across streamed chunk boundaries and back.
 * No teleport, injected items, world mutation API, or clock changes. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer";
const args = process.argv.slice(2);
const option = (key, fallback) => (args.includes(key) ? args[args.indexOf(key) + 1] : fallback);
const distance = Number(option("--distance", "256"));
assert.ok(Number.isInteger(distance) && distance >= 16 && distance <= 2048);
const url = new URL(option("--url", "http://localhost:4173/"));
url.searchParams.set("seed", "1");
url.searchParams.set("mode", "creative");
const out = "visual-check/exploration";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const samples = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const boot = () =>
    page.waitForFunction(() => window.__mc?.meshedChunks() >= 60, { timeout: 120000 });
  const info = () =>
    page.evaluate(() => ({
      position: window.__mc.position(),
      eye: window.__mc.eyeHeight(),
      pitch: window.__mc.pitch(),
      yaw: window.__mc.yaw(),
    }));
  const block = (p) => page.evaluate((p) => window.__mc.blockAt(p.x, p.y, p.z), p);
  const passable = (id) => [0, 5, 26].includes(id);
  async function aim(p) {
    const s = await info();
    const dx = p.x - s.position.x,
      dz = p.z - s.position.z;
    const nextYaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(p.y - s.position.y - s.eye, Math.hypot(dx, dz));
    await page.evaluate(
      ({ x, y }) =>
        document.dispatchEvent(new MouseEvent("mousemove", { movementX: x, movementY: y })),
      { x: -(nextYaw - s.yaw) / 0.0022, y: -(pitch - s.pitch) / 0.0022 },
    );
    await wait(35);
  }
  async function walk(x, z) {
    const start = Date.now();
    const initial = (await info()).position;
    const timeout = Math.max(15000, Math.hypot(x - initial.x, z - initial.z) * 1000);
    try {
      while (true) {
        const s = await info();
        const d = Math.hypot(x - s.position.x, z - s.position.z);
        if (d < 0.12) break;
        assert.ok(Date.now() - start < timeout, `walk to ${x},${z}: ${JSON.stringify(s.position)}`);
        await aim({ x, z, y: s.position.y + s.eye });
        await page.keyboard.down("KeyW");
        await wait(Math.max(25, Math.min(130, d * 140)));
        await page.keyboard.up("KeyW");
      }
    } finally {
      await page.keyboard.up("KeyW");
    }
  }
  async function clear(p) {
    for (let i = 0; i < 8; i++) {
      if (passable(await block(p))) return;
      await aim({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 });
      const target = await page.evaluate(() => window.__mc.target());
      assert.ok(target, "reachable obstruction");
      assert.ok(target.y >= p.y, "do not excavate the supporting floor");
      await page.mouse.down();
      await page.mouse.up();
      await wait(70);
    }
    assert.fail(`cannot clear ${JSON.stringify(p)}`);
  }
  const play = async () => {
    await page.click("#play-button");
    await page.waitForFunction(() => window.__mc.mode() === "pointer");
  };
  const save = async () => {
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForFunction(() => window.__mc.mode() === "idle");
    await page.click("#save-button");
    await page.waitForFunction(
      () => document.querySelector("#save-status").textContent === "保存済み",
    );
  };
  const sample = async (label) => {
    const s = await page.evaluate(() => ({
      position: window.__mc.position(),
      loaded: window.__mc.loadedChunks(),
      heap: window.performance.memory?.usedJSHeapSize ?? null,
    }));
    assert.ok(s.loaded <= 196);
    if (s.heap !== null) assert.ok(s.heap < 256 * 1024 * 1024);
    assert.equal(errors.length, 0, errors.join("\n"));
    samples.push({ label, ...s });
    console.log(JSON.stringify(samples.at(-1)));
  };
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await boot();
  await play();
  await wait(500);
  await page.keyboard.press("Digit2"); // The normal creative dirt stack.
  const origin = (await info()).position;
  const y = Math.round(origin.y),
    z = Math.floor(origin.z),
    x0 = Math.floor(origin.x);
  for (let step = 1; step <= distance; step++) {
    const x = x0 + step;
    await clear({ x, y: y + 1, z });
    await clear({ x, y, z });
    if (passable(await block({ x, y: y - 1, z }))) {
      // Crouch beyond the supporting edge and attach the bridge to its side.
      await page.keyboard.down("ShiftLeft");
      await aim({ x: x + 1, y: (await info()).position.y + (await info()).eye, z: z + 0.5 });
      await page.keyboard.down("KeyW");
      const start = Date.now();
      while ((await info()).position.x < x + 0.1) {
        assert.ok(Date.now() - start < 4000, "reach a protected bridge edge");
        await wait(40);
      }
      await page.keyboard.up("KeyW");
      await aim({ x, y: y - 0.5, z: z + 0.5 });
      const target = await page.evaluate(() => window.__mc.target());
      assert.ok(
        target && target.x === x - 1 && target.y === y - 1,
        "attach to previous supporting block",
      );
      await page.mouse.down({ button: "right" });
      await page.mouse.up({ button: "right" });
      await wait(70);
      assert.ok(!passable(await block({ x, y: y - 1, z })), "bridge floor was placed");
      await page.keyboard.up("ShiftLeft");
    }
    await walk(x + 0.5, z + 0.5);
    assert.ok(Math.abs((await info()).position.y - y) < 0.1, "stay on the constructed route");
    if (step % 64 === 0 || step === distance) await sample(`outbound ${step}`);
  }
  await save();
  await page.reload({ waitUntil: "domcontentloaded" });
  await boot();
  const far = (await info()).position;
  assert.ok(Math.abs(far.x - x0 - distance - 0.5) < 0.15);
  await page.screenshot({ path: `${out}/far.png` });
  await play();
  await walk(x0 + 0.5, z + 0.5);
  assert.ok(Math.abs((await info()).position.y - y) < 0.1);
  for (let x = x0 + 1; x <= x0 + Math.min(32, distance); x++) {
    assert.ok(!passable(await block({ x, y: y - 1, z })), "streamed bridge floor retained");
    assert.ok(passable(await block({ x, y, z })), "streamed excavation retained");
  }
  await sample("returned home after save/reload");
  assert.ok(
    await page.evaluate(() => window.__mc.effects().soundCounts.step > 0),
    "walking back over the constructed route produces footsteps",
  );
  await save();
  await page.screenshot({ path: `${out}/returned.png` });
  writeFileSync(
    `${out}/results.json`,
    JSON.stringify({ completed: true, distanceEachWay: distance, origin, samples }, null, 2),
  );
  console.log(
    `PASS native exploration: ${distance} blocks outward, reload, ${distance} blocks back`,
  );
} catch (error) {
  if (process.env.GITHUB_ACTIONS)
    console.log(
      `::error title=Exploration failed::${String(error?.stack ?? error)
        .replaceAll("%", "%25")
        .replaceAll("\r", "%0D")
        .replaceAll("\n", "%0A")}`,
    );
  throw error;
} finally {
  await browser.close();
}
