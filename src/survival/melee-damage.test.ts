import { describe, expect, it } from "vitest";
import { ITEMS } from "../items/catalog";
import { meleeDamage } from "./melee-damage";

describe("base melee balance", () => {
  it.each([
    ["wood_sword", 4],
    ["gold_sword", 4],
    ["stone_sword", 5],
    ["iron_sword", 6],
    ["diamond_sword", 7],
  ])("gives %s %s health points of damage", (id, expected) => {
    expect(meleeDamage(ITEMS[id])).toBe(expected);
  });
  it("keeps bare hands and other tools below a sword", () => {
    expect(meleeDamage(undefined)).toBe(1);
    expect(meleeDamage(ITEMS.iron_pick)).toBe(3);
  });
});
