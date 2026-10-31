import { describe, expect, it } from "vitest";
import { Chunk } from "../world/chunk";
import { World } from "../world/world";
import { BlockId } from "../world/blocks";
import { newSession, SurvivalSession } from "../survival/session";
import { stack } from "../items/catalog";
import { validateSave } from "../save/persistence";
import { CompanionController, createCompanion } from "./companion";
import { give } from "./exchange";
import { must } from "../core/assert";

function setup() {
  const world = new World(1);
  const chunk = new Chunk(0, 0);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.setBlock(x, 0, z, BlockId.GRASS);
  world.setChunk(chunk);
  const data = newSession(1, "survival", { x: 4.5, y: 1, z: 4.5 });
  const session = new SurvivalSession(world, data, (x, y, z, id) => {
    world.setBlock(x, y, z, id);
  });
  const state = createCompanion(session, data.position);
  data.companion = state;
  const companion = new CompanionController(session, state);
  function tick(seconds: number) {
    for (let i = 0; i < Math.ceil(seconds * 60); i++) {
      companion.update(1 / 60);
      session.tick(1 / 60, { position: data.position, onGround: true, yaw: 0, pitch: 0 });
    }
  }
  return { world, data, session, state, companion, tick };
}

describe("shared-world companion", () => {
  it("moves independently with collision and automatically stops a stale command", () => {
    const { world, data, state, companion, tick } = setup();
    world.setBlock(8, 1, 4, BlockId.STONE);
    world.setBlock(8, 2, 4, BlockId.STONE);
    expect(companion.move({ forward: 1, right: 0, jump: false, yaw: -Math.PI / 2 }, 1)).toBe(true);
    tick(2);
    expect(state.position.x).toBeGreaterThan(6.5);
    expect(state.position.x).toBeLessThan(8);
    expect(data.position.x).toBe(4.5);
    const x = state.position.x;
    tick(1);
    expect(state.position.x).toBeCloseTo(x, 3);
    expect(companion.move({ forward: 2, right: 0, jump: false, yaw: 0 }, 1)).toBe(false);
  });

  it("immediately cancels an in-progress movement or mining command", () => {
    const { world, state, companion, tick } = setup();
    const initial = state.position.x;
    expect(companion.move({ forward: 1, right: 0, jump: false, yaw: -Math.PI / 2 }, 1)).toBe(true);
    companion.stop();
    tick(0.5);
    expect(state.position.x).toBeCloseTo(initial, 4);
    world.setBlock(7, 1, 4, BlockId.WOOD);
    expect(companion.mine(7, 1, 4)).toBe(true);
    companion.stop();
    tick(2);
    expect(world.getBlock(7, 1, 4)).toBe(BlockId.WOOD);
  });

  it("identifies and clears a leaf blocking a reachable tree", () => {
    const { world, companion, tick } = setup();
    world.setBlock(7, 2, 4, BlockId.LEAVES);
    world.setBlock(8, 2, 4, BlockId.WOOD);
    expect(companion.mine(8, 2, 4)).toBe(false);
    expect(companion.blockingLeaf(8, 2, 4)).toEqual({ x: 7, y: 2, z: 4 });
    expect(companion.mine(7, 2, 4)).toBe(true);
    tick(1);
    expect(world.getBlock(7, 2, 4)).toBe(BlockId.AIR);
    expect(companion.mine(8, 2, 4)).toBe(true);
  });

  it("plants an owned sapling on supported ground and starts normal growth", () => {
    const { world, state, data, companion } = setup();
    state.inventory[0] = stack("sapling");
    expect(companion.place(7, 1, 4)).toBe(true);
    expect(world.getBlock(7, 1, 4)).toBe(BlockId.SAPLING);
    expect(data.growth["7,1,4"]).toBe(0);
    expect(state.inventory[0]).toBe(null);
  });

  it("mines a real block over time and collects its drop into the nearest inventory", () => {
    const { world, data, state, companion, tick } = setup();
    world.setBlock(7, 1, 4, BlockId.WOOD);
    expect(companion.mine(7, 1, 4)).toBe(true);
    tick(0.5);
    expect(world.getBlock(7, 1, 4)).toBe(BlockId.WOOD);
    tick(1.5);
    expect(world.getBlock(7, 1, 4)).toBe(BlockId.AIR);
    expect(state.inventory.some((s) => s?.id === "log")).toBe(true);
    expect(data.inventory.every((s) => s === null)).toBe(true);
    expect(companion.craft("planks")).toBe(true);
    expect(state.inventory.some((s) => s?.id === "planks" && s.count === 4)).toBe(true);
    expect(companion.craft("planks")).toBe(false);
    expect(() => validateSave(data)).not.toThrow();
  });

  it("transfers only available items within reach, without partial loss", () => {
    const { data, state } = setup();
    state.inventory[0] = stack("log", 4);
    expect(give(state.inventory, data.inventory, 0, 2, state.position, data.position)).toBe(true);
    expect(must(state.inventory[0]).count).toBe(2);
    expect(data.inventory[0]?.count).toBe(2);
    expect(give(state.inventory, data.inventory, 0, 3, state.position, data.position)).toBe(false);
    expect(give(state.inventory, data.inventory, 0, 1, state.position, { x: 50, y: 1, z: 4 })).toBe(
      false,
    );
    expect(data.inventory[0]?.count).toBe(2);
  });

  it("lets a live hostile target and damage the closer companion", () => {
    const { data, state, tick } = setup();
    data.creatures.push({
      id: data.nextId++,
      species: "zombie",
      position: { x: 8.5, y: 1, z: 4.5 },
      velocity: { x: 0, y: 0, z: 0 },
      onGround: true,
      hp: 16,
      age: 0,
      cooldown: 0,
      intent: 0,
      love: 0,
    });
    // Night prevents the zombie from burning in direct sunlight.
    data.time = 800;
    tick(1);
    expect(state.vitals.health).toBeLessThan(20);
    expect(data.vitals.health).toBe(20);
  });

  it("attacks only a reachable unobstructed creature and uses a separate cooldown", () => {
    const { world, data, session, companion } = setup();
    const mob = {
      id: data.nextId++,
      species: "zombie" as const,
      position: { x: 8.5, y: 1, z: 4.5 },
      velocity: { x: 0, y: 0, z: 0 },
      onGround: true,
      hp: 16,
      age: 0,
      cooldown: 0,
      intent: 0,
      love: 0,
    };
    data.creatures.push(mob);
    world.setBlock(7, 2, 4, BlockId.STONE);
    expect(companion.attack(mob.id)).toBe(false);
    world.setBlock(7, 2, 4, BlockId.AIR);
    expect(companion.attack(mob.id)).toBe(true);
    const hp = mob.hp;
    expect(companion.attack(mob.id)).toBe(false);
    expect(mob.hp).toBe(hp);
    expect(session.hitCreature(mob.id)).toBe(true);
    expect(mob.hp).toBeLessThan(hp);
  });

  it("requires a safe distinct bed for both players before advancing time", () => {
    const { world, data, state, companion, session } = setup();
    data.time = 800;
    world.setBlock(4, 1, 5, BlockId.BED);
    world.setBlock(6, 1, 5, BlockId.BED);
    session.sleep(4, 1, 5);
    expect(data.time).toBe(800);
    expect(companion.sleep(6, 1, 5)).toBe(true);
    session.sleep(4, 1, 5);
    expect(data.time).toBeGreaterThan(800);
    expect(state.sleeping).toBe(false);
  });
});
