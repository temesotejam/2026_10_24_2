import { BlockId } from "../world/blocks";

/** Flat per-block colors for the CPU raycaster — the same palette the
 * procedural texture atlas is built from, without needing a canvas. Grass
 * is the one block whose top and sides differ. */
export interface BlockColor {
  readonly top: readonly [number, number, number];
  readonly side: readonly [number, number, number];
}

const uniform = (r: number, g: number, b: number): BlockColor => ({
  top: [r, g, b],
  side: [r, g, b],
});

export const BLOCK_COLORS: Readonly<Record<BlockId, BlockColor>> = {
  [BlockId.OBSIDIAN]: uniform(48, 30, 65),
  [BlockId.NETHERRACK]: uniform(117, 53, 47),
  [BlockId.GLOWSTONE]: uniform(241, 192, 91),
  [BlockId.PORTAL]: uniform(130, 64, 191),
  [BlockId.SOUL_SAND]: uniform(88, 65, 54),
  [BlockId.NETHER_WART]: uniform(152, 42, 55),
  [BlockId.ENCHANT_TABLE]: uniform(60, 54, 101),
  [BlockId.BREWING]: uniform(130, 116, 82),
  [BlockId.STONE_BRICK]: uniform(106, 112, 119),
  [BlockId.GLASS]: uniform(182, 221, 224),
  [BlockId.FIRE]: uniform(255, 135, 34),
  [BlockId.END_FRAME]: uniform(64, 112, 102),
  [BlockId.END_FRAME_FILLED]: uniform(80, 155, 125),
  [BlockId.END_GATE]: uniform(27, 22, 43),
  [BlockId.END_STONE]: uniform(211, 215, 158),
  [BlockId.END_CRYSTAL]: uniform(222, 109, 224),
  [BlockId.PLANKS]: uniform(174, 135, 79),
  [BlockId.COBBLE]: uniform(111, 116, 121),
  [BlockId.TABLE]: uniform(137, 95, 47),
  [BlockId.FURNACE]: uniform(79, 84, 92),
  [BlockId.CHEST]: uniform(183, 127, 45),
  [BlockId.BED]: uniform(179, 61, 57),
  [BlockId.TORCH]: uniform(255, 204, 83),
  [BlockId.COAL_ORE]: uniform(72, 76, 85),
  [BlockId.IRON_ORE]: uniform(163, 138, 113),
  [BlockId.GOLD_ORE]: uniform(200, 172, 73),
  [BlockId.DIAMOND_ORE]: uniform(69, 188, 191),
  [BlockId.FARMLAND]: uniform(99, 67, 42),
  [BlockId.CROP]: uniform(83, 140, 50),
  [BlockId.RIPE_CROP]: uniform(207, 181, 72),
  [BlockId.WOOL]: uniform(220, 218, 204),
  [BlockId.SAPLING]: uniform(72, 134, 47),
  [BlockId.LAVA]: uniform(232, 92, 22),
  [BlockId.BIRCH]: uniform(211, 211, 189),
  [BlockId.AIR]: uniform(0, 0, 0), // never drawn — rays pass through air
  [BlockId.GRASS]: { top: [86, 140, 58], side: [122, 84, 51] },
  [BlockId.DIRT]: uniform(122, 84, 51),
  [BlockId.STONE]: uniform(130, 130, 134),
  [BlockId.SAND]: uniform(219, 196, 120),
  [BlockId.WATER]: uniform(59, 111, 209),
  [BlockId.WOOD]: uniform(95, 66, 40),
  [BlockId.LEAVES]: uniform(58, 117, 45),
  [BlockId.BEDROCK]: uniform(40, 40, 44),
  [BlockId.SNOW]: uniform(235, 240, 245),
};
