/** Numeric block ids, stored one byte each in a chunk's Uint8Array. */
export const BlockId = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  WOOD: 6,
  LEAVES: 7,
  BEDROCK: 8,
  SNOW: 9,
  PLANKS: 10,
  COBBLE: 11,
  TABLE: 12,
  FURNACE: 13,
  CHEST: 14,
  BED: 15,
  TORCH: 16,
  COAL_ORE: 17,
  IRON_ORE: 18,
  GOLD_ORE: 19,
  DIAMOND_ORE: 20,
  FARMLAND: 21,
  CROP: 22,
  RIPE_CROP: 23,
  WOOL: 24,
  SAPLING: 25,
  LAVA: 26,
  BIRCH: 27,
  OBSIDIAN: 28,
  NETHERRACK: 29,
  GLOWSTONE: 30,
  PORTAL: 31,
  SOUL_SAND: 32,
  NETHER_WART: 33,
  ENCHANT_TABLE: 34,
  BREWING: 35,
  STONE_BRICK: 36,
  GLASS: 37,
  END_FRAME: 38,
  END_FRAME_FILLED: 39,
  END_GATE: 40,
  END_STONE: 41,
  END_CRYSTAL: 42,
  FIRE: 43,
} as const;

export type BlockId = (typeof BlockId)[keyof typeof BlockId];

export interface BlockDef {
  readonly id: BlockId;
  readonly name: string;
  /** Has collision and stops the player. */
  readonly solid: boolean;
  /** Doesn't occlude a neighboring block's face in the mesher (air, water, leaves). */
  readonly transparent: boolean;
  /** Can be broken and picked up into the hotbar. */
  readonly breakable: boolean;
}

function block(id: BlockId, name: string, overrides: Partial<BlockDef> = {}): BlockDef {
  return { id, name, solid: true, transparent: false, breakable: true, ...overrides };
}

export const BLOCKS: Readonly<Record<BlockId, BlockDef>> = {
  [BlockId.OBSIDIAN]: block(BlockId.OBSIDIAN, "obsidian"),
  [BlockId.NETHERRACK]: block(BlockId.NETHERRACK, "netherrack"),
  [BlockId.GLOWSTONE]: block(BlockId.GLOWSTONE, "glowstone"),
  [BlockId.PORTAL]: block(BlockId.PORTAL, "portal", {
    solid: false,
    transparent: true,
    breakable: false,
  }),
  [BlockId.SOUL_SAND]: block(BlockId.SOUL_SAND, "soul_sand"),
  [BlockId.NETHER_WART]: block(BlockId.NETHER_WART, "nether_wart", {
    solid: false,
    transparent: true,
  }),
  [BlockId.ENCHANT_TABLE]: block(BlockId.ENCHANT_TABLE, "enchant_table"),
  [BlockId.BREWING]: block(BlockId.BREWING, "brewing"),
  [BlockId.STONE_BRICK]: block(BlockId.STONE_BRICK, "stone_brick"),
  [BlockId.GLASS]: block(BlockId.GLASS, "glass", { transparent: true }),
  [BlockId.FIRE]: block(BlockId.FIRE, "fire", { solid: false, transparent: true }),
  [BlockId.END_FRAME]: block(BlockId.END_FRAME, "end_frame", { breakable: false }),
  [BlockId.END_FRAME_FILLED]: block(BlockId.END_FRAME_FILLED, "end_frame_filled", {
    breakable: false,
  }),
  [BlockId.END_GATE]: block(BlockId.END_GATE, "end_gate", {
    solid: false,
    transparent: true,
    breakable: false,
  }),
  [BlockId.END_STONE]: block(BlockId.END_STONE, "end_stone"),
  [BlockId.END_CRYSTAL]: block(BlockId.END_CRYSTAL, "end_crystal", {
    solid: false,
    transparent: true,
  }),
  [BlockId.AIR]: block(BlockId.AIR, "air", { solid: false, transparent: true, breakable: false }),
  [BlockId.GRASS]: block(BlockId.GRASS, "grass"),
  [BlockId.DIRT]: block(BlockId.DIRT, "dirt"),
  [BlockId.STONE]: block(BlockId.STONE, "stone"),
  [BlockId.SAND]: block(BlockId.SAND, "sand"),
  [BlockId.WATER]: block(BlockId.WATER, "water", {
    solid: false,
    transparent: true,
    breakable: false,
  }),
  [BlockId.WOOD]: block(BlockId.WOOD, "wood"),
  [BlockId.LEAVES]: block(BlockId.LEAVES, "leaves", { transparent: true }),
  [BlockId.BEDROCK]: block(BlockId.BEDROCK, "bedrock", { breakable: false }),
  [BlockId.SNOW]: block(BlockId.SNOW, "snow"),
  [BlockId.PLANKS]: block(BlockId.PLANKS, "planks"),
  [BlockId.COBBLE]: block(BlockId.COBBLE, "cobble"),
  [BlockId.TABLE]: block(BlockId.TABLE, "table"),
  [BlockId.FURNACE]: block(BlockId.FURNACE, "furnace"),
  [BlockId.CHEST]: block(BlockId.CHEST, "chest"),
  [BlockId.BED]: block(BlockId.BED, "bed"),
  [BlockId.TORCH]: block(BlockId.TORCH, "torch", { solid: false, transparent: true }),
  [BlockId.COAL_ORE]: block(BlockId.COAL_ORE, "coal_ore"),
  [BlockId.IRON_ORE]: block(BlockId.IRON_ORE, "iron_ore"),
  [BlockId.GOLD_ORE]: block(BlockId.GOLD_ORE, "gold_ore"),
  [BlockId.DIAMOND_ORE]: block(BlockId.DIAMOND_ORE, "diamond_ore"),
  [BlockId.FARMLAND]: block(BlockId.FARMLAND, "farmland"),
  [BlockId.CROP]: block(BlockId.CROP, "crop", { solid: false, transparent: true }),
  [BlockId.RIPE_CROP]: block(BlockId.RIPE_CROP, "ripe_crop", { solid: false, transparent: true }),
  [BlockId.WOOL]: block(BlockId.WOOL, "wool"),
  [BlockId.SAPLING]: block(BlockId.SAPLING, "sapling", { solid: false, transparent: true }),
  [BlockId.BIRCH]: block(BlockId.BIRCH, "birch"),
  [BlockId.LAVA]: block(BlockId.LAVA, "lava", {
    solid: false,
    transparent: true,
    breakable: false,
  }),
};

export function isSolid(id: BlockId): boolean {
  return BLOCKS[id].solid;
}

export function isTransparent(id: BlockId): boolean {
  return BLOCKS[id].transparent;
}

/** Blocks a player can place from the hotbar, in hotbar order. */
export const PLACEABLE_BLOCKS: readonly BlockId[] = [
  BlockId.GRASS,
  BlockId.DIRT,
  BlockId.STONE,
  BlockId.SAND,
  BlockId.WOOD,
  BlockId.LEAVES,
  BlockId.SNOW,
];

export function isSmallBlock(id: BlockId): boolean {
  return (
    id === BlockId.TORCH ||
    id === BlockId.FIRE ||
    id === BlockId.NETHER_WART ||
    id === BlockId.CROP ||
    id === BlockId.RIPE_CROP ||
    id === BlockId.SAPLING
  );
}
