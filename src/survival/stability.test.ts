import { expect, it } from "vitest";
import { World } from "../world/world";
import { Chunk } from "../world/chunk";
import { BlockId } from "../world/blocks";
import { newSession, SurvivalSession } from "./session";
import { validateSave } from "../save/persistence";
import { stack } from "../items/catalog";

it("keeps state and saves valid across two simulated hours and repeated restoration", () => {
  const world = new World(11);
  const chunk = new Chunk(0, 0);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.setBlock(x, 0, z, BlockId.GRASS);
  world.setChunk(chunk);
  let session = new SurvivalSession(
    world,
    newSession(11, "creative", { x: 8.5, y: 1, z: 8.5 }),
    (x, y, z, id) => {
      world.setBlock(x, y, z, id);
    },
  );
  let restorations = 0;
  // Headless state simulation, not a claim of two hours of rendered play.
  for (let minute = 0; minute < 120; minute++) {
    for (let tick = 0; tick < 60 * 20; tick++)
      session.tick(0.05, { position: session.data.position, onGround: true, yaw: 0, pitch: 0 });
    session.chest(4, 1, 4)[0] = stack("diamond", Math.min(64, minute + 1));
    const restored = validateSave(JSON.parse(JSON.stringify(session.data)));
    session = new SurvivalSession(world, restored, (x, y, z, id) => {
      world.setBlock(x, y, z, id);
    });
    restorations++;
    expect(session.data.creatures.length).toBeLessThanOrEqual(28);
    expect(Number.isFinite(session.data.time)).toBe(true);
  }
  expect(restorations).toBe(120);
  expect(session.data.time).toBeCloseTo(7200 + 1200 * 0.15, 5);
  expect(session.chest(4, 1, 4)[0]).toEqual(stack("diamond", 64));
}, 30000);
