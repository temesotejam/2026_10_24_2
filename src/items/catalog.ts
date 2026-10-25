import { must } from "../core/assert";
import { BlockId } from "../world/blocks";
export interface ItemDef {
  name: string;
  color: string;
  block?: BlockId;
  tool?: "pick" | "axe" | "shovel" | "sword" | "hoe";
  tier?: number;
  durability?: number;
  food?: number;
  fuel?: number;
  enchanted?: boolean;
}
export const ITEMS: Record<string, ItemDef> = {
  obsidian: { name: "黒曜石", color: "#301e41", block: BlockId.OBSIDIAN },
  netherrack: { name: "ネザーラック", color: "#75352f", block: BlockId.NETHERRACK },
  glowstone: { name: "グロウストーン", color: "#f1c05b", block: BlockId.GLOWSTONE },
  soulSand: { name: "ソウルサンド", color: "#584136", block: BlockId.SOUL_SAND },
  netherWart: { name: "ネザーウォート", color: "#982a37", block: BlockId.NETHER_WART },
  enchantTable: { name: "エンチャント台", color: "#3c3665", block: BlockId.ENCHANT_TABLE },
  brewingStand: { name: "醸造台", color: "#827452", block: BlockId.BREWING },
  stoneBrick: { name: "石レンガ", color: "#6a7077", block: BlockId.STONE_BRICK },
  glass: { name: "ガラス", color: "#b6dde0", block: BlockId.GLASS },
  string: { name: "糸", color: "#ddd9cf" },
  fishingRod: { name: "釣り竿", color: "#b5956b", durability: 65 },
  fish: { name: "生魚", color: "#7aa5b0", food: 2 },
  cookedFish: { name: "焼き魚", color: "#b98c65", food: 6 },
  flint: { name: "火打石", color: "#555363" },
  flintSteel: { name: "火打石と打ち金", color: "#9b9da9", durability: 65 },
  book: { name: "本", color: "#99795c" },
  emerald: { name: "エメラルド", color: "#4fb77d" },
  blazeRod: { name: "炎のロッド", color: "#e6b54c" },
  blazePowder: { name: "炎の粉", color: "#e78e32" },
  bottle: { name: "ガラス瓶", color: "#b6dde0" },
  waterBottle: { name: "水入り瓶", color: "#558acc" },
  healingPotion: { name: "治癒のポーション", color: "#dd6682" },
  firePotion: { name: "耐火のポーション（60秒）", color: "#e8a04a" },
  strengthPotion: { name: "力のポーション（60秒）", color: "#ab639e" },
  bucket: { name: "バケツ", color: "#b8c0c9" },
  waterBucket: { name: "水入りバケツ", color: "#558acc", block: BlockId.WATER },
  lavaBucket: { name: "溶岩入りバケツ", color: "#e88835", block: BlockId.LAVA },
  endStone: { name: "エンドストーン", color: "#d3d79e", block: BlockId.END_STONE },
  enderPearl: { name: "エンダーパール", color: "#43877c" },
  enderEye: { name: "エンダーアイ", color: "#72ad72" },
  dragonEgg: { name: "ドラゴンの卵（討伐の証）", color: "#65427c" },
  bow: { name: "弓", color: "#bd955d", durability: 385 },
  arrow: { name: "矢", color: "#b9bfc8" },
  dirt: { name: "土", color: "#876044", block: BlockId.DIRT },
  grass: { name: "草ブロック", color: "#73a448", block: BlockId.GRASS },
  stone: { name: "石", color: "#999ca5", block: BlockId.STONE },
  sand: { name: "砂", color: "#dfcf94", block: BlockId.SAND },
  birchLog: { name: "シラカバの原木", color: "#d3d3bd", block: BlockId.BIRCH, fuel: 15 },
  log: { name: "原木", color: "#735331", block: BlockId.WOOD, fuel: 15 },
  leaves: { name: "葉", color: "#4c873d", block: BlockId.LEAVES },
  snow: { name: "雪", color: "#eaf0f5", block: BlockId.SNOW },
  planks: { name: "木材", color: "#b68b51", block: BlockId.PLANKS, fuel: 15 },
  cobble: { name: "丸石", color: "#7b8087", block: BlockId.COBBLE },
  table: { name: "作業台", color: "#9e713b", block: BlockId.TABLE, fuel: 15 },
  furnace: { name: "かまど", color: "#535963", block: BlockId.FURNACE },
  chest: { name: "チェスト", color: "#bd8739", block: BlockId.CHEST, fuel: 15 },
  bed: { name: "ベッド", color: "#b8433d", block: BlockId.BED },
  torch: { name: "松明", color: "#ffd96a", block: BlockId.TORCH },
  coal: { name: "石炭", color: "#383d49", fuel: 80 },
  ironOre: { name: "鉄鉱石", color: "#b3967b", block: BlockId.IRON_ORE },
  goldOre: { name: "金鉱石", color: "#d5b455", block: BlockId.GOLD_ORE },
  diamondOre: { name: "ダイヤ鉱石", color: "#54d2cf", block: BlockId.DIAMOND_ORE },
  coalOre: { name: "石炭鉱石", color: "#555967", block: BlockId.COAL_ORE },
  iron: { name: "鉄インゴット", color: "#cbd1d8" },
  gold: { name: "金インゴット", color: "#f7ca50" },
  diamond: { name: "ダイヤモンド", color: "#65e3dc" },
  stick: { name: "棒", color: "#b39768", fuel: 5 },
  apple: { name: "りんご", color: "#d75c4c", food: 4 },
  rawMeat: { name: "生肉", color: "#cc797a", food: 2 },
  meat: { name: "焼き肉", color: "#b27640", food: 8 },
  seeds: { name: "種", color: "#90a85c", block: BlockId.CROP },
  wheat: { name: "小麦", color: "#d9bd58" },
  bread: { name: "パン", color: "#d7a65c", food: 5 },
  wool: { name: "羊毛", color: "#e4e0d5", block: BlockId.WOOL },
  sapling: { name: "苗木", color: "#6b9c40", block: BlockId.SAPLING },
  bone: { name: "骨", color: "#d6d3c6" },
};
for (const [material, tier, color, durability] of [
  ["wood", 1, "#b68b51", 60],
  ["stone", 2, "#9196a0", 132],
  ["iron", 3, "#d1dae0", 251],
  ["gold", 1, "#f4cc57", 33],
  ["diamond", 4, "#65e3dc", 1562],
] as const) {
  const names = { wood: "木", stone: "石", iron: "鉄", gold: "金", diamond: "ダイヤ" };
  for (const [tool, name] of Object.entries({
    pick: "ツルハシ",
    axe: "斧",
    shovel: "シャベル",
    sword: "剣",
    hoe: "クワ",
  }) as [NonNullable<ItemDef["tool"]>, string][]) {
    ITEMS[`${material}_${tool}`] = {
      name: `${names[material]}の${name}`,
      color,
      tool,
      tier,
      durability,
    };
  }
}
for (const [id, def] of Object.entries(ITEMS)) {
  if (!def.tool) continue;
  ITEMS[`enchanted_${id}`] = {
    ...def,
    name: `${def.name}（強化）`,
    enchanted: true,
    durability: (def.durability ?? 1) * 2,
  };
}
export interface Stack {
  id: string;
  count: number;
  durability?: number;
}
export function stackLimit(id: string): number {
  return ITEMS[id]?.durability ||
    id.endsWith("Potion") ||
    id === "waterBottle" ||
    id.endsWith("Bucket") ||
    id === "bucket"
    ? 1
    : 64;
}
export function stack(id: string, count = 1): Stack {
  const durability = ITEMS[id]?.durability;
  return durability === undefined ? { id, count } : { id, count, durability };
}
export function validStack(value: unknown): value is Stack {
  if (!value || typeof value !== "object") return false;
  const s = value as Stack;
  if (typeof s.id !== "string" || !Object.hasOwn(ITEMS, s.id)) return false;
  const def = ITEMS[s.id];
  return (
    !!def &&
    Number.isInteger(s.count) &&
    s.count > 0 &&
    s.count <= stackLimit(s.id) &&
    (def.durability === undefined
      ? s.durability === undefined
      : Number.isInteger(s.durability) &&
        must(s.durability) > 0 &&
        must(s.durability) <= def.durability)
  );
}
export function blockItem(id: BlockId): string | undefined {
  return Object.keys(ITEMS).find((key) => ITEMS[key]?.block === id);
}
