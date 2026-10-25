import { ITEMS, type Stack, stack, stackLimit } from "./catalog";
export type Slots = (Stack | null)[];
export function emptySlots(size: number): Slots {
  return Array.from({ length: size }, () => null);
}
export function addItem(slots: Slots, incoming: Stack): number {
  let left = incoming.count;
  for (const slot of slots) {
    if (slot?.id !== incoming.id || slot.durability !== incoming.durability) continue;
    const n = Math.min(left, stackLimit(slot.id) - slot.count);
    slot.count += n;
    left -= n;
  }
  for (let i = 0; i < slots.length && left > 0; i++) {
    if (slots[i]) continue;
    const n = Math.min(left, stackLimit(incoming.id));
    slots[i] = { ...incoming, count: n };
    left -= n;
  }
  return left;
}
export function removeItem(slots: Slots, index: number, amount = 1): boolean {
  const slot = slots[index];
  if (!slot || slot.count < amount || amount <= 0) return false;
  slot.count -= amount;
  if (slot.count === 0) slots[index] = null;
  return true;
}
export function transfer(from: Slots, a: number, to: Slots, b: number, split = false): void {
  if (from === to && a === b) return;
  const source = from[a];
  const target = to[b];
  if (!source || b < 0 || b >= to.length) return;
  if (!target || (target.id === source.id && target.durability === source.durability)) {
    const n = Math.min(split ? 1 : source.count, stackLimit(source.id) - (target?.count ?? 0));
    if (n <= 0) return;
    if (target) target.count += n;
    else to[b] = { ...source, count: n };
    removeItem(from, a, n);
  } else if (!split) {
    from[a] = target;
    to[b] = source;
  }
}
export function wearTool(slots: Slots, index: number): void {
  const item = slots[index];
  if (item?.durability === undefined) return;
  item.durability--;
  if (item.durability <= 0) slots[index] = null;
}
export const SMELTING: Record<string, string> = {
  ironOre: "iron",
  goldOre: "gold",
  rawMeat: "meat",
  log: "coal",
  birchLog: "coal",
  sand: "glass",
  fish: "cookedFish",
};
export interface FurnaceState {
  slots: Slots;
  fuel: number;
  progress: number;
  recipe: string | null;
}
export function newFurnace(): FurnaceState {
  return { slots: emptySlots(3), fuel: 0, progress: 0, recipe: null };
}
export function tickFurnace(f: FurnaceState, dt: number): void {
  const input = f.slots[0];
  const outputId = input ? SMELTING[input.id] : undefined;
  if (f.recipe !== (outputId ?? null)) {
    f.recipe = outputId ?? null;
    f.progress = 0;
  }
  const out = f.slots[2];
  const canWork = !!outputId && (!out || (out.id === outputId && out.count < 64));
  if (!canWork) {
    f.fuel = Math.max(0, f.fuel - dt);
    return;
  }
  if (f.fuel <= 0) {
    const fuel = f.slots[1];
    const seconds = fuel ? ITEMS[fuel.id]?.fuel : undefined;
    if (!seconds) return;
    removeItem(f.slots, 1);
    f.fuel += seconds;
  }
  const burn = Math.min(dt, f.fuel);
  f.fuel -= burn;
  f.progress += burn;
  if (f.progress >= 8 && outputId) {
    if (out) out.count++;
    else f.slots[2] = stack(outputId);
    removeItem(f.slots, 0);
    f.progress -= 8;
  }
}
