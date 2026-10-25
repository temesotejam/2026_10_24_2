import type { Vec3 } from "../player/physics";
export function dragonPosition(phase: number): Vec3 {
  const cycle = phase % 24;
  return cycle < 12
    ? {
        x: Math.cos((cycle * Math.PI) / 6) * 18,
        y: 43 + Math.sin(cycle) * 2,
        z: Math.sin((cycle * Math.PI) / 6) * 18,
      }
    : { x: 0, y: 35.5, z: 0 };
}
export function rayHitsSphere(
  origin: Vec3,
  direction: Vec3,
  center: Vec3,
  radius: number,
  reach: number,
): boolean {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length === 0) return false;
  const dx = center.x - origin.x,
    dy = center.y - origin.y,
    dz = center.z - origin.z;
  const along = (dx * direction.x + dy * direction.y + dz * direction.z) / length;
  return (
    along >= 0 &&
    along - radius <= reach &&
    dx * dx + dy * dy + dz * dz - along * along <= radius * radius
  );
}
