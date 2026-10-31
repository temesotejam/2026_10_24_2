import { raycastVoxels } from "./raycast";
import type { SolidQuery, Vec3 } from "./physics";

const delta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Pick a nearby viewing angle when a wall would put the camera inside the actor. */
export function observerYaw(
  eye: Vec3,
  preferred: number,
  previous: number,
  solid: SolidQuery,
): number {
  const clearance = (yaw: number) => {
    const direction = {
      x: Math.sin(yaw) * Math.cos(0.18),
      y: Math.sin(0.18),
      z: Math.cos(yaw) * Math.cos(0.18),
    };
    let distance = 4;
    for (const x of [-0.15, 0.15])
      for (const y of [-0.15, 0.15])
        for (const z of [-0.15, 0.15]) {
          const hit = raycastVoxels(
            { x: eye.x + x, y: eye.y + y, z: eye.z + z },
            direction,
            4,
            solid,
          );
          if (hit) distance = Math.min(distance, Math.max(0, hit.distance - 0.18));
        }
    return distance;
  };
  const direct = clearance(preferred);
  if (direct >= 3.3) return preferred;
  const candidates = [
    0,
    Math.PI / 4,
    -Math.PI / 4,
    Math.PI / 2,
    -Math.PI / 2,
    (3 * Math.PI) / 4,
    (-3 * Math.PI) / 4,
    Math.PI,
  ];
  let best = preferred,
    bestScore = direct - 0.18 * Math.abs(delta(previous, preferred));
  for (const offset of candidates) {
    const yaw = preferred + offset;
    const score = clearance(yaw) - 0.18 * Math.abs(offset) - 0.18 * Math.abs(delta(previous, yaw));
    if (score > bestScore) {
      best = yaw;
      bestScore = score;
    }
  }
  return best;
}
