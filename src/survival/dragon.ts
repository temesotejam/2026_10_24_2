import type { Vec3 } from "../player/physics";

export const dragonMaxHealth = (generator: number): number => (generator >= 3 ? 200 : 120);

const smooth = (value: number) => value * value * (3 - 2 * value);
const cycleAt = (phase: number) => ((phase % 24) + 24) % 24;

/** A continuous orbit, approach, perch and takeoff. Position and first
 * derivative agree at each phase boundary, including the cycle wrap. */
export function dragonPosition(phase: number): Vec3 {
  const cycle = cycleAt(phase);
  if (cycle < 9) {
    const angle = smooth(cycle / 9) * Math.PI * 2;
    return { x: Math.cos(angle) * 18, y: 43 + Math.sin(angle * 2) * 2, z: Math.sin(angle) * 18 };
  }
  const travel =
    cycle < 12 ? 1 - smooth((cycle - 9) / 3) : cycle < 20 ? 0 : smooth((cycle - 20) / 4);
  return { x: 18 * travel, y: 35.5 + 7.5 * travel, z: 0 };
}

export function dragonYaw(phase: number): number {
  const cycle = cycleAt(phase);
  if (cycle < 9) return Math.PI - smooth(cycle / 9) * Math.PI * 2;
  if (cycle < 12) return Math.PI * (1 - smooth((cycle - 9) / 3));
  return cycle < 20 ? 0 : Math.PI * smooth((cycle - 20) / 4);
}

/** First forward contact with a sphere, in world units; null for a miss.
 * Comparing the true entry point prevents diagonal hits beyond weapon reach. */
export function raySphereDistance(
  origin: Vec3,
  direction: Vec3,
  center: Vec3,
  radius: number,
): number | null {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length === 0) return null;
  const dx = center.x - origin.x,
    dy = center.y - origin.y,
    dz = center.z - origin.z;
  const along = (dx * direction.x + dy * direction.y + dz * direction.z) / length;
  const discriminant = radius * radius - (dx * dx + dy * dy + dz * dz - along * along);
  if (discriminant < 0) return null;
  const half = Math.sqrt(discriminant);
  if (along + half < 0) return null;
  return Math.max(0, along - half);
}

export function rayHitsSphere(
  origin: Vec3,
  direction: Vec3,
  center: Vec3,
  radius: number,
  reach: number,
): boolean {
  const distance = raySphereDistance(origin, direction, center, radius);
  return distance !== null && distance <= reach;
}
