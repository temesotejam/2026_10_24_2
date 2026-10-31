import { describe, expect, it } from "vitest";
import { observerYaw } from "./observer-camera";

const eye = { x: 0.5, y: 2, z: 0.5 };
describe("second player's observer camera", () => {
  it("uses the actor's direction when the trailing view is clear", () => {
    expect(observerYaw(eye, 0, 0, () => false)).toBe(0);
  });
  it("turns to a clearer side when a wall blocks the trailing camera", () => {
    const yaw = observerYaw(eye, 0, 0, (_x, _y, z) => z >= 1);
    expect(Math.abs(yaw)).toBeGreaterThan(0.5);
  });
  it("accounts for the camera's width when the center ray misses a corner", () => {
    const closeToEdge = { x: 0.94, y: 2, z: 0.5 };
    const yaw = observerYaw(closeToEdge, 0, 0, (x, _y, z) => x === 1 && z >= 1);
    expect(Math.abs(yaw)).toBeGreaterThan(0.5);
  });
});
