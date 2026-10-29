import type { Vec3 } from "../player/physics";
import { BlockId, isSolid } from "../world/blocks";
import { World } from "../world/world";
import type { SessionState } from "./session";
import { portalInterior } from "./portal";

/** Nether horizontal distances are one eighth of the Overworld's. The
 * eventual portal and safe landing can be a few blocks from this ideal point. */
export function scaledPortalPosition(position: Vec3, destination: "overworld" | "nether"): Vec3 {
  const scale = destination === "nether" ? 1 / 8 : 8;
  return { x: position.x * scale, y: position.y, z: position.z * scale };
}

const address = (x: number, y: number, z: number) => ({
  key: `${Math.floor(x / 16)},${Math.floor(z / 16)}`,
  index: (y * 16 + (((z % 16) + 16) % 16)) * 16 + (((x % 16) + 16) % 16),
});
const fluid = (id: BlockId) => id === BlockId.WATER || id === BlockId.LAVA;
const natural = new Set<BlockId>([
  BlockId.AIR,
  BlockId.GRASS,
  BlockId.DIRT,
  BlockId.STONE,
  BlockId.SAND,
  BlockId.WATER,
  BlockId.LAVA,
  BlockId.SNOW,
  BlockId.WOOD,
  BlockId.BIRCH,
  BlockId.LEAVES,
  BlockId.GRAVEL,
  BlockId.NETHERRACK,
  BlockId.SOUL_SAND,
  BlockId.NETHER_WART,
  BlockId.GLOWSTONE,
  BlockId.COAL_ORE,
  BlockId.IRON_ORE,
  BlockId.GOLD_ORE,
  BlockId.DIAMOND_ORE,
]);

/** Mutates only an already cloned travel candidate. No portal exists in a
 * fresh realm until this function is called after entry into a built portal. */
