import { creatureContainsPoint } from "../entities/creature-hitbox";
import { meleeDamage } from "./melee-damage";
import { must } from "../core/assert";
import { ITEMS, stack, type Stack } from "../items/catalog";
import { addItem, removeItem, wearTool } from "../items/inventory";
import type { Vec3 } from "../player/physics";
import { raycastVoxels } from "../player/raycast";
import { BlockId } from "../world/blocks";
import type { SurvivalSession } from "./session";
import { BREWS, newAdventure, type Potion } from "./adventure-state";
import { endFrames, stronghold, END_CRYSTALS } from "../world/adventure-terrain";
import { dragonMaxHealth, dragonPosition, raySphereDistance } from "./dragon";
import { isSolid } from "../world/blocks";
import { portalInterior } from "./portal";
import { eyeDirection, eyeBreaks } from "./eye-guidance";
export { portalInterior } from "./portal";

export { BREWS } from "./adventure-state";
/** Small atomic inventory transaction: no partial payment or lost output. */
export function exchange(
  inventory: (Stack | null)[],
  costs: Record<string, number>,
  output?: Stack,
): boolean {
  const copy = inventory.map((s) => (s ? { ...s } : null));
  for (const [id, amount] of Object.entries(costs)) {
    let remaining = amount;
    for (let i = 0; i < copy.length && remaining; i++) {
      const item = copy[i];
      if (item?.id !== id) continue;
      const take = Math.min(item.count, remaining);
      removeItem(copy, i, take);
      remaining -= take;
    }
    if (remaining) return false;
  }
  if (output && addItem(copy, output)) return false;
  inventory.splice(0, inventory.length, ...copy);
  return true;
}

