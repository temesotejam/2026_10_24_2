import { describe, expect, it } from "vitest";
import { findPleasantSpawn, openSpawnYaw } from "./spawn";
import { createCaveSampler, createColumnSampler, SEA_LEVEL } from "./terrain";

describe("findPleasantSpawn", () => {
  it("is deterministic per seed", () => {
    expect(findPleasantSpawn(2026)).toEqual(findPleasantSpawn(2026));
  });

  it("lands on a grassy, gently-elevated, cave-free column for many seeds", () => {
    for (const seed of [1, 2, 42, 2026, 987654]) {
      const spawn = findPleasantSpawn(seed);
      const profile = createColumnSampler(seed)(Math.floor(spawn.x), Math.floor(spawn.z));
      const isCave = createCaveSampler(seed);

      expect(profile.isDesert).toBe(false);
      expect(profile.isSnowy).toBe(false);
      expect(profile.terrainHeight).toBeGreaterThan(SEA_LEVEL + 1);
      expect(profile.terrainHeight).toBeLessThanOrEqual(SEA_LEVEL + 12);
      expect(isCave(Math.floor(spawn.x), profile.terrainHeight, Math.floor(spawn.z))).toBe(false);
    }
  });

  it("centers the spawn inside its block so the player isn't on an edge", () => {
    const spawn = findPleasantSpawn(2026);
    expect(spawn.x - Math.floor(spawn.x)).toBeCloseTo(0.5);
    expect(spawn.z - Math.floor(spawn.z)).toBeCloseTo(0.5);
  });
});

describe("new-world spawn framing", () => {
  it("rejects a narrow ledge with a cliff immediately behind it", () => {
    const profile = (x: number, z: number) => ({
      terrainHeight: x < 0 || z !== 0 ? 45 : 35,
      isDesert: false,
      isSnowy: false,
    });
    expect(openSpawnYaw(0, 0, 35, profile, () => false)).toBeNull();
  });

  it("faces an open route with rear-camera clearance instead of facing a tall hillside", () => {
    const profile = (_x: number, z: number) => ({
      terrainHeight: z < 0 ? 45 : 35,
      isDesert: false,
      isSnowy: false,
    });
    // East/west have clear ground ahead and behind. North faces the wall;
    // south would put the camera inside it.
    expect(openSpawnYaw(0, 0, 35, profile, () => false)).toBe(-Math.PI / 2);
  });

  it("gives new seeds a walkable first route while preserving old-world spawn coordinates", () => {
    for (const seed of [1, 2, 42, 2026, 11031, 11032, 987654]) {
      const old = findPleasantSpawn(seed, 2);
      expect(old.yaw).toBe(0);
      const spawn = findPleasantSpawn(seed, 3);
      const sample = createColumnSampler(seed, 3),
        cave = createCaveSampler(seed);
      const x = Math.floor(spawn.x),
        z = Math.floor(spawn.z);
      let previous = sample(x, z).terrainHeight;
      const dx = Math.round(-Math.sin(spawn.yaw)),
        dz = Math.round(-Math.cos(spawn.yaw));
      for (let distance = 1; distance <= 4; distance++) {
        const height = sample(x + dx * distance, z + dz * distance).terrainHeight;
        expect(Math.abs(height - previous)).toBeLessThanOrEqual(1);
        expect(height).toBeGreaterThan(SEA_LEVEL);
        expect(cave(x + dx * distance, height, z + dz * distance)).toBe(false);
        previous = height;
      }
    }
  });
});
