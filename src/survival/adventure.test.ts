import { describe, expect, it } from "vitest";
import { Adventure, exchange, portalInterior } from "./adventure";
import { newSession, SurvivalSession } from "./session";
import { travelCandidate, realmSnapshot } from "./adventure-state";
import { World } from "../world/world";
import { Chunk } from "../world/chunk";
import { BlockId } from "../world/blocks";
import { stack } from "../items/catalog";
import { emptySlots } from "../items/inventory";
import { encodeSave, parseSave, validateSave } from "../save/persistence";
import { miningSeconds } from "../items/mining";
import {
  END_CRYSTALS,
  endFrames,
  stronghold,
  strongholdEntrance,
  structureBlocks,
  structuresNear,
} from "../world/adventure-terrain";
import { createColumnSampler, generateChunk } from "../world/terrain";
import { weatherAt, adventureSky } from "../world/weather";
import type { Dimension } from "../world/adventure-terrain";
import { must } from "../core/assert";

function fixture(dimension: Dimension = "overworld") {
  const world = new World(2026, dimension, 2);
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) world.setChunk(new Chunk(x, z));
  for (let x = -16; x < 32; x++)
    for (let z = -16; z < 32; z++) world.setBlock(x, 33, z, BlockId.STONE);
  const data = newSession(2026, "survival", { x: 0.5, y: 34, z: 0.5 });
  data.generator = 2;
  const a = must(data.adventure);
  a.dragon.health = 120;
  if (dimension !== "overworld") a.realms.overworld = realmSnapshot(data);
  a.dimension = dimension;
  const session = new SurvivalSession(world, data, (x, y, z, id) => {
    world.setBlock(x, y, z, id);
  });
  const adventure = new Adventure(session);
  return { world, data, session, adventure, a };
}

