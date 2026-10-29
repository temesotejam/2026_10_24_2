import { describe, expect, it } from "vitest";
import { World } from "../world/world";
import { Chunk } from "../world/chunk";
import { BlockId } from "../world/blocks";
import { stack } from "../items/catalog";
import { newSession, SurvivalSession } from "./session";
import { Adventure } from "./adventure";

describe("finite source collection", () => {
  it.each([
    [BlockId.WATER, "waterBucket"],
    [BlockId.LAVA, "lavaBucket"],
  ] as const)(
    "collects source %s but cannot manufacture buckets from its flowing cells",
    (block, item) => {
      const world = new World(1, "overworld", 3);
      world.setChunk(new Chunk(0, 0));
      world.setBlock(1, 34, 0, block);
      const data = newSession(1, "survival", { x: 0.5, y: 34, z: 0.5 });
      data.inventory[0] = stack("bucket");
      data.fluidLevels["1,34,0"] = 2;
      const session = new SurvivalSession(world, data, (x, y, z, id) => {
          world.setBlock(x, y, z, id);
        }),
        a = new Adventure(session);
      a.use({ x: 0.5, y: 34.5, z: 0.5 }, { x: 1, y: 0, z: 0 });
      expect(data.inventory[0].id).toBe("bucket");
      expect(world.getBlock(1, 34, 0)).toBe(block);
      data.fluidLevels["1,34,0"] = 0;
      a.use({ x: 0.5, y: 34.5, z: 0.5 }, { x: 1, y: 0, z: 0 });
      expect(data.inventory[0].id).toBe(item);
      expect(world.getBlock(1, 34, 0)).toBe(BlockId.AIR);
    },
  );
});
