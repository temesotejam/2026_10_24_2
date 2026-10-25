import type { SessionState } from "./session";
import type { Dimension } from "../world/adventure-terrain";
import type { Vec3 } from "../player/physics";

export const REALM_FIELDS = [
  "position",
  "spawn",
  "yaw",
  "pitch",
  "edits",
  "chests",
  "furnaces",
  "growth",
  "creatures",
  "loot",
  "arrows",
  "fluidLevels",
  "nextId",
] as const;
export type RealmState = Pick<SessionState, (typeof REALM_FIELDS)[number]>;
export type Potion = "healingPotion" | "firePotion" | "strengthPotion";
export interface AdventureState {
  dimension: Dimension;
  dragon: { health: number; phase: number; defeated: boolean };
  opened: Record<string, true>;
  xp: number;
  fire: number;
  strength: number;
  realms: Partial<Record<Dimension, RealmState>>;
  brewing: Record<string, { remaining: number; output: Potion }>;
}
export function newAdventure(): AdventureState {
  return {
    dragon: { health: 120, phase: 0, defeated: false },
    opened: {},
    dimension: "overworld",
    xp: 0,
    fire: 0,
    strength: 0,
    realms: {},
    brewing: {},
  };
}
export function realmSnapshot(data: SessionState): RealmState {
  return Object.fromEntries(
    REALM_FIELDS.map((key) => [key, structuredClone(data[key])]),
  ) as unknown as RealmState;
}
/** Build a candidate first. The caller persists it atomically before reloading. */
export function travelCandidate(
  data: SessionState,
  destination: Dimension,
  netherSpawn: Vec3,
): SessionState {
  const next = structuredClone(data);
  const adventure = (next.adventure ??= newAdventure());
  if (adventure.dimension === destination) return next;
  adventure.realms[adventure.dimension] = realmSnapshot(next);
  const target = adventure.realms[destination];
  if (target)
    for (const key of REALM_FIELDS) Object.assign(next, { [key]: structuredClone(target[key]) });
  else {
    if (destination === "overworld") throw new Error("帰還先のワールドがありません");
    next.position = { ...netherSpawn };
    next.spawn = { ...netherSpawn };
    next.yaw = 0;
    next.pitch = 0;
    next.edits = {};
    next.chests = {};
    next.furnaces = {};
    next.growth = {};
    next.creatures = [];
    next.loot = [];
    next.arrows = [];
    next.fluidLevels = {};
    next.nextId = 1;
  }
  // A brewing stand belongs to its dimension; keep jobs with an explicit prefix.
  adventure.dimension = destination;
  return next;
}

export const BREWS: Record<Potion, { name: string; ingredient: string }> = {
  healingPotion: { name: "治癒（体力+8）", ingredient: "apple" },
  firePotion: { name: "耐火（60秒）", ingredient: "glowstone" },
  strengthPotion: { name: "力（60秒）", ingredient: "bone" },
};
