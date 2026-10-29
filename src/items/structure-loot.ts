import { stack, type Stack } from "./catalog";
import { deriveSeed, mulberry32 } from "../world/rng";

/** Location-seeded loot is stable across reloads, but not a fixed progression
 * kit repeated in every house. SessionState.opened prevents replenishment. */
export function structureLoot(
  seed: number,
  x: number,
  y: number,
  z: number,
  kind: "village" | "ruin",
): Stack[] {
  const random = mulberry32(
    deriveSeed(seed, Math.imul(x, 73856093) ^ Math.imul(y, 83492791) ^ Math.imul(z, 19349663)),
  );
  const quantity = (minimum: number, range: number) => minimum + Math.floor(random() * range);
  const loot =
    kind === "village"
      ? [stack("bread", quantity(1, 4)), stack("seeds", quantity(2, 5))]
      : [stack("book"), stack("coal", quantity(2, 5))];
  if (random() < 0.5) loot.push(stack(kind === "village" ? "apple" : "string", quantity(1, 3)));
  if (random() < 0.3) loot.push(stack("iron", quantity(1, 3)));
  return loot;
}