export class Adventure {
  shots: { position: Vec3; velocity: Vec3; age: number }[] = [];
  private attackCooldown = 0;
  private dragonCooldown = 0;
  cast: { point: Vec3; elapsed: number } | null = null;
  onTravel: ((destination?: "overworld" | "nether" | "end") => void) | undefined;
  readonly session: SurvivalSession;
  constructor(session: SurvivalSession) {
    this.session = session;
    session.data.adventure ??= newAdventure(session.data.generator);
  }
  get state() {
    return must(this.session.data.adventure);
  }
  enchant(index: number): boolean {
    const item = this.session.data.inventory[index];
    if (!item || !ITEMS[item.id]?.tool || ITEMS[item.id]?.enchanted) return false;
    if (!this.session.creative && this.state.xp < 5) {
      this.session.notice?.("経験値が5必要です");
      return false;
    }
    // Enchant in place: cannot accidentally overwrite another selected item.
    const enhanced = stack(`enchanted_${item.id}`);
    enhanced.durability = Math.min(must(enhanced.durability), (item.durability ?? 1) * 2);
    this.session.data.inventory[index] = enhanced;
    if (!this.session.creative) this.state.xp -= 5;
    this.session.onChange?.();
    return true;
  }
  brew(key: string, output: Potion): boolean {
    const jobKey = `${this.state.dimension}:${key}`;
    if (this.state.brewing[jobKey]) return false;
    if (
      !this.session.creative &&
      !exchange(this.session.data.inventory, {
        waterBottle: 1,
        netherWart: 1,
        blazePowder: 1,
        [BREWS[output].ingredient]: 1,
      })
    ) {
      this.session.notice?.("水入り瓶・ネザーウォート・炎の粉・追加材料が必要です");
      return false;
    }
    this.state.brewing[jobKey] = { remaining: 5, output };
    this.session.onChange?.();
    return true;
  }
  claim(key: string): boolean {
    const k = `${this.state.dimension}:${key}`,
      job = this.state.brewing[k];
    if (!job || job.remaining > 0) return false;
    if (addItem(this.session.data.inventory, stack(job.output))) {
      this.session.notice?.("所持品の空きを作ってください");
      return false;
    }
    Reflect.deleteProperty(this.state.brewing, k);
    this.session.onChange?.();
    return true;
  }
  tick(dt: number): void {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.dragonCooldown = Math.max(0, this.dragonCooldown - dt);
    const dragon = this.state.dragon;
    if (this.state.dimension === "end" && !dragon.defeated) {
      dragon.phase += dt;
      const crystals = END_CRYSTALS.filter(
        (p) => this.session.world.getBlock(p.x, p.y, p.z) === BlockId.END_CRYSTAL,
      ).length;
      dragon.health = Math.min(
        dragonMaxHealth(this.session.world.revision),
        dragon.health + crystals * dt * 2,
      );
      const p = dragonPosition(dragon.phase),
        player = this.session.data.position;
      if (
        this.dragonCooldown === 0 &&
        Math.hypot(p.x - player.x, p.y - player.y, p.z - player.z) < 7 &&
        raycastVoxels(
          p,
          { x: player.x - p.x, y: player.y + 0.9 - p.y, z: player.z - p.z },
          Math.hypot(player.x - p.x, player.y + 0.9 - p.y, player.z - p.z),
          (x, y, z) => isSolid(this.session.world.getBlock(x, y, z)),
        ) === null
      ) {
        this.session.hurt(3);
        this.dragonCooldown = 2;
      }
    }
    for (const shot of this.shots) {
      // Short segments prevent fast arrows tunneling through a crystal or wall.
      const steps = Math.max(1, Math.ceil(dt * 120));
      for (let i = 0; i < steps && shot.age < 3; i++) {
        const step = dt / steps;
        shot.position = {
          x: shot.position.x + shot.velocity.x * step,
          y: shot.position.y + shot.velocity.y * step,
          z: shot.position.z + shot.velocity.z * step,
        };
        shot.velocity = { ...shot.velocity, y: shot.velocity.y - 2.4 * step };
        shot.age += step;
        const p = shot.position,
          x = Math.floor(p.x),
          y = Math.floor(p.y),
          z = Math.floor(p.z);
        const block = this.session.world.getBlock(x, y, z);
        if (block === BlockId.END_CRYSTAL) {
          this.session.mine(x, y, z);
          shot.age = 3;
        } else if (isSolid(block)) shot.age = 3;
        else if (
          this.session.data.creatures.some((m) => {
            if (!creatureContainsPoint(m, p)) return false;
            this.session.shootCreature(m.id, 8);
            return true;
          })
        )
          shot.age = 3;
        else if (this.state.dimension === "end" && !dragon.defeated) {
          const d = dragonPosition(dragon.phase);
          if (Math.hypot(d.x - p.x, d.y - p.y, d.z - p.z) < 2.5) {
            this.damageDragon(8);
            shot.age = 3;
          }
        }
      }
    }
    this.shots = this.shots.filter((s) => s.age < 3);
    this.state.fire = Math.max(0, this.state.fire - dt);
    this.state.strength = Math.max(0, this.state.strength - dt);
    for (const [key, job] of Object.entries(this.state.brewing)) {
      if (!key.startsWith(`${this.state.dimension}:`)) continue;
      job.remaining = Math.max(0, job.remaining - dt);
    }
    const cast = this.cast;
    if (cast) {
      if (
        this.session.held?.id !== "fishingRod" ||
        Math.hypot(
          cast.point.x - this.session.data.position.x,
          cast.point.z - this.session.data.position.z,
        ) > 8 ||
        this.session.world.getBlock(cast.point.x, cast.point.y, cast.point.z) !== BlockId.WATER
      ) {
        this.cast = null;
        return;
      }
      const before = cast.elapsed;
      cast.elapsed += dt;
      if (before < 5 && cast.elapsed >= 5)
        this.session.notice?.("食いついた！3秒以内に右クリックで引き上げよう");
      if (cast.elapsed >= 8) {
        this.cast = null;
        this.session.notice?.("魚が逃げました。もう一度投げられます");
      }
    }
  }
  attackDragon(origin: Vec3, direction: Vec3): boolean {
    if (this.state.dimension !== "end" || this.state.dragon.defeated) return false;
    const contact = raySphereDistance(
      origin,
      direction,
      dragonPosition(this.state.dragon.phase),
      2.5,
    );
    // Use the same three-block melee reach as ordinary creature attacks.
    if (contact === null || contact > 3) return false;
    const block = raycastVoxels(origin, direction, contact, (x, y, z) =>
      isSolid(this.session.world.getBlock(x, y, z)),
    );
    if (block) return false;
    if (this.attackCooldown > 0) return true;
    const item = this.session.held ? ITEMS[this.session.held.id] : undefined;
    this.damageDragon(
      meleeDamage(item) + (item?.enchanted ? 2 : 0) + (this.state.strength > 0 ? 4 : 0),
    );
    if (!this.session.creative) wearTool(this.session.data.inventory, this.session.data.selected);
    this.attackCooldown = 0.5;
    return true;
  }
  private damageDragon(amount: number): void {
    const dragon = this.state.dragon;
    if (dragon.defeated) return;
    dragon.health = Math.max(0, dragon.health - amount);
    if (dragon.health === 0) {
      dragon.defeated = true;
      this.state.xp = Math.min(1000000, this.state.xp + 100);
      this.session.collect(stack("dragonEgg"));
      // Keep the exit at the island center. Creating it under the melee
      // approach (z=4) would forcibly teleport a victorious gen3 player.
      const exitZ = this.session.world.revision >= 3 ? 0 : 5;
      for (let x = -1; x <= 1; x++)
        for (let z = exitZ - 1; z <= exitZ + 1; z++) this.session.edit(x, 34, z, BlockId.END_GATE);
      this.session.notice?.(
        this.session.world.revision >= 3
          ? "エンダードラゴンを討伐しました！卵を獲得。帰還ゲートへ入ると通常世界へ戻れます"
          : "エンダードラゴンを討伐しました！卵を獲得。帰還ゲートを右クリックで通常世界へ戻れます",
      );
    }
    this.session.onChange?.();
  }
  use(origin: Vec3, direction: Vec3): boolean {
    const s = this.session,
      item = s.held;
    if (!item) return false;
    if (item.id === "bow") {
      if (this.attackCooldown > 0 || this.shots.length >= 32) return true;
      if (!s.creative && !exchange(s.data.inventory, { arrow: 1 })) {
        s.notice?.("矢が必要です");
        return true;
      }
      const length = Math.hypot(direction.x, direction.y, direction.z);
      if (length === 0) return true;
      this.shots.push({
        position: { ...origin },
        velocity: {
          x: (direction.x / length) * 22,
          y: (direction.y / length) * 22,
          z: (direction.z / length) * 22,
        },
        age: 0,
      });
      if (!s.creative) wearTool(s.data.inventory, s.data.selected);
      this.attackCooldown = 0.5;
      s.onChange?.();
      return true;
    }
    const hit = raycastVoxels(origin, direction, 6, (x, y, z) => {
      const b = s.world.getBlock(x, y, z);
      return (
        b !== BlockId.AIR &&
        b !== BlockId.PORTAL &&
        !(item.id === "flintSteel" && (b === BlockId.WATER || b === BlockId.LAVA))
      );
    });
    if (item.id === "fishingRod") {
      if (this.cast) {
        if (this.cast.elapsed >= 5 && this.cast.elapsed < 8) {
          s.collect(stack("fish"));
          this.state.xp = Math.min(1000000, this.state.xp + 1);
          s.notice?.("魚を釣り上げました（経験値+1）");
        } else s.notice?.("まだ食いついていません");
        if (!s.creative) wearTool(s.data.inventory, s.data.selected);
        this.cast = null;
        return true;
      }
      if (
        hit &&
        s.world.getBlock(hit.blockX, hit.blockY, hit.blockZ) === BlockId.WATER &&
        this.state.dimension !== "nether"
      ) {
        this.cast = { point: { x: hit.blockX, y: hit.blockY, z: hit.blockZ }, elapsed: 0 };
        s.notice?.("浮きを投げました。食いつくまで待とう");
      } else s.notice?.("6ブロック以内の水面に向けて投げてください");
      return true;
    }
    if (item.id === "bucket") {
      if (hit) {
        const block = s.world.getBlock(hit.blockX, hit.blockY, hit.blockZ);
        const level = s.data.fluidLevels[`${hit.blockX},${hit.blockY},${hit.blockZ}`] ?? 0;
        if ((block === BlockId.WATER || block === BlockId.LAVA) && level > 0) {
          s.notice?.("流れている液体は汲めません。水源・溶岩源を探してください");
          return true;
        }
        if (
          (block === BlockId.WATER || block === BlockId.LAVA) &&
          exchange(
            s.data.inventory,
            { bucket: 1 },
            stack(block === BlockId.WATER ? "waterBucket" : "lavaBucket"),
          )
        ) {
          s.edit(hit.blockX, hit.blockY, hit.blockZ, BlockId.AIR);
          s.onChange?.();
        }
      }
      return true;
    }
    if (item.id === "bottle") {
      if (hit && s.world.getBlock(hit.blockX, hit.blockY, hit.blockZ) === BlockId.WATER)
        if (exchange(s.data.inventory, { bottle: 1 }, stack("waterBottle"))) s.onChange?.();
      return true;
    }
    if (item.id.endsWith("Potion")) {
      if (item.id === "healingPotion")
        s.data.vitals.health = Math.min(20, s.data.vitals.health + 8);
      else if (item.id === "firePotion") this.state.fire = 60;
      else if (item.id === "strengthPotion") this.state.strength = 60;
      if (!s.creative) {
        removeItem(s.data.inventory, s.data.selected);
        s.collect(stack("bottle"));
      }
      s.onChange?.();
      return true;
    }
    if (item.id === "flintSteel") {
      const cells = hit
        ? portalInterior(s.world, { x: hit.blockX, y: hit.blockY, z: hit.blockZ })
        : null;
      if (!cells) {
        if (
          hit &&
          isSolid(s.world.getBlock(hit.blockX, hit.blockY, hit.blockZ)) &&
          s.world.getBlock(hit.placeX, hit.placeY, hit.placeZ) === BlockId.AIR &&
          isSolid(s.world.getBlock(hit.placeX, hit.placeY - 1, hit.placeZ))
        ) {
          s.edit(hit.placeX, hit.placeY, hit.placeZ, BlockId.FIRE);
          if (!s.creative) wearTool(s.data.inventory, s.data.selected);
          s.notice?.("火を付けました。ゲートには黒曜石の外幅4・高さ5の枠が必要です");
        } else s.notice?.("黒曜石で外幅4・高さ5の枠を作り、枠を右クリックしてください");
        return true;
      }
      for (const p of cells) s.edit(p.x, p.y, p.z, BlockId.PORTAL);
      if (!s.creative) wearTool(s.data.inventory, s.data.selected);
      s.notice?.(
        s.world.revision >= 3
          ? "ゲートが開きました。紫の面の中に入り、少し待つと移動できます"
          : "ゲートが開きました。紫の面を右クリックして移動できます",
      );
      return true;
    }
    if (item.id === "enderEye") {
      const normalHit = raycastVoxels(origin, direction, 6, (x, y, z) => {
        const b = s.world.getBlock(x, y, z);
        return b !== BlockId.AIR && b !== BlockId.WATER && b !== BlockId.LAVA;
      });
      if (this.state.dimension !== "overworld") {
        s.notice?.("エンダーアイは通常世界の遺跡で使えます");
        return true;
      }
      if (
        normalHit &&
        s.world.getBlock(normalHit.blockX, normalHit.blockY, normalHit.blockZ) === BlockId.END_FRAME
      ) {
        s.edit(normalHit.blockX, normalHit.blockY, normalHit.blockZ, BlockId.END_FRAME_FILLED);
        if (!s.creative) removeItem(s.data.inventory, s.data.selected);
        if (
          endFrames(s.data.seed, s.world.revision).every(
            (p) => s.world.getBlock(p.x, p.y, p.z) === BlockId.END_FRAME_FILLED,
          )
        ) {
          const c = stronghold(s.data.seed, s.world.revision);
          for (let x = -1; x <= 1; x++)
            for (let z = -1; z <= 1; z++) s.edit(c.x + x, c.y, c.z + z, BlockId.END_GATE);
          s.notice?.(
            s.world.revision >= 3
              ? "エンドへのゲートが開きました。中央の面へ入ると移動できます"
              : "エンドへのゲートが開きました。中央の面を右クリックで移動できます",
          );
        }
      } else {
        const c = stronghold(s.data.seed, s.world.revision);
        if (s.world.revision < 3) {
          s.notice?.(`エンダーアイが遺跡を示しています：X ${c.x} / Z ${c.z}。階段で地下へ進もう`);
        } else {
          const attempts = this.state.eyeThrows ?? 0;
          const broken = !s.creative && eyeBreaks(s.data.seed, attempts);
          if (!s.creative) {
            this.state.eyeThrows = attempts + 1;
            if (broken) removeItem(s.data.inventory, s.data.selected);
          }
          s.notice?.(
            `アイが${eyeDirection(origin, c)}を示しました。${broken ? "アイは砕けました" : "アイを回収しました"}`,
          );
          s.onChange?.();
        }
      }
      return true;
    }
    return false;
  }
}
