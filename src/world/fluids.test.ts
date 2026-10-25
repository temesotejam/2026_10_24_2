import { describe, expect, it } from "vitest";
import { World } from "./world";
import { Chunk } from "./chunk";
import { BlockId } from "./blocks";
import { FluidSimulator } from "./fluids";
function fixture() {
  const world = new World(1);
  world.setChunk(new Chunk(0, 0));
  const levels: Record<string, number> = {};
  const sim = new FluidSimulator(world, levels, (x, y, z, id) => {
    world.setBlock(x, y, z, id);
  });
  return { world, levels, sim };
}
describe("bounded fluids", () => {
  it("flows downward into air and retains levels for future saves", () => {
    const { world, levels, sim } = fixture();
    world.setBlock(5, 4, 5, BlockId.WATER);
    sim.notify(5, 4, 5);
    sim.tick(0.2);
    expect(world.getBlock(5, 3, 5)).toBe(BlockId.WATER);
    expect(levels["5,3,5"]).toBe(0);
  });
  it("stops sideways propagation after four cells and cannot cross walls", () => {
    const { world, sim } = fixture();
    for (let x = 0; x < 16; x++)
      for (let z = 0; z < 16; z++) {
        world.setBlock(x, 1, z, BlockId.STONE);
        if (x === 8) world.setBlock(x, 2, z, BlockId.STONE);
      }
    world.setBlock(5, 2, 5, BlockId.WATER);
    sim.notify(5, 2, 5);
    for (let i = 0; i < 40; i++) sim.tick(0.2);
    expect(world.getBlock(7, 2, 5)).toBe(BlockId.WATER);
    expect(world.getBlock(9, 2, 5)).toBe(BlockId.AIR);
    expect(world.getBlock(5, 2, 10)).toBe(BlockId.AIR);
  });
  it("turns water touching a lava source into obsidian", () => {
    const { world, sim } = fixture();
    world.setBlock(5, 2, 5, BlockId.WATER);
    world.setBlock(5, 1, 5, BlockId.LAVA);
    sim.notify(5, 2, 5);
    sim.tick(0.2);
    expect(world.getBlock(5, 1, 5)).toBe(BlockId.OBSIDIAN);
  });
});
