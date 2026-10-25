import { BlockId } from "./blocks";
import { Chunk } from "./chunk";
import { deriveSeed } from "./rng";
import type { ColumnProfile } from "./terrain";

export type Dimension = "overworld" | "nether" | "end";
export type GeneratorVersion = 1 | 2;
export interface Structure {
  x: number;
  y: number;
  z: number;
  kind: "village" | "ruin";
}
export interface StructureBlock {
  x: number;
  y: number;
  z: number;
  id: BlockId;
}

/** Global anchors and blueprints, never chunk-owned: borders and reloads agree. */
export function structuresNear(
  seed: number,
  x: number,
  z: number,
  sample: (x: number, z: number) => ColumnProfile,
): Structure[] {
  const result: Structure[] = [];
  for (let gx = Math.floor(x / 128) - 1; gx <= Math.floor(x / 128) + 1; gx++)
    for (let gz = Math.floor(z / 128) - 1; gz <= Math.floor(z / 128) + 1; gz++) {
      const h = deriveSeed(seed, Math.imul(gx, 73856093) ^ Math.imul(gz, 19349663) ^ 79183) >>> 0;
      const sx = gx * 128 + 48 + (h % 32),
        sz = gz * 128 + 48 + ((h >>> 8) % 32);
      const p = sample(sx, sz);
      if (p.terrainHeight <= 33 || p.terrainHeight > 47 || p.isSnowy) continue;
      result.push({ x: sx, z: sz, y: p.terrainHeight + 1, kind: h % 3 ? "village" : "ruin" });
    }
  return result;
}

export function structureBlocks(s: Structure): StructureBlock[] {
  const result: StructureBlock[] = [];
  const put = (x: number, y: number, z: number, id: BlockId) =>
    result.push({ x: s.x + x, y: s.y + y, z: s.z + z, id });
  if (s.kind === "ruin") {
    for (let x = -3; x <= 3; x++)
      for (let z = -3; z <= 3; z++) {
        put(x, -1, z, BlockId.STONE_BRICK);
        for (let y = 0; y <= 3; y++)
          put(
            x,
            y,
            z,
            (Math.abs(x) === 3 || Math.abs(z) === 3) && (x + z + y) % 3 !== 0
              ? BlockId.STONE_BRICK
              : BlockId.AIR,
          );
      }
    put(0, 0, 0, BlockId.CHEST);
    put(1, 0, 0, BlockId.TORCH);
    return result;
  }
  // Two accessible houses, a well, paths and a wheat field.
  for (let x = -11; x <= 11; x++)
    for (let z = -7; z <= 7; z++) {
      put(x, -1, z, Math.abs(z) <= 1 ? BlockId.COBBLE : BlockId.GRASS);
      for (let y = -5; y < -1; y++) put(x, y, z, BlockId.DIRT);
      for (let y = 0; y <= 5; y++) put(x, y, z, BlockId.AIR);
    }
  for (const hx of [-8, 5])
    for (let x = 0; x < 5; x++)
      for (let z = 2; z < 7; z++) {
        put(hx + x, -1, z, BlockId.PLANKS);
        for (let y = 0; y < 3; y++) {
          const wall = x === 0 || x === 4 || z === 2 || z === 6;
          const door = x === 2 && z === 2 && y < 2;
          const window = y === 1 && z === 4 && (x === 0 || x === 4);
          put(hx + x, y, z, door || !wall ? BlockId.AIR : window ? BlockId.GLASS : BlockId.PLANKS);
        }
        put(hx + x, 3, z, BlockId.COBBLE);
      }
  put(-7, 0, 5, BlockId.CHEST);
  put(6, 0, 5, BlockId.BED);
  put(-5, 0, 5, BlockId.TABLE);
  put(8, 0, 5, BlockId.FURNACE);
  for (let x = -1; x <= 1; x++)
    for (let z = -1; z <= 1; z++)
      put(x, -1, z, x === 0 && z === 0 ? BlockId.WATER : BlockId.STONE_BRICK);
  for (let x = -7; x <= 7; x++)
    for (let z = -6; z <= -3; z++) {
      put(x, -1, z, x === 0 ? BlockId.WATER : BlockId.FARMLAND);
      if (x !== 0) put(x, 0, z, BlockId.RIPE_CROP);
    }
  put(-2, 0, 0, BlockId.TORCH);
  put(2, 0, 0, BlockId.TORCH);
  // A weathered gateway beside the settlement: one bottom block needs repair.
  for (let x = -10; x <= -4; x++)
    for (let z = -12; z <= -8; z++) {
      put(x, -1, z, BlockId.COBBLE);
      for (let y = 0; y <= 5; y++) put(x, y, z, BlockId.AIR);
    }
  for (let u = 0; u < 4; u++)
    for (let v = 0; v < 5; v++)
      if ((u === 0 || u === 3 || v === 0 || v === 4) && !(u === 1 && v === 0))
        put(-9 + u, v, -10, BlockId.OBSIDIAN);
  return result;
}

