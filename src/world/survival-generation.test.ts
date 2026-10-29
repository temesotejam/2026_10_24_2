import { describe, expect, it } from "vitest";
import { BlockId } from "./blocks";
import { generateChunk, createColumnSampler } from "./terrain";
import {
  structureBlocks,
  structuresNear,
  stronghold,
  endFrames,
  generateNether,
} from "./adventure-terrain";
import { newSession } from "../survival/session";
import { parseSave, encodeSave } from "../save/persistence";

describe("revision3 survival progression", () => {
  it("starts new worlds with revision3 and preserves the revision in a save", () => {
    const data = newSession(20261029, "survival", { x: 0.5, y: 35, z: 0.5 });
    expect(data.generator).toBe(3);
    expect(parseSave(encodeSave(data)).generator).toBe(3);
  });
  it("does not attach obsidian or activated portals to every village", () => {
    for (const seed of [1, 2026, 11032, 11033]) {
      const villages = structuresNear(seed, 64, 64, createColumnSampler(seed, 3)).filter(
        (s) => s.kind === "village",
      );
      for (const village of villages) {
        const blocks = structureBlocks(village, 3);
        expect(blocks.some((p) => p.id === BlockId.OBSIDIAN || p.id === BlockId.PORTAL)).toBe(
          false,
        );
        expect(structureBlocks(village, 2).some((p) => p.id === BlockId.OBSIDIAN)).toBe(true);
      }
    }
  });
  it("does not generate a Nether portal before a player ever travels there", () => {
    for (const [cx, cz] of [
      [0, 0],
      [-1, 0],
      [0, -1],
      [-1, -1],
    ]) {
      const chunk = generateNether(cx ?? 0, cz ?? 0, 2026, 3);
      for (let x = 0; x < 16; x++)
        for (let z = 0; z < 16; z++)
          for (let y = 1; y < 95; y++) expect(chunk.getBlock(x, y, z)).not.toBe(BlockId.PORTAL);
    }
  });
  it("places strongholds away from the start with seeded sparse eye filling", () => {
    const fills = [];
    for (let seed = 1; seed <= 100; seed++) {
      const room = stronghold(seed, 3);
      expect(Math.hypot(room.x, room.z)).toBeGreaterThan(250);
      const frames = endFrames(seed, 3);
      expect(frames).toHaveLength(12);
      fills.push(frames.filter((f) => !f.empty).length);
      expect(endFrames(seed, 2).filter((f) => f.empty)).toHaveLength(4);
    }
    expect(new Set(fills).size).toBeGreaterThan(2);
    expect(fills.reduce((a, b) => a + b, 0) / 100).toBeLessThan(2);
  });
  it("generates real gravel resources in new terrain without modifying legacy stone", () => {
    let gravel = 0;
    for (let cx = 0; cx < 2; cx++) {
      const modern = generateChunk(cx, 0, 2026, "overworld", 3),
        legacy = generateChunk(cx, 0, 2026, "overworld", 2);
      for (let x = 0; x < 16; x++)
        for (let z = 0; z < 16; z++)
          for (let y = 1; y < 30; y++) {
            if (modern.getBlock(x, y, z) === BlockId.GRAVEL) gravel++;
            expect(legacy.getBlock(x, y, z)).not.toBe(BlockId.GRAVEL);
          }
    }
    expect(gravel).toBeGreaterThan(10);
  });
});