describe("planned adventure progression", () => {
  it("lights a supported fire with flint and steel outside a portal frame", () => {
    const { world, data, adventure } = fixture();
    data.inventory[0] = stack("flintSteel");
    adventure.use({ x: 0.5, y: 35.6, z: 0.5 }, { x: 0, y: -1, z: -1 });
    expect(world.getBlock(0, 34, -2)).toBe(BlockId.FIRE);
    expect(data.inventory.at(0)?.durability).toBe(64);
  });
  it("takes contact fire damage and honors a fire resistance potion", () => {
    const { world, data, session, a } = fixture();
    world.setBlock(0, 34, 0, BlockId.FIRE);
    const sample = { position: data.position, onGround: true, yaw: 0, pitch: 0 };
    for (let i = 0; i < 6; i++) session.tick(0.2, sample);
    expect(data.vitals.health).toBe(16);
    a.fire = 60;
    for (let i = 0; i < 6; i++) session.tick(0.2, sample);
    expect(data.vitals.health).toBe(16);
  });
  it("keeps inventory transactions atomic when materials or output capacity are missing", () => {
    const inv = emptySlots(2);
    inv[0] = stack("wheat", 12);
    inv[1] = stack("dirt", 64);
    expect(exchange(inv, { wheat: 13 }, stack("emerald"))).toBe(false);
    expect(inv.at(0)?.count).toBe(12);
    expect(exchange(inv, { wheat: 1 }, stack("emerald"))).toBe(false);
    expect(inv.at(0)?.count).toBe(12);
    expect(exchange(inv, { wheat: 12 }, stack("emerald"))).toBe(true);
    expect(inv.at(0)?.id).toBe("emerald");
  });
  it("requires experience to enchant and preserves existing wear", () => {
    const { data, a, adventure } = fixture();
    data.inventory[0] = stack("iron_pick");
    must(data.inventory[0]).durability = 10;
    expect(adventure.enchant(0)).toBe(false);
    a.xp = 5;
    expect(adventure.enchant(0)).toBe(true);
    expect(data.inventory.at(0)?.id).toBe("enchanted_iron_pick");
    expect(data.inventory.at(0)?.durability).toBe(20);
    expect(a.xp).toBe(0);
    expect(miningSeconds(BlockId.STONE, data.inventory.at(0) ?? null)).toBeLessThan(
      miningSeconds(BlockId.STONE, stack("iron_pick")),
    );
    expect(adventure.enchant(0)).toBe(false);
    expect(parseSave(encodeSave(data)).inventory[0]).toEqual(data.inventory[0]);
  });
  it("brews with paid ingredients, waits, claims only once, and retains completed output when full", () => {
    const { data, adventure } = fixture();
    ["waterBottle", "netherWart", "blazePowder", "apple"].forEach(
      (id, i) => (data.inventory[i] = stack(id)),
    );
    expect(adventure.brew("1,34,1", "healingPotion")).toBe(true);
    expect(adventure.claim("1,34,1")).toBe(false);
    expect(adventure.brew("1,34,1", "firePotion")).toBe(false);
    adventure.tick(5);
    data.inventory.fill(stack("dirt", 64));
    expect(adventure.claim("1,34,1")).toBe(false);
    data.inventory[0] = null;
    expect(adventure.claim("1,34,1")).toBe(true);
    expect(adventure.claim("1,34,1")).toBe(false);
    expect(data.inventory.at(0)?.id).toBe("healingPotion");
  });
  it("applies potions, returns a bottle, and expires effects in simulation time", () => {
    const { data, adventure, a } = fixture();
    data.inventory[0] = stack("firePotion");
    expect(adventure.use({ x: 0.5, y: 35.6, z: 0.5 }, { x: 0, y: 0, z: -1 })).toBe(true);
    expect(a.fire).toBe(60);
    expect(data.inventory.at(0)?.id).toBe("bottle");
    adventure.tick(10);
    expect(a.fire).toBe(50);
    adventure.tick(60);
    expect(a.fire).toBe(0);
    data.inventory[0] = stack("healingPotion");
    data.vitals.health = 4;
    adventure.use({ x: 0.5, y: 35.6, z: 0.5 }, { x: 0, y: 0, z: -1 });
    expect(data.vitals.health).toBe(12);
  });
  it("requires real water, a bite and timely retrieval to award a fish", () => {
    const { world, data, adventure, a } = fixture();
    data.inventory[0] = stack("fishingRod");
    const eye = { x: 0.5, y: 35.6, z: 0.5 },
      direction = { x: 0, y: -1, z: -1 };
    adventure.use(eye, direction);
    expect(adventure.cast).toBeNull();
    world.setBlock(0, 34, -1, BlockId.WATER);
    adventure.use(eye, direction);
    expect(adventure.cast).not.toBeNull();
    adventure.tick(5.1);
    adventure.use(eye, direction);
    expect(data.inventory.some((s) => s?.id === "fish")).toBe(true);
    expect(a.xp).toBe(1);
    adventure.use(eye, direction);
    adventure.tick(8.1);
    expect(adventure.cast).toBeNull();
    expect(a.xp).toBe(1);
  });
  it("recognizes only complete upright portal frames in either orientation", () => {
    const { world } = fixture();
    for (const axis of ["x", "z"] as const) {
      for (let u = 0; u < 4; u++)
        for (let v = 0; v < 5; v++)
          world.setBlock(
            axis === "x" ? u : 0,
            34 + v,
            axis === "z" ? u : 0,
            u === 0 || u === 3 || v === 0 || v === 4 ? BlockId.OBSIDIAN : BlockId.AIR,
          );
      expect(portalInterior(world, { x: 0, y: 34, z: 0 })).toHaveLength(6);
      world.setBlock(0, 35, 0, BlockId.AIR);
      expect(portalInterior(world, { x: 0, y: 34, z: 0 })).toBeNull();
      for (let u = 0; u < 4; u++)
        for (let v = 0; v < 5; v++)
          world.setBlock(axis === "x" ? u : 0, 34 + v, axis === "z" ? u : 0, BlockId.AIR);
    }
  });
  it("ignites a frame crossing negative chunk coordinates through item use", () => {
    const { world, data, adventure } = fixture();
    for (let u = 0; u < 4; u++)
      for (let v = 0; v < 5; v++)
        world.setBlock(
          u - 1,
          v + 34,
          -4,
          u === 0 || u === 3 || v === 0 || v === 4 ? BlockId.OBSIDIAN : BlockId.AIR,
        );
    expect(portalInterior(world, { x: -1, y: 34, z: -4 })).toHaveLength(6);
    data.inventory[0] = stack("flintSteel");
    world.setBlock(0, 34, -2, BlockId.WATER);
    expect(adventure.use({ x: 1.5, y: 35.62, z: 1.5 }, { x: -2, y: -1.12, z: -5 })).toBe(true);
    expect(world.getBlock(0, 35, -4)).toBe(BlockId.PORTAL);
  });
  it("preserves independent realm edits, chests and positions while sharing progression", () => {
    const { data } = fixture();
    data.edits = { "0,0": { "32": 2 } };
    data.inventory[0] = stack("diamond", 3);
    const n = travelCandidate(data, "nether", { x: 0.5, y: 34, z: 0.5 });
    n.edits = { "0,0": { "32": 29 } };
    n.chests["0,34,0"] = emptySlots(27);
    n.position = { x: 12, y: 34, z: 4 };
    n.inventory[0] = stack("blazeRod", 2);
    const o = parseSave(encodeSave(travelCandidate(n, "overworld", { x: 0, y: 34, z: 0 })));
    expect(o.edits).toEqual(data.edits);
    expect(o.inventory[0]?.id).toBe("blazeRod");
    expect(data.inventory.at(0)?.id).toBe("diamond");
    const again = travelCandidate(o, "nether", { x: 0, y: 34, z: 0 });
    expect(again.position).toEqual(n.position);
    expect(again.edits).toEqual(n.edits);
    expect(again.chests).toEqual(n.chests);
    expect(
      validateSave(travelCandidate(again, "end", { x: 0.5, y: 34, z: 0.5 })).adventure?.dimension,
    ).toBe("end");
  });
  it("returns End victors to their Overworld bed without restoring health or inventory", () => {
    const { data } = fixture();
    data.generator = 3;
    data.spawn = { x: 199.5, y: 35, z: -71.5 };
    data.position = { x: 13.5, y: 18.68, z: -257.97 };
    const end = travelCandidate(data, "end", { x: 0.5, y: 34, z: 0.5 });
    must(end.adventure).dragon = { health: 0, phase: 230, defeated: true };
    end.inventory[0] = stack("dragonEgg");
    end.vitals.health = 13;
    end.vitals.hunger = 19;
    const returned = travelCandidate(end, "overworld", { x: 0.5, y: 34, z: 0.5 });
    expect(returned.position).toEqual(data.spawn);
    expect(returned.spawn).toEqual(data.spawn);
    expect(returned.inventory).toEqual(end.inventory);
    expect(returned.vitals).toEqual(end.vitals);
    expect(returned.adventure?.dimension).toBe("overworld");
    expect(returned.adventure?.dragon.defeated).toBe(true);
    expect(end.adventure?.dimension).toBe("end");
  });
  it("accepts legacy saves and rejects corrupt or recursive realm state", () => {
    const { data } = fixture();
    const legacy = { ...data, generator: 1, adventure: undefined };
    expect(validateSave(legacy).generator).toBe(1);
    const n = travelCandidate(data, "nether", { x: 0, y: 34, z: 0 });
    must(n.adventure).realms.overworld = {
      ...must(must(n.adventure).realms.overworld),
      position: { x: NaN, y: 0, z: 0 },
    };
    expect(() => validateSave(n)).toThrow();
    expect(() =>
      validateSave({
        ...data,
        adventure: { ...data.adventure, dragon: { health: 0, defeated: false, phase: 0 } },
      }),
    ).toThrow();
  });
  it("generates stable village blocks at both sides of chunk borders", () => {
    const sample = createColumnSampler(2026, 2);
    const candidates = structuresNear(2026, 64, 64, sample);
    const s = candidates.find((v) => v.kind === "village");
    expect(s).toBeDefined();
    for (const p of structureBlocks(must(s)).filter(
      (p) => p.id === BlockId.CHEST || p.id === BlockId.BED || p.id === BlockId.RIPE_CROP,
    )) {
      const c = generateChunk(Math.floor(p.x / 16), Math.floor(p.z / 16), 2026, "overworld", 2);
      expect(c.getBlock(((p.x % 16) + 16) % 16, p.y, ((p.z % 16) + 16) % 16)).toBe(p.id);
    }
  });
  it("keeps the Nether landing clear and its generated return frame valid", () => {
    const world = new World(2026, "nether", 2);
    for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) world.ensureChunk(x, z);
    expect(world.getBlock(0, 33, 0)).toBe(BlockId.OBSIDIAN);
    expect(world.getBlock(0, 34, 0)).toBe(BlockId.AIR);
    expect(portalInterior(world, { x: 0, y: 35, z: -3 })).toHaveLength(6);
  });
  it("does not refill generated treasure after breaking and replacing its chest", () => {
    const { world, data, session } = fixture();
    const s = must(
      structuresNear(2026, 64, 64, createColumnSampler(2026, 2)).find((v) => v.kind === "village"),
    );
    const p = must(structureBlocks(s).find((p) => p.id === BlockId.CHEST));
    world.setChunk(generateChunk(Math.floor(p.x / 16), Math.floor(p.z / 16), 2026, "overworld", 2));
    expect(session.chest(p.x, p.y, p.z).some((s) => s?.id === "obsidian")).toBe(true);
    session.mine(p.x, p.y, p.z);
    world.setBlock(p.x, p.y, p.z, BlockId.CHEST);
    expect(session.chest(p.x, p.y, p.z).every((s) => s === null)).toBe(true);
    expect(data.loot.filter((l) => l.stack.id === "obsidian")).toHaveLength(1);
  });
  it("refunds an unfinished brew instead of instantly awarding its potion when the stand is broken", () => {
    const { world, data, session, adventure, a } = fixture();
    ["waterBottle", "netherWart", "blazePowder", "apple"].forEach(
      (id, i) => (data.inventory[i] = stack(id)),
    );
    world.setBlock(1, 34, 1, BlockId.BREWING);
    expect(adventure.brew("1,34,1", "healingPotion")).toBe(true);
    session.mine(1, 34, 1);
    expect(data.loot.some((l) => l.stack.id === "healingPotion")).toBe(false);
    expect(data.loot.some((l) => l.stack.id === "waterBottle")).toBe(true);
    expect(a.brewing).toEqual({});
  });
  it("closes the entire portal after a required frame block is mined", () => {
    const { world, session, data, adventure } = fixture();
    for (let u = 0; u < 4; u++)
      for (let v = 0; v < 5; v++)
        world.setBlock(
          u,
          34 + v,
          -4,
          u === 0 || u === 3 || v === 0 || v === 4 ? BlockId.OBSIDIAN : BlockId.AIR,
        );
    data.inventory[0] = stack("flintSteel");
    adventure.use({ x: 1.5, y: 35.6, z: 0.5 }, { x: 0, y: -1, z: -4 });
    expect(world.getBlock(1, 35, -4)).toBe(BlockId.PORTAL);
    session.mine(0, 35, -4);
    expect(world.getBlock(1, 35, -4)).toBe(BlockId.AIR);
    expect(world.getBlock(2, 37, -4)).toBe(BlockId.AIR);
  });
  it.each([1, 2026, -987654321, 42, 99, 12345])(
    "connects the stronghold stairs to dry daylight for seed %s",
    (seed) => {
      const sample = createColumnSampler(seed, 2),
        entrance = strongholdEntrance(seed, sample, 2);
      const c = generateChunk(
        Math.floor(entrance.x / 16),
        Math.floor(entrance.z / 16),
        seed,
        "overworld",
        2,
      );
      const world = new World(seed, "overworld", 2),
        room = stronghold(seed, 2);
      for (let t = 0; t <= entrance.y - room.y; t++) {
        for (const dx of [-2, 0, 2]) {
          const x = room.x + dx,
            z = room.z + 4 + t;
          world.ensureChunk(Math.floor(x / 16), Math.floor(z / 16));
          expect(world.getBlock(x, room.y + t + 4, z)).toBe(BlockId.STONE_BRICK);
          if (dx !== 0) expect(world.getBlock(x, room.y + t, z)).toBe(BlockId.STONE_BRICK);
        }
      }
      expect(entrance.y).toBeGreaterThan(
        Math.max(32, sample(entrance.x, entrance.z).terrainHeight),
      );
      expect(
        c.getBlock(((entrance.x % 16) + 16) % 16, entrance.y - 1, ((entrance.z % 16) + 16) % 16),
      ).toBe(BlockId.STONE_BRICK);
      expect(
        c.getBlock(((entrance.x % 16) + 16) % 16, entrance.y, ((entrance.z % 16) + 16) % 16),
      ).toBe(BlockId.AIR);
    },
  );
  it("inserts an eye into a submerged frame without water intercepting the action", () => {
    const { world, data, adventure } = fixture();
    data.inventory[0] = stack("enderEye");
    world.setBlock(0, 34, -1, BlockId.WATER);
    world.setBlock(0, 34, -2, BlockId.WATER);
    world.setBlock(0, 34, -3, BlockId.END_FRAME);
    adventure.use({ x: 0.5, y: 34.5, z: 0.5 }, { x: 0, y: 0, z: -1 });
    expect(world.getBlock(0, 34, -3)).toBe(BlockId.END_FRAME_FILLED);
    expect(data.inventory[0]).toBeNull();
  });
  it("preserves legacy twelve stronghold frames with four awaiting eyes and six end crystals", () => {
    const room = stronghold(2026, 2);
    expect(room.y).toBeLessThan(32);
    expect(endFrames(2026, 2)).toHaveLength(12);
    expect(endFrames(2026, 2).filter((f) => f.empty)).toHaveLength(4);
    const world = new World(2026, "end", 2);
    for (const p of END_CRYSTALS) {
      world.ensureChunk(Math.floor(p.x / 16), Math.floor(p.z / 16));
      expect(world.getBlock(p.x, p.y, p.z)).toBe(BlockId.END_CRYSTAL);
    }
    expect(world.ensureChunk(8, 8).isEmpty()).toBe(true);
  });
  it("heals the living dragon through crystals, permits melee only in reach, and awards victory once", () => {
    const { world, data, adventure, a } = fixture("end");
    for (const p of END_CRYSTALS) world.setBlock(p.x, p.y, p.z, BlockId.END_CRYSTAL);
    a.dragon.health = 80;
    adventure.tick(1);
    expect(a.dragon.health).toBeGreaterThan(80);
    for (const p of END_CRYSTALS) world.setBlock(p.x, p.y, p.z, BlockId.AIR);
    data.inventory[0] = stack("diamond_sword");
    a.dragon.phase = 13;
    expect(adventure.attackDragon({ x: 20, y: 35.5, z: 0 }, { x: -1, y: 0, z: 0 })).toBe(false);
    for (let i = 0; i < 80 && !a.dragon.defeated; i++) {
      adventure.attackDragon({ x: 0, y: 35.5, z: 4 }, { x: 0, y: 0, z: -1 });
      adventure.tick(0.51);
    }
    expect(a.dragon.defeated).toBe(true);
    expect(data.inventory.filter((s) => s?.id === "dragonEgg")).toHaveLength(1);
    expect(world.getBlock(0, 34, 5)).toBe(BlockId.END_GATE);
    expect(a.xp).toBe(100);
    adventure.tick(3);
    expect(a.xp).toBe(100);
    expect(parseSave(encodeSave(data)).adventure?.dragon.defeated).toBe(true);
  });
  it("blocks the dragon's proximity attack behind a solid shelter", () => {
    const { world, data, adventure, a } = fixture("end");
    a.dragon.phase = 13;
    data.position = { x: 0.5, y: 34, z: 4.5 };
    for (let x = -2; x <= 2; x++)
      for (let y = 34; y <= 38; y++) world.setBlock(x, y, 2, BlockId.STONE);
    adventure.tick(0.1);
    expect(data.vitals.health).toBe(20);
    for (let x = -2; x <= 2; x++)
      for (let y = 34; y <= 38; y++) world.setBlock(x, y, 2, BlockId.AIR);
    adventure.tick(0.1);
    expect(data.vitals.health).toBe(17);
  });
  it("keeps dragon melee within three blocks of actual contact and respects the nearer wall", () => {
    const { world, data, adventure, a } = fixture("end");
    a.dragon.phase = 13;
    data.inventory[0] = stack("iron_sword");
    expect(adventure.attackDragon({ x: 0, y: 35.5, z: 5.6 }, { x: 0, y: 0, z: -1 })).toBe(false);
    expect(a.dragon.health).toBe(120);
    world.setBlock(0, 35, 3, BlockId.STONE);
    expect(adventure.attackDragon({ x: 0, y: 35.5, z: 4 }, { x: 0, y: 0, z: -1 })).toBe(false);
    expect(a.dragon.health).toBe(120);
    world.setBlock(0, 35, 3, BlockId.AIR);
    world.setBlock(0, 35, -1, BlockId.STONE);
    expect(adventure.attackDragon({ x: 0, y: 35.5, z: 4 }, { x: 0, y: 0, z: -1 })).toBe(true);
    expect(a.dragon.health).toBe(114);
  });
  it("fires a paid physical arrow that removes a crystal on its path", () => {
    const { world, data, adventure } = fixture("end");
    data.inventory[0] = stack("bow");
    data.inventory[1] = stack("arrow", 2);
    world.setBlock(0, 35, -4, BlockId.END_CRYSTAL);
    expect(adventure.use({ x: 0.5, y: 35.5, z: 0.5 }, { x: 0, y: 0, z: -1 })).toBe(true);
    for (let i = 0; i < 30; i++) adventure.tick(0.01);
    expect(world.getBlock(0, 35, -4)).toBe(BlockId.AIR);
    expect(data.inventory.at(1)?.count).toBe(1);
  });
  it("keeps weather reproducible, suppresses precipitation in other dimensions and changes the sky", () => {
    const wet = Array.from({ length: 50 }, (_, i) => i * 180).find(
      (t) => weatherAt(2026, t, "overworld") === "rain",
    );
    expect(wet).toBeDefined();
    expect(weatherAt(2026, must(wet), "overworld", true)).toBe("snow");
    expect(weatherAt(2026, must(wet), "nether")).toBe("clear");
    expect(weatherAt(2026, must(wet), "end")).toBe("clear");
    expect(adventureSky(must(wet), "overworld", "rain").sunIntensity).toBeLessThan(
      adventureSky(must(wet), "overworld", "clear").sunIntensity,
    );
  });
});

