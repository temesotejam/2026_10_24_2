import { must } from "../core/assert";
import { type Stack, stack } from "./catalog";
import { addItem, type Slots } from "./inventory";
export interface Recipe {
  id: string;
  pattern: string[];
  keys: Record<string, string>;
  output: Stack;
  station: 2 | 3;
}
export const RECIPES: Recipe[] = [
  {
    id: "birch_planks",
    pattern: ["B"],
    keys: { B: "birchLog" },
    output: stack("planks", 4),
    station: 2,
  },
  { id: "planks", pattern: ["L"], keys: { L: "log" }, output: stack("planks", 4), station: 2 },
  {
    id: "sticks",
    pattern: ["P", "P"],
    keys: { P: "planks" },
    output: stack("stick", 4),
    station: 2,
  },
  { id: "table", pattern: ["PP", "PP"], keys: { P: "planks" }, output: stack("table"), station: 2 },
  {
    id: "torch",
    pattern: ["C", "S"],
    keys: { C: "coal", S: "stick" },
    output: stack("torch", 4),
    station: 2,
  },
  {
    id: "furnace",
    pattern: ["CCC", "C C", "CCC"],
    keys: { C: "cobble" },
    output: stack("furnace"),
    station: 3,
  },
  {
    id: "chest",
    pattern: ["PPP", "P P", "PPP"],
    keys: { P: "planks" },
    output: stack("chest"),
    station: 3,
  },
  {
    id: "bed",
    pattern: ["WWW", "PPP"],
    keys: { W: "wool", P: "planks" },
    output: stack("bed"),
    station: 3,
  },
  { id: "bread", pattern: ["WWW"], keys: { W: "wheat" }, output: stack("bread"), station: 3 },
];
RECIPES.push(
  {
    id: "bow",
    pattern: [" ST", "S T", " ST"],
    keys: { S: "stick", T: "string" },
    output: stack("bow"),
    station: 3,
  },
  {
    id: "arrow",
    pattern: ["F", "S", "P"],
    keys: { F: "flint", S: "stick", P: "feather" },
    output: stack("arrow", 4),
    station: 3,
  },
  {
    id: "enderEye",
    pattern: ["PB"],
    keys: { P: "enderPearl", B: "blazePowder" },
    output: stack("enderEye"),
    station: 2,
  },
  {
    id: "bucket",
    pattern: ["I I", " I "],
    keys: { I: "iron" },
    output: stack("bucket"),
    station: 3,
  },
  { id: "wool", pattern: ["SS", "SS"], keys: { S: "string" }, output: stack("wool"), station: 2 },
  {
    id: "flintSteel",
    pattern: ["I ", " F"],
    keys: { I: "iron", F: "flint" },
    output: stack("flintSteel"),
    station: 2,
  },
  {
    id: "fishingRod",
    pattern: ["  S", " ST", "S T"],
    keys: { S: "stick", T: "string" },
    output: stack("fishingRod"),
    station: 3,
  },
  {
    id: "bottle",
    pattern: ["G G", " G "],
    keys: { G: "glass" },
    output: stack("bottle", 3),
    station: 3,
  },
  {
    id: "enchantTable",
    pattern: [" B ", "DOD", "OOO"],
    keys: { B: "book", D: "diamond", O: "obsidian" },
    output: stack("enchantTable"),
    station: 3,
  },
  {
    id: "brewingStand",
    pattern: [" R ", "CCC"],
    keys: { R: "blazeRod", C: "cobble" },
    output: stack("brewingStand"),
    station: 3,
  },
  {
    id: "blazePowder",
    pattern: ["R"],
    keys: { R: "blazeRod" },
    output: stack("blazePowder", 2),
    station: 2,
  },
  {
    id: "stoneBrick",
    pattern: ["SS", "SS"],
    keys: { S: "stone" },
    output: stack("stoneBrick", 4),
    station: 2,
  },
);

for (const [material, ingredient] of Object.entries({
  wood: "planks",
  stone: "cobble",
  iron: "iron",
  gold: "gold",
  diamond: "diamond",
})) {
  for (const [tool, pattern] of Object.entries({
    pick: ["MMM", " S ", " S "],
    axe: ["MM", "MS", " S"],
    shovel: ["M", "S", "S"],
    sword: ["M", "M", "S"],
    hoe: ["MM", " S", " S"],
  })) {
    RECIPES.push({
      id: `${material}_${tool}`,
      pattern,
      keys: { M: ingredient, S: "stick" },
      output: stack(`${material}_${tool}`),
      station: 3,
    });
  }
}
export function matchRecipe(grid: Slots, size: 2 | 3): Recipe | undefined {
  const occupied = grid.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  if (!occupied.length) return;
  const minX = Math.min(...occupied.map((i) => i % size));
  const minY = Math.min(...occupied.map((i) => Math.floor(i / size)));
  const maxX = Math.max(...occupied.map((i) => i % size));
  const maxY = Math.max(...occupied.map((i) => Math.floor(i / size)));
  return RECIPES.find((r) => {
    if (
      r.station > size ||
      r.pattern.length !== maxY - minY + 1 ||
      must(r.pattern[0]).length !== maxX - minX + 1
    )
      return false;
    return [false, true].some((mirror) =>
      r.pattern.every((row, y) =>
        Array.from(row).every((symbol, x) => {
          const gx = minX + (mirror ? row.length - 1 - x : x);
          return (grid[(minY + y) * size + gx]?.id ?? null) === (r.keys[symbol] ?? null);
        }),
      ),
    );
  });
}
/** Output capacity is checked on a copy before consuming any ingredients. */
export function craft(grid: Slots, size: 2 | 3, inventory: Slots): boolean {
  const recipe = matchRecipe(grid, size);
  if (!recipe) return false;
  const copy = inventory.map((s) => (s ? { ...s } : null));
  if (addItem(copy, recipe.output) !== 0) return false;
  for (let i = 0; i < grid.length; i++) {
    const s = grid[i];
    if (s && --s.count === 0) grid[i] = null;
  }
  inventory.splice(0, inventory.length, ...copy);
  return true;
}
