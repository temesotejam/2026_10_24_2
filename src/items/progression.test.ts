import { describe, expect, it } from "vitest";
import { stack } from "./catalog";
import { blockDrops } from "./mining";
import { craft, matchRecipe, RECIPES } from "./recipes";
import { emptySlots } from "./inventory";
import { BlockId } from "../world/blocks";
import { creatureDrops, type Creature } from "../entities/creatures";
import { structureLoot } from "./structure-loot";
import { FOOD_TRADES } from "./trades";

const mob = (species: Creature["species"]): Creature => ({
  id: 1,
  species,
  position: { x: 0, y: 1, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  onGround: true,
  hp: 0,
  age: 0,
  cooldown: 0,
  intent: 0,
  love: 0,
});

describe("survival resource sources", () => {
  it("requires a diamond pickaxe to collect naturally mined obsidian", () => {
    expect(blockDrops(BlockId.OBSIDIAN, stack("iron_pick"), 0)).toEqual([]);
    expect(blockDrops(BlockId.OBSIDIAN, stack("gold_pick"), 0)).toEqual([]);
    expect(blockDrops(BlockId.OBSIDIAN, stack("diamond_pick"), 0)).toEqual([stack("obsidian")]);
    expect(RECIPES.some((r) => r.id === "diamond_pick")).toBe(true);
  });
  it("gets flint only from gravel's chance drop, keeping gravel on unsuccessful rolls", () => {
    expect(blockDrops(BlockId.GRAVEL, null, 0.099)).toEqual([stack("flint")]);
    expect(blockDrops(BlockId.GRAVEL, null, 0.1)).toEqual([stack("gravel")]);
    expect(RECIPES.some((r) => r.output.id === "flint")).toBe(false);
    expect(matchRecipe([stack("cobble"), stack("cobble"), null, null], 2)).toBeUndefined();
  });
  it("cannot turn one wool into string or wheat and wood into books", () => {
    expect(matchRecipe([stack("wool"), null, null, null], 2)).toBeUndefined();
    expect(RECIPES.some((r) => r.output.id === "string" || r.output.id === "book")).toBe(false);
    expect(creatureDrops(mob("spider"))).toEqual([stack("string", 2)]);
  });
  it("needs feathers as well as a stick and flint to craft four arrows at a table", () => {
    const grid = emptySlots(9),
      inventory = emptySlots(36);
    grid[0] = stack("flint");
    grid[3] = stack("stick");
    expect(craft(grid, 3, inventory)).toBe(false);
    grid[6] = stack("feather");
    expect(craft(grid, 3, inventory)).toBe(true);
    expect(inventory[0]).toEqual(stack("arrow", 4));
    expect(grid.every((s) => s === null)).toBe(true);
    expect(creatureDrops(mob("chicken"), 0.9)).toContainEqual(stack("feather", 2));
    expect(creatureDrops(mob("skeleton"), 0.9)).toContainEqual(stack("arrow", 2));
  });
  it("does not guarantee a progression drop for every End or Nether enemy", () => {
    for (const [species, item] of [
      ["wanderer", "enderPearl"],
      ["ember", "blazeRod"],
    ] as const) {
      expect(creatureDrops(mob(species), 0.1)).toEqual([stack(item)]);
      expect(creatureDrops(mob(species), 0.9)).toEqual([]);
    }
  });
  it("harvests one wheat with a variable number of seeds", () => {
    expect(blockDrops(BlockId.RIPE_CROP, null, 0)).toEqual([stack("wheat")]);
    expect(blockDrops(BlockId.RIPE_CROP, null, 0.99)).toEqual([stack("wheat"), stack("seeds", 3)]);
  });
});

describe("village and ruin progression", () => {
  it("does not let a generic food merchant sell pearls or mining progression items", () => {
    expect(FOOD_TRADES.some((t) => ["enderPearl", "iron", "obsidian"].includes(t.output.id))).toBe(
      false,
    );
    expect(FOOD_TRADES.find((t) => t.id === "sell-wheat")?.costs).toEqual({ wheat: 20 });
  });
  it("seeds varied chest contents by location without a guaranteed Nether starter kit", () => {
    const chests = Array.from({ length: 32 }, (_, x) =>
      structureLoot(2026, x * 16, 35, -12, "village"),
    );
    expect(new Set(chests.map((c) => JSON.stringify(c))).size).toBeGreaterThan(5);
    expect(
      chests.flat().some((s) => ["obsidian", "enderPearl", "blazeRod", "string"].includes(s.id)),
    ).toBe(false);
    expect(structureLoot(2026, 0, 35, -12, "village")).toEqual(
      structureLoot(2026, 0, 35, -12, "village"),
    );
    expect(structureLoot(2026, 16, 35, -12, "ruin")).toContainEqual(stack("book"));
  });
});
