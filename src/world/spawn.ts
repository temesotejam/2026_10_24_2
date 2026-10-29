import { treeAllowedOn, treeCandidatesNear } from "./features";
import type { GeneratorVersion } from "./adventure-terrain";
import { createCaveSampler, createColumnSampler, SEA_LEVEL } from "./terrain";

const MAX_SPAWN_HEIGHT = SEA_LEVEL + 12;
const SEARCH_STEP = 8;
const SEARCH_LIMIT = 640; // world units in each direction — always finds something in practice

export interface SpawnPoint {
  readonly x: number;
  readonly z: number;
  /** Initial yaw only; saved worlds retain their own aim. */
  readonly yaw: number;
}

/** A deterministic, *pleasant* place to start: a grassy column at a gentle
 * height, not a desert, not a windswept snow peak, not the roof of a cave
 * about to swallow the player. Scans outward from the origin in growing
 * rings so the same seed always spawns in the same spot. Falls back to
 * (8, 8) if the seed is somehow all ocean and dunes within the search
 * limit. */
export function findPleasantSpawn(seed: number, revision: GeneratorVersion = 1): SpawnPoint {
  const sample = createColumnSampler(seed, revision);
  const isCave = createCaveSampler(seed);

  for (let radius = 0; radius <= SEARCH_LIMIT; radius += SEARCH_STEP) {
    const candidates: [number, number][] = radius === 0 ? [[0, 0]] : ringCoordinates(radius);
    for (const [x, z] of candidates) {
      const profile = sample(x, z);
      if (profile.isDesert || profile.isSnowy) continue;
      if (profile.terrainHeight <= SEA_LEVEL + 1) continue; // beach or ocean
      if (profile.terrainHeight > MAX_SPAWN_HEIGHT) continue; // steep highlands
      if (isCave(x, profile.terrainHeight, z)) continue; // cave mouth underfoot
      if (revision < 3) return { x: x + 0.5, z: z + 0.5, yaw: 0 };
      // The controller finds the highest solid block, so even an overhead
      // canopy would otherwise turn a ground spawn into a treetop spawn.
      const underTree = treeCandidatesNear(seed, x, x, z, z).some(
        (tree) =>
          Math.abs(tree.x - x) <= 2 &&
          Math.abs(tree.z - z) <= 2 &&
          treeAllowedOn(sample(tree.x, tree.z), SEA_LEVEL),
      );
      if (underTree) continue;
      const yaw = openSpawnYaw(x, z, profile.terrainHeight, sample, isCave);
      if (yaw === null) continue;
      return { x: x + 0.5, z: z + 0.5, yaw };
    }
  }
  return { x: 8, z: 8, yaw: 0 };
}

function ringCoordinates(radius: number): [number, number][] {
  const coords: [number, number][] = [];
  for (let i = -radius; i <= radius; i += SEARCH_STEP) {
    coords.push([i, -radius], [i, radius], [-radius, i], [radius, i]);
  }
  return coords;
}

/** Prefer a view with a walkable route ahead and room for the rear camera.
 * Reject a cliff-hugging candidate rather than forcing the player to dig
 * through a hillside before they can take their first steps. */
export function openSpawnYaw(
  x: number,
  z: number,
  ground: number,
  sample: ReturnType<typeof createColumnSampler>,
  cave: ReturnType<typeof createCaveSampler>,
): number | null {
  let best: { yaw: number; score: number } | null = null;
  for (const [dx, dz, yaw] of [
    [0, -1, 0],
    [1, 0, -Math.PI / 2],
    [0, 1, Math.PI],
    [-1, 0, Math.PI / 2],
  ] as const) {
    let previous = ground,
      score = 0,
      clear = true;
    for (let distance = 1; distance <= 4; distance++) {
      const nx = x + dx * distance,
        nz = z + dz * distance;
      const height = sample(nx, nz).terrainHeight;
      if (height <= SEA_LEVEL || Math.abs(height - previous) > 1 || cave(nx, height, nz)) {
        clear = false;
        break;
      }
      score -= Math.abs(height - ground);
      previous = height;
    }
    for (let distance = 1; distance <= 3 && clear; distance++) {
      const height = sample(x - dx * distance, z - dz * distance).terrainHeight;
      if (height > ground + 1) clear = false;
    }
    if (clear && (!best || score > best.score)) best = { yaw, score };
  }
  return best?.yaw ?? null;
}