export function placeLinkedPortal(
  candidate: SessionState,
  destination: "overworld" | "nether",
  sourcePosition: Vec3,
  initialRealm = false,
): void {
  const ideal = scaledPortalPosition(sourcePosition, destination);
  const world = new World(candidate.seed, destination, candidate.generator);
  const getBlock = (x: number, y: number, z: number): BlockId => {
    if (y < 0 || y >= 96) return BlockId.BEDROCK;
    const { key, index } = address(x, y, z);
    const edited = candidate.edits[key]?.[index];
    if (edited !== undefined) return edited as BlockId;
    world.ensureChunk(Math.floor(x / 16), Math.floor(z / 16));
    return world.getBlock(x, y, z);
  };
  const setBlock = (x: number, y: number, z: number, id: BlockId) => {
    const { key, index } = address(x, y, z);
    (candidate.edits[key] ??= {})[index] = id;
    // A generated landing removes old fluid bookkeeping in that same cell.
    Reflect.deleteProperty(candidate.fluidLevels, `${x},${y},${z}`);
  };
  const radius = destination === "nether" ? 16 : 128;
  let best: { cells: Vec3[]; distance: number } | undefined;
  for (const [key, edits] of Object.entries(candidate.edits)) {
    const [cx, cz] = key.split(",").map(Number);
    for (const [index, id] of Object.entries(edits)) {
      if (id !== BlockId.PORTAL) continue;
      const i = Number(index);
      const p = {
        x: (cx ?? 0) * 16 + (i % 16),
        y: Math.floor(i / 256),
        z: (cz ?? 0) * 16 + Math.floor((i % 256) / 16),
      };
      const distance = Math.hypot(p.x + 0.5 - ideal.x, p.z + 0.5 - ideal.z);
      if (distance > radius || (best && distance >= best.distance)) continue;
      const cells = portalInterior({ getBlock }, p);
      if (cells?.every((cell) => getBlock(cell.x, cell.y, cell.z) === BlockId.PORTAL))
        best = { cells, distance };
    }
  }
  if (best) {
    const bottom = best.cells.filter((p) => p.y === Math.min(...best.cells.map((c) => c.y)));
    const first = bottom[0];
    if (!first) throw new Error("Invalid portal interior");
    const alongX = bottom.some((p) => p.x !== first.x);
    const center = {
      x: bottom.reduce((n, p) => n + p.x + 0.5, 0) / bottom.length,
      y: first.y,
      z: bottom.reduce((n, p) => n + p.z + 0.5, 0) / bottom.length,
    };
    // Prefer a real landing outside either face. If both were obstructed by
    // later edits, the portal's own bottom frame remains a safe arrival floor.
    let landing = center;
    for (const side of [1, -1]) {
      const p = {
        x: center.x + (alongX ? 0 : side),
        y: center.y,
        z: center.z + (alongX ? side : 0),
      };
      const x = Math.floor(p.x),
        y = Math.floor(p.y),
        z = Math.floor(p.z);
      if (
        getBlock(x, y, z) === BlockId.AIR &&
        getBlock(x, y + 1, z) === BlockId.AIR &&
        isSolid(getBlock(x, y - 1, z))
      ) {
        landing = p;
        break;
      }
    }
    candidate.position = { ...landing };
    candidate.yaw = alongX ? 0 : Math.PI / 2;
    candidate.pitch = 0;
    return;
  }

  const offsets: { x: number; z: number }[] = [];
  for (let x = -12; x <= 12; x += 4) for (let z = -12; z <= 12; z += 4) offsets.push({ x, z });
  offsets.sort((a, b) => a.x * a.x + a.z * a.z - b.x * b.x - b.z * b.z);
  interface Site {
    x: number;
    y: number;
    z: number;
  }
  const ground = new Set<BlockId>([
    BlockId.STONE,
    BlockId.DIRT,
    BlockId.GRASS,
    BlockId.SAND,
    BlockId.SNOW,
    BlockId.GRAVEL,
    BlockId.NETHERRACK,
    BlockId.SOUL_SAND,
  ]);
  const canBuild = (site: Site) => {
    for (let xx = site.x - 1; xx <= site.x + 4; xx++)
      for (let zz = site.z - 2; zz <= site.z + 2; zz++)
        for (let yy = site.y; yy <= site.y + 5; yy++) {
          const { key, index } = address(xx, yy, zz);
          const edit = candidate.edits[key]?.[index];
          if (
            (edit !== undefined && edit !== BlockId.AIR && !fluid(edit as BlockId)) ||
            !natural.has(getBlock(xx, yy, zz))
          )
            return false;
        }
    return true;
  };
  let site: Site | undefined;
  for (const offset of offsets) {
    const x = Math.floor(ideal.x) - 1 + offset.x;
    const z = Math.floor(ideal.z) + offset.z;
    let y = destination === "nether" ? 48 : 80;
    while (y > 2 && !isSolid(getBlock(x + 1, y, z))) y--;
    if (y < 2 || y > 87 || !ground.has(getBlock(x + 1, y, z))) continue;
    if (fluid(getBlock(x + 1, y + 1, z))) continue;
    if (canBuild({ x, y, z })) {
      site = { x, y, z };
      break;
    }
  }
  // A lava ocean or sea need not make a portal unusable. As in normal portal
  // arrival, create a small safe platform above it, still avoiding saved builds.
  if (!site)
    for (const offset of offsets) {
      const possible = {
        x: Math.floor(ideal.x) - 1 + offset.x,
        y: destination === "nether" ? 32 : 34,
        z: Math.floor(ideal.z) + offset.z,
      };
      if (canBuild(possible)) {
        site = possible;
        break;
      }
    }
  // If no natural site was free, do not overwrite a player structure or a
  // generated chest. The source realm remains untouched because save is atomic.
  if (!site)
    throw new Error("移動先に安全なゲートの場所がありません。別の場所にゲートを作ってください");
  for (let x = site.x - 1; x <= site.x + 4; x++)
    for (let z = site.z - 2; z <= site.z + 2; z++) {
      setBlock(x, site.y, z, destination === "nether" ? BlockId.NETHERRACK : BlockId.COBBLE);
      for (let y = site.y + 1; y <= site.y + 5; y++) setBlock(x, y, z, BlockId.AIR);
    }
  for (let u = 0; u < 4; u++)
    for (let v = 0; v < 5; v++)
      setBlock(
        site.x + u,
        site.y + v,
        site.z,
        u === 0 || u === 3 || v === 0 || v === 4 ? BlockId.OBSIDIAN : BlockId.PORTAL,
      );
  candidate.position = { x: site.x + 1.5, y: site.y + 1, z: site.z + 1.5 };
  if (initialRealm) candidate.spawn = { ...candidate.position };
  candidate.yaw = 0;
  candidate.pitch = 0;
}