describe("arrows use the visible mob body", () => {
  const creature = (species: import("../entities/creatures").Species) => ({
    id: 1,
    species,
    hp: 16,
    age: 1,
    cooldown: 0,
    intent: 0,
    love: 0,
    position: { x: 0.5, y: 34, z: 4.5 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
  });
  it("hits the head of a tall enemy", () => {
    const { data, adventure } = fixture();
    data.creatures = [creature("wanderer")];
    data.nextId = 2;
    adventure.shots.push({
      position: { x: 0.5, y: 35.98, z: 3 },
      velocity: { x: 0, y: 0, z: 10 },
      age: 0,
    });
    adventure.tick(0.2);
    expect(data.creatures[0]?.hp).toBe(8);
    expect(adventure.shots).toHaveLength(0);
  });
  it("flies over a spider without hitting an invisible human-sized body", () => {
    const { data, adventure } = fixture();
    data.creatures = [creature("spider")];
    data.nextId = 2;
    adventure.shots.push({
      position: { x: 0.5, y: 35.2, z: 3 },
      velocity: { x: 0, y: 0, z: 10 },
      age: 0,
    });
    adventure.tick(0.4);
    expect(data.creatures[0]?.hp).toBe(16);
    expect(adventure.shots).toHaveLength(1);
  });
});
