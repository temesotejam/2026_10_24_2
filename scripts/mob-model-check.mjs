/** Visual inspection of the exact procedural models used by EntityView. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer";
const origin = process.argv[2] ?? "http://127.0.0.1:4177";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setRequestInterception(true);
  page.on("request", (r) =>
    r.isNavigationRequest()
      ? r.respond({
          status: 200,
          contentType: "text/html",
          body: '<html lang="ja"><meta charset="UTF-8"><style>body{margin:0;background:#1c2530;color:#ecede5;font:20px system-ui}h1{font-size:25px;margin:15px 25px}#grid{position:relative;width:1440px;height:1008px}canvas{position:absolute;inset:0}.label{position:absolute;text-align:center;width:360px;pointer-events:none;text-shadow:0 2px 3px #000}</style><h1>MOBの造形見直し — ゲームで使用する実モデル</h1><div id="grid"></div></html>',
        })
      : r.continue(),
  );
  await page.goto(origin + "/model-review");
  const result = await page.evaluate(async () => {
    const THREE = await import("/node_modules/.vite/deps/three.js");
    const { mobGeometry } = await import("/src/entities/mob-model.ts");
    const { AdventureView } = await import("/src/render/adventure-view.ts");
    const { skyStateAt } = await import("/src/render/sky.ts");
    const day = skyStateAt(300);
    const review = [];
    const entries = [
      ["pig", "ブタ"],
      ["cow", "ウシ"],
      ["sheep", "ヒツジ"],
      ["chicken", "ニワトリ"],
      ["zombie", "ゾンビ"],
      ["skeleton", "スケルトン"],
      ["spider", "クモ"],
      ["mossling", "モスリング（苔の敵）"],
      ["villager", "村人"],
      ["wanderer", "ワンダラー（パール）"],
      ["ember", "エンバー（ロッド）"],
      ["dragon", "エンダードラゴン"],
    ];
    const grid = document.querySelector("#grid");
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1440, 1008);
    renderer.setClearColor(0x25313d);
    grid.append(renderer.domElement);
    renderer.setScissorTest(true);
    const proof = [];
    for (let i = 0; i < entries.length; i++) {
      const [species, label] = entries[i],
        scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, day.ambientIntensity));
      const light = new THREE.DirectionalLight(0xffffff, day.sunIntensity);
      light.position.set(-3, 6, -4);
      scene.add(light);
      let mesh,
        vertices = 0;
      if (species === "dragon") {
        const staging = new THREE.Scene();
        new AdventureView(staging);
        mesh = staging.children.find((child) => child.isGroup);
        mesh.scale.setScalar(0.14);
        mesh.position.y = 1;
        mesh.traverse((child) => {
          if (child.geometry) vertices += child.geometry.getAttribute("position").count;
        });
      } else {
        const geometry = mobGeometry(species);
        mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
        vertices = geometry.getAttribute("position").count;
      }
      scene.add(mesh);
      const bounds = new THREE.Box3().setFromObject(mesh);
      const floor = new THREE.Mesh(
        new THREE.CylinderGeometry(1.42, 1.42, 0.08, 48),
        new THREE.MeshLambertMaterial({ color: 0x536251 }),
      );
      floor.position.y = -0.06;
      scene.add(floor);
      const camera = new THREE.PerspectiveCamera(34, 360 / 336, 0.1, 30);
      camera.position.set(2.9, 2.25, -4.6);
      camera.lookAt(0, 0.98, 0);
      const col = i % 4,
        row = Math.floor(i / 4),
        y = 1008 - (row + 1) * 336;
      renderer.setViewport(col * 360, y, 360, 336);
      renderer.setScissor(col * 360, y, 360, 336);
      renderer.render(scene, camera);
      review.push({ scene, camera, mesh, species, col, y });
      const text = document.createElement("div");
      text.className = "label";
      text.style.left = col * 360 + "px";
      text.style.top = row * 336 + 302 + "px";
      text.textContent = label;
      grid.append(text);
      proof.push({
        species,
        vertices,
        bounds: {
          min: bounds.min.toArray(),
          max: bounds.max.toArray(),
        },
        drawCalls: renderer.info.render.calls,
      });
    }
    window.__mobReview = { renderer, review, skyStateAt };
    return proof;
  });
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.equal(result.length, 12);
  for (const model of result) {
    assert.ok(model.bounds.min.every(Number.isFinite));
    assert.ok(model.bounds.max.every(Number.isFinite));
    assert.ok(model.vertices < 5000);
    if (model.species === "dragon") assert.ok(model.drawCalls < 100);
    else assert.equal(model.drawCalls, 2);
  }
  mkdirSync("docs/screenshots", { recursive: true });
  mkdirSync("visual-check/mob-models", { recursive: true });
  await page.screenshot({ path: "docs/screenshots/mob-models.png" });
  for (const condition of ["night", "young-animals"]) {
    await page.evaluate((condition) => {
      const { renderer, review, skyStateAt } = window.__mobReview;
      const lighting = skyStateAt(condition === "night" ? 900 : 300);
      for (const { scene, camera, mesh, species, col, y } of review) {
        for (const light of scene.children) {
          if (light.isAmbientLight) light.intensity = lighting.ambientIntensity;
          if (light.isDirectionalLight) light.intensity = lighting.sunIntensity;
        }
        if (condition === "young-animals" && ["pig", "cow", "sheep", "chicken"].includes(species))
          mesh.scale.setScalar(0.6);
        renderer.setViewport(col * 360, y, 360, 336);
        renderer.setScissor(col * 360, y, 360, 336);
        renderer.render(scene, camera);
      }
    }, condition);
    await page.screenshot({ path: `visual-check/mob-models/${condition}.png` });
    assert.equal(await page.evaluate(() => window.__mobReview.renderer.getContext().getError()), 0);
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  writeFileSync(
    "visual-check/mob-models/proof.json",
    JSON.stringify(
      { models: result, conditions: ["day", "night", "young-animals"], errors },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      models: result.length,
      errors,
      screenshot: "docs/screenshots/mob-models.png",
    }),
  );
} finally {
  await browser.close();
}
