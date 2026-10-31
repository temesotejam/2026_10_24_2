import { FixedStepClock } from "../core/fixed-step";
import { must } from "../core/assert";
import { hostile } from "../entities/creatures";
import { creatureRayDistance } from "../entities/creature-hitbox";
import { emptySlots, removeItem, type Slots } from "../items/inventory";
import { craft, RECIPES } from "../items/recipes";
import {
  aabbFromFeetPosition,
  aabbIntersectsSolid,
  stepPhysics,
  type MoveInput,
  type Vec3,
} from "../player/physics";
import { raycastVoxels } from "../player/raycast";
import { damage, newVitals, tickVitals, type Vitals } from "../survival/vitals";
import type { SurvivalSession } from "../survival/session";
import { BlockId, BLOCKS, isSolid } from "../world/blocks";

/** The second actor belongs to the same world but has its own body and inventory. */
export interface CompanionState {
  position: Vec3;
  velocity: Vec3;
  onGround: boolean;
  yaw: number;
  inventory: Slots;
  selected: number;
  vitals: Vitals;
  sleeping: boolean;
  bed?: Vec3;
}

export function createCompanion(session: SurvivalSession, player: Vec3): CompanionState {
  const solid = (x: number, y: number, z: number) => isSolid(session.world.getBlock(x, y, z));
  for (const [dx, dz] of [
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
    [3, 0],
    [0, 3],
  ] as const) {
    const x = Math.floor(player.x + dx) + 0.5,
      z = Math.floor(player.z + dz) + 0.5;
    for (let y = Math.floor(player.y) + 2; y >= Math.floor(player.y) - 3; y--) {
      const position = { x, y, z };
      if (
        solid(Math.floor(x), y - 1, Math.floor(z)) &&
        !aabbIntersectsSolid(aabbFromFeetPosition(position), solid)
      )
        return {
          position,
          velocity: { x: 0, y: 0, z: 0 },
          onGround: false,
          yaw: 0,
          inventory: emptySlots(36),
          selected: 0,
          vitals: newVitals(),
          sleeping: false,
        };
    }
  }
  throw new Error("協力実験の２人目を安全に配置できません");
}

export class CompanionController {
  readonly session: SurvivalSession;
  readonly state: CompanionState;
  private clock = new FixedStepClock();
  private input: MoveInput = { forward: 0, right: 0, jump: false, yaw: 0 };
  private inputRemaining = 0;
  private fallStart: number | null = null;
  private mining: { x: number; y: number; z: number; block: BlockId; remaining: number } | null =
    null;
  private deathHandled = false;
  constructor(session: SurvivalSession, state: CompanionState) {
    this.session = session;
    this.state = state;
  }

  /** Movement expires automatically, so a disconnected controller cannot run forever. */
  move(input: MoveInput, seconds: number): boolean {
    if (
      this.state.vitals.health <= 0 ||
      !Number.isFinite(seconds) ||
      seconds <= 0 ||
      seconds > 1 ||
      !Number.isFinite(input.yaw) ||
      !Number.isFinite(input.forward) ||
      !Number.isFinite(input.right) ||
      Math.abs(input.forward) > 1 ||
      Math.abs(input.right) > 1
    )
      return false;
    this.state.sleeping = false;
    delete this.state.bed;
    this.input = { ...input };
    this.inputRemaining = seconds;
    this.mining = null;
    return true;
  }

  select(slot: number): boolean {
    if (!Number.isInteger(slot) || slot < 0 || slot > 8 || this.state.vitals.health <= 0)
      return false;
    this.state.selected = slot;
    this.mining = null;
    return true;
  }

  private asCompanion<T>(action: () => T): T {
    const d = this.session.data,
      s = this.state;
    const original = {
      inventory: d.inventory,
      selected: d.selected,
      position: d.position,
      vitals: d.vitals,
    };
    d.inventory = s.inventory;
    d.selected = s.selected;
    d.position = s.position;
    d.vitals = s.vitals;
    try {
      return action();
    } finally {
      s.inventory = d.inventory;
      s.selected = d.selected;
      s.vitals = d.vitals;
      d.inventory = original.inventory;
      d.selected = original.selected;
      d.position = original.position;
      d.vitals = original.vitals;
    }
  }

