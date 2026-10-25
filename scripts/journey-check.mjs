import { createDriver, initialJourney, wait } from "./lib/survival-driver.mjs";
/** Browser-only survival journey. World inspection is read-only; all changes
 * use keyboard/mouse and UI. No injected inventory, teleport or time changes. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer";
const args = process.argv.slice(2);
const i = args.indexOf("--url");
const url = new URL(i >= 0 ? args[i + 1] : "http://localhost:4173/");
url.searchParams.set("seed", "2026");
url.searchParams.set("mode", "survival");
const out = "visual-check/journey";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--window-size=1280,720"],
});
let activePage;
try {
  const page = await browser.newPage();
  activePage = page;
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const d = createDriver(page, out);
  const {
    info,
    count,
    block,
    report,
    aim,
    open,
    close,
    equip,
    mine,
    make,
    collect,
    tunnelTo,
    findOre,
  } = d;
  await initialJourney(d, page, url);
  if ((await count("coal")) === 0) {
    const ore = await findOre(17);
    assert.ok(ore, "find coal for cave lighting");
    const current = (await info()).position;
    await tunnelTo({ ...ore, x: ore.x + (ore.x > current.x ? -1 : 1) });
    await mine(ore);
    await collect("coal", 1);
  }
  await open();
  await make("torch");
  await close();
  await equip("torch");
  const current = (await info()).position;
  const torchCell = {
    x: Math.floor(current.x),
    y: Math.round(current.y),
    z: Math.floor(current.z),
  };
  await aim({ x: torchCell.x + 0.5, y: torchCell.y - 0.5, z: torchCell.z + 0.5 });
  async function brightness() {
    const png = await page.screenshot({ encoding: "base64" });
    return page.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(
        Math.floor(img.width * 0.25),
        Math.floor(img.height * 0.2),
        Math.floor(img.width * 0.5),
        Math.floor(img.height * 0.4),
      ).data;
      let sum = 0;
      for (let i = 0; i < pixels.length; i += 4)
        sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      return sum / (pixels.length / 4);
    }, png);
  }
  const unlit = await brightness();
  await page.mouse.down({ button: "right" });
  await page.mouse.up({ button: "right" });
  await page.waitForFunction((p) => window.__mc.blockAt(p.x, p.y, p.z) === 16, {}, torchCell);
  await wait(1000);
  const lit = await brightness();
  assert.ok(lit > unlit + 2, `torch brightens cave: ${unlit.toFixed(1)} -> ${lit.toFixed(1)}`);
  await report("Crafted a torch and verified real cave illumination");
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => window.__mc.mode() === "idle");
  await page.click("#save-button");
  await page.waitForFunction(
    () => document.querySelector("#save-status").textContent === "保存済み",
  );
  const beforeReload = await info();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__mc?.meshedChunks() >= 60, { timeout: 120000 });
  const restored = await info();
  assert.deepEqual(restored.inventory, beforeReload.inventory);
  assert.equal(restored.health, beforeReload.health);
  assert.equal(await block(torchCell), 16);
  assert.ok((await count("diamond")) >= 1);
  await page.click("#play-button");
  await page.waitForFunction(() => window.__mc.mode() === "pointer");
  await wait(500);
  assert.equal(errors.length, 0, errors.join("\n"));
  await report("PASS: natural survival journey, cave lighting, save and reload");
  await page.screenshot({ path: `${out}/diamond.png` });
} catch (error) {
  if (activePage) {
    await activePage.screenshot({ path: `${out}/failure.png` });
    const state = await activePage.evaluate(() => ({
      position: window.__mc?.position(),
      inventory: window.__mc?.inventory(),
      target: window.__mc?.target(),
      health: window.__mc?.health(),
    }));
    writeFileSync(`${out}/failure.json`, JSON.stringify(state, null, 2));
    if (process.env.GITHUB_ACTIONS)
      console.log(
        `::error title=Survival journey failed::${String(error?.stack ?? error)
          .concat("\nState: ", JSON.stringify(state))
          .replaceAll("%", "%25")
          .replaceAll("\r", "%0D")
          .replaceAll("\n", "%0A")}`,
      );
  }
  console.error(error);
  throw error;
} finally {
  await browser.close();
}
