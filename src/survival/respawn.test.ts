import { describe, expect, it, vi } from "vitest";
import { stack } from "../items/catalog";
import { emptySlots } from "../items/inventory";
import { encodeSave, parseSave } from "../save/persistence";
import { BlockId } from "../world/blocks";
import { findPleasantSpawn } from "../world/spawn";
import { createColumnSampler } from "../world/terrain";
import { World } from "../world/world";
import { realmSnapshot } from "./adventure-state";
import { newSession, type SessionState } from "./session";
import { respawnCandidate } from "./respawn";
import { newVitals } from "./vitals";

function edit(data: SessionState, x: number, y: number, z: number, id: BlockId) {
  const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`,
    index = (y * 16 + (((z % 16) + 16) % 16)) * 16 + (((x % 16) + 16) % 16);
  (data.edits[key] ??= {})[index] = id;
}
function block(data: SessionState, x: number, y: number, z: number) {
  const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`,
    index = (y * 16 + (((z % 16) + 16) % 16)) * 16 + (((x % 16) + 16) % 16);
  return data.edits[key]?.[index];
}
function deadFixture(dimension: "nether" | "end") {
  const overworld = newSession(2026, "survival", { x: 50.5, y: 34, z: 50.5 });
  overworld.position = { x: 80.5, y: 38, z: 90.5 };
  overworld.yaw = 1.25;
  overworld.pitch = -0.2;
  overworld.inventory[0] = stack("iron_pick");
  overworld.chests["49,34,50"] = emptySlots(27);
  overworld.chests["49,34,50"][0] = stack("bread", 4);
  for (let x = 48; x <= 52; x++)
    for (let z = 48; z <= 52; z++) {
      edit(overworld, x, 33, z, BlockId.STONE);
      edit(overworld, x, 34, z, BlockId.AIR);
      edit(overworld, x, 35, z, BlockId.AIR);
    }
  edit(overworld, 49, 34, 50, BlockId.CHEST);
  const data = newSession(2026, "survival", { x: 1.5, y: 34, z: 1.5 });
  if (!data.adventure) throw new Error("missing adventure");
  data.adventure.dimension = dimension;
  data.adventure.realms.overworld = realmSnapshot(overworld);
  data.adventure.xp = 25;
  data.adventure.fire = 30;
  data.adventure.strength = 20;
  data.position = { x: 20.5, y: 42, z: -7.5 };
  data.vitals.health = 0;
  data.gridSize = 3;
  data.grid = emptySlots(9);
  data.loot = [{ id: 1, stack: stack("diamond", 3), position: { ...data.position }, age: 1 }];
  data.nextId = 2;
  edit(data, 20, 41, -8, BlockId.OBSIDIAN);
  return { data, overworld };
}

