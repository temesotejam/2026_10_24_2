import { BlockId } from "../world/blocks";
import { ITEMS, blockItem, type Stack, stack } from "./catalog";

const PICK_BLOCKS: readonly BlockId[] = [
  BlockId.STONE,
  BlockId.COBBLE,
  BlockId.COAL_ORE,
  BlockId.IRON_ORE,
  BlockId.GOLD_ORE,
  BlockId.DIAMOND_ORE,
  BlockId.FURNACE,
];
export function miningSeconds(block: BlockId, held: Stack | null): number {
  const tool = held ? ITEMS[held.id] : undefined;
  const preferred = PICK_BLOCKS.includes(block)
    ? "pick"
    : [BlockId.WOOD, BlockId.BIRCH, BlockId.PLANKS, BlockId.TABLE, BlockId.CHEST].includes(
          block as typeof BlockId.WOOD,
        )
      ? "axe"
      : "shovel";
  const hardness = PICK_BLOCKS.includes(block)
    ? 2.4
    : block === BlockId.WOOD || block === BlockId.BIRCH
      ? 1.2
      : 0.45;
  return hardness / (tool?.tool === preferred ? (tool.tier ?? 1) * 2 : 1);
}
export function blockDrops(block: BlockId, held: Stack | null, roll: number): Stack[] {
  const tool = held ? ITEMS[held.id] : undefined;
  const tier = tool?.tool === "pick" ? (tool.tier ?? 0) : 0;
  if (PICK_BLOCKS.includes(block)) {
    const required =
      block === BlockId.IRON_ORE
        ? 2
        : [BlockId.GOLD_ORE, BlockId.DIAMOND_ORE].includes(block as typeof BlockId.GOLD_ORE)
          ? 3
          : 1;
    if (tier < required) return [];
    if (block === BlockId.STONE) return [stack("cobble")];
    if (block === BlockId.COAL_ORE) return [stack("coal")];
    if (block === BlockId.DIAMOND_ORE) return [stack("diamond")];
  }
  if (block === BlockId.GRASS) return [stack("dirt"), ...(roll < 0.35 ? [stack("seeds")] : [])];
  if (block === BlockId.FARMLAND) return [stack("dirt")];
  if (block === BlockId.LEAVES)
    return roll < 0.15 ? [stack("apple")] : roll < 0.4 ? [stack("sapling")] : [];
  if (block === BlockId.CROP) return [stack("seeds")];
  if (block === BlockId.RIPE_CROP) return [stack("wheat", 2), stack("seeds", 2)];
  const id = blockItem(block);
  return id ? [stack(id)] : [];
}
