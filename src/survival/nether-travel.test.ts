import { describe, expect, it } from "vitest";
import { newSession } from "./session";
import { travelCandidate } from "./adventure-state";
import { scaledPortalPosition } from "./nether-travel";
import { portalInterior } from "./portal";
import { BlockId, isSolid } from "../world/blocks";
import { World } from "../world/world";
import { encodeSave, parseSave } from "../save/persistence";
import { stack } from "../items/catalog";

function put(data: ReturnType<typeof newSession>, x: number, y: number, z: number, id: BlockId) {
  const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
  const index = (y * 16 + (((z % 16) + 16) % 16)) * 16 + (((x % 16) + 16) % 16);
  (data.edits[key] ??= {})[index] = id;
}
function view(data: ReturnType<typeof newSession>, dimension: "overworld" | "nether") {
  const world = new World(data.seed, dimension, data.generator);
  return {
    getBlock: (x: number, y: number, z: number) => {
      const index = (y * 16 + (((z % 16) + 16) % 16)) * 16 + (((x % 16) + 16) % 16);
      const edit = data.edits[`${Math.floor(x / 16)},${Math.floor(z / 16)}`]?.[index];
      if (edit !== undefined) return edit as BlockId;
      world.ensureChunk(Math.floor(x / 16), Math.floor(z / 16));
      return world.getBlock(x, y, z);
    },
  };
}
function frame(data: ReturnType<typeof newSession>, x: number, y: number, z: number) {
  for (let u = 0; u < 4; u++)
    for (let v = 0; v < 5; v++)
      put(
        data,
        x + u,
        y + v,
        z,
        u === 0 || u === 3 || v === 0 || v === 4 ? BlockId.OBSIDIAN : BlockId.PORTAL,
      );
}
describe("survival portal linking", () => {
  it("scales negative horizontal coordinates8:1 and leaves height unchanged", () => {
    expect(scaledPortalPosition({ x: -80, y: 45, z: 160 }, "nether")).toEqual({
      x: -10,
      y: 45,
      z: 20,
    });
    expect(scaledPortalPosition({ x: -10, y: 31, z: 20 }, "overworld")).toEqual({
      x: -80,
      y: 31,
      z: 160,
    });
  });
  it("generates an arrival portal only in the candidate and preserves paid inventory and realm", () => {
    const data = newSession(2026, "survival", { x: 160.5, y: 35, z: -80.5 });
    data.inventory[0] = stack("diamond", 3);
    frame(data, 159, 34, -81);
    const original = structuredClone(data);
    const candidate = travelCandidate(data, "nether", { x: 0, y: 34, z: 0 });
    expect(data).toEqual(original);
    expect(candidate.inventory).toEqual(data.inventory);
    expect(candidate.adventure?.realms.overworld?.edits).toEqual(data.edits);
    expect(candidate.position.x).toBeCloseTo(data.position.x / 8, -1);
    expect(Math.abs(candidate.position.z - data.position.z / 8)).toBeLessThan(16);
    const blocks = view(candidate, "nether"),
      p = candidate.position;
    expect(isSolid(blocks.getBlock(Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z)))).toBe(
      true,
    );
    expect(blocks.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))).toBe(BlockId.AIR);
    const portal = Object.entries(candidate.edits).flatMap(([key, edits]) => {
      const [cx = 0, cz = 0] = key.split(",").map(Number);
      return Object.entries(edits)
        .filter(([, id]) => id === BlockId.PORTAL)
        .map(([i]) => ({
          x: cx * 16 + (Number(i) % 16),
          y: Math.floor(Number(i) / 256),
          z: cz * 16 + Math.floor((Number(i) % 256) / 16),
        }));
    });
    expect(portal).toHaveLength(6);
    expect(portalInterior(blocks, portal[0] ?? p)).toHaveLength(6);
    expect(parseSave(encodeSave(candidate)).generator).toBe(3);
  });
  it("returns to an intact source portal instead of the old saved player position", () => {
    const data = newSession(2026, "survival", { x: 161.5, y: 35, z: -80.5 });
    frame(data, 160, 34, -81);
    const nether = travelCandidate(data, "nether", { x: 0, y: 34, z: 0 });
    nether.position = { x: 20, y: 30, z: -10 };
    const back = travelCandidate(nether, "overworld", { x: 0, y: 34, z: 0 });
    expect(back.edits).toEqual(data.edits);
    expect(back.position.y).toBe(35);
    expect(Math.abs(back.position.x - 162)).toBeLessThan(3);
    expect(Math.abs(back.position.z + 80.5)).toBeLessThan(3);
  });
  it("does not reuse a broken destination frame", () => {
    const data = newSession(2026, "survival", { x: 1.5, y: 35, z: 0.5 });
    frame(data, 0, 34, 0);
    const nether = travelCandidate(data, "nether", { x: 0, y: 34, z: 0 });
    const realm = nether.adventure?.realms.overworld;
    if (!realm) throw new Error("missing source");
    const fake = { ...data, edits: realm.edits };
    put(fake, 0, 35, 0, BlockId.AIR);
    const back = travelCandidate(nether, "overworld", { x: 0, y: 34, z: 0 });
    expect(back.edits).not.toEqual(data.edits);
    expect(view(back, "overworld").getBlock(0, 35, 0)).toBe(BlockId.AIR);
  });
  it("preserves historical revision2 fixed arrival and saved-position return", () => {
    const data = newSession(2026, "survival", { x: 120, y: 35, z: 80 });
    data.generator = 2;
    const n = travelCandidate(data, "nether", { x: 0.5, y: 34, z: 0.5 });
    expect(n.position).toEqual({ x: 0.5, y: 34, z: 0.5 });
    expect(n.edits).toEqual({});
    expect(travelCandidate(n, "overworld", { x: 0, y: 34, z: 0 }).position).toEqual(data.position);
  });
});

it("preserves an existing Overworld bed spawn while linking a return portal", () => {
  const data = newSession(2026, "survival", { x: 81.5, y: 35, z: -159.5 });
  data.spawn = { x: 72.5, y: 34, z: -152.5 };
  frame(data, 80, 34, -160);
  const nether = travelCandidate(data, "nether", { x: 0.5, y: 34, z: 0.5 });
  const returned = travelCandidate(nether, "overworld", { x: 0.5, y: 34, z: 0.5 });
  expect(returned.spawn).toEqual(data.spawn);
});

it("keeps End arrival separate from Nether portal generation", () => {
  const data = newSession(2026, "survival", { x: 81.5, y: 35, z: -159.5 });
  const spawn = { x: 0.5, y: 34, z: 0.5 };
  const end = travelCandidate(data, "end", spawn);
  expect(end.position).toEqual(spawn);
  expect(end.edits).toEqual({});
  expect(end.adventure?.dimension).toBe("end");
});
