import { BlockId, isSolid } from "../world/blocks";
import type { World } from "../world/world";
import { stepPhysics, type PlayerPhysicsState, type Vec3 } from "../player/physics";
import { stack, type Stack } from "../items/catalog";

export type Species =
  | "pig"
  | "cow"
  | "sheep"
  | "chicken"
  | "zombie"
  | "skeleton"
  | "mossling"
  | "spider"
  | "villager"
  | "ember"
  | "wanderer";
export interface Creature extends PlayerPhysicsState {
  id: number;
  species: Species;
  hp: number;
  age: number;
  cooldown: number;
  intent: number;
  love: number;
  fuse?: number;
}
export interface Loot {
  id: number;
  position: Vec3;
  stack: Stack;
  age: number;
}
export interface Arrow {
  position: Vec3;
  velocity: Vec3;
  age: number;
}
export const FRIENDLY: readonly Species[] = ["pig", "cow", "sheep", "chicken"];
export const COLORS: Record<Species, number> = {
  wanderer: 0x484052,
  villager: 0x9f795e,
  ember: 0xe2a24c,
  pig: 0xdba4a0,
  cow: 0x91745b,
  sheep: 0xe6e0d0,
  chicken: 0xd8c786,
  zombie: 0x7e9462,
  skeleton: 0xc5c6b5,
  mossling: 0x689662,
  spider: 0x594a57,
};
export function hostile(m: Creature): boolean {
  return m.species !== "villager" && !FRIENDLY.includes(m.species);
}
export function creatureDrops(m: Creature): Stack[] {
  if (m.species === "villager") return [];
  if (m.species === "wanderer") return [stack("enderPearl")];
  if (m.species === "ember") return [stack("blazeRod")];
  if (m.species === "spider") return [stack("string", 2)];
  return FRIENDLY.includes(m.species)
    ? [
        stack("rawMeat", m.species === "cow" ? 3 : 1),
        ...(m.species === "sheep" ? [stack("wool", 2)] : []),
      ]
    : m.species === "skeleton"
      ? [stack("bone", 2)]
      : [];
}
export function moveCreature(m: Creature, target: Vec3, world: World, dt: number): void {
  const d = Math.hypot(target.x - m.position.x, target.z - m.position.z);
  const aggressive = hostile(m) && (m.species !== "wanderer" || m.fuse === 2);
  const flee = !aggressive && m.cooldown > 0;
  let yaw = Math.atan2(-(target.x - m.position.x), -(target.z - m.position.z));
  let forward = d < 1.3 ? 0 : 0.32;
  if (m.species === "skeleton" && d < 7) forward = -0.25;
  if (!aggressive) {
    yaw = flee ? yaw + Math.PI : m.intent;
    forward = flee ? 0.5 : 0.12;
  }
  if (aggressive || flee) m.intent = yaw;
  if (d > 32) return; // Dormant distant creatures do not run collision or AI.
  const aheadX = Math.floor(m.position.x - Math.sin(yaw) * 0.7);
  const aheadZ = Math.floor(m.position.z - Math.cos(yaw) * 0.7);
  const next = stepPhysics(
    m,
    {
      yaw,
      forward,
      right: 0,
      jump: m.onGround && isSolid(world.getBlock(aheadX, Math.floor(m.position.y), aheadZ)),
    },
    dt,
    (x, y, z) => isSolid(world.getBlock(x, y, z)),
    (x, y, z) => world.getBlock(x, y, z) === BlockId.WATER,
  );
  Object.assign(m, next);
}
