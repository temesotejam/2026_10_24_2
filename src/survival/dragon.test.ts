import { describe, expect, it } from "vitest";
import {
  dragonMaxHealth,
  dragonPosition,
  dragonYaw,
  rayHitsSphere,
  raySphereDistance,
} from "./dragon";
const origin = { x: 0, y: 0, z: 0 };
const forward = { x: 0, y: 0, z: 1 };
const distance = (a: ReturnType<typeof dragonPosition>, b: ReturnType<typeof dragonPosition>) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe("continuous dragon flight", () => {
  it("approaches and leaves the perch without teleporting at any phase boundary", () => {
    for (const boundary of [0, 9, 12, 20, 24, 48]) {
      expect(
        distance(dragonPosition(boundary - 0.0001), dragonPosition(boundary + 0.0001)),
      ).toBeLessThan(0.001);
      const yawDelta = dragonYaw(boundary + 0.0001) - dragonYaw(boundary - 0.0001);
      expect(Math.abs(Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta)))).toBeLessThan(0.001);
    }
  });
  it("has bounded motion during a full flight cycle and stays on the perch during attacks", () => {
    for (let frame = 1; frame <= 24 * 60; frame++)
      expect(distance(dragonPosition(frame / 60), dragonPosition((frame - 1) / 60))).toBeLessThan(
        0.35,
      );
    expect(dragonPosition(13)).toEqual({ x: 0, y: 35.5, z: 0 });
    expect(dragonPosition(19)).toEqual(dragonPosition(13));
  });
});

describe("weapon contact geometry", () => {
  it("uses the true sphere entry distance rather than its projected bounding box", () => {
    const center = { x: 0.9, y: 0, z: 3.8 };
    expect(raySphereDistance(origin, forward, center, 1)).toBeCloseTo(3.3641101);
    expect(rayHitsSphere(origin, forward, center, 1, 3)).toBe(false);
    expect(rayHitsSphere(origin, forward, center, 1, 3.5)).toBe(true);
  });
  it("handles non-unit rays, misses, spheres behind the player and an origin inside", () => {
    expect(raySphereDistance(origin, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 5 }, 1)).toBe(4);
    expect(raySphereDistance(origin, forward, { x: 3, y: 0, z: 5 }, 1)).toBeNull();
    expect(raySphereDistance(origin, forward, { x: 0, y: 0, z: -5 }, 1)).toBeNull();
    expect(raySphereDistance(origin, forward, { x: 0, y: 0, z: -0.5 }, 1)).toBe(0);
    expect(raySphereDistance(origin, origin, origin, 1)).toBeNull();
  });
});

it("uses full boss health for new worlds and preserves the legacy maximum", () => {
  expect(dragonMaxHealth(1)).toBe(120);
  expect(dragonMaxHealth(2)).toBe(120);
  expect(dragonMaxHealth(3)).toBe(200);
});
