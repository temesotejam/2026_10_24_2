/** Recorded survival run, never a fixture import. Resume uses the same browser
 * profile's ordinary save, and produces another chronological recording part. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setInterval, clearInterval } from "node:timers";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer";
import { createDriver, initialJourney, finishIronDiamond, wait } from "./lib/survival-driver.mjs";
import { createAdventureDriver } from "./lib/adventure-driver.mjs";
const args = process.argv.slice(2),
  option = (key, fallback) => (args.includes(key) ? args[args.indexOf(key) + 1] : fallback);
const out = path.resolve(option("--out", `visual-check/dragon-playthrough/run-${Date.now()}`));
const resume = Number(option("--resume", "0"));
const url = new URL(option("--url", "http://127.0.0.1:4173/2026_10_24_2/"));
url.searchParams.set("seed", "2026");
url.searchParams.set("mode", "survival");
const thirdPerson = args.includes("--third-person");
if (thirdPerson) url.searchParams.set("view", "third-person");
mkdirSync(out, { recursive: true });
const profile = path.join(out, "profile");
assert.ok(resume > 0 || !existsSync(profile), "new run must use a genuinely fresh browser profile");
const meta =
  resume > 0
    ? JSON.parse(readFileSync(path.join(out, "recording.json"), "utf8"))
    : {
        seed: 2026,
        mode: "survival",
        url: url.href,
        fixtureImports: false,
        stateMutationAPI: false,
        speedRequested: 1.5,
        perspective: thirdPerson ? "third-person-behind" : "first-person",
        parts: [],
        chapters: [],
      };
const part = {
  path: `part-${meta.parts.length + 1}.mp4`,
  resumePhase: resume,
  startedAt: null,
  completed: false,
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
};
meta.parts.push(part);
const flush = () => writeFileSync(path.join(out, "recording.json"), JSON.stringify(meta, null, 2));
flush();
const browser = await puppeteer.launch({
  headless: true,
  userDataDir: profile,
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--window-size=1280,720",
  ],
});
const restoredPages = await browser.pages();
const page = await browser.newPage();
for (const restored of restoredPages) await restored.close({ runBeforeUnload: false });
await page.setViewport({ width: 1280, height: 720 });
const d = createDriver(page, out),
  a = createAdventureDriver(page, d);
let recorder;
let cameraSampler;
meta.narration ??= [];
let lastNarrationAt = -Infinity;
const lastTextAt = new Map();
d.setNarrator((text, priority = 0) => {
  if (!part.startedAt) return;
  const seconds = (Date.now() - Date.parse(part.startedAt)) / 1000;
  const gap = priority >= 2 ? 4 : 6;
  if (seconds - lastNarrationAt < gap || seconds - (lastTextAt.get(text) ?? -Infinity) < 20) return;
  meta.narration.push({ part: part.path, seconds, text });
  lastNarrationAt = seconds;
  lastTextAt.set(text, seconds);
  flush();
});
const startRecording = async () => {
  await page.select("#render-scale", "0.5");
  part.assets = await page.$$eval("script[src]", (els) => els.map((el) => el.getAttribute("src")));
  part.initial = await d.info();
  part.dimension = (await a.adventure()).dimension;
  part.camera = await page.evaluate(() => window.__mc.cameraView());
  part.cameraSamples = [];
  cameraSampler = setInterval(async () => {
    try {
      part.cameraSamples.push(await page.evaluate(() => window.__mc.cameraView()));
    } catch {
      /* The final sample may overlap browser shutdown. */
    }
  }, 2000);
  part.startedAt = new Date().toISOString();
  flush();
  recorder = await page.screencast({
    path: path.join(out, part.path),
    format: "mp4",
    fps: 15,
    quality: 28,
    speed: 1,
    ffmpegPath: path.resolve("scripts/ffmpeg-capture.py"),
  });
  d.setGoal(
    resume === 0
      ? thirdPerson
        ? "三人称で出発。所持品ゼロから、ドラゴン討伐を目指します。"
        : "所持品ゼロで出発。まずは木を探して材料を集めます。"
      : "通常セーブから再開し、冒険を続けます。",
  );
};
const chapter = async (name, phase) => {
  meta.chapters.push({
    name,
    phase,
    part: part.path,
    at: new Date().toISOString(),
    seconds: (Date.now() - Date.parse(part.startedAt)) / 1000,
  });
  meta.nextPhase = phase;
  flush();
  await d.report(name);
  await a.save();
};
const villageFromWorld = async () => {
  const p = (await d.info()).position;
  return (await a.adventure()).structures
    .filter((s) => s.kind === "village")
    .sort((x, y) => Math.hypot(x.x - p.x, x.z - p.z) - Math.hypot(y.x - p.x, y.z - p.z))[0];
};
async function stockFood(village) {
  if ((await d.count("bread")) >= 8) return;
  d.setGoal("遠出に備えて、パンを補充し体力を回復します。");
  await a.surfaceTo({ x: village.x, z: village.z - 3 });
  const needed = 3 * (12 - (await d.count("bread"))),
    until = Date.now() + 240000;
  while ((await d.count("wheat")) < needed) {
    assert.ok(Date.now() < until, "grow food through ordinary farming");
    await a.harvest(village, needed, true);
    if ((await d.count("wheat")) < needed) await a.waitSafe(5000);
  }
  await a.surfaceTo({ x: village.x - 6, z: village.z + 1 });
  await a.move(village.x - 5.5, village.z + 2.7);
  await a.move(village.x - 4.5, village.z + 3.5);
  await d.equip("iron_pick");
  await a.useAt({ x: village.x - 5, y: village.y, z: village.z + 5 });
  await page.waitForSelector('[data-recipe="bread"]');
  while ((await d.count("bread")) < 12 && (await d.count("wheat")) >= 3) await d.make("bread");
  assert.ok((await d.count("bread")) >= 6, "carry enough real food for the trip");
  await d.close();
  await a.eat();
  await a.recover(20);
  await d.report("通常の農業とクラフトで食料を補充し、体力を回復");
}
async function stockArrows(village, target = 24) {
  d.setGoal("遠出の前に、矢と予備の材料を補充します。");
  if ((await d.count("planks")) < 4) {
    await a.surfaceTo({ x: village.x - 6, z: village.z + 1 });
    await a.move(village.x - 5.5, village.z + 2.7);
    await a.move(village.x - 4.5, village.z + 3.5);
    await d.equip("iron_pick");
    for (const [dy, dz] of [
      [1, 3],
      [2, 3],
      [1, 2],
      [2, 2],
      [1, 6],
    ]) {
      if ((await d.count("planks")) >= 4) break;
      const cell = { x: village.x - 4, y: village.y + dy, z: village.z + dz };
      if ((await d.block(cell)) === 10) await d.mine(cell);
      await wait(450);
    }
    assert.ok((await d.count("planks")) >= 4, "gather wood for arrows and a reserve");
  }
  await craftArrows(target);
}
async function craftArrows(target) {
  if ((await d.count("arrow")) >= target) return;
  await d.open();
  while ((await d.count("arrow")) < target) {
    if (!(await d.count("stick"))) {
      assert.ok((await d.count("planks")) >= 2, "own wood for arrows");
      await d.make("sticks");
    }
    if (!(await d.count("flint"))) {
      assert.ok((await d.count("cobble")) >= 2, "own stone for arrows");
      await d.make("flint");
    }
    await d.make("arrow");
  }
  await d.close();
}
try {
  if (resume === 0) {
    await initialJourney(d, page, url, startRecording);
    await chapter("空の所持品から木・石・鉄の道具を作り、自然のダイヤを採掘", 1);
  } else {
    await page.goto(url.href, { waitUntil: "domcontentloaded" });
    await a.boot();
    await startRecording();
    await page.locator("#play-button").click();
    await page.waitForFunction(() => window.__mc.mode() === "pointer");
  }
  if (resume === 0.5) {
    await finishIronDiamond(d, page);
    await chapter("通常セーブから再開し、鉄の精錬と自然のダイヤ採掘を完了", 1);
  }
  let village = meta.village;
  if (resume <= 1) {
    d.setGoal("地下から地上へ戻り、村を探します。");
    await a.reachSurface();
    village = await villageFromWorld();
    assert.ok(village, "discover a generated village");
    meta.village = village;
    flush();
    d.setGoal("村を目指して、地上を進みます。");
    await a.surfaceTo({ x: village.x - 6, z: village.z + 1 });
    await a.move(village.x - 5.5, village.z + 2.7);
    await a.useAt({ x: village.x - 7, y: village.y, z: village.z + 5 });
    await a.takeChest();
    await chapter("地上へ帰還し、村の家と自然生成の宝箱を探索", 2);
  }
  assert.ok(village, "remember the actually discovered village");
  if (resume <= 2) {
    d.setGoal("村の素材で、剣と弓、矢を準備します。");
    await a.guard();
    await a.recover();
    await a.eat();
    if (
      !(await d.count("iron_sword")) ||
      !(await d.count("bow")) ||
      !(await d.count("flintSteel")) ||
      (await d.count("arrow")) < 32
    ) {
      await a.surfaceTo({ x: village.x - 6, z: village.z + 1 });
      await a.move(village.x - 5.5, village.z + 2.7);
      const requiredSticks =
        ((await d.count("iron_sword")) ? 0 : 1) +
        ((await d.count("bow")) ? 0 : 3) +
        Math.ceil(Math.max(0, 32 - (await d.count("arrow"))) / 4);
      const neededPlanks =
        2 * Math.ceil(Math.max(0, requiredSticks - (await d.count("stick"))) / 4);
      if ((await d.count("planks")) < neededPlanks) {
        await a.move(village.x - 5.5, village.z + 4.5);
        for (const dz of [3, 4, 2]) {
          if ((await d.count("planks")) >= neededPlanks) break;
          await d.mine({ x: village.x - 4, y: village.y, z: village.z + dz });
          await wait(600);
        }
        await a.move(village.x - 4.5, village.z + 3.5);
        await wait(700);
        assert.ok((await d.count("planks")) >= neededPlanks, "gather wood for spare sticks");
      }
      await d.equip("iron_pick");
      await a.useAt({ x: village.x - 5, y: village.y, z: village.z + 5 });
      await page.waitForSelector('[data-recipe="bow"]');
      while ((await d.count("stick")) < requiredSticks) await d.make("sticks");
      if (!(await d.count("iron_sword"))) await d.make("iron_sword");
      if (!(await d.count("bow"))) await d.make("bow");
      if (!(await d.count("flintSteel"))) {
        await d.make("flint");
        await d.make("flintSteel");
      }
      while ((await d.count("arrow")) < 32) {
        if (!(await d.count("flint"))) await d.make("flint");
        await d.make("arrow");
      }
      await d.close();
    }
    await a.surfaceTo({ x: village.x, z: village.z - 3 });
    d.setGoal("畑を収穫し、小麦を食料と取引に回します。");
    await a.harvest(village, 144, true);
    if ((await d.count("bread")) < 8) {
      await a.surfaceTo({ x: village.x - 6, z: village.z + 1 });
      await a.move(village.x - 4.5, village.z + 3.5);
      await d.equip("iron_pick");
      await a.useAt({ x: village.x - 5, y: village.y, z: village.z + 5 });
      await page.waitForSelector('[data-recipe="bread"]');
      while ((await d.count("bread")) < 8 && (await d.count("wheat")) >= 3) await d.make("bread");
      await d.close();
    }

    d.setGoal("壊れたゲートを修理して、ネザーへ向かいます。");
    await a.surfaceTo({ x: village.x - 7, z: village.z - 8 });
    const repair = { x: village.x - 8, y: village.y, z: village.z - 10 };
    if ((await d.block(repair)) !== 28) {
      await d.equip("obsidian");
      await d.aim({ x: repair.x + 0.5, y: repair.y - 0.01, z: repair.z + 0.5 });
      await a.right();
    }
    assert.equal(
      await d.block(repair),
      28,
      "repair the missing gateway block with discovered obsidian",
    );
    await d.equip("flintSteel");
    await a.useAt({ x: village.x - 9, y: village.y + 1, z: village.z - 10 });
    assert.equal(await d.block({ ...repair, y: repair.y + 1 }), 31, "ignite repaired gateway");
    await chapter("弓と剣を作成、畑を収穫して植え直し、廃ゲートを修理・点火", 3);
  }
  if (resume <= 3) {
    d.setGoal("ネザーの敵を倒して、ロッドを集めます。");
    if ((await a.adventure()).dimension === "overworld")
      await a.travel("nether", { x: village.x - 8, y: village.y + 1, z: village.z - 10 });
    if ((await d.count("blazeRod")) < 2) {
      const netherStart = (await d.info()).position;
      if (netherStart.y >= 33.8) {
        const landing = await page.evaluate(() => {
          const mc = window.__mc,
            points = [];
          for (let x = -24; x <= 24; x++)
            for (let z = -24; z <= 24; z++) {
              if (Math.abs(x) <= 5 && Math.abs(z) <= 5) continue;
              for (let y = 60; y >= 25; y--)
                if (
                  [29, 32].includes(mc.blockAt(x, y, z)) &&
                  mc.blockAt(x, y + 1, z) === 0 &&
                  mc.blockAt(x, y + 2, z) === 0
                ) {
                  points.push({ x, z, y, d: x * x + z * z + (34 - y) ** 2 });
                  break;
                }
            }
          return points.sort((x, y) => x.d - y.d)[0];
        });
        assert.ok(landing, "find dry Nether terrain");
        await d.tunnelTo(landing);
        await d.center();
        const position = (await d.info()).position;
        await d.mine({
          x: Math.floor(position.x),
          y: Math.round(position.y) - 1,
          z: Math.floor(position.z),
        });
        await wait(1000);
      }
      const deadline = Date.now() + 240000;
      while ((await d.count("blazeRod")) < 2) {
        assert.ok(Date.now() < deadline, "gather two rods through survival combat");
        assert.ok((await d.info()).health > 0, "survive Nether expedition");
        await a.eat();
        const p = (await d.info()).position;
        const mobs = (await a.adventure()).creatures
          .filter((m) => m.species === "ember")
          .sort(
            (x, y) =>
              Math.hypot(x.position.x - p.x, x.position.z - p.z) -
              Math.hypot(y.position.x - p.x, y.position.z - p.z),
          );
        const mob = mobs[0];
        if (!mob) {
          await wait(700);
          continue;
        }
        const distance = Math.hypot(mob.position.x - p.x, mob.position.z - p.z);
        if (distance < 2.8) {
          await d.equip("iron_sword");
          await d.aim({ ...mob.position, y: mob.position.y + 1 });
          await page.mouse.down();
          await wait(450);
          await page.mouse.up();
        } else if (distance < 24 && (await d.count("arrow")) > 12) {
          await d.equip("bow");
          const t = distance / 22;
          await d.aim({
            x: mob.position.x + mob.velocity.x * t,
            y: mob.position.y + 1 + 1.2 * t * t,
            z: mob.position.z + mob.velocity.z * t,
          });
          await a.right();
          await wait(700);
        } else await wait(500);
        const alive = (await a.adventure()).creatures.some((m) => m.id === mob.id);
        if (!alive) {
          await d.equip("iron_pick");
          await d.tunnelTo({ x: Math.floor(mob.position.x), z: Math.floor(mob.position.z) });
          if ((await d.info()).position.y < Math.floor(mob.position.y))
            await a.pillarTo(Math.floor(mob.position.y));
          else if (
            (await d.info()).position.y > Math.floor(mob.position.y) + 1.2 &&
            [29, 32, 28, 11, 2].includes(
              await d.block({
                x: Math.floor(mob.position.x),
                y: Math.floor(mob.position.y) - 1,
                z: Math.floor(mob.position.z),
              }),
            )
          ) {
            await d.center();
            const feet = (await d.info()).position;
            d.narrate("敵が落としたロッドを回収するため、地面へ降ります。", 1);
            await d.mine({
              x: Math.floor(feet.x),
              y: Math.round(feet.y) - 1,
              z: Math.floor(feet.z),
            });
          }
          await wait(1000);
        }
      }
    }
    await d.report("ネザーの敵を倒し、炎のロッドを2本回収");
    d.setGoal("ロッドを回収できたので、帰還ゲートへ戻ります。");
    await a.pillarTo(34);
    await d.tunnelTo({ x: 0, z: 0 });
    await a.travel("overworld", { x: 0, y: 35, z: -3 });
    await chapter("ネザーで素材を入手し、持ち物を持って村へ帰還", 4);
  }
  if (resume <= 4) {
    d.setGoal("小麦を育て、村人との取引でパールを集めます。");
    if ((await d.count("enderPearl")) < 4 && (await d.count("enderEye")) < 4) {
      if ((await d.count("wheat")) < 144) await a.surfaceTo({ x: village.x, z: village.z - 3 });
      const deadline = Date.now() + 240000;
      while ((await d.count("wheat")) < 144) {
        assert.ok(Date.now() < deadline, "farm the remaining wheat");
        await a.harvest(village, 144, true);
        if ((await d.count("wheat")) < 144) await a.waitSafe(5000);
      }
      await a.tradePearls(village);
    }
    await d.open();
    while ((await d.count("arrow")) < 16) {
      if (!(await d.count("stick"))) {
        assert.ok((await d.count("planks")) >= 2, "wood available for spare arrows");
        await d.make("sticks");
      }
      assert.ok(
        (await d.count("cobble")) >= 2 || (await d.count("flint")),
        "stone available for spare arrows",
      );
      if (!(await d.count("flint"))) await d.make("flint");
      await d.make("arrow");
    }
    while ((await d.count("enderEye")) < 4) {
      if (!(await d.count("blazePowder"))) await d.make("blazePowder");
      await d.make("enderEye");
    }
    await d.close();
    await stockFood(village);
    await a.eat();
    await chapter("育った小麦を村人と交換し、4個のエンダーアイを作成", 5);
  }
  if (resume <= 5) {
    const here = (await d.info()).position;
    if (Math.hypot(here.x - village.x, here.z - village.z) < 24) {
      await stockArrows(village);
      await stockFood(village);
    } else {
      await craftArrows(8);
      if ((await d.count("bread")) < 3) await stockFood(village);
    }
    d.setGoal("エンダーアイを持って、地下遺跡へ向かいます。");
    const c = (await a.adventure()).stronghold;
    await a.enterStronghold();
    d.narrate("遺跡に到着。空いている枠にアイを入れます。", 2);
    await d.equip("enderEye");
    for (const [dx, dz] of [
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
    ])
      if ((await d.block({ x: c.x + dx, y: c.y, z: c.z + dz })) === 38)
        await a.useAt({ x: c.x + dx, y: c.y, z: c.z + dz });
    assert.equal(await d.block(c), 40, "activate the discovered stronghold gateway");
    await a.recover(20);
    await a.travel("end", c);
    await chapter("地下遺跡のゲートを開き、エンドの島へ到達", 6);
  }
  if (resume <= 6) {
    await craftArrows(8);
    d.setGoal("まずクリスタルを弓で壊し、ドラゴンの回復を止めます。");
    await a.defeatDragon();
    await d.report("エンダードラゴン討伐。クリスタル6個破壊、卵1個を獲得");
    await page.screenshot({ path: path.join(out, "victory.png") });
    await wait(3000);
    await a.travel("overworld", { x: 0, y: 34, z: 5 });
    await chapter("討伐報酬を持って通常世界へ帰還・保存", 7);
  }
  const final = await a.adventure();
  assert.ok(final.dragon.defeated);
  assert.equal(await d.count("dragonEgg"), 1);
  meta.completed = true;
  delete meta.error;
  meta.combat = a.combatStats;
  meta.final = {
    health: (await d.info()).health,
    dragon: final.dragon,
    eggCount: await d.count("dragonEgg"),
    dimension: final.dimension,
  };
  await a.save();
  await wait(2000);
  part.completed = true;
} catch (error) {
  part.error = String(error?.stack ?? error);
  meta.error = part.error;
  console.error(error);
  try {
    await d.releaseAttack();
    await page.keyboard.up("KeyW");
    await page.keyboard.up("Space");
    await a.save();
  } catch {
    /* Preserve failure evidence. */
  }
  await page.screenshot({ path: path.join(out, "failure.png") });
  writeFileSync(
    path.join(out, "failure.json"),
    JSON.stringify(
      {
        info: await d.info(),
        adventure: await a.adventure(),
        toast: await page.$eval("#toast", (el) => el.textContent),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  clearInterval(cameraSampler);
  if (recorder) await recorder.stop();
  part.finishedAt = new Date().toISOString();
  flush();
  await browser.close();
  console.log(`Recording and metadata: ${out}`);
}
