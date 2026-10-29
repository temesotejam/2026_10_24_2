import { expect, it } from "vitest";
import { must } from "../core/assert";
import { BlockId } from "../world/blocks";
import { World } from "../world/world";
import { createColumnSampler, generateChunk } from "../world/terrain";
import { structureBlocks, structuresNear } from "../world/adventure-terrain";
import { newSession, SurvivalSession } from "./session";

it("new-world village loot cannot supply a ready Nether kit and never refills after replacement", () => {
  const world = new World(2026, "overworld", 3);
  const data = newSession(2026, "survival", { x: 0.5, y: 34, z: 0.5 });
  const session = new SurvivalSession(world, data, (x, y, z, id) => {
    world.setBlock(x, y, z, id);
  });
  const village = must(
    structuresNear(2026, 64, 64, createColumnSampler(2026, 3)).find((s) => s.kind === "village"),
  );
  const chest = must(structureBlocks(village, 3).find((p) => p.id === BlockId.CHEST));
  world.setChunk(
    generateChunk(Math.floor(chest.x / 16), Math.floor(chest.z / 16), 2026, "overworld", 3),
  );
  const loot = session.chest(chest.x, chest.y, chest.z);
  expect(loot.some((s) => s?.id === "bread")).toBe(true);
  expect(
    loot.some((s) => s && ["obsidian", "enderPearl", "blazeRod", "string"].includes(s.id)),
  ).toBe(false);
  session.mine(chest.x, chest.y, chest.z);
  world.setBlock(chest.x, chest.y, chest.z, BlockId.CHEST);
  expect(session.chest(chest.x, chest.y, chest.z).every((s) => s === null)).toBe(true);
});
