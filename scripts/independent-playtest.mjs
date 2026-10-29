/** Independent new-seed playtests. World observations are read-only; all changes
 * are ordinary keyboard/mouse/UI actions. No fixture or save imports. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { createDriver, wait } from "./lib/survival-driver.mjs";
import { createAdventureDriver } from "./lib/adventure-driver.mjs";
const seeds = process.argv.slice(2).map(Number);
const report = [];
const round = process.env.INDEPENDENT_PLAYTEST_ROUND ?? "baseline";
const base = path.resolve("visual-check/qa-independent", round);
for (const seed of seeds.length ? seeds : [11031, 11032]) {
  const out = path.join(base, `seed-${seed}`);
  mkdirSync(out, { recursive: true });
  const result = {
    seed,
    round,
    fixtureImports: false,
    stateMutationAPI: false,
    actions: [],
    findings: [],
    completed: false,
  };
  const recordAction = (text) => {
    result.actions.push(text);
    writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ seed, action: text }));
  };
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const d = createDriver(page, out),
      a = createAdventureDriver(page, d);
    const url = new URL(process.env.INDEPENDENT_PLAYTEST_URL ?? "http://127.0.0.1:4183/");
    url.searchParams.set("seed", String(seed));
    url.searchParams.set("mode", "survival");
    url.searchParams.set("view", "third-person");
    await page.goto(url.href);
    await a.boot();
    await page.select("#render-scale", "0.5");
    result.initial = await d.info();
    assert.ok(result.initial.inventory.every((s) => s === null));
    result.initialAdventure = await a.adventure();
    result.sourceAssets = await page.$$eval("script[src]", (els) =>
      els.map((el) => el.getAttribute("src")),
    );
    await page.locator("#play-button").click();
    await page.waitForFunction(() => window.__mc.mode() === "pointer");
    await page.screenshot({ path: `${out}/01-spawn.png` });
    recordAction("Start fresh survival with empty inventory and engage pointer lock");
    if (result.initialAdventure.generator >= 3) {
      await page.keyboard.down("KeyW");
      await page.keyboard.down("Space");
      await wait(900);
      await page.keyboard.up("KeyW");
      await page.keyboard.up("Space");
      await wait(500);
      result.openingWalk = await d.info();
      result.openingDisplacement = Math.hypot(
        result.openingWalk.position.x - result.initial.position.x,
        result.openingWalk.position.z - result.initial.position.z,
      );
      assert.ok(
        result.openingDisplacement > 1,
        "walk/jump forward from fresh spawn without digging",
      );
      await page.screenshot({ path: `${out}/01b-opening-walk.png` });
      recordAction("Walk and jump forward from the selected spawn facing without digging terrain");
    }
    const tree = await page.evaluate(() => {
      const mc = window.__mc,
        p = mc.position(),
        trees = [];
      for (let x = Math.floor(p.x) - 24; x <= p.x + 24; x++)
        for (let z = Math.floor(p.z) - 24; z <= p.z + 24; z++)
          for (let y = 30; y < 70; y++) {
            const id = mc.blockAt(x, y, z);
            if ((id === 6 || id === 27) && mc.blockAt(x, y - 1, z) !== id)
              trees.push({ x, y, z, id, d: Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) });
          }
      return trees.sort((a, b) => a.d - b.d)[0];
    });
    result.tree = tree;
    assert.ok(tree, "natural tree near spawn");
    recordAction(`Walk to naturally generated tree ${JSON.stringify(tree)}`);
    await a.surfaceTo({ x: tree.x - 1, z: tree.z });
    await page.screenshot({ path: `${out}/02-tree.png` });
    for (let dy = 0; dy < 4; dy++) await d.mine({ x: tree.x, y: tree.y + dy, z: tree.z });
    await a.move(tree.x + 0.5, tree.z + 0.5);
    await wait(1000);
    const log = tree.id === 27 ? "birchLog" : "log";
    await d.collect(log, 4);
    recordAction("Gather four natural logs with bare hands and pick up drops");
    await d.open();
    for (let i = 0; i < 4; i++) await d.make(log === "log" ? "planks" : "birch_planks");
    await d.make("table");
    for (let i = 0; i < 2; i++) await d.make("sticks");
    await d.close();
    recordAction("Craft planks, crafting table and sticks in inventory");
    const table = await d.station("table");
    await d.make("wood_pick");
    await d.close();
    recordAction("Place a crafting table, interact with it, and craft a wooden pickaxe");
    await page.screenshot({ path: `${out}/03-first-tools.png` });
    result.table = table;
    result.firstTools = await d.info();
    if (result.initialAdventure.generator >= 3) {
      await a.useAt(table);
      await d.make("wood_sword");
      await d.close();
      await d.equip("wood_sword");
      recordAction("Craft a wooden sword through the placed table before exploring");
      const here = (await d.info()).position;
      const villages = (await a.adventure()).structures
        .filter((s) => s.kind === "village")
        .sort(
          (a, b) => Math.hypot(a.x - here.x, a.z - here.z) - Math.hypot(b.x - here.x, b.z - here.z),
        );
      const village = villages[0];
      assert.ok(village, "discover a generated village");
      result.village = village;
      await a.surfaceTo({ x: village.x - 6, z: village.z + 1 });
      result.villageArrival = await d.info();
      recordAction("Reach a generated village by normal overland travel");
      await page.screenshot({ path: `${out}/04-village.png` });
      result.oldGatewayBlocks = await page.evaluate((v) => {
        const cells = [];
        for (let u = 0; u < 4; u++)
          for (let y = 0; y < 5; y++)
            if (u === 0 || u === 3 || y === 0 || y === 4) {
              const id = window.__mc.blockAt(v.x - 9 + u, v.y + y, v.z - 10);
              if (id === 28 || id === 31) cells.push({ u, y, id });
            }
        return cells;
      }, village);
      assert.equal(result.oldGatewayBlocks.length, 0, "new village has no prebuilt gateway");
      await a.move(village.x - 5.5, village.z + 2.7);
      await a.useAt({ x: village.x - 7, y: village.y, z: village.z + 5 });
      await page.waitForSelector('[data-area="chest"]');
      result.villageLoot = await page.$$eval('[data-area="chest"]', (els) =>
        els
          .map((el) => ({ title: el.title, text: el.textContent }))
          .filter((s) => s.text || s.title),
      );
      await page.screenshot({ path: `${out}/05-village-chest.png` });
      recordAction("Inspect naturally generated village chest through the actual UI");
      await d.close();
    }
    await d.equip("wood_pick");
    const s = await d.info(),
      y = Math.round(s.position.y);
    const exposed = await page.evaluate(
      ({ y }) => {
        const mc = window.__mc,
          p = mc.position(),
          v = [];
        for (let x = Math.floor(p.x) - 3; x <= p.x + 3; x++)
          for (let z = Math.floor(p.z) - 3; z <= p.z + 3; z++)
            for (let yy = y - 1; yy <= y + 2; yy++)
              if (mc.blockAt(x, yy, z) === 3)
                v.push({
                  x,
                  y: yy,
                  z,
                  d: Math.hypot(x + 0.5 - p.x, yy + 0.5 - p.y - 1.62, z + 0.5 - p.z),
                });
        return v.sort((a, b) => a.d - b.d)[0];
      },
      { y },
    );
    if (exposed) {
      await d.mine(exposed);
      recordAction("Mine naturally exposed stone with the crafted wooden pickaxe");
    }
    result.final = await d.info();
    result.finalAdventure = await a.adventure();
    result.camera = await page.evaluate(() => window.__mc.cameraView());
    result.errors = errors;
    await page.screenshot({ path: `${out}/04-final.png` });
    assert.ok(result.final.health > 0);
    assert.equal(errors.length, 0);
    result.completed = true;
  } catch (error) {
    result.error = String(error.stack ?? error);
    try {
      const page = (await browser.pages()).at(-1);
      result.failure = await page.evaluate(() => ({
        position: window.__mc?.position(),
        health: window.__mc?.health(),
        target: window.__mc?.target(),
        inventory: window.__mc?.inventory(),
      }));
      await page.screenshot({ path: `${out}/failure.png` });
    } catch {
      /* Preserve the original failure if the page has already navigated away. */
    }
  } finally {
    await browser.close();
    writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
    report.push(result);
    console.log(
      JSON.stringify({
        seed,
        completed: result.completed,
        actions: result.actions,
        error: result.error,
        final: result.final?.position,
      }),
    );
  }
}
mkdirSync(base, { recursive: true });
writeFileSync(path.join(base, "summary.json"), JSON.stringify(report, null, 2));
