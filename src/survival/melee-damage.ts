import type { ItemDef } from "../items/catalog";

/** Base weapon damage in health points. Tool tier is 1=wood/gold through
 * 4=diamond, giving swords 4/5/6/7 rather than doubling every tier. */
export function meleeDamage(item: ItemDef | undefined): number {
  return item?.tool === "sword" ? 3 + (item.tier ?? 1) : item?.tool ? 3 : 1;
}
