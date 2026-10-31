import { meleeDamage } from "./melee-damage";
import { structureLoot } from "../items/structure-loot";
import { BREWS, newAdventure, type AdventureState } from "./adventure-state";
import { structureBlocks, structuresNear } from "../world/adventure-terrain";
import { createColumnSampler } from "../world/terrain";
import { portalInterior } from "./adventure";
import { must } from "../core/assert";
import { raycastVoxels } from "../player/raycast";
import { FixedStepClock } from "../core/fixed-step";
import { type Vec3 } from "../player/physics";
import { BlockId, BLOCKS, isSolid } from "../world/blocks";
import type { World } from "../world/world";
import { ITEMS, stack, type Stack } from "../items/catalog";
import {
  addItem,
  emptySlots,
  newFurnace,
  removeItem,
  tickFurnace,
  wearTool,
  type FurnaceState,
  type Slots,
} from "../items/inventory";
import { blockDrops, miningSeconds } from "../items/mining";
import { damage, newVitals, tickVitals, type Vitals } from "./vitals";
import {
  FRIENDLY,
  creatureDrops,
  hostile,
  moveCreature,
  type Arrow,
  type Creature,
  type Loot,
  type Species,
} from "../entities/creatures";
import { DAY_LENGTH_SECONDS, STARTUP_PHASE, isNightAt } from "../render/sky";
import { deriveSeed, mulberry32 } from "../world/rng";
export type GameMode = "survival" | "creative";
export interface SessionState {
  version: 1;
  generator: 1 | 2 | 3;
  adventure?: AdventureState;
  seed: number;
  mode: GameMode;
  inventory: Slots;
  selected: number;
  vitals: Vitals;
  time: number;
  spawn: Vec3;
  position: Vec3;
  yaw: number;
  pitch: number;
  chests: Record<string, Slots>;
  furnaces: Record<string, FurnaceState>;
  growth: Record<string, number>;
  creatures: Creature[];
  loot: Loot[];
  arrows: Arrow[];
  nextId: number;
  grid: Slots;
  gridSize: 2 | 3;
  edits: Record<string, Record<string, number>>;
  fluidLevels: Record<string, number>;
}
export const blockKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
export function parseBlockKey(key: string): [number, number, number] {
  return key.split(",").map(Number) as [number, number, number];
}
export function newSession(seed: number, mode: GameMode, spawn: Vec3): SessionState {
  const inventory = emptySlots(36);
  if (mode === "creative")
    ["grass", "dirt", "stone", "sand", "log", "leaves", "snow", "torch", "table"].forEach(
      (id, i) => (inventory[i] = stack(id, 64)),
    );
  return {
    version: 1,
    generator: 3,
    adventure: newAdventure(),
    seed,
    mode,
    inventory,
    selected: 0,
    vitals: newVitals(),
    time: STARTUP_PHASE * DAY_LENGTH_SECONDS,
    spawn,
    position: spawn,
    yaw: 0,
    pitch: 0,
    chests: {},
    furnaces: {},
    growth: {},
    creatures: [],
    loot: [],
    arrows: [],
    nextId: 1,
    grid: emptySlots(4),
    gridSize: 2,
    edits: {},
    fluidLevels: {},
  };
}
export interface PlayerSample {
  position: Vec3;
  onGround: boolean;
  yaw: number;
  pitch: number;
}
export class SurvivalSession {
  readonly data: SessionState;
  private clock = new FixedStepClock();
  private random: () => number;
  private mobTimer = 0;
  private simulationTicks = 0;
  private fallStart: number | null = null;
  private attackCooldown = 0;
  onChange: (() => void) | undefined;
  onDeath: (() => void) | undefined;
  notice: ((text: string) => void) | undefined;
  readonly world: World;
  readonly edit: (x: number, y: number, z: number, id: BlockId) => void;
  constructor(
    world: World,
    data: SessionState,
    edit: (x: number, y: number, z: number, id: BlockId) => void,
  ) {
    this.world = world;
    this.edit = edit;
    this.data = data;
    data.adventure ??= newAdventure(data.generator);
    this.random = mulberry32(deriveSeed(data.seed, 10247));
  }
  get held(): Stack | null {
    return this.data.inventory[this.data.selected] ?? null;
  }
  get creative(): boolean {
    return this.data.mode === "creative";
  }
  get dead(): boolean {
    return this.data.vitals.health <= 0;
  }
  drop(item: Stack, position = this.data.position): void {
    // Bounded count, but never silently destroy a player's items at the cap.
    const same = this.data.loot.find(
      (l) =>
        l.stack.id === item.id &&
        l.stack.durability === item.durability &&
        Math.hypot(
          l.position.x - position.x,
          l.position.y - position.y,
          l.position.z - position.z,
        ) < 1 &&
        l.stack.count + item.count <= 64,
    );
    if (same) same.stack.count += item.count;
    else
      this.data.loot.push({
        id: this.data.nextId++,
        stack: { ...item },
        position: { ...position },
        age: 0,
      });
  }
  collect(item: Stack): void {
    const left = addItem(this.data.inventory, item);
    if (left) this.drop({ ...item, count: left });
    this.onChange?.();
  }
  mine(x: number, y: number, z: number): boolean {
    const id = this.world.getBlock(x, y, z);
    if (!BLOCKS[id].breakable) return false;
    if (!this.creative) {
      for (const item of blockDrops(id, this.held, this.random()))
        this.drop(item, { x: x + 0.5, y: y + 0.25, z: z + 0.5 });
      wearTool(this.data.inventory, this.data.selected);
    }
    if (id === BlockId.CHEST) this.chest(x, y, z);
    if (
      !this.creative &&
      [BlockId.COAL_ORE, BlockId.IRON_ORE, BlockId.GOLD_ORE, BlockId.DIAMOND_ORE].includes(
        id as typeof BlockId.COAL_ORE,
      )
    )
      must(this.data.adventure).xp = Math.min(1000000, must(this.data.adventure).xp + 1);
    const key = blockKey(x, y, z);
    const brewKey = `${must(this.data.adventure).dimension}:${key}`;
    const brew = must(this.data.adventure).brewing[brewKey];
    if (brew) {
      if (brew.remaining === 0) this.drop(stack(brew.output), { x, y, z });
      else
        for (const id of [
          "waterBottle",
          "netherWart",
          "blazePowder",
          BREWS[brew.output].ingredient,
        ])
          this.drop(stack(id), { x, y, z });
      Reflect.deleteProperty(must(this.data.adventure).brewing, brewKey);
    }
    for (const item of this.data.chests[key] ?? []) if (item) this.drop(item, { x, y: y + 0.5, z });
    for (const item of this.data.furnaces[key]?.slots ?? [])
      if (item) this.drop(item, { x, y: y + 0.5, z });
    Reflect.deleteProperty(this.data.chests, key);
    Reflect.deleteProperty(this.data.furnaces, key);
    Reflect.deleteProperty(this.data.growth, key);
    this.edit(x, y, z, BlockId.AIR);
    if (id === BlockId.OBSIDIAN) {
      for (let dx = -3; dx <= 3; dx++)
        for (let dy = -4; dy <= 4; dy++)
          for (let dz = -3; dz <= 3; dz++) {
            const p = { x: x + dx, y: y + dy, z: z + dz };
            if (
              this.world.getBlock(p.x, p.y, p.z) === BlockId.PORTAL &&
              !portalInterior(this.world, p)
            )
              this.edit(p.x, p.y, p.z, BlockId.AIR);
          }
    }
    this.onChange?.();
    return true;
  }
  duration(id: BlockId): number {
    return this.creative ? 0 : miningSeconds(id, this.held);
  }
  place(x: number, y: number, z: number): boolean {
    const item = this.held;
    const block = item ? ITEMS[item.id]?.block : undefined;
    if (
      block === undefined ||
      ![BlockId.AIR, BlockId.WATER, BlockId.LAVA].includes(
        this.world.getBlock(x, y, z) as typeof BlockId.AIR,
      ) ||
      y < 1 ||
      y >= 95
    )
      return false;
    const below = this.world.getBlock(x, y - 1, z);
    if (this.world.dimension === "nether" && block === BlockId.WATER) return false;
    if (block === BlockId.NETHER_WART && below !== BlockId.SOUL_SAND) {
      this.notice?.("ネザーウォートはソウルサンドに植えます");
      return false;
    }
    if (block === BlockId.CROP && below !== BlockId.FARMLAND) {
      this.notice?.("種はクワで耕した土に植えます");
      return false;
    }
    if ((block === BlockId.SAPLING || block === BlockId.TORCH) && !isSolid(below)) return false;
    if (!this.creative) {
      removeItem(this.data.inventory, this.data.selected);
      if (item?.id.endsWith("Bucket")) this.collect(stack("bucket"));
    }
    this.edit(x, y, z, block);
    if (block === BlockId.CROP || block === BlockId.SAPLING || block === BlockId.NETHER_WART)
      this.data.growth[blockKey(x, y, z)] = 0;
    this.onChange?.();
    return true;
  }
  eat(): boolean {
    const value = this.held ? ITEMS[this.held.id]?.food : undefined;
    if (!value || this.dead || this.data.vitals.hunger >= 20) return false;
    this.data.vitals.hunger = Math.min(20, this.data.vitals.hunger + value);
    if (!this.creative) removeItem(this.data.inventory, this.data.selected);
    this.onChange?.();
    return true;
  }
  till(x: number, y: number, z: number): boolean {
    const block = this.world.getBlock(x, y, z);
    if (
      !this.held ||
      ITEMS[this.held.id]?.tool !== "hoe" ||
      ![BlockId.DIRT, BlockId.GRASS].includes(block as typeof BlockId.DIRT) ||
      this.world.getBlock(x, y + 1, z) !== BlockId.AIR
    )
      return false;
    this.edit(x, y, z, BlockId.FARMLAND);
    if (!this.creative) wearTool(this.data.inventory, this.data.selected);
    return true;
  }
  sleep(x: number, y: number, z: number): void {
    if (this.world.dimension !== "overworld") {
      this.notice?.("この世界では眠れません。帰還ゲートで通常世界へ戻ってください");
      return;
    }
    // Respawn beside the bed, not inside its full-block collision box.
    const place = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].find(
      ([dx, dz]) =>
        !isSolid(this.world.getBlock(x + must(dx), y, z + must(dz))) &&
        !isSolid(this.world.getBlock(x + must(dx), y + 1, z + must(dz))) &&
        isSolid(this.world.getBlock(x + must(dx), y - 1, z + must(dz))),
    );
    if (!place) {
      this.notice?.("ベッドの隣に立てる場所を空けてください");
      return;
    }
    this.data.spawn = { x: x + must(place[0]) + 0.5, y, z: z + must(place[1]) + 0.5 };
    if (this.isNight) {
      if (
        this.data.creatures.some(
          (m) => hostile(m) && Math.hypot(m.position.x - x, m.position.z - z) < 8,
        )
      ) {
        this.notice?.("近くに敵がいます");
        return;
      }
      this.data.time =
        (Math.floor(this.data.time / DAY_LENGTH_SECONDS) + 1) * DAY_LENGTH_SECONDS +
        DAY_LENGTH_SECONDS * 0.25;
      this.notice?.("朝になりました。復活地点を設定しました");
    } else this.notice?.("復活地点を設定しました。夜は眠れます");
    this.onChange?.();
  }
  get isNight(): boolean {
    return this.world.dimension === "nether" || isNightAt(this.data.time);
  }
  hitCreature(id: number): void {
    if (this.attackCooldown > 0 || this.dead) return;
    const mob = this.data.creatures.find((m) => m.id === id);
    if (!mob) return;
    const item = this.held ? ITEMS[this.held.id] : undefined;
    mob.hp -=
      (this.data.adventure?.strength ? 4 : 0) + (item?.enchanted ? 2 : 0) + meleeDamage(item);
    mob.cooldown = 0.7;
    if (mob.species === "wanderer") mob.fuse = 2;
    this.attackCooldown = 0.4;
    if (!this.creative) wearTool(this.data.inventory, this.data.selected);
    this.removeDead();
  }
  shootCreature(id: number, amount: number): void {
    const mob = this.data.creatures.find((m) => m.id === id);
    if (!mob || this.dead) return;
    if (mob.species === "wanderer") mob.fuse = 2;
    mob.hp -= amount;
    mob.cooldown = 0.7;
    this.removeDead();
    this.onChange?.();
  }
  feedCreature(id: number): boolean {
    const mob = this.data.creatures.find((m) => m.id === id);
    if (
      !mob ||
      mob.species === "villager" ||
      hostile(mob) ||
      this.held?.id !== (mob.species === "chicken" ? "seeds" : "wheat")
    )
      return false;
    if (mob.love > 0 || mob.age < 0) return true;
    mob.love = 30;
    if (!this.creative) removeItem(this.data.inventory, this.data.selected);
    this.onChange?.();
    return true;
  }
  hurt(amount: number): void {
    if (!this.creative && damage(this.data.vitals, amount)) {
      this.onChange?.();
      if (this.dead) this.die();
    }
  }
  private die(): void {
    if (this.data.generator >= 3 && this.data.adventure) {
      this.data.adventure.xp = 0;
      this.data.adventure.fire = 0;
      this.data.adventure.strength = 0;
    }
    for (const item of this.data.inventory) if (item) this.drop(item);
    this.data.inventory = emptySlots(36);
    for (const item of this.data.grid) if (item) this.drop(item);
    this.data.grid = emptySlots(this.data.gridSize ** 2);
    this.onDeath?.();
    this.onChange?.();
  }
  respawn(): void {
    this.data.vitals = newVitals();
    const spawn = this.data.spawn;
    let safe: Vec3 | null = null;
    const offsets = [0, 1, -1, 2, -2];
    const heights = [Math.floor(spawn.y), ...Array.from({ length: 94 }, (_v, i) => 94 - i)];
    for (const y of heights) {
      for (const dx of offsets)
        for (const dz of offsets) {
          const x = Math.floor(spawn.x) + dx,
            z = Math.floor(spawn.z) + dz;
          const feet = this.world.getBlock(x, y, z),
            head = this.world.getBlock(x, y + 1, z);
          if (
            y > 0 &&
            y < 95 &&
            isSolid(this.world.getBlock(x, y - 1, z)) &&
            feet === BlockId.AIR &&
            head === BlockId.AIR
          ) {
            safe = { x: x + 0.5, y, z: z + 0.5 };
            break;
          }
        }
      if (safe) break;
    }
    this.data.position = safe ?? { ...spawn };
    this.fallStart = null;
    this.onChange?.();
  }
  tick(dt: number, player: PlayerSample): void {
    const distance = Math.hypot(
      player.position.x - this.data.position.x,
      player.position.z - this.data.position.z,
    );
    this.data.position = { ...player.position };
    this.data.yaw = player.yaw;
    this.data.pitch = player.pitch;
    if (this.dead) return;
    if (!player.onGround)
      this.fallStart = Math.max(this.fallStart ?? player.position.y, player.position.y);
    else if (this.fallStart !== null) {
      this.hurt(Math.max(0, Math.floor(this.fallStart - player.position.y - 3)));
      this.fallStart = null;
    }
    const x = Math.floor(player.position.x),
      y = Math.floor(player.position.y),
      z = Math.floor(player.position.z);
    const head = this.world.getBlock(x, Math.floor(player.position.y + 1.5), z);
    if (this.world.getBlock(x, y, z) === BlockId.WATER) this.fallStart = null;
    this.clock.advance(dt, (step) => {
      if (this.dead) return;
      this.data.time += step;
      this.attackCooldown = Math.max(0, this.attackCooldown - step);
      if (!this.creative) {
        tickVitals(
          this.data.vitals,
          step,
          (distance * step) / Math.max(dt, step),
          head === BlockId.WATER,
          [BlockId.LAVA, BlockId.FIRE].includes(
            this.world.getBlock(x, y, z) as typeof BlockId.LAVA,
          ) && !this.data.adventure?.fire,
          isSolid(head),
        );
        if (this.data.vitals.health <= 0) {
          this.die();
          return;
        }
        if (y < -8) this.hurt(20);
      }
      for (const f of Object.values(this.data.furnaces)) tickFurnace(f, step);
      this.simulationTicks++;
      if (this.simulationTicks % 12 === 0) this.tickEntities(0.1);
    });
  }
  private tickEntities(dt: number): void {
    const d = this.data;
    for (const loot of d.loot) {
      loot.age += dt;
      const p = loot.position;
      if (
        this.world.hasChunk(Math.floor(p.x / 16), Math.floor(p.z / 16)) &&
        !isSolid(this.world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.1), Math.floor(p.z)))
      )
        loot.position = { ...p, y: p.y - dt * 3 };
      if (
        loot.age > 0.4 &&
        Math.hypot(p.x - d.position.x, p.y - d.position.y, p.z - d.position.z) < 2
      )
        loot.stack.count = addItem(d.inventory, loot.stack);
    }
    d.loot = d.loot.filter((l) => l.stack.count > 0 && l.age < 600);
    for (const [key, age] of Object.entries(d.growth)) {
      const [x, y, z] = parseBlockKey(key);
      if (!this.world.hasChunk(Math.floor(x / 16), Math.floor(z / 16))) continue;
      const block = this.world.getBlock(x, y, z);
      d.growth[key] = age + dt;
      if (block === BlockId.NETHER_WART && age > 60) {
        this.drop(stack("netherWart", 2), { x: x + 0.5, y, z: z + 0.5 });
        this.edit(x, y, z, BlockId.AIR);
        Reflect.deleteProperty(d.growth, key);
      }
      if (block === BlockId.CROP && age > 180) {
        this.edit(x, y, z, BlockId.RIPE_CROP);
        Reflect.deleteProperty(d.growth, key);
      }
      if (block === BlockId.SAPLING && age > 240) {
        if ([1, 2, 3, 4].every((dy) => !isSolid(this.world.getBlock(x, y + dy, z)))) {
          for (let dy = 0; dy < 4; dy++) this.edit(x, y + dy, z, BlockId.WOOD);
          for (let dx = -2; dx <= 2; dx++)
            for (let dz = -2; dz <= 2; dz++)
              for (let dy = 3; dy <= 5; dy++)
                if (!isSolid(this.world.getBlock(x + dx, y + dy, z + dz)))
                  this.edit(x + dx, y + dy, z + dz, BlockId.LEAVES);
          Reflect.deleteProperty(d.growth, key);
        }
      }
      if (block !== BlockId.CROP && block !== BlockId.SAPLING && block !== BlockId.NETHER_WART)
        Reflect.deleteProperty(d.growth, key);
    }
    for (const m of d.creatures) {
      if (m.hp <= 0) continue;
      m.age += dt;
      if (!hostile(m) && Math.floor(m.age * 10) % 50 === 0 && m.cooldown <= 0)
        m.intent = this.random() * Math.PI * 2;
      m.cooldown = Math.max(0, m.cooldown - dt);
      m.love = Math.max(0, m.love - dt);
      if (Math.hypot(m.position.x - d.position.x, m.position.z - d.position.z) > 48) continue;
      // Integrate small substeps even though decisions run at 10 Hz.
      for (let i = 0; i < 12; i++) moveCreature(m, d.position, this.world, dt / 12);
      if (m.position.y < -8) m.hp = 0;
      if (!this.isNight && (m.species === "zombie" || m.species === "skeleton")) {
        let sky = true;
        for (let yy = Math.floor(m.position.y) + 2; yy < 96; yy++)
          if (
            isSolid(this.world.getBlock(Math.floor(m.position.x), yy, Math.floor(m.position.z)))
          ) {
            sky = false;
            break;
          }
        if (sky) m.hp -= dt * 2;
      }
      // A creature killed this tick cannot attack or participate in breeding.
      if (m.hp <= 0) continue;
      const dist = Math.hypot(
        m.position.x - d.position.x,
        m.position.y - d.position.y,
        m.position.z - d.position.z,
      );
      const visible = () => {
        const origin = { x: m.position.x, y: m.position.y + 1, z: m.position.z };
        const direction = {
          x: d.position.x - origin.x,
          y: d.position.y + 1 - origin.y,
          z: d.position.z - origin.z,
        };
        const distance = Math.hypot(direction.x, direction.y, direction.z);
        return (
          raycastVoxels(origin, direction, distance, (x, y, z) =>
            isSolid(this.world.getBlock(x, y, z)),
          ) === null
        );
      };
      if (
        hostile(m) &&
        (m.species !== "wanderer" || m.fuse === 2) &&
        !this.creative &&
        m.cooldown === 0 &&
        visible()
      ) {
        if (m.species === "skeleton" && dist < 14) {
          const delta = {
            x: d.position.x - m.position.x,
            y: d.position.y - m.position.y,
            z: d.position.z - m.position.z,
          };
          d.arrows.push({
            position: { ...m.position, y: m.position.y + 1.2 },
            velocity: {
              x: (delta.x / dist) * 10,
              y: (delta.y / dist) * 10,
              z: (delta.z / dist) * 10,
            },
            age: 0,
          });
          m.cooldown = 2.5;
        } else if (dist < 1.8) {
          if (m.species === "mossling") {
            m.fuse = (m.fuse ?? 0) + dt;
            if (m.fuse < 1.5) continue;
            this.hurt(8);
            m.hp = 0;
            const bx = Math.floor(m.position.x),
              by = Math.floor(m.position.y),
              bz = Math.floor(m.position.z);
            for (let dx = -1; dx <= 1; dx++)
              for (let dz = -1; dz <= 1; dz++)
                for (let dy = -1; dy <= 1; dy++)
                  if (dx * dx + dy * dy + dz * dz <= 2) {
                    const b = this.world.getBlock(bx + dx, by + dy, bz + dz);
                    if (BLOCKS[b].breakable) this.mine(bx + dx, by + dy, bz + dz);
                  }
          } else {
            this.hurt(m.species === "spider" ? 2 : 3);
            m.cooldown = 1.2;
          }
        }
      }
      if (m.species === "mossling" && dist >= 1.8) m.fuse = Math.max(0, (m.fuse ?? 0) - dt);
      if (
        m.love > 0 &&
        d.creatures.length < 28 &&
        d.creatures.filter((animal) => !hostile(animal)).length < 16
      ) {
        const partner = d.creatures.find(
          (other) =>
            other !== m &&
            other.hp > 0 &&
            other.species === m.species &&
            other.love > 0 &&
            Math.hypot(other.position.x - m.position.x, other.position.z - m.position.z) < 3,
        );
        if (partner) {
          m.love = 0;
          partner.love = 0;
          const child = this.makeCreature(m.species, m.position);
          child.age = -120;
          d.creatures.push(child);
        }
      }
    }
    for (const arrow of d.arrows) {
      for (let i = 0; i < 4; i++) {
        arrow.position = {
          x: arrow.position.x + (arrow.velocity.x * dt) / 4,
          y: arrow.position.y + (arrow.velocity.y * dt) / 4,
          z: arrow.position.z + (arrow.velocity.z * dt) / 4,
        };
        const a = arrow.position;
        if (isSolid(this.world.getBlock(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z)))) {
          arrow.age = 10;
          break;
        }
        if (Math.hypot(a.x - d.position.x, a.y - d.position.y - 0.9, a.z - d.position.z) < 0.65) {
          this.hurt(3);
          arrow.age = 10;
          break;
        }
      }
      arrow.age += dt;
    }
    d.arrows = d.arrows.filter((a) => a.age < 4);
    this.removeDead();
    this.mobTimer += dt;
    if (this.mobTimer > 5) {
      this.mobTimer = 0;
      this.spawnCreature();
    }
    this.onChange?.();
  }
  private makeCreature(species: Species, position: Vec3): Creature {
    return {
      id: this.data.nextId++,
      species,
      position: { ...position },
      velocity: { x: 0, y: 0, z: 0 },
      onGround: false,
      hp: hostile({ species } as Creature) ? 16 : 8,
      age: 0,
      cooldown: 0,
      intent: this.random() * Math.PI * 2,
      love: 0,
    };
  }
  private spawnCreature(): void {
    const d = this.data;
    if (d.creatures.length >= 28) return;
    if (this.world.dimension === "end") {
      const x = Math.floor((this.random() - 0.5) * 48),
        z = Math.floor((this.random() - 0.5) * 48);
      if (
        d.creatures.filter((m) => m.species === "wanderer").length < 4 &&
        this.world.getBlock(x, 33, z) === BlockId.END_STONE
      )
        d.creatures.push(this.makeCreature("wanderer", { x: x + 0.5, y: 34, z: z + 0.5 }));
      return;
    }
    if (this.world.dimension === "nether") {
      const x = Math.floor(d.position.x + (this.random() - 0.5) * 30),
        z = Math.floor(d.position.z + (this.random() - 0.5) * 30);
      if (!this.world.hasChunk(Math.floor(x / 16), Math.floor(z / 16))) return;
      for (let y = 60; y >= 25; y--)
        if (
          isSolid(this.world.getBlock(x, y, z)) &&
          this.world.getBlock(x, y + 1, z) === BlockId.AIR &&
          this.world.getBlock(x, y + 2, z) === BlockId.AIR
        ) {
          if (d.creatures.filter((m) => m.species === "ember").length < 8)
            d.creatures.push(this.makeCreature("ember", { x: x + 0.5, y: y + 1, z: z + 0.5 }));
          break;
        }
      return;
    }
    if (
      this.world.revision >= 2 &&
      d.creatures.filter((m) => m.species === "villager").length < 2
    ) {
      const village = structuresNear(
        d.seed,
        d.position.x,
        d.position.z,
        createColumnSampler(d.seed, this.world.revision),
      ).find(
        (v) => v.kind === "village" && Math.hypot(v.x - d.position.x, v.z - d.position.z) < 30,
      );
      if (village && this.world.hasChunk(Math.floor(village.x / 16), Math.floor(village.z / 16))) {
        d.creatures.push(
          this.makeCreature("villager", { x: village.x + 3.5, y: village.y, z: village.z + 0.5 }),
        );
        return;
      }
    }
    // Keep room for night enemies even when a daytime herd is nearby.
    if (d.creatures.filter((m) => hostile(m) === this.isNight).length >= 12) return;
    const angle = this.random() * Math.PI * 2;
    const radius = 10 + this.random() * 14;
    const x = Math.floor(d.position.x + Math.cos(angle) * radius),
      z = Math.floor(d.position.z + Math.sin(angle) * radius);
    if (!this.world.hasChunk(Math.floor(x / 16), Math.floor(z / 16))) return;
    let y = 94;
    while (y > 1 && !isSolid(this.world.getBlock(x, y, z))) y--;
    const surface = this.world.getBlock(x, y, z);
    if (surface !== BlockId.GRASS && surface !== BlockId.DIRT && surface !== BlockId.SNOW) return;
    const species = this.isNight
      ? must(
          (["zombie", "skeleton", "mossling", "spider", "wanderer"] as const)[
            Math.floor(this.random() * 5)
          ],
        )
      : must(FRIENDLY[Math.floor(this.random() * 4)]);
    if (d.creatures.filter((m) => m.species === species).length >= 6) return;
    d.creatures.push(this.makeCreature(species, { x: x + 0.5, y: y + 1, z: z + 0.5 }));
  }
  private removeDead(): void {
    for (const m of this.data.creatures)
      if (m.hp <= 0) {
        if (!this.creative && hostile(m))
          must(this.data.adventure).xp = Math.min(1000000, must(this.data.adventure).xp + 2);
        for (const item of creatureDrops(m, this.random())) this.drop(item, m.position);
      }
    this.data.creatures = this.data.creatures.filter(
      (m) =>
        m.hp > 0 &&
        Math.hypot(m.position.x - this.data.position.x, m.position.z - this.data.position.z) < 80,
    );
  }
  chest(x: number, y: number, z: number): Slots {
    const key = blockKey(x, y, z);
    if (!this.data.chests[key]) {
      const slots = emptySlots(27);
      if (
        this.world.dimension === "overworld" &&
        this.world.revision >= 2 &&
        this.world.getBlock(x, y, z) === BlockId.CHEST
      ) {
        const generated = structuresNear(
          this.data.seed,
          x,
          z,
          createColumnSampler(this.data.seed, this.world.revision),
        ).find((s) =>
          structureBlocks(s, this.world.revision).some(
            (p) => p.x === x && p.y === y && p.z === z && p.id === BlockId.CHEST,
          ),
        );
        // A replaced chest must never regenerate its original treasure.
        const cx = Math.floor(x / 16),
          cz = Math.floor(z / 16),
          index = y * 256 + (((z % 16) + 16) % 16) * 16 + (((x % 16) + 16) % 16);
        const changed = this.data.edits[`${cx},${cz}`]?.[String(index)] !== undefined;
        const treasureKey = `${this.world.dimension}:${key}`;
        const opened = must(this.data.adventure).opened;
        if (generated && !changed && !opened[treasureKey])
          (this.world.revision === 2
            ? [
                stack("bread", 6),
                stack("iron", 4),
                stack("string", 6),
                stack("book"),
                stack("obsidian", 4),
              ]
            : structureLoot(this.data.seed, x, y, z, generated.kind)
          ).forEach((v, i) => (slots[i] = v));
        opened[treasureKey] = true;
      }
      this.data.chests[key] = slots;
    }
    return must(this.data.chests[key]);
  }
  furnace(x: number, y: number, z: number): FurnaceState {
    return (this.data.furnaces[blockKey(x, y, z)] ??= newFurnace());
  }
}
