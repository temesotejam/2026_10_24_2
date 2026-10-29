import { describe, expect, it } from "vitest";
import { eyeDirection, eyeBreaks } from "./eye-guidance";
import { Adventure } from "./adventure";
import { newSession, SurvivalSession } from "./session";
import { World } from "../world/world";
import { stack } from "../items/catalog";
import { stronghold } from "../world/adventure-terrain";
import { encodeSave, parseSave } from "../save/persistence";

describe("eye guidance", () => {
  it("points along compass bearings and indicates proximity without exposing coordinates", () => {
    const origin = { x: 0, y: 50, z: 0 };
    expect(eyeDirection(origin, { x: 0, y: 18, z: -100 })).toBe("北");
    expect(eyeDirection(origin, { x: 100, y: 18, z: 100 })).toBe("南東");
    expect(eyeDirection(origin, { x: -100, y: 18, z: 0 })).toBe("西");
    expect(eyeDirection(origin, { x: 1, y: 18, z: 1 })).toBe("足元の地下");
  });
  it("persists throw count and consumes broken eyes while recovered throws retain the stack", () => {
    const world = new World(2026, "overworld", 3);
    const data = newSession(2026, "survival", { x: 0.5, y: 40, z: 0.5 });
    data.inventory[0] = stack("enderEye", 32);
    const session = new SurvivalSession(world, data, () => undefined),
      adventure = new Adventure(session);
    const notices: string[] = [];
    session.notice = (text) => notices.push(text);
    let broken = 0;
    for (let i = 0; i < 20; i++) {
      if (eyeBreaks(2026, i)) broken++;
      adventure.use({ x: 0.5, y: 41.62, z: 0.5 }, { x: 0, y: 0, z: -1 });
    }
    expect(broken).toBeGreaterThan(0);
    expect(data.inventory[0].count).toBe(32 - broken);
    expect(data.adventure?.eyeThrows).toBe(20);
    const c = stronghold(2026, 3);
    expect(notices.every((n) => !n.includes(`X ${c.x}`) && !n.includes(`Z ${c.z}`))).toBe(true);
    expect(parseSave(encodeSave(data)).adventure?.eyeThrows).toBe(20);
  });
});
