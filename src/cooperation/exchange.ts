import { addItem, removeItem, type Slots } from "../items/inventory";
import type { Vec3 } from "../player/physics";

/** Transfer atomically: the recipient must have room for the entire stack. */
export function give(
  from: Slots,
  to: Slots,
  slot: number,
  amount: number,
  a: Vec3,
  b: Vec3,
): boolean {
  if (
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= from.length ||
    !Number.isInteger(amount) ||
    amount <= 0 ||
    Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 2.5
  )
    return false;
  const item = from[slot];
  if (!item || item.count < amount || from === to) return false;
  const copy = structuredClone(to);
  if (addItem(copy, { ...item, count: amount }) !== 0) return false;
  removeItem(from, slot, amount);
  to.splice(0, to.length, ...copy);
  return true;
}
