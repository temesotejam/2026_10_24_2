/** Corrected resource route: a new survival player obtains flint by mining
 * natural gravel, with real input and no inventory/save fixture injection. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer";
import { createDriver, wait } from "./lib/survival-driver.mjs";
import { createAdventureDriver } from "./lib/adventure-driver.mjs";
const args = process.argv.slice(2),
  option = (key, fallback) => (args.includes(key) ? args[args.indexOf(key) + 1] : fallback);
const out = option("--out", "visual-check/progression-agent-corrected");
const url = new URL(option("--url", "http://127.0.0.1:4173/2026_10_24_2/"));
url.searchParams.set("seed", option("--seed", "2026"));
url.searchParams.set("mode", "survival");
mkdirSync(out, { recursive: true });
let reviewPage;
let driver;
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
try {
  const page = await browser.newPage();
  reviewPage = page;
  await page.setViewport({ width: 960, height: 540 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const d = createDriver(page, out),
    a = createAdventureDriver(page, d);
  driver = d;
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await a.boot();
  await page.select("#render-scale", "0.5");
  assert.ok(
    (await d.info()).inventory.every((s) => s === null),
    "genuinely empty new inventory",
  );
  assert.equal((await a.adventure()).generator, 3);
  await page.locator("#play-button").click();
  await page.waitForFunction(() => window.__mc.mode() === "pointer");
  const observations = [];
  console.log("Initial position", (await d.info()).position);
  for (let attempt = 0; attempt < 50 && !(await d.count("flint")); attempt++) {
    const gravel = await page.evaluate(() => {
      const mc = window.__mc,
        p = mc.position(),
        candidates = [];
      for (let x = Math.floor(p.x) - 32; x <= Math.floor(p.x) + 32; x++)
        for (let z = Math.floor(p.z) - 32; z <= Math.floor(p.z) + 32; z++)
          for (let y = 55; y >= 15; y--)
            if (
              mc.blockAt(x, y, z) === 44 &&
              mc.blockAt(x, y + 1, z) === 0 &&
              mc.blockAt(x, y + 2, z) === 0
            ) {
              candidates.push({
                x,
                y,
                z,
                d: Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) + Math.abs(y + 1 - p.y) * 2,
              });
              break;
            }
      return candidates.sort((a, b) => a.d - b.d)[0];
    });
    assert.ok(gravel, "discover exposed, naturally generated gravel");
    console.log("Selected gravel", gravel);
    await a.surfaceTo(gravel);
    await wait(350);
    console.log("Approached gravel", (await d.info()).position);
    const before = await d.info();
    await d.mine(gravel);
    await wait(700);
    observations.push({
      mined: gravel,
      before: before.position,
      after: (await d.info()).position,
      flint: await d.count("flint"),
      gravel: await d.count("gravel"),
    });
    console.log("Mined natural gravel", observations.at(-1));
  }
  assert.ok(await d.count("flint"), "collect actual flint from mined gravel");
  await d.open();
  for (const id of ["flint", "string", "book"])
    assert.equal(await page.$(`[data-recipe="${id}"]`), null, `no fabricated ${id} recipe`);
  await page.screenshot({ path: `${out}/flint-and-crafting.png` });
  const report = {
    agent: "progression_audit",
    assets: await page.$$eval("script[src]", (els) => els.map((el) => el.getAttribute("src"))),
    round: "corrected",
    url: url.href,
    normalInputOnly: true,
    fixtureImports: false,
    stateMutationAPI: false,
    completed: true,
    objective: "Acquire flint by hand-mining natural gravel and verify false shortcuts are absent",
    observations,
    final: await d.info(),
    errors,
  };
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/review.json`, JSON.stringify(report, null, 2));
  console.log("PASS natural gravel → actual flint; false crafting recipes absent");
} catch (error) {
  if (reviewPage && driver) {
    await reviewPage.screenshot({ path: `${out}/failure.png` });
    writeFileSync(
      `${out}/failure.json`,
      JSON.stringify({ error: String(error), info: await driver.info() }, null, 2),
    );
  }
  throw error;
} finally {
  await browser.close();
}
