/** Independent resource progression review using normal keyboard/mouse/UI input. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer";
import { createDriver, initialJourney } from "./lib/survival-driver.mjs";
const out = "visual-check/progression-agent-baseline";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 540 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const d = createDriver(page, out);
  await initialJourney(
    d,
    page,
    new URL("http://127.0.0.1:4173/2026_10_24_2/?seed=2026&mode=survival"),
    async () => page.select("#render-scale", "0.5"),
  );
  const before = await d.info();
  await d.open();
  const badRecipe = await page.$('[data-recipe="flint"]');
  if (badRecipe) {
    await d.make("flint");
    assert.ok(await d.count("flint"));
  }
  await page.screenshot({ path: `${out}/resource-review.png` });
  writeFileSync(
    `${out}/review.json`,
    JSON.stringify(
      {
        agent: "progression_audit",
        assets: await page.$$eval("script[src]", (els) => els.map((el) => el.getAttribute("src"))),
        normalInputOnly: true,
        fixtureImports: false,
        gameplay:
          "Fresh empty inventory → gathered natural logs → wood/stone tools → smelted iron → mined natural diamond",
        issue: badRecipe
          ? "Confirmed cobblestone-to-flint shortcut through real crafting UI"
          : "Correctly no cobblestone-to-flint recipe",
        before,
        after: await d.info(),
        errors,
      },
      null,
      2,
    ),
  );
  console.log("Resource progression play review completed");
} finally {
  await browser.close();
}
