import { describe, expect, it } from "vitest";
import { ThirdPersonCamera } from "./third-person-camera";
const eye = { x: 0.5, y: 3.62, z: 0.5 };
const still = { x: 0, y: 0, z: 0 };
const open = () => false;

describe("steady third-person framing", () => {
  it("keeps the closer framing through short gaps, then returns at a bounded speed", () => {
    const camera = new ThirdPersonCamera();
    const wall = (_x: number, _y: number, z: number) => z === 2;
    camera.update(eye, still, 0, 0, false, 1 / 60, true, wall);
    const near = camera.distance;
    for (let i = 0; i < 25; i++) camera.update(eye, still, 0, 0, false, 1 / 60, false, open);
    expect(camera.distance).toBe(near);
    camera.update(eye, still, 0, 0, false, 1 / 60, false, wall);
    for (let i = 0; i < 25; i++) camera.update(eye, still, 0, 0, false, 1 / 60, false, open);
    expect(camera.distance).toBe(near);
    for (let i = 0; i < 300; i++) {
      const previous = camera.distance;
      camera.update(eye, still, 0, 0, false, 1 / 60, false, open);
      expect(camera.distance - previous).toBeLessThanOrEqual(1.6 / 60 + 1e-8);
    }
    expect(camera.distance).toBeGreaterThan(3.97);
  });

  it("anticipates backing toward a wall without a sudden contraction or crossing it", () => {
    const camera = new ThirdPersonCamera();
    const wall = (_x: number, _y: number, z: number) => z >= 7;
    camera.update(eye, still, 0, 0, false, 1 / 60, true, wall);
    let largestChange = 0;
    for (let i = 1; i <= 65; i++) {
      const at = { ...eye, z: eye.z + (i * 4.317) / 60 };
      const previous = camera.distance;
      camera.update(at, { x: 0, y: 0, z: 4.317 }, 0, 0, false, 1 / 60, false, wall);
      largestChange = Math.max(largestChange, previous - camera.distance);
      expect(at.z + camera.distance + 0.15).toBeLessThan(7);
    }
    expect(camera.distance).toBeLessThan(1.6);
    expect(largestChange).toBeLessThanOrEqual(6 / 60 + 1e-8);
  });

  it("slows the orbit instead of snapping inward when looking around a pillar", () => {
    const camera = new ThirdPersonCamera();
    const pillar = (x: number, _y: number, z: number) => x >= 1 && z >= 1;
    camera.update(eye, still, 0, 0, false, 1 / 60, true, pillar);
    let largestChange = 0;
    for (let i = 0; i < 180; i++) {
      const previous = camera.distance;
      camera.update(eye, still, Math.PI / 2, 0, false, 1 / 60, false, pillar);
      largestChange = Math.max(largestChange, previous - camera.distance);
    }
    expect(largestChange).toBeLessThanOrEqual(6 / 60 + 1e-8);
    expect(camera.yaw).toBeCloseTo(Math.PI / 2, 2);
  });

  it("uses the shortest orbit across the yaw wrap and still handles a newly placed wall safely", () => {
    const camera = new ThirdPersonCamera();
    camera.update(eye, still, Math.PI - 0.01, 0, false, 1 / 60, true, open);
    camera.update(eye, still, -Math.PI + 0.01, 0, false, 1 / 60, false, open);
    expect(camera.yaw).toBeGreaterThan(Math.PI - 0.01);
    expect(camera.yaw).toBeLessThan(Math.PI + 0.01);
    camera.update(eye, still, 0, 0, false, 1 / 60, true, open);
    camera.update(eye, still, 0, 0, false, 1 / 60, false, (_x, _y, z) => z === 2);
    expect(camera.distance).toBeLessThan(1.3);
  });
});
