import { must } from "../core/assert";
import { describe, expect, it } from "vitest";
import { BlockId } from "./blocks";
import { buildLightField, LIGHT_SIZE } from "./light";
const at = (
  field: ReturnType<typeof buildLightField>,
  x: number,
  y: number,
  z: number,
  channel: number,
) => {
  const p = field.origin;
  return (
    must(field.data[(((z - p.z) * LIGHT_SIZE + y - p.y) * LIGHT_SIZE + x - p.x) * 2 + channel]) / 17
  );
};
describe("voxel light propagation", () => {
  it("keeps sky at full light above ground and caves dark", () => {
    const f = buildLightField({ x: 0, y: 10, z: 0 }, (_x, y) =>
      y === 20 ? BlockId.STONE : BlockId.AIR,
    );
    expect(at(f, 0, 21, 0, 0)).toBe(15);
    expect(at(f, 0, 10, 0, 0)).toBe(0);
  });
  it("propagates torch light through air but not a complete wall", () => {
    const f = buildLightField({ x: 0, y: 10, z: 0 }, (x, y, z) =>
      x === 2 ? BlockId.STONE : x === 0 && y === 10 && z === 0 ? BlockId.TORCH : BlockId.AIR,
    );
    expect(at(f, 0, 10, 0, 1)).toBe(14);
    expect(at(f, 1, 10, 0, 1)).toBe(13);
    expect(at(f, 3, 10, 0, 1)).toBe(0);
  });
  it("removing a torch removes emitted light on rebuild", () => {
    const f = buildLightField({ x: 0, y: 10, z: 0 }, () => BlockId.AIR);
    expect(at(f, 0, 10, 0, 1)).toBe(0);
  });
});
