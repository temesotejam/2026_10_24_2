/** Recorded survival run, never a fixture import. Resume uses the same browser
 * profile's ordinary save, and produces another chronological recording part. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setInterval, clearInterval } from "node:timers";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer";
import { createDriver, initialJourney, wait } from "./lib/survival-driver.mjs";
import { createAdventureDriver } from "./lib/adventure-driver.mjs";
import { createModernHunting } from "./lib/modern-hunting.mjs";
const args = process.argv.slice(2),
  option = (key, fallback) => (args.includes(key) ? args[args.indexOf(key) + 1] : fallback);
const out = path.resolve(option("--out", `visual-check/dragon-playthrough/run-${Date.now()}`));
const resume = Number(option("--resume", "0"));
const until = Number(option("--until", "1"));
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
const workingGuard = createModernHunting(page, d, a);
a.setGuard(workingGuard.guard);
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
  const generation = await page.evaluate(() => window.__mc.adventure().generator);
  assert.equal(generation, 3, "new survival recording requires generator3");
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
try {
  if (resume === 0) {
    await initialJourney(d, page, url, startRecording);
    await chapter("所持品ゼロから木・石・鉄の道具と自然のダイヤを入手", 1);
  } else {
    await page.goto(url.href, { waitUntil: "domcontentloaded" });
    await a.boot();
    await startRecording();
    if ((await d.info()).health <= 0) {
      d.setGoal("夜の戦闘で倒されました。復活して、落とした道具を回収します。");
      await page.locator("#respawn").click();
      await page.waitForFunction(
        () => window.__mc.health() > 0 && window.__mc.mode() === "pointer",
      );
      await a.boot();
    } else {
      await page.locator("#play-button").click();
      await page.waitForFunction(() => window.__mc.mode() === "pointer");
    }
  }
  for (let phase = Math.max(1, resume); phase < until; phase++) {
    const mission = await import(`./missions/phase-${phase}.mjs?run=${Date.now()}`);
    await mission.run({ page, d, a, meta, flush, chapter, out });
  }
  await a.save();
  await wait(1000);
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
