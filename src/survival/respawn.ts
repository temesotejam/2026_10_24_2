import { emptySlots } from "../items/inventory";
import type { Vec3 } from "../player/physics";
import { BlockId, isSolid } from "../world/blocks";
import { CHUNK_HEIGHT } from "../world/coords";
import { World } from "../world/world";
import { REALM_FIELDS, realmSnapshot } from "./adventure-state";
import type { SessionState } from "./session";
import { newVitals } from "./vitals";

const address = (x: number, y: number, z: number) => ({
  key: `${Math.floor(x / 16)},${Math.floor(z / 16)}`,
  index: (y * 16 + (((z % 16) + 16) % 16)) * 16 + (((x % 16) + 16) % 16),
});
function safeOverworldSpawn(candidate: SessionState): Vec3 {
  const naturalWorld = new World(candidate.seed, "overworld", candidate.generator);
  const getBlock = (x: number, y: number, z: number): BlockId => {
    if (y < 0 || y >= CHUNK_HEIGHT) return BlockId.BEDROCK;
    const { key, index } = address(x, y, z);
    const edited = candidate.edits[key]?.[index];
    if (edited !== undefined) return edited as BlockId;
    naturalWorld.ensureChunk(Math.floor(x / 16), Math.floor(z / 16));
    return naturalWorld.getBlock(x, y, z);
  };
  const offsets = [{ x: 0, z: 0 }];
  for (let radius = 1; radius <= 2; radius++)
    for (let x = -radius; x <= radius; x++)
      for (let z = -radius; z <= radius; z++)
        if (Math.max(Math.abs(x), Math.abs(z)) === radius) offsets.push({ x, z });
  offsets.sort((a, b) => a.x * a.x + a.z * a.z - b.x * b.x - b.z * b.z);
  const baseX = Math.floor(candidate.spawn.x),
    baseY = Math.max(2, Math.min(CHUNK_HEIGHT - 2, Math.floor(candidate.spawn.y + 0.01))),
    baseZ = Math.floor(candidate.spawn.z);
  const heights = [baseY];
  for (let distance = 1; distance < CHUNK_HEIGHT; distance++)
    heights.push(baseY + distance, baseY - distance);
  // The saved bed location wins; nearby free cells are preferable to changing
  // any blocks. Natural blocks are generated before considering a cell empty.
  for (const y of heights) {
    if (y < 2 || y >= CHUNK_HEIGHT - 1) continue;
    for (const offset of offsets) {
      const x = baseX + offset.x,
        z = baseZ + offset.z;
      if (
        isSolid(getBlock(x, y - 1, z)) &&
        getBlock(x, y, z) === BlockId.AIR &&
        getBlock(x, y + 1, z) === BlockId.AIR
      )
        return { x: x + 0.5, y, z: z + 0.5 };
    }
  }
  // Do not carve through a player's build to manufacture a landing. The
  // caller keeps the dead source realm if this candidate cannot be saved.
  throw new Error("復活地点の周囲に安全な場所がありません");
}

/** Persist this cloned candidate before replacing a dead Nether/End session.
 * Death loot stays in its original realm; respawning never creates a portal. */
export function respawnCandidate(data: SessionState): SessionState {
  const next = structuredClone(data),
    adventure = next.adventure;
  if (next.generator < 3 || !adventure || adventure.dimension === "overworld")
    throw new Error("この復活処理は新しいネザー・エンドのワールド用です");
  const target = adventure.realms.overworld;
  if (!target) throw new Error("復活先の通常世界がありません");
  adventure.realms[adventure.dimension] = realmSnapshot(next);
  for (const key of REALM_FIELDS) Object.assign(next, { [key]: structuredClone(target[key]) });
  adventure.dimension = "overworld";
  next.inventory = emptySlots(36);
  next.grid = emptySlots(next.gridSize ** 2);
  next.selected = 0;
  next.vitals = newVitals();
  adventure.xp = 0;
  adventure.fire = 0;
  adventure.strength = 0;
  next.position = safeOverworldSpawn(next);
  return next;
}