export function stampAdventure(
  chunk: Chunk,
  seed: number,
  sample: (x: number, z: number) => ColumnProfile,
): void {
  const ox = chunk.worldOriginX,
    oz = chunk.worldOriginZ;
  for (const s of structuresNear(seed, ox, oz, sample)) {
    if (Math.abs(s.x - ox - 8) > 20 || Math.abs(s.z - oz - 8) > 20) continue;
    for (const p of structureBlocks(s)) {
      if (p.x >= ox && p.x < ox + 16 && p.z >= oz && p.z < oz + 16 && p.y > 0 && p.y < 95)
        chunk.setBlock(p.x - ox, p.y, p.z - oz, p.id);
    }
  }
  const room = stronghold(seed),
    entrance = strongholdEntrance(seed, sample);
  const stairLength = entrance.y - room.y;
  if (Math.abs(ox + 8 - room.x) < 32 && oz + 16 >= room.z - 6 && oz <= entrance.z + 1) {
    const put = (x: number, y: number, z: number, id: BlockId) => {
      if (x >= ox && x < ox + 16 && z >= oz && z < oz + 16 && y > 0 && y < 95)
        chunk.setBlock(x - ox, y, z - oz, id);
    };
    for (let x = -5; x <= 5; x++)
      for (let z = -5; z <= 5; z++)
        for (let y = -1; y <= 4; y++)
          put(
            room.x + x,
            room.y + y,
            room.z + z,
            y === -1 || y === 4 || Math.abs(x) === 5 || Math.abs(z) === 5
              ? BlockId.STONE_BRICK
              : BlockId.AIR,
          );
    for (const p of endFrames(seed))
      put(p.x, p.y, p.z, p.empty ? BlockId.END_FRAME : BlockId.END_FRAME_FILLED);
    // Stairs connect the underground room to daylight, rather than a sealed box.
    for (let t = 0; t <= stairLength; t++)
      for (let dx = -2; dx <= 2; dx++) {
        put(room.x + dx, room.y - 1 + t, room.z + 4 + t, BlockId.STONE_BRICK);
        for (let dy = 0; dy <= 4; dy++)
          put(
            room.x + dx,
            room.y + t + dy,
            room.z + 4 + t,
            Math.abs(dx) === 2 || dy === 4 ? BlockId.STONE_BRICK : BlockId.AIR,
          );
      }
    put(room.x - 4, room.y, room.z, BlockId.TORCH);
    put(room.x + 4, room.y, room.z, BlockId.TORCH);
  }
}

