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
}
export const ITEMS: Record<string, ItemDef> = {
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
export interface Stack {
  id: string;
  count: number;
  durability?: number;
}
export function stackLimit(id: string): number {
  return ITEMS[id]?.tool ? 1 : 64;
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
