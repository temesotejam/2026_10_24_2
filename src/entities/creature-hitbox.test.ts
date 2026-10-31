import { describe, expect, it } from "vitest";
import { creatureContainsPoint, creatureRayDistance } from "./creature-hitbox";
import type { Creature, Species } from "./creatures";
const mob = (species: Species): Creature => ({
  id: 1,
  species,
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  onGround: true,
  hp: 16,
  age: 1,
  cooldown: 0,
  intent: 0,
  love: 0,
});
describe("creature body targeting", () => {
  it("hits the visible head of a tall enemy with melee and arrows", () => {
    const m = mob("wanderer"),
      origin = { x: 0, y: 1.98, z: -2.5 };
    expect(creatureRayDistance(m, origin, { x: 0, y: 0, z: 1 })).toBeCloseTo(2.27);
    expect(creatureContainsPoint(m, { x: 0, y: 1.98, z: 0 })).toBe(true);
  });
  it("does not hit empty space above a spider or a baby", () => {
    const spider = mob("spider"),
      baby = { ...mob("cow"), age: -60 };
    expect(creatureRayDistance(spider, { x: 0, y: 1.4, z: -2 }, { x: 0, y: 0, z: 1 })).toBeNull();
    expect(creatureContainsPoint(spider, { x: 0, y: 1, z: 0 })).toBe(false);
    expect(creatureRayDistance(baby, { x: 0, y: 1.3, z: -2 }, { x: 0, y: 0, z: 1 })).toBeNull();
    expect(creatureRayDistance(baby, { x: 0, y: 0.6, z: -2 }, { x: 0, y: 0, z: 1 })).not.toBeNull();
  });
  it("uses the body surface rather than its center for reach and wall ordering", () => {
    const m = mob("zombie");
    const hit = creatureRayDistance(m, { x: 0, y: 1.6, z: -3.4 }, { x: 0, y: 0, z: 1 });
    expect(hit).toBeLessThan(3); // Head/arms can be reached while the center cannot.
    expect(hit).toBeGreaterThan(2); // A wall two blocks away still blocks the hit.
  });
  it("rotates the long animal body and scales children", () => {
    const m = mob("cow");
    expect(creatureContainsPoint(m, { x: 0, y: 0.9, z: -0.9 })).toBe(true);
    m.intent = Math.PI / 2;
    expect(creatureContainsPoint(m, { x: -0.9, y: 0.9, z: 0 })).toBe(true);
    expect(creatureContainsPoint(m, { x: 0, y: 0.9, z: -0.9 })).toBe(false);
    m.age = -1;
    expect(creatureContainsPoint(m, { x: -0.9, y: 0.9, z: 0 })).toBe(false);
  });
});
