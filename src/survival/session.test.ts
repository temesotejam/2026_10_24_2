import { must } from "../core/assert";
import { describe, expect, it } from "vitest";
import { World } from "../world/world";
import { Chunk } from "../world/chunk";
import { BlockId } from "../world/blocks";
import { newSession, SurvivalSession } from "./session";
import { newVitals, tickVitals } from "./vitals";
import { stack } from "../items/catalog";
import { removeItem } from "../items/inventory";
import { RECIPES, craft } from "../items/recipes";
function fixture() {
  const w = new World(1);
  const c = new Chunk(0, 0);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) c.setBlock(x, 0, z, BlockId.GRASS);
  w.setChunk(c);
  const d = newSession(1, "survival", { x: 4.5, y: 1, z: 4.5 });
  const game = new SurvivalSession(w, d, (x, y, z, id) => {
    w.setBlock(x, y, z, id);
  });
  return { w, d, game };
}
function tick(game: SurvivalSession, seconds: number) {
  for (let i = 0; i < seconds * 60; i++)
    game.tick(1 / 60, { position: game.data.position, onGround: true, yaw: 0, pitch: 0 });
}
function gather(game: SurvivalSession, x: number, y: number, z: number) {
  game.data.position = { x: x + 0.5, y: y + 0.1, z: z + 0.5 };
  expect(game.mine(x, y, z)).toBe(true);
  tick(game, 0.6);
}
function make(game: SurvivalSession, id: string) {
  const r = must(RECIPES.find((r) => r.id === id));
  const grid = Array.from({ length: r.station ** 2 }, () => null) as typeof game.data.grid;
  r.pattern.forEach((row, y) => {
    Array.from(row).forEach((ch, x) => {
      const item = r.keys[ch];
      if (!item) return;
      const i = game.data.inventory.findIndex((s) => s?.id === item);
      expect(i, `ingredient ${item} for ${id}`).toBeGreaterThanOrEqual(0);
      grid[y * r.station + x] = { ...must(game.data.inventory[i]), count: 1 };
      removeItem(game.data.inventory, i);
    });
  });
  expect(craft(grid, r.station, game.data.inventory)).toBe(true);
}
function select(game: SurvivalSession, id: string) {
  game.data.selected = game.data.inventory.findIndex((s) => s?.id === id);
  expect(game.data.selected).toBeGreaterThanOrEqual(0);
}
describe("survival progression", () => {
  it("progresses from an empty inventory through wood, stone and smelting to a diamond", () => {
    const { w, d, game } = fixture();
    expect(d.inventory.every((s) => s === null)).toBe(true);
    for (let i = 0; i < 5; i++) {
      w.setBlock(5, 1, 5, BlockId.WOOD);
      gather(game, 5, 1, 5);
    }
    for (let i = 0; i < 5; i++) make(game, "planks");
    make(game, "table");
    make(game, "sticks");
    make(game, "sticks");
    make(game, "sticks");
    make(game, "wood_pick");
    select(game, "wood_pick");
    for (let i = 0; i < 11; i++) {
      w.setBlock(6, 1, 5, BlockId.STONE);
      gather(game, 6, 1, 5);
    }
    make(game, "stone_pick");
    make(game, "furnace");
    select(game, "stone_pick");
    w.setBlock(6, 1, 5, BlockId.COAL_ORE);
    gather(game, 6, 1, 5);
    for (let i = 0; i < 3; i++) {
      w.setBlock(6, 1, 5, BlockId.IRON_ORE);
      gather(game, 6, 1, 5);
    }
    const f = game.furnace(7, 1, 5);
    for (const [slot, id] of [
      [0, "ironOre"],
      [1, "coal"],
    ] as const) {
      const i = d.inventory.findIndex((s) => s?.id === id);
      f.slots[slot] = must(d.inventory[i]);
      d.inventory[i] = null;
    }
    tick(game, 24.1);
    expect(f.slots[2]).toEqual(stack("iron", 3));
    game.collect(must(f.slots[2]));
    f.slots[2] = null;
    make(game, "iron_pick");
    select(game, "iron_pick");
    w.setBlock(6, 1, 5, BlockId.DIAMOND_ORE);
    gather(game, 6, 1, 5);
    expect(d.inventory.some((s) => s?.id === "diamond")).toBe(true);
  });
  it("consumes placed blocks and rejects crops without farmland", () => {
    const { w, d, game } = fixture();
    d.inventory[0] = stack("log", 2);
    expect(game.place(5, 1, 5)).toBe(true);
    expect(d.inventory[0].count).toBe(1);
    expect(w.getBlock(5, 1, 5)).toBe(BlockId.WOOD);
    d.inventory[0] = stack("seeds", 2);
    expect(game.place(6, 1, 5)).toBe(false);
    w.setBlock(6, 0, 5, BlockId.FARMLAND);
    expect(game.place(6, 1, 5)).toBe(true);
    expect(d.inventory[0].count).toBe(1);
    tick(game, 181);
    expect(w.getBlock(6, 1, 5)).toBe(BlockId.RIPE_CROP);
  });
  it("drops inventory and crafting contents on death and resets health on respawn", () => {
    const { d, game } = fixture();
    d.inventory[0] = stack("diamond", 2);
    d.grid[0] = stack("log", 3);
    game.hurt(20);
    expect(game.dead).toBe(true);
    expect(d.inventory.every((s) => !s)).toBe(true);
    expect(d.grid.every((s) => !s)).toBe(true);
    expect(d.loot.map((l) => l.stack.id)).toContain("diamond");
    game.respawn();
    expect(game.dead).toBe(false);
    expect(d.vitals.health).toBe(20);
  });
  it("returns chest contents to the world when a chest is mined", () => {
    const { w, game, d } = fixture();
    w.setBlock(5, 1, 5, BlockId.CHEST);
    game.chest(5, 1, 5)[0] = stack("diamond", 3);
    game.mine(5, 1, 5);
    expect(d.chests["5,1,5"]).toBeUndefined();
    expect(d.loot.some((l) => l.stack.id === "diamond" && l.stack.count === 3)).toBe(true);
  });
  it("eating consumes food and restores hunger without exceeding twenty", () => {
    const { d, game } = fixture();
    d.vitals.hunger = 17;
    d.inventory[0] = stack("meat", 2);
    expect(game.eat()).toBe(true);
    expect(d.vitals.hunger).toBe(20);
    expect(d.inventory[0].count).toBe(1);
    expect(game.eat()).toBe(false);
  });
});
describe("vitals", () => {
  it("drowns only after air runs out and restores air on the surface", () => {
    const v = newVitals();
    for (let i = 0; i < 9 * 120; i++) tickVitals(v, 1 / 120, 0, true, false, false);
    expect(v.health).toBe(20);
    for (let i = 0; i < 3 * 120; i++) tickVitals(v, 1 / 120, 0, true, false, false);
    expect(v.health).toBeLessThan(20);
    tickVitals(v, 1, 0, false, false, false);
    expect(v.air).toBeGreaterThan(0);
  });
  it("burns in lava, starves and regenerates when fed", () => {
    const v = newVitals();
    for (let i = 0; i < 2 * 120; i++) tickVitals(v, 1 / 120, 0, false, true, false);
    expect(v.health).toBeLessThan(20);
    v.health = 10;
    v.hunger = 20;
    for (let i = 0; i < 5 * 120; i++) tickVitals(v, 1 / 120, 0, false, false, false);
    expect(v.health).toBeGreaterThan(10);
    v.hunger = 0;
    for (let i = 0; i < 2 * 120; i++) tickVitals(v, 1 / 120, 0, false, false, false);
    expect(v.health).toBeLessThan(11);
  });
});