describe("cross-dimension death respawn", () => {
  for (const dimension of ["nether", "end"] as const)
    it(`returns ${dimension} death to the Overworld bed while keeping dropped gear in ${dimension}`, () => {
      const { data, overworld } = deadFixture(dimension),
        before = structuredClone(data),
        next = respawnCandidate(data);
      expect(next.adventure?.dimension).toBe("overworld");
      expect(next.position).toEqual(overworld.spawn);
      expect(next.spawn).toEqual(overworld.spawn);
      expect(next.position).not.toEqual(overworld.position);
      expect(next.yaw).toBe(overworld.yaw);
      expect(next.pitch).toBe(overworld.pitch);
      expect(next.chests).toEqual(overworld.chests);
      expect(next.edits).toEqual(overworld.edits);
      expect(next.inventory).toEqual(emptySlots(36));
      expect(next.grid).toEqual(emptySlots(9));
      expect(next.vitals).toEqual(newVitals());
      expect(next.adventure?.xp).toBe(0);
      expect(next.adventure?.fire).toBe(0);
      expect(next.adventure?.strength).toBe(0);
      expect(next.adventure?.realms[dimension]).toEqual(realmSnapshot(data));
      expect(next.adventure?.realms[dimension]?.loot[0]?.stack).toEqual(stack("diamond", 3));
      expect(next.loot).toEqual(overworld.loot);
      expect(data).toEqual(before);
      expect(parseSave(encodeSave(next))).toEqual(next);
    });

  it("uses adjacent safe air when a bed spawn is blocked without modifying blocks", () => {
    const { data, overworld } = deadFixture("nether");
    edit(overworld, 50, 34, 50, BlockId.STONE);
    edit(overworld, 50, 35, 50, BlockId.STONE);
    if (!data.adventure) throw new Error("missing adventure");
    data.adventure.realms.overworld = realmSnapshot(overworld);
    const next = respawnCandidate(data);
    expect(next.position).not.toEqual(overworld.spawn);
    expect(
      Math.hypot(next.position.x - overworld.spawn.x, next.position.z - overworld.spawn.z),
    ).toBe(1);
    expect(next.position.y).toBe(overworld.spawn.y);
    expect(next.edits).toEqual(overworld.edits);
    expect(next.spawn).toEqual(overworld.spawn);
  });

  it("finds free space above a sealed bed without changing builds or portal blocks", () => {
    const { data, overworld } = deadFixture("end");
    for (let x = 48; x <= 52; x++)
      for (let z = 48; z <= 52; z++)
        for (let y = 30; y <= 40; y++) edit(overworld, x, y, z, BlockId.STONE);
    edit(overworld, 48, 34, 48, BlockId.PORTAL);
    edit(overworld, 48, 33, 48, BlockId.OBSIDIAN);
    overworld.fluidLevels["50,34,50"] = 1;
    overworld.growth["50,34,50"] = 15;
    if (!data.adventure) throw new Error("missing adventure");
    data.adventure.realms.overworld = realmSnapshot(overworld);
    const before = structuredClone(data),
      next = respawnCandidate(data);
    expect(next.position.y).toBe(41);
    expect(block(next, 50, 34, 50)).toBe(BlockId.STONE);
    expect(block(next, 50, 35, 50)).toBe(BlockId.STONE);
    expect(block(next, 50, 33, 50)).toBe(BlockId.STONE);
    expect(block(next, 48, 34, 48)).toBe(BlockId.PORTAL);
    expect(block(next, 48, 33, 48)).toBe(BlockId.OBSIDIAN);
    expect(next.edits).toEqual(overworld.edits);
    expect(next.fluidLevels).toEqual(overworld.fluidLevels);
    expect(next.growth).toEqual(overworld.growth);
    expect(data).toEqual(before);
    expect(parseSave(encodeSave(next))).toEqual(next);
  });

  it("consults generated natural terrain before accepting an unedited spawn as safe", () => {
    const { data } = deadFixture("nether"),
      spawn = findPleasantSpawn(data.seed, 3),
      height = createColumnSampler(data.seed, 3)(
        Math.floor(spawn.x),
        Math.floor(spawn.z),
      ).terrainHeight;
    const overworld = newSession(data.seed, "survival", { x: spawn.x, y: height + 1, z: spawn.z });
    if (!data.adventure) throw new Error("missing adventure");
    data.adventure.realms.overworld = realmSnapshot(overworld);
    const ensure = vi.spyOn(World.prototype, "ensureChunk");
    try {
      const next = respawnCandidate(data);
      expect(ensure).toHaveBeenCalled();
      expect(next.position).toEqual(overworld.spawn);
      expect(next.edits).toEqual({});
    } finally {
      ensure.mockRestore();
    }
  });

  it("rejects a completely blocked return area without carving a player's build", () => {
    const { data, overworld } = deadFixture("end");
    for (let x = 48; x <= 52; x++)
      for (let z = 48; z <= 52; z++)
        for (let y = 1; y < 96; y++) edit(overworld, x, y, z, BlockId.STONE);
    if (!data.adventure) throw new Error("missing adventure");
    data.adventure.realms.overworld = realmSnapshot(overworld);
    const before = structuredClone(data);
    expect(() => respawnCandidate(data)).toThrow("安全な場所");
    expect(data).toEqual(before);
  });

  it("rejects a missing return realm without mutating the dead session", () => {
    const { data } = deadFixture("end");
    if (!data.adventure) throw new Error("missing adventure");
    delete data.adventure.realms.overworld;
    const before = structuredClone(data);
    expect(() => respawnCandidate(data)).toThrow("通常世界");
    expect(data).toEqual(before);
  });
});
