/** A replaceable normal-input controller, separate from the recording process. */
import puppeteer from "puppeteer";
import { readFileSync } from "node:fs";
import { createDriver, wait } from "./survival-driver.mjs";
import { createAdventureDriver } from "./adventure-driver.mjs";
import { createModernHunting } from "./modern-hunting.mjs";
const [endpoint, out, resumeText, untilText] = process.argv.slice(2);
const browser = await puppeteer.connect({ browserWSEndpoint: endpoint, defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes("/2026_10_24_2/"));
const meta = JSON.parse(readFileSync(`${out}/recording.json`, "utf8"));
const d = createDriver(page, out),
  a = createAdventureDriver(page, d),
  h = createModernHunting(page, d, a);
h.activate();
const send = (data) => process.send?.(data);
d.setNarrator((text, priority) => send({ kind: "narration", text, priority }));
const flush = () => send({ kind: "mission", data: meta });
const chapter = async (name, phase) => {
  meta.nextPhase = phase;
  flush();
  await d.report(name);
  await a.save();
  send({ kind: "chapter", name, phase });
};
try {
  for (let phase = Math.max(1, Number(resumeText)); phase < Number(untilText); phase++) {
    const mission = await import(`../missions/phase-${phase}.mjs?run=${Date.now()}`);
    await mission.run({ page, d, a, meta, flush, chapter, out });
  }
  flush();
  await wait(50);
} catch (error) {
  console.error(error);
  send({ kind: "failure", error: String(error.stack ?? error) });
  process.exitCode = 1;
} finally {
  await browser.disconnect();
}
