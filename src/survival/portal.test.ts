import { describe, expect, it } from "vitest";
import { BlockId } from "../world/blocks";
import { PortalContact } from "./portal";
const outside = { x: 1.5, y: 35, z: 2 };
const inside = { x: 1.5, y: 35, z: 0.5 };
const blocks = (x: number, y: number, z: number): BlockId => {
  if (z !== 0 || x < 0 || x > 3 || y < 34 || y > 38) return BlockId.AIR;
  return x === 0 || x === 3 || y === 34 || y === 38 ? BlockId.OBSIDIAN : BlockId.PORTAL;
};
describe("physical portal entry", () => {
  it("does not arm an arrival portal while its paused chunks are still loading", () => {
    const c = new PortalContact();
    c.update(0.1, inside, false, false, "nether", () => BlockId.AIR);
    for (let i = 0; i < 60; i++)
      expect(c.update(0.1, inside, true, false, "nether", blocks)).toBeNull();
    c.update(0.1, outside, true, false, "nether", blocks);
    for (let i = 0; i < 39; i++)
      expect(c.update(0.1, inside, true, false, "nether", blocks)).toBeNull();
    expect(c.update(0.1, inside, true, false, "nether", blocks)).toBe("overworld");
  });
  it("lets an End victory arrival leave the loaded gate before it can re-enter", () => {
    const c = new PortalContact();
    const gate = (_x: number, y: number, z: number) =>
      y === 35 && z === 0 ? BlockId.END_GATE : BlockId.AIR;
    c.update(0.1, inside, false, false, "overworld", () => BlockId.AIR);
    expect(c.update(0.1, inside, true, false, "overworld", gate)).toBeNull();
    expect(c.update(0.1, outside, true, false, "overworld", gate)).toBeNull();
    expect(c.update(0.1, inside, true, false, "overworld", gate)).toBe("end");
  });
  it("requires four seconds of uninterrupted survival contact and resets on leaving", () => {
    const c = new PortalContact();
    const step = (p = inside) => c.update(0.1, p, true, false, "overworld", blocks);
    step(outside);
    for (let i = 0; i < 20; i++) expect(step()).toBeNull();
    step(outside);
    for (let i = 0; i < 39; i++) expect(step()).toBeNull();
    expect(step()).toBe("nether");
    for (let i = 0; i < 50; i++) expect(step()).toBeNull();
    step(outside);
    for (let i = 0; i < 39; i++) expect(step()).toBeNull();
    expect(step()).toBe("nether");
  });
  it("does not bounce on arrival or travel through an invalid frame", () => {
    const c = new PortalContact();
    for (let i = 0; i < 60; i++)
      expect(c.update(0.1, inside, true, false, "nether", blocks)).toBeNull();
    c.update(0.1, outside, true, false, "nether", blocks);
    const broken = (x: number, y: number, z: number) => (x === 0 ? BlockId.AIR : blocks(x, y, z));
    for (let i = 0; i < 60; i++)
      expect(c.update(0.1, inside, true, false, "nether", broken)).toBeNull();
  });
  it("pausing cancels progress and creative entry is immediate after leaving arrival", () => {
    const c = new PortalContact();
    c.update(0.1, outside, true, false, "overworld", blocks);
    c.update(0.2, inside, true, false, "overworld", blocks);
    expect(c.progress).toBeGreaterThan(0);
    c.update(0.1, inside, false, false, "overworld", blocks);
    expect(c.progress).toBe(0);
    expect(c.update(0.1, inside, true, true, "overworld", blocks)).toBe("nether");
  });
});