describe("creatures, combat and sleep", () => {
  const mob = (species: import("../entities/creatures").Species, x = 5.5) => ({
    id: 1,
    species,
    hp: 8,
    age: 0,
    cooldown: 0,
    intent: 0,
    love: 0,
    position: { x, y: 1, z: 4.5 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
  });
  it("damages nearby players at night but cannot attack through a solid wall", () => {
    const { w, d, game } = fixture();
    d.time = 0;
    d.creatures = [mob("zombie")];
    d.nextId = 2;
    tick(game, 0.3);
    expect(d.vitals.health).toBeLessThan(20);
    const blocked = fixture();
    blocked.d.time = 0;
    blocked.d.position = { x: 4.5, y: 1, z: 4.5 };
    const enemy = mob("zombie", 6.1);
    blocked.d.creatures = [enemy];
    blocked.d.nextId = 2;
    w.setBlock(5, 1, 4, BlockId.AIR);
    blocked.w.setBlock(5, 1, 4, BlockId.STONE);
    blocked.w.setBlock(5, 2, 4, BlockId.STONE);
    tick(blocked.game, 0.3);
    expect(blocked.d.vitals.health).toBe(20);
  });
  it("a sword kills an animal and produces recoverable food", () => {
    const { d, game } = fixture();
    d.inventory[0] = stack("iron_sword");
    d.creatures = [mob("pig")];
    d.nextId = 2;
    game.hitCreature(1);
    expect(d.creatures[0]?.hp).toBe(2);
    game.hitCreature(1);
    expect(d.creatures[0]?.hp).toBe(2); // The attack cooldown prevents a second immediate hit.
    tick(game, 0.5);
    game.hitCreature(1);
    expect(d.creatures).toHaveLength(0);
    expect(d.loot.some((l) => l.stack.id === "rawMeat")).toBe(true);
    expect(d.inventory[0].durability).toBe(249);
  });
  it("feeding two adult animals breeds a child and consumes wheat", () => {
    const { d, game } = fixture();
    d.inventory[0] = stack("wheat", 2);
    d.creatures = [mob("sheep", 5.5), { ...mob("sheep", 6), id: 2 }];
    d.nextId = 3;
    expect(game.feedCreature(1)).toBe(true);
    expect(game.feedCreature(2)).toBe(true);
    tick(game, 0.2);
    expect(d.creatures).toHaveLength(3);
    expect(d.creatures.some((m) => m.age < 0)).toBe(true);
    expect(d.inventory[0]).toBeNull();
  });
  it("skeleton arrows are stopped by terrain before reaching the player", () => {
    const { w, d, game } = fixture();
    d.time = 0;
    d.creatures = [mob("skeleton", 10.5)];
    d.nextId = 2;
    tick(game, 0.2);
    expect(d.arrows.length).toBeGreaterThan(0);
    w.setBlock(7, 1, 4, BlockId.STONE);
    w.setBlock(7, 2, 4, BlockId.STONE);
    tick(game, 1);
    expect(d.arrows).toHaveLength(0);
    expect(d.vitals.health).toBe(20);
  });
  it("sets a safe respawn beside a bed and skips night unless enemies are close", () => {
    const { w, d, game } = fixture();
    w.setBlock(7, 1, 7, BlockId.BED);
    d.time = 0;
    game.sleep(7, 1, 7);
    expect(d.spawn.y).toBe(1);
    expect(d.spawn.x).not.toBe(7.5);
    expect(game.isNight).toBe(false);
    d.time = 0;
    d.creatures = [mob("zombie", 7.5)];
    game.sleep(7, 1, 7);
    expect(game.isNight).toBe(true);
  });
});

it("finds a clear supported respawn when construction blocks the saved spawn", () => {
  const { w, d, game } = fixture();
  w.setBlock(4, 1, 4, BlockId.STONE);
  w.setBlock(4, 2, 4, BlockId.STONE);
  game.hurt(20);
  game.respawn();
  const p = d.position;
  expect(w.getBlock(Math.floor(p.x), p.y, Math.floor(p.z))).toBe(BlockId.AIR);
  expect(w.getBlock(Math.floor(p.x), p.y + 1, Math.floor(p.z))).toBe(BlockId.AIR);
  expect(w.getBlock(Math.floor(p.x), p.y - 1, Math.floor(p.z))).not.toBe(BlockId.AIR);
});

it("an existing animal herd cannot suppress all night enemy spawns", () => {
  const { w, d, game } = fixture();
  for (let cx = -2; cx <= 2; cx++)
    for (let cz = -2; cz <= 2; cz++) {
      const chunk = new Chunk(cx, cz);
      for (let x = 0; x < 16; x++)
        for (let z = 0; z < 16; z++) chunk.setBlock(x, 1, z, BlockId.GRASS);
      w.setChunk(chunk);
    }
  d.mode = "creative";
  d.time = 900;
  d.position = { x: 8.5, y: 2, z: 8.5 };
  d.creatures = Array.from({ length: 24 }, (_v, i) => ({
    id: i + 1,
    species: "pig" as const,
    position: { x: 8.5 + (i % 4), y: 2, z: 8.5 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    hp: 8,
    age: 0,
    cooldown: 0,
    intent: 0,
    love: 0,
  }));
  d.nextId = 25;
  tick(game, 6);
  expect(d.creatures.some((m) => m.species !== "pig")).toBe(true);
  expect(d.creatures.length).toBeLessThanOrEqual(28);
});

describe("mob death at simulation boundaries", () => {
  const creature = (id: number, species: import("../entities/creatures").Species, hp: number) => ({
    id,
    species,
    hp,
    age: 1,
    cooldown: 0,
    intent: 0,
    love: 0,
    position: { x: 9.5 + id * 0.2, y: 1, z: 4.5 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
  });
  it("a skeleton killed by daylight cannot fire a final arrow", () => {
    const { d, game } = fixture();
    d.time = 300;
    d.creatures = [creature(1, "skeleton", 0.1)];
    d.nextId = 2;
    tick(game, 0.2);
    expect(d.creatures).toHaveLength(0);
    expect(d.arrows).toHaveLength(0);
    expect(d.vitals.health).toBe(20);
  });
  it("an animal cannot breed with a dead partner waiting to be removed", () => {
    const { d, game } = fixture();
    d.creatures = [
      { ...creature(1, "sheep", 8), love: 30 },
      { ...creature(2, "sheep", 0), love: 30 },
    ];
    d.nextId = 3;
    tick(game, 0.2);
    expect(d.creatures).toHaveLength(1);
    expect(d.creatures.some((m) => m.age < 0)).toBe(false);
  });
});
