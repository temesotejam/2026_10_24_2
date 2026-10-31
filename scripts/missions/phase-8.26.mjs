/** Fish a small amount beside the irrigation canal without damaging crops. */
import { hostile } from "../lib/combat-policy.mjs";
export async function run(ctx) {
  const { d, a, meta, flush } = ctx;
  const guard = async () => {
    const p = (await d.info()).position;
    const t = (await a.adventure()).creatures.find(
      (m) =>
        m.hp > 0 &&
        hostile(m) &&
        Math.hypot(m.position.x - p.x, m.position.y - p.y, m.position.z - p.z) <
          (m.species === "skeleton" ? 18 : 9),
    );
    if (t) throw Error(`Safety checkpoint: ${t.species} near fishing route`);
    return false;
  };
  a.setGuard(guard);
  d.setThreatHandler(guard);
  meta.livingSafe = true;
  meta.livingFishTarget = 7;
  const before = meta.fishingFood?.caught ?? 0;
  const rods = (await d.info()).inventory
    .filter((s) => s?.id === "fishingRod")
    .map((s) => s.durability);
  flush();
  d.setGoal("在庫のある釣り竿を使い、畑の水路で少量の魚を集めます。");
  await a.surfaceTo({ x: 196, z: -84 });
  meta.fishingSpot = { ...(await d.info()).position };
  flush();
  const fishing = await import("./phase-4.9.mjs");
  await fishing.run(ctx);
  meta.livingFishReserve = {
    caught: meta.fishingFood.caught - before,
    remaining: await d.count("fish"),
    health: (await d.info()).health,
    rodsBefore: rods,
    rodsAfter: (await d.info()).inventory
      .filter((s) => s?.id === "fishingRod")
      .map((s) => s.durability),
  };
  flush();
  console.log("Living renewable reserve", JSON.stringify(meta.livingFishReserve));
}
