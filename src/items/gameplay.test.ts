import { must } from "../core/assert";
import { describe, expect, it } from "vitest";
import { stack, validStack, ITEMS } from "./catalog";
import {
  addItem,
  emptySlots,
  removeItem,
  transfer,
  newFurnace,
  tickFurnace,
  wearTool,
} from "./inventory";
import { craft, matchRecipe, RECIPES } from "./recipes";
import { blockDrops } from "./mining";
import { BlockId } from "../world/blocks";
const count = (slots: ReturnType<typeof emptySlots>, id: string) =>
  slots.filter((s) => s?.id === id).reduce((sum, s) => sum + must(s).count, 0);
describe("inventory conservation", () => {
  it("merges stacks, fills empty slots and reports overflow", () => {
    const inv = emptySlots(2);
    expect(addItem(inv, stack("log", 64))).toBe(0);
    expect(addItem(inv, stack("log", 64))).toBe(0);
    expect(addItem(inv, stack("log", 5))).toBe(5);
    expect(count(inv, "log")).toBe(128);
  });
  it("moves one item, swaps unlike items, and ignores self drops", () => {
    const a = [stack("log", 6), stack("coal", 3), null];
    transfer(a, 0, a, 2, true);
    expect(a.map((s) => s?.count)).toEqual([5, 3, 1]);
    transfer(a, 0, a, 1);
    expect(a[1]?.id).toBe("log");
    transfer(a, 1, a, 1);
    expect(count(a, "log")).toBe(6);
    expect(count(a, "coal")).toBe(3);
  });
  it("does not overwrite full destinations or overstack tools", () => {
    const a = [stack("log", 64), stack("log", 64)];
    transfer(a, 0, a, 1);
    expect(a[0]?.count).toBe(64);
    const tools = emptySlots(2);
    expect(addItem(tools, stack("wood_pick"))).toBe(0);
    expect(addItem(tools, stack("wood_pick"))).toBe(0);
    expect(tools.every((s) => s?.count === 1)).toBe(true);
  });
  it("removes a broken tool instead of allowing zero durability", () => {
    const inv = [{ ...stack("wood_pick"), durability: 1 }];
    wearTool(inv, 0);
    expect(inv[0]).toBeNull();
  });
  it.each([
    { id: "missing", count: 1 },
    { id: "log", count: 65 },
    { id: "log", count: -1 },
    { id: "iron_pick", count: 1, durability: 99999 },
    { id: "iron_pick", count: 1 },
  ])("rejects invalid stacks %j", (s) => {
    expect(validStack(s)).toBe(false);
  });
});
describe("shaped crafting", () => {
  it("supports shifted recipes and consumes exactly one ingredient per cell", () => {
    const inv = emptySlots(36),
      grid = emptySlots(4);
    grid[3] = stack("log", 2);
    expect(craft(grid, 2, inv)).toBe(true);
    expect(count(inv, "planks")).toBe(4);
    expect(grid[3].count).toBe(1);
  });
  it("rejects extra ingredients, missing ingredients and a 3x3 recipe at 2x2", () => {
    const grid = [stack("log"), stack("dirt"), null, null];
    expect(matchRecipe(grid, 2)).toBeUndefined();
    expect(matchRecipe(emptySlots(4), 2)).toBeUndefined();
    expect(RECIPES.find((r) => r.id === "wood_pick")?.station).toBe(3);
    expect(
      matchRecipe([stack("planks"), stack("planks"), stack("stick"), stack("stick")], 2),
    ).toBeUndefined();
  });
  it("leaves ingredients unchanged if output cannot fit", () => {
    const inv = Array.from({ length: 36 }, () => stack("dirt", 64));
    const grid = [stack("log"), null, null, null];
    expect(craft(grid, 2, inv)).toBe(false);
    expect(grid[0]?.count).toBe(1);
    expect(count(inv, "planks")).toBe(0);
  });
  it.each(RECIPES.map((r) => [r.id, r] as const))(
    "can craft %s using its declared pattern",
    (_id, r) => {
      const grid = emptySlots(r.station ** 2);
      r.pattern.forEach((row, y) => {
        Array.from(row).forEach((ch, x) => {
          if (r.keys[ch]) grid[y * r.station + x] = stack(must(r.keys[ch]));
        });
      });
      const inv = emptySlots(36);
      expect(craft(grid, r.station, inv)).toBe(true);
      expect(inv[0]).toEqual(r.output);
      expect(grid.every((s) => s === null)).toBe(true);
    },
  );
  it("mirrors an axe recipe without accepting a different shape", () => {
    const grid = [
      stack("planks"),
      stack("planks"),
      null,
      stack("stick"),
      stack("planks"),
      null,
      stack("stick"),
      null,
      null,
    ];
    expect(matchRecipe(grid, 3)?.id).toBe("wood_axe");
  });
});
describe("mining tiers and durability", () => {
  it("requires wood, stone and iron picks for progressively harder resources", () => {
    expect(blockDrops(BlockId.STONE, null, 0)).toEqual([]);
    expect(blockDrops(BlockId.STONE, stack("wood_pick"), 0)[0]?.id).toBe("cobble");
    expect(blockDrops(BlockId.IRON_ORE, stack("wood_pick"), 0)).toEqual([]);
    expect(blockDrops(BlockId.IRON_ORE, stack("stone_pick"), 0)[0]?.id).toBe("ironOre");
    expect(blockDrops(BlockId.DIAMOND_ORE, stack("stone_pick"), 0)).toEqual([]);
    expect(blockDrops(BlockId.DIAMOND_ORE, stack("iron_pick"), 0)[0]?.id).toBe("diamond");
  });
  it("only applies durability to tools", () => {
    const inv = [stack("log", 2)];
    wearTool(inv, 0);
    expect(inv[0]).toEqual(stack("log", 2));
    expect(must(ITEMS.diamond_pick).durability).toBeGreaterThan(
      must(must(ITEMS.iron_pick).durability),
    );
  });
});
describe("furnace transactions", () => {
  it("smelts three iron ore with one coal using eight seconds per ingot", () => {
    const f = newFurnace();
    f.slots[0] = stack("ironOre", 3);
    f.slots[1] = stack("coal");
    for (let i = 0; i < 24 * 120; i++) tickFurnace(f, 1 / 120);
    expect(f.slots[2]).toEqual(stack("iron", 3));
    expect(f.slots[0]).toBeNull();
    expect(f.slots[1]).toBeNull();
    expect(f.fuel).toBeCloseTo(56);
  });
  it("does not consume fuel for invalid inputs or a blocked output", () => {
    const f = newFurnace();
    f.slots[0] = stack("dirt");
    f.slots[1] = stack("coal");
    tickFurnace(f, 1);
    expect(f.slots[1].count).toBe(1);
    f.slots[0] = stack("ironOre");
    f.slots[2] = stack("gold", 64);
    tickFurnace(f, 1);
    expect(f.fuel).toBe(0);
    expect(f.slots[1].count).toBe(1);
  });
  it("resets progress when the recipe changes instead of transferring progress", () => {
    const f = newFurnace();
    f.slots[0] = stack("ironOre");
    f.slots[1] = stack("coal");
    tickFurnace(f, 4);
    f.slots[0] = stack("goldOre");
    tickFurnace(f, 1);
    expect(f.progress).toBe(1);
    expect(f.slots[2]).toBeNull();
  });
  it("removal cannot consume more than present", () => {
    const inv = [stack("log", 2)];
    expect(removeItem(inv, 0, 3)).toBe(false);
    expect(inv[0]?.count).toBe(2);
  });
});
