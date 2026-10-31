import type { Creature, Species } from "./creatures";
import type { Vec3 } from "../player/physics";

/** Local -Z faces forward. Include the head and torso, not a human-height
 * sphere shared by chickens, spiders and tall enemies. */
const BOUNDS: Record<Species, { x: number; height: number; back: number; front: number }> = {
  pig: { x: 0.38, height: 1.19, back: 0.57, front: 0.96 },
  cow: { x: 0.46, height: 1.57, back: 0.58, front: 1.12 },
  sheep: { x: 0.55, height: 1.3, back: 0.58, front: 0.98 },
  chicken: { x: 0.34, height: 1.17, back: 0.4, front: 0.61 },
  zombie: { x: 0.52, height: 1.96, back: 0.26, front: 0.66 },
  skeleton: { x: 0.5, height: 1.85, back: 0.24, front: 0.52 },
  mossling: { x: 0.58, height: 1.96, back: 0.29, front: 0.44 },
  spider: { x: 1.03, height: 0.64, back: 0.64, front: 0.72 },
  villager: { x: 0.38, height: 2.06, back: 0.28, front: 0.54 },
  ember: { x: 0.64, height: 1.91, back: 0.64, front: 0.64 },
  wanderer: { x: 0.36, height: 2.15, back: 0.22, front: 0.23 },
};

function localPoint(mob: Creature, point: Vec3): Vec3 {
  const x = point.x - mob.position.x,
    z = point.z - mob.position.z;
  const c = Math.cos(mob.intent),
    s = Math.sin(mob.intent);
  return { x: c * x - s * z, y: point.y - mob.position.y, z: s * x + c * z };
}
function limits(mob: Creature) {
  const b = BOUNDS[mob.species],
    scale = mob.age < 0 ? 0.6 : 1;
  return {
    min: [-b.x * scale, 0, -b.front * scale] as const,
    max: [b.x * scale, b.height * scale, b.back * scale] as const,
  };
}

/** Ray entry distance in world units, including when the center is out of
 * reach. Used for melee and feeding; callers still clip against terrain. */
export function creatureRayDistance(mob: Creature, origin: Vec3, direction: Vec3): number | null {
  if (mob.hp <= 0) return null;
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length === 0) return null;
  const p = localPoint(mob, origin),
    c = Math.cos(mob.intent),
    s = Math.sin(mob.intent);
  const d = [
    (c * direction.x - s * direction.z) / length,
    direction.y / length,
    (s * direction.x + c * direction.z) / length,
  ] as const;
  const o = [p.x, p.y, p.z] as const,
    b = limits(mob);
  let near = 0,
    far = Infinity;
  for (const axis of [0, 1, 2] as const) {
    const v = d[axis],
      at = o[axis],
      min = b.min[axis],
      max = b.max[axis];
    if (Math.abs(v) < 1e-10) {
      if (at < min || at > max) return null;
      continue;
    }
    const a = (min - at) / v,
      z = (max - at) / v;
    near = Math.max(near, Math.min(a, z));
    far = Math.min(far, Math.max(a, z));
    if (near > far) return null;
  }
  return near;
}

/** Small arrow thickness, applied to the same body used by melee. */
export function creatureContainsPoint(mob: Creature, point: Vec3): boolean {
  if (mob.hp <= 0) return false;
  const p = localPoint(mob, point),
    b = limits(mob),
    epsilon = 0.04;
  const values = [p.x, p.y, p.z] as const;
  return ([0, 1, 2] as const).every(
    (axis) => values[axis] >= b.min[axis] - epsilon && values[axis] <= b.max[axis] + epsilon,
  );
}
