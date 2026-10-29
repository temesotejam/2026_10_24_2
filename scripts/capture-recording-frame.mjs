/** Read-only visual observation of an existing recording browser. */
import puppeteer from "puppeteer";
import { readFileSync } from "node:fs";
import path from "node:path";
const directory = path.resolve(process.argv[2]);
const [port, endpoint] = readFileSync(path.join(directory, "profile/DevToolsActivePort"), "utf8")
  .trim()
  .split("\n");
const browser = await puppeteer.connect({
  browserWSEndpoint: `ws://127.0.0.1:${port}${endpoint}`,
  defaultViewport: null,
});
try {
  const page = (await browser.pages()).find((p) => p.url().includes("2026_10_24_2"));
  if (!page) throw new Error("recording page not found");
  await page.screenshot({ path: path.join(directory, "observed-frame.png") });
  console.log(
    await page.evaluate(() => ({
      position: window.__mc.position(),
      health: window.__mc.health(),
      camera: window.__mc.cameraView(),
      dimension: window.__mc.adventure().dimension,
    })),
  );
} finally {
  browser.disconnect();
}