  private reachable(x: number, y: number, z: number): boolean {
    if (![x, y, z].every(Number.isInteger)) return false;
    const p = this.state.position,
      origin = { x: p.x, y: p.y + 1.62, z: p.z };
    const targets = [
      { x: x + 0.5, y: y + 0.5, z: z + 0.5 },
      {
        x: Math.max(x + 0.05, Math.min(x + 0.95, p.x)),
        y: y + 0.5,
        z: Math.max(z + 0.05, Math.min(z + 0.95, p.z)),
      },
    ];
    return targets.some((target) => {
      const dir = { x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z };
      const distance = Math.hypot(dir.x, dir.y, dir.z);
      if (distance > 4.5) return false;
      const hit = raycastVoxels(origin, dir, distance + 0.1, (bx, by, bz) => {
        const b = this.session.world.getBlock(bx, by, bz);
        return b !== BlockId.AIR && b !== BlockId.WATER && b !== BlockId.LAVA;
      });
      return !!hit && hit.blockX === x && hit.blockY === y && hit.blockZ === z;
    });
  }

  mine(x: number, y: number, z: number): boolean {
    if (this.state.vitals.health <= 0 || !this.reachable(x, y, z)) return false;
    const block = this.session.world.getBlock(x, y, z);
    if (!BLOCKS[block].breakable) return false;
    const remaining = this.asCompanion(() => this.session.duration(block));
    this.mining = { x, y, z, block, remaining };
    this.inputRemaining = 0;
    return true;
  }

  place(x: number, y: number, z: number): boolean {
    // Placement uses the adjacent, reachable support block, as a player does.
    if (this.state.vitals.health <= 0 || !this.reachable(x, y - 1, z)) return false;
    const body = aabbFromFeetPosition(this.state.position);
    if (
      x < body.max.x &&
      x + 1 > body.min.x &&
      y < body.max.y &&
      y + 1 > body.min.y &&
      z < body.max.z &&
      z + 1 > body.min.z
    )
      return false;
    if (
      aabbIntersectsSolid(
        aabbFromFeetPosition(this.session.data.position),
        (bx, by, bz) => bx === x && by === y && bz === z,
      )
    )
      return false;
    return this.asCompanion(() => this.session.place(x, y, z));
  }

  eat(): boolean {
    return this.asCompanion(() => this.session.eat());
  }

  attack(id: number): boolean {
    if (!Number.isInteger(id) || this.state.vitals.health <= 0) return false;
    const mob = this.session.data.creatures.find((m) => m.id === id && m.hp > 0);
    if (!mob) return false;
    const p = this.state.position,
      origin = { x: p.x, y: p.y + 1.62, z: p.z };
    const direction = {
      x: mob.position.x - origin.x,
      y: mob.position.y + 0.8 - origin.y,
      z: mob.position.z - origin.z,
    };
    const distance = creatureRayDistance(mob, origin, direction);
    if (distance === null || distance > 3) return false;
    const obstruction = raycastVoxels(origin, direction, distance, (x, y, z) =>
      isSolid(this.session.world.getBlock(x, y, z)),
    );
    if (obstruction) return false;
    return this.asCompanion(() => this.session.hitCreature(id, "companion"));
  }

