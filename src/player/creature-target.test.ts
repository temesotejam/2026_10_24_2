import { afterEach, describe, expect, it, vi } from "vitest";
import { PerspectiveCamera } from "three";
import { BlockInteraction } from "./interaction";
import type { PlayerController } from "./controller";
import type { Hotbar } from "../ui/hotbar";
import type { Creature, Species } from "../entities/creatures";
import { newSession, SurvivalSession } from "../survival/session";
import { World } from "../world/world";
import { Chunk } from "../world/chunk";
import { BlockId } from "../world/blocks";
function setup(species: Species, height: number, age = 1) {
  vi.stubGlobal("document", new EventTarget());
  vi.stubGlobal("window", new EventTarget());
  const world = new World(1);
  world.setChunk(new Chunk(0, 0));
  const data = newSession(1, "survival", { x: 4.5, y: 1, z: 2.5 });
  const m: Creature = {
    id: 1,
    species,
    age,
    position: { x: 4.5, y: 1, z: 4.5 },
    velocity: { x: 0, y: 0, z: 0 },
    hp: 16,
    onGround: true,
    cooldown: 0,
    intent: 0,
    love: 0,
  };
  data.creatures = [m];
  const session = new SurvivalSession(world, data, (x, y, z, b) => {
    world.setBlock(x, y, z, b);
  });
  const controller = {
    isActive: true,
    eyePosition: { x: 4.5, y: 1 + height, z: 2.5 },
    lookDirection: { x: 0, y: 0, z: 1 },
  } as unknown as PlayerController;
  const interaction = new BlockInteraction(
    new PerspectiveCamera(),
    new EventTarget() as unknown as HTMLElement,
    world,
    { updateChunk: vi.fn() },
    {} as Hotbar,
    controller,
    session,
  );
  return { interaction, m, world };
}
afterEach(() => vi.unstubAllGlobals());
describe("normal mouse attack targets the rendered creature", () => {
  it("damages a wanderer aimed at the head", () => {
    const { interaction, m } = setup("wanderer", 1.98);
    interaction.breakTargetedBlock();
    expect(m.hp).toBe(15);
  });
  it("misses empty space above a baby cow", () => {
    const { interaction, m } = setup("cow", 1.1, -60);
    interaction.breakTargetedBlock();
    expect(m.hp).toBe(16);
  });
  it("does not damage a visible head through a wall", () => {
    const { interaction, m, world } = setup("wanderer", 1.98);
    world.setBlock(4, 2, 3, BlockId.BEDROCK);
    interaction.breakTargetedBlock();
    expect(m.hp).toBe(16);
  });
});
