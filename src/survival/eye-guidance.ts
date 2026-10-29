import type { Vec3 } from "../player/physics";
import { deriveSeed } from "../world/rng";

export function eyeDirection(origin: Vec3, destination: Vec3): string {
  if (Math.hypot(destination.x - origin.x, destination.z - origin.z) < 16) return "足元の地下";
  const bearing = Math.atan2(destination.x - origin.x, origin.z - destination.z);
  return (
    ["北", "北東", "東", "南東", "南", "南西", "西", "北西"][
      ((Math.round(bearing / (Math.PI / 4)) % 8) + 8) % 8
    ] ?? "地下"
  );
}
export function eyeBreaks(seed: number, throws: number): boolean {
  return (deriveSeed(seed, throws ^ 0xe7e) >>> 0) % 5 === 0;
}
