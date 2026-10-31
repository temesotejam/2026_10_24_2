import { describe, expect, it } from "vitest";
import { moveCreature, type Creature, type Species } from "./creatures";
import { World } from "../world/world";
import { Chunk } from "../world/chunk";
import { BlockId } from "../world/blocks";
function ledge(species: Species) {
  const world = new World(1),
    chunk = new Chunk(0, 0);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.setBlock(x, 0, z, BlockId.STONE);
  chunk.setBlock(7, 1, 6, BlockId.STONE);
  world.setChunk(chunk);
  const mob: Creature = {
    id: 1,
    species,
    hp: 16,
    age: 1,
    cooldown: 0,
    love: 0,
    intent: 0,
    position: { x: 6.5, y: 1, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
  };
  return { world, mob };
}
describe("creature terrain movement", () => {
  it("jumps onto a step behind it while a skeleton retreats", () => {
    const { world, mob } = ledge("skeleton");
    let high = 1;
    for (let i = 0; i < 240; i++) {
      moveCreature(mob, { x: 4.5, y: 1, z: 6.5 }, world, 1 / 120);
      high = Math.max(high, mob.position.y);
    }
    expect(high).toBeGreaterThan(2);
    expect(mob.position.x).toBeGreaterThan(7.5);
  });
  it("still climbs a step in front when pursuing", () => {
    const { world, mob } = ledge("zombie");
    for (let i = 0; i < 240; i++) moveCreature(mob, { x: 10.5, y: 1, z: 6.5 }, world, 1 / 120);
    expect(mob.position.x).toBeGreaterThan(7.5);
  });
});
