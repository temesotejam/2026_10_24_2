import { describe, expect, it } from "vitest";
import { encodeSave, parseSave, validateSave } from "./persistence";
import { newSession } from "../survival/session";
import { stack } from "../items/catalog";
const fresh = () => newSession(1, "survival", { x: 0.5, y: 35, z: 0.5 });
describe("versioned save validation", () => {
  it("round trips complete inventory, terrain edits, stats and containers", () => {
    const d = fresh();
    d.inventory[0] = stack("iron_pick");
    d.edits = { "0,0": { "3": 0, "200": 10 } };
    d.vitals.hunger = 7;
    d.chests["1,35,1"] = Array.from({ length: 27 }, (_, i) =>
      i === 0 ? stack("diamond", 3) : null,
    );
    expect(parseSave(encodeSave(d))).toEqual(d);
  });
  it.each([
    "version",
    "generator",
    "inventory",
    "vitals",
    "position",
    "edits",
    "creatures",
    "grid",
  ])("rejects missing %s", (key) => {
    const d = fresh() as unknown as Record<string, unknown>;
    Reflect.deleteProperty(d, key);
    expect(() => validateSave(d)).toThrow();
  });
  it("rejects invalid block ids and indices, NaN position, unknown items and overstacking", () => {
    for (const change of [
      (d: ReturnType<typeof fresh>) => (d.edits = { "0,0": { "0": 255 } }),
      (d: ReturnType<typeof fresh>) => (d.edits = { "0,0": { "999999": 1 } }),
      (d: ReturnType<typeof fresh>) => (d.position = { ...d.position, x: NaN }),
      (d: ReturnType<typeof fresh>) => (d.inventory[0] = { id: "bogus", count: 1 }),
      (d: ReturnType<typeof fresh>) => (d.inventory[0] = stack("log", 65)),
    ]) {
      const d = fresh();
      change(d);
      expect(() => validateSave(d)).toThrow();
    }
  });
  it("does not mutate the source object and rejects incompatible versions", () => {
    const d = fresh();
    const safe = validateSave(d);
    safe.vitals.health = 1;
    expect(d.vitals.health).toBe(20);
    expect(() => validateSave({ ...d, generator: 99 })).toThrow();
  });
  it("rejects oversized imports and malformed JSON", () => {
    expect(() => parseSave(" ".repeat(10 * 1024 * 1024 + 1))).toThrow();
    expect(() => parseSave("{")).toThrow();
  });
});
