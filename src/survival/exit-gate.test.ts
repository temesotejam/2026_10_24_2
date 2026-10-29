import { expect, it } from "vitest";
import { World } from "../world/world";
import { BlockId } from "../world/blocks";
import { newSession, SurvivalSession } from "./session";
import { realmSnapshot } from "./adventure-state";
import { Adventure } from "./adventure";
import { PortalContact } from "./portal";
import { stack } from "../items/catalog";

it("opens the exit at the center without automatically ejecting a victorious player", () => {
  const world = new World(2026, "end", 3);
  world.ensureChunk(0, 0);
  const data = newSession(2026, "survival", { x: 0.5, y: 34, z: 4 });
  if (!data.adventure) throw new Error("missing adventure");
  data.adventure.realms.overworld = realmSnapshot(data);
  data.adventure.dimension = "end";
  data.adventure.dragon = { health: 6, phase: 18, defeated: false };
  data.inventory[0] = stack("iron_sword");
  const session = new SurvivalSession(world, data, (x, y, z, id) => {
    world.setBlock(x, y, z, id);
  });
  const adventure = new Adventure(session);
  adventure.attackDragon({ x: 0.5, y: 35.62, z: 4 }, { x: -0.5, y: -0.12, z: -4 });
  expect(adventure.state.dragon.defeated).toBe(true);
  expect(data.inventory.some((s) => s?.id === "dragonEgg")).toBe(true);
  expect(world.getBlock(0, 34, 4)).toBe(BlockId.AIR);
  expect(world.getBlock(0, 34, 0)).toBe(BlockId.END_GATE);
  const contact = new PortalContact();
  const getBlock = (x: number, y: number, z: number) => world.getBlock(x, y, z);
  expect(contact.update(0.1, data.position, true, false, "end", getBlock)).toBeNull();
  expect(contact.update(0.1, { x: 0.5, y: 34, z: 0.5 }, true, false, "end", getBlock)).toBe(
    "overworld",
  );
});
