import { writeFileSync } from "node:fs";
export async function run({ page, d, out }) {
  d.setGoal("黒曜石の採掘を続けるため、足場と視界を確かめます。");
  const target = { x: 187, y: 4, z: -73 };
  await d.aim({ x: target.x + 0.5, y: target.y + 0.5, z: target.z + 0.5 });
  const probe = await page.evaluate(() => {
    const p = window.__mc.position(),
      cells = [];
    for (let x = 185; x <= 190; x++)
      for (let z = -75; z <= -71; z++)
        for (let y = 3; y <= 8; y++) cells.push({ x, y, z, b: window.__mc.blockAt(x, y, z) });
    return {
      p,
      eye: window.__mc.eyeHeight(),
      pitch: window.__mc.pitch(),
      yaw: window.__mc.yaw(),
      target: window.__mc.target(),
      cells,
    };
  });
  writeFileSync(`${out}/obsidian-probe.json`, JSON.stringify(probe, null, 2));
  console.log("Obsidian probe", { ...probe, cells: undefined });
}
