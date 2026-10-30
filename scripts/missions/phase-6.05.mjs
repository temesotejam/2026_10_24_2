/** Replace arrows actually consumed during defense before entering the Nether. */
import { createModernHunting } from "../lib/modern-hunting.mjs";
import { stashVillage } from "../lib/modern-storage.mjs";
import { prepareArchery } from "../lib/modern-archery.mjs";

export async function run({ page, d, a, meta, flush, chapter }) {
  const events = (meta.huntingEvents ??= []);
  const surplus = [
    "sand",
    "seeds",
    "sapling",
    "wool",
    "bone",
    "stoneBrick",
    "goldOre",
    "glass",
    "rawMeat",
    "dirt",
  ];
  const h = createModernHunting(page, d, a, {
    maintain: async (state) => {
      if (state.inventory.filter((slot) => slot === null).length < 4)
        await stashVillage(page, d, a, meta.village, surplus);
    },
    onEvent: async (event) => {
      events.push(event);
      flush();
    },
  });
  h.activate();
  await a.eat();
  await a.recover(20);
  if ((await d.info()).inventory.filter((slot) => slot === null).length < 6)
    await stashVillage(page, d, a, meta.village, surplus);
  d.setGoal("迎撃で減った矢を、実際の羽根と火打ち石から補充してネザーへ備えます。");
  await a.surfaceTo(meta.huntingCamp.position ?? meta.huntingCamp);
  meta.netherAmmoPreparation = await h.collectAmmo(24, {
    timeoutMs: 600000,
    avoidWaterTargets: true,
    arrowReserve: Infinity,
    home: meta.huntingCamp.position ?? meta.huntingCamp,
  });
  await prepareArchery(page, d, a, 24);
  flush();
  await chapter("実際に集めた羽根と火打ち石でネザー用の矢を補充", 6);
}
