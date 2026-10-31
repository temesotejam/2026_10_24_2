/** Recorded survival run, never a fixture import. Resume uses the same browser
 * profile's ordinary save, and produces another chronological recording part. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setInterval, clearInterval } from "node:timers";
import { execFileSync, fork } from "node:child_process";
import puppeteer from "puppeteer";
import { createDriver, initialJourney, wait } from "./lib/survival-driver.mjs";
import { createAdventureDriver } from "./lib/adventure-driver.mjs";
import { createModernHunting } from "./lib/modern-hunting.mjs";
const args = process.argv.slice(2),
  option = (key, fallback) => (args.includes(key) ? args[args.indexOf(key) + 1] : fallback);
const out = path.resolve(option("--out", `visual-check/dragon-playthrough/run-${Date.now()}`));
const resume = Number(option("--resume", "0"));
const until = Number(option("--until", "1"));
const renderScale = option("--render-scale", "0.5");
process.env.RECORDING_RENDER_SCALE = renderScale;
const captureQuality = Number(option("--capture-quality", "28"));
const captureFps = Number(option("--capture-fps", "15"));
assert.ok([15, 30].includes(captureFps));
assert.ok(["0.5", "0.75", "1"].includes(renderScale));
assert.ok(Number.isInteger(captureQuality) && captureQuality >= 0 && captureQuality <= 51);
const inspectPaused = args.includes("--inspect");
const manualStart = args.includes("--manual-start");
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
if (args.includes("--directional-eye")) meta.directionalNavigation = true;
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
const recordNarration = (text, priority = 0) => {
  if (!part.startedAt) return;
  const seconds = (Date.now() - Date.parse(part.startedAt)) / 1000;
  const gap = priority >= 2 ? 4 : 6;
  if (seconds - lastNarrationAt < gap || seconds - (lastTextAt.get(text) ?? -Infinity) < 20) return;
  meta.narration.push({ part: part.path, seconds, text });
  lastNarrationAt = seconds;
  lastTextAt.set(text, seconds);
  flush();
};
d.setNarrator(recordNarration);
const startRecording = async () => {
  const generation = await page.evaluate(() => window.__mc.adventure().generator);
  assert.equal(generation, 3, "new survival recording requires generator3");
  part.generator = generation;
  meta.generator = generation;
  await page.select("#render-scale", renderScale);
  part.capture = {
    width: 1280,
    height: 720,
    fps: captureFps,
    quality: captureQuality,
    renderScale: Number(renderScale),
  };
  part.assets = await page.$$eval("script[src]", (els) => els.map((el) => el.getAttribute("src")));
  part.initial = await d.info();
  part.dimension = (await a.adventure()).dimension;
  part.camera = await page.evaluate(() => window.__mc.cameraView());
  part.cameraSamples = [];
  cameraSampler = setInterval(async () => {
    try {
      const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      if (viewport.width !== 1280 || viewport.height !== 720) {
        (part.viewportCorrections ??= []).push({ at: new Date().toISOString(), ...viewport });
        // Another CDP connection can leave this Page's cached viewport stale.
        // Synchronize that cache before requesting the recording dimensions.
        await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
        await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
      }
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
    fps: captureFps,
    quality: captureQuality,
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
    if ((await d.info()).health <= 0 && !inspectPaused) {
      const previous = meta.parts.at(-2);
      if (previous && !(meta.deaths ?? []).some((death) => death.part === previous.path)) {
        meta.lastDeath = (await d.info()).position;
        (meta.deaths ??= []).push({
          part: previous.path,
          position: meta.lastDeath,
          cause: "Observed actual death before normal respawn",
        });
        flush();
      }
      d.setGoal("倒されました。復活して、落とした道具を回収します。");
      await page.locator("#respawn").click();
      await page.waitForFunction(() => window.__mc?.health() > 0, { timeout: 120000 });
      await a.boot();
      if (!manualStart) {
        if ((await page.evaluate(() => window.__mc.mode())) !== "pointer")
          await page.locator("#play-button").click();
        await page.waitForFunction(() => window.__mc.mode() === "pointer");
      }
    } else if (!inspectPaused && !manualStart) {
      await page.locator("#play-button").click();
      await page.waitForFunction(() => window.__mc.mode() === "pointer");
    }
  }
  if (inspectPaused) {
    part.inspection = { info: await d.info(), adventure: await a.adventure() };
    console.log("Paused inspection", JSON.stringify(part.inspection));
  }
  if (!inspectPaused && Math.max(1, resume) < until) {
    const child = fork(
      path.resolve("scripts/lib/recorded-mission-worker.mjs"),
      [browser.wsEndpoint(), out, String(resume), String(until)],
      { stdio: ["ignore", "inherit", "inherit", "ipc"] },
    );
    writeFileSync(path.join(out, "controller-pid"), String(child.pid));
    let childFailure;
    const requestCheckpoint = () => {
      part.checkpointRequested = true;
      child.kill("SIGTERM");
    };
    process.on("SIGUSR2", requestCheckpoint);
    child.on("message", (message) => {
      if (message.kind === "narration") recordNarration(message.text, message.priority);
      if (message.kind === "failure") childFailure = message.error;
      if (message.kind === "mission") {
        for (const [key, value] of Object.entries(message.data))
          if (!["parts", "narration", "chapters"].includes(key)) meta[key] = value;
        if (meta.completed) delete meta.error;
        flush();
      }
      if (message.kind === "chapter") {
        meta.chapters.push({
          name: message.name,
          phase: message.phase,
          part: part.path,
          at: new Date().toISOString(),
          seconds: (Date.now() - Date.parse(part.startedAt)) / 1000,
        });
        flush();
      }
    });
    const code = await new Promise((resolve) =>
      child.once("exit", (code, signal) =>
        resolve(signal === "SIGTERM" && part.checkpointRequested ? 0 : (code ?? 1)),
      ),
    );
    process.off("SIGUSR2", requestCheckpoint);
    if (code !== 0) throw new Error(childFailure ?? `Mission controller exited with ${code}`);
  }
  await a.save(false);
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
    if ((await d.info()).health <= 0) {
      meta.lastDeath = (await d.info()).position;
      (meta.deaths ??= []).push({ part: part.path, position: meta.lastDeath, cause: part.error });
      await page.evaluate(() => document.exitPointerLock());
      await page.locator("#save-button").click();
      await page.waitForFunction(
        () => document.querySelector("#save-status").textContent === "保存済み",
      );
    } else await a.save(false);
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