  craft(id: string, table?: { x: number; y: number; z: number }): boolean {
    const recipe = RECIPES.find((r) => r.id === id);
    if (!recipe || this.state.vitals.health <= 0) return false;
    if (
      recipe.station === 3 &&
      (!table ||
        this.session.world.getBlock(table.x, table.y, table.z) !== BlockId.TABLE ||
        !this.reachable(table.x, table.y, table.z))
    )
      return false;
    const inventory = structuredClone(this.state.inventory);
    const grid = emptySlots(recipe.station ** 2);
    for (let y = 0; y < recipe.pattern.length; y++) {
      const row = must(recipe.pattern[y]);
      for (let x = 0; x < row.length; x++) {
        const ingredient = recipe.keys[must(row[x])];
        if (!ingredient) continue;
        const slot = inventory.findIndex((item) => item?.id === ingredient);
        if (slot < 0) return false;
        grid[y * recipe.station + x] = { ...must(inventory[slot]), count: 1 };
        removeItem(inventory, slot);
      }
    }
    if (!craft(grid, recipe.station, inventory)) return false;
    this.state.inventory.splice(0, this.state.inventory.length, ...inventory);
    return true;
  }

  sleep(x: number, y: number, z: number): boolean {
    if (
      this.state.vitals.health <= 0 ||
      !this.session.isNight ||
      this.session.world.dimension !== "overworld" ||
      this.session.world.getBlock(x, y, z) !== BlockId.BED ||
      !this.reachable(x, y, z) ||
      this.session.data.creatures.some(
        (m) =>
          m.hp > 0 &&
          hostile(m) &&
          (m.species !== "wanderer" || m.fuse === 2) &&
          Math.abs(m.position.y - y) < 5 &&
          Math.hypot(m.position.x - x, m.position.z - z) < 8,
      )
    )
      return false;
    this.state.sleeping = true;
    this.state.bed = { x, y, z };
    this.inputRemaining = 0;
    return true;
  }

  update(dt: number): void {
    this.clock.advance(dt, (step) => {
      const s = this.state;
      if (s.vitals.health <= 0) {
        if (!this.deathHandled) {
          for (const item of s.inventory) if (item) this.session.drop(item, s.position);
          s.inventory = emptySlots(36);
          s.sleeping = false;
          this.deathHandled = true;
        }
        return;
      }
      const before = s.position;
      const input =
        this.inputRemaining > 0 && !s.sleeping
          ? this.input
          : { forward: 0, right: 0, jump: false, yaw: s.yaw };
      const solid = (x: number, y: number, z: number) =>
        !this.session.world.hasChunk(Math.floor(x / 16), Math.floor(z / 16)) ||
        isSolid(this.session.world.getBlock(x, y, z));
      const water = (x: number, y: number, z: number) =>
        this.session.world.getBlock(x, y, z) === BlockId.WATER;
      const next = stepPhysics(s, input, step, solid, water);
      s.position = next.position;
      s.velocity = next.velocity;
      s.onGround = next.onGround;
      s.yaw = input.yaw;
      this.inputRemaining = Math.max(0, this.inputRemaining - step);
      if (!s.onGround) this.fallStart = Math.max(this.fallStart ?? s.position.y, s.position.y);
      else if (this.fallStart !== null) {
        damage(s.vitals, Math.max(0, Math.floor(this.fallStart - s.position.y - 3)));
        this.fallStart = null;
      }
      const x = Math.floor(s.position.x),
        y = Math.floor(s.position.y),
        z = Math.floor(s.position.z);
      const head = this.session.world.getBlock(x, Math.floor(s.position.y + 1.5), z);
      if (!this.session.creative)
        tickVitals(
          s.vitals,
          step,
          Math.hypot(s.position.x - before.x, s.position.z - before.z),
          head === BlockId.WATER,
          [BlockId.LAVA, BlockId.FIRE].includes(
            this.session.world.getBlock(x, y, z) as typeof BlockId.LAVA,
          ),
          isSolid(head),
        );
      if (y < -8 && !this.session.creative) damage(s.vitals, 20);
      const task = this.mining;
      if (task) {
        if (
          this.session.world.getBlock(task.x, task.y, task.z) !== task.block ||
          !this.reachable(task.x, task.y, task.z)
        )
          this.mining = null;
        else if ((task.remaining -= step) <= 0) {
          this.asCompanion(() => this.session.mine(task.x, task.y, task.z));
          this.mining = null;
        }
      }
    });
  }
}