export function stronghold(seed: number): { x: number; y: number; z: number } {
  return { x: 24 + ((seed >>> 0) % 16), y: 18, z: -40 - ((seed >>> 4) % 16) };
}
export function strongholdEntrance(
  seed: number,
  sample: (x: number, z: number) => ColumnProfile,
): { x: number; y: number; z: number } {
  const c = stronghold(seed);
  for (let t = 8; t <= 60; t++) {
    const z = c.z + 4 + t;
    if (c.y + t > Math.max(32, sample(c.x, z).terrainHeight)) return { x: c.x, y: c.y + t, z };
  }
  return { x: c.x, y: c.y + 60, z: c.z + 64 };
}
export function endFrames(seed: number): (StructureBlock & { empty: boolean })[] {
  const c = stronghold(seed),
    result: (StructureBlock & { empty: boolean })[] = [];
  for (const axis of ["x", "z"] as const)
    for (const side of [-2, 2])
      for (let along = -1; along <= 1; along++) {
        const p = { x: c.x, y: c.y, z: c.z, id: BlockId.END_FRAME, empty: along === 0 };
        p[axis] += side;
        p[axis === "x" ? "z" : "x"] += along;
        result.push(p);
      }
  return result;
}
export const END_CRYSTALS = Array.from({ length: 6 }, (_, i) => ({
  x: Math.round(Math.cos((i * Math.PI) / 3) * 16),
  z: Math.round(Math.sin((i * Math.PI) / 3) * 16),
  y: 39 + (i % 3) * 2,
}));
export function generateEnd(cx: number, cz: number): Chunk {
  const chunk = new Chunk(cx, cz);
  for (let x = 0; x < 16; x++)
    for (let z = 0; z < 16; z++) {
      const wx = cx * 16 + x,
        wz = cz * 16 + z;
      const radius = Math.hypot(wx, wz);
      const bottom = Math.max(8, 28 - Math.floor((40 - radius) * 0.3));
      if (radius < 40)
        for (let y = bottom; y <= 33; y++) chunk.setBlock(x, y, z, BlockId.END_STONE);
      for (const p of END_CRYSTALS)
        if (Math.abs(p.x - wx) <= 1 && Math.abs(p.z - wz) <= 1) {
          for (let y = 34; y < p.y; y++) chunk.setBlock(x, y, z, BlockId.OBSIDIAN);
          if (p.x === wx && p.z === wz) chunk.setBlock(x, p.y, z, BlockId.END_CRYSTAL);
        }
    }
  return chunk;
}

/** A separate deterministic cavern realm, with a safe return gateway at origin. */
export function generateNether(cx: number, cz: number, seed: number): Chunk {
  const chunk = new Chunk(cx, cz);
  for (let x = 0; x < 16; x++)
    for (let z = 0; z < 16; z++) {
      const wx = cx * 16 + x,
        wz = cz * 16 + z;
      const floor = 23 + Math.floor(7 * Math.sin(wx * 0.07 + seed) * Math.cos(wz * 0.09));
      const roof = 68 + Math.floor(7 * Math.sin(wx * 0.05) * Math.cos(wz * 0.06 + seed));
      for (let y = 0; y < 96; y++) {
        let id: BlockId =
          y === 0 || y === 95
            ? BlockId.BEDROCK
            : y <= floor || y >= roof
              ? BlockId.NETHERRACK
              : y <= 24
                ? BlockId.LAVA
                : BlockId.AIR;
        if (id === BlockId.NETHERRACK && y === roof && (wx * 13 + wz * 7) % 19 === 0)
          id = BlockId.GLOWSTONE;
        if (y === floor && floor > 24 && (wx + wz) % 7 === 0) id = BlockId.SOUL_SAND;
        if (y === floor + 1 && floor > 24 && (wx + wz) % 7 === 0) id = BlockId.NETHER_WART;
        // Landing zone is never flooded or intersected by ceiling terrain.
        if (Math.abs(wx) <= 5 && Math.abs(wz) <= 5) {
          if (y >= 28 && y <= 33) id = BlockId.OBSIDIAN;
          else if (y >= 34 && y <= 40) id = BlockId.AIR;
          if (wz === -3 && wx >= -1 && wx <= 2 && y >= 33 && y <= 37)
            id = wx === -1 || wx === 2 || y === 33 || y === 37 ? BlockId.OBSIDIAN : BlockId.PORTAL;
        }
        chunk.setBlock(x, y, z, id);
      }
    }
  return chunk;
}
