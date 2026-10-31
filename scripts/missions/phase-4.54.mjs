/** Turn the earned seven-feather reserve into real arrows before nightfall. */
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { prepareArchery } from "../lib/modern-archery.mjs";
export async function run({ page, d, a, meta, chapter }) {
  const h = createModernHunting(page, d, a, { arrowReserve: 12 });
  h.activate();
  d.setGoal("集めた砂利から火打ち石を取り、手持ちの羽根を実際の矢に仕上げます。");
  await a.surfaceTo({ x: meta.village.x - 6, z: meta.village.z + 1 });
  await prepareArchery(page, d, a, 32);
  await chapter(`実際に採取した砂利・羽根・棒から矢${await d.count("arrow")}本を製作`, 4);
}
