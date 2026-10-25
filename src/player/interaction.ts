import * as THREE from "three";
import { BlockId, BLOCKS, isSolid } from "../world/blocks";
import type { World } from "../world/world";
import type { Hotbar } from "../ui/hotbar";
import { aabbFromFeetPosition, aabbIntersectsSolid, type Vec3 } from "./physics";
import type { PlayerController } from "./controller";
import { raycastVoxels } from "./raycast";
import type { SurvivalSession } from "../survival/session";

export interface ChunkVisualUpdater {
  updateChunk(cx: number, cz: number): void;
}
export class BlockInteraction {
  private world: World;
  private hotbar: Hotbar;
  private controller: PlayerController;
  private session: SurvivalSession;
  private held = false;
  private progress = 0;
  private targetKey = "";
  private nextCreativeBreak = 0;
  onAttack: (() => boolean) | undefined;
  onItemUse: (() => boolean) | undefined;
  onCreatureUse: ((id: number) => boolean) | undefined;
  onUseBlock: ((x: number, y: number, z: number, id: BlockId) => boolean) | undefined;
  onProgress: ((fraction: number) => void) | undefined;
  onBreak: ((position: Vec3, block: BlockId) => void) | undefined;
  onPlace: ((position: Vec3, block: BlockId) => void) | undefined;
  constructor(
    _camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    world: World,
    _meshes: ChunkVisualUpdater,
    hotbar: Hotbar,
    controller: PlayerController,
    session: SurvivalSession,
  ) {
    this.world = world;
    this.hotbar = hotbar;
    this.controller = controller;
    this.session = session;
    let tap: { x: number; y: number; time: number } | null = null;
    domElement.addEventListener("mousedown", (e) => {
      if (!controller.isActive || session.dead) return;
      if (e.button === 2) {
        this.placeTargetedBlock();
        return;
      }
      if (e.button !== 0) return;
      if (controller.isLocked) {
        this.held = true;
        this.nextCreativeBreak = 0;
        this.breakTargetedBlock(false);
      } else tap = { x: e.clientX, y: e.clientY, time: performance.now() };
    });
    document.addEventListener("mouseup", (e) => {
      this.held = false;
      if (
        e.button === 0 &&
        tap &&
        controller.isActive &&
        !controller.isLocked &&
        performance.now() - tap.time < 300 &&
        Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 6
      )
        this.breakTargetedBlock();
      tap = null;
    });
    document.addEventListener("pointerlockchange", () => {
      this.cancel();
    });
    window.addEventListener("blur", () => {
      this.cancel();
    });
  }
  private cancel(): void {
    this.held = false;
    this.progress = 0;
    this.targetKey = "";
    this.nextCreativeBreak = 0;
    this.onProgress?.(0);
  }
  raycastFromCamera(maxDistance = 6) {
    const direction = this.controller.lookDirection;
    return raycastVoxels(this.controller.eyePosition, direction, maxDistance, (x, y, z) => {
      const b = this.world.getBlock(x, y, z);
      return b !== BlockId.AIR && b !== BlockId.WATER && b !== BlockId.LAVA;
    });
  }
  private creatureTarget(): number | null {
    const direction = new THREE.Vector3().copy(this.controller.lookDirection);
    const origin = this.controller.eyePosition;
    const block = this.raycastFromCamera(3);
    let closest = block?.distance ?? 3;
    let target: number | null = null;
    for (const m of this.session.data.creatures) {
      const delta = new THREE.Vector3(
        m.position.x - origin.x,
        m.position.y + 0.7 - origin.y,
        m.position.z - origin.z,
      );
      const along = delta.dot(direction);
      if (along < 0 || along > closest) continue;
      if (delta.lengthSq() - along * along < 0.55 ** 2) {
        closest = along;
        target = m.id;
      }
    }
    return target;
  }
  breakTargetedBlock(tap = true): void {
    if (!this.controller.isActive || this.session.dead) return;
    if (this.onAttack?.()) return;
    const mob = this.creatureTarget();
    if (mob !== null) {
      this.session.hitCreature(mob);
      return;
    }
    const hit = this.raycastFromCamera(this.session.creative ? 6 : 4.5);
    if (!hit) return;
    const id = this.world.getBlock(hit.blockX, hit.blockY, hit.blockZ);
    if (!BLOCKS[id].breakable) return;
    const key = `${hit.blockX},${hit.blockY},${hit.blockZ}:${this.session.held?.id ?? "hand"}`;
    if (key !== this.targetKey) {
      this.targetKey = key;
      this.progress = 0;
    }
    const seconds = this.session.duration(id);
    if (seconds === 0) {
      if (!tap && performance.now() < this.nextCreativeBreak) return;
      if (this.mine(hit.blockX, hit.blockY, hit.blockZ, id))
        this.nextCreativeBreak = performance.now() + 200;
      return;
    }
    if (tap) this.progress += 0.3;
    if (this.progress >= seconds) {
      this.mine(hit.blockX, hit.blockY, hit.blockZ, id);
      this.progress = 0;
    }
    this.onProgress?.(this.progress / seconds);
  }
  private mine(x: number, y: number, z: number, block: BlockId): boolean {
    if (!this.session.mine(x, y, z)) return false;
    this.onBreak?.({ x, y, z }, block);
    return true;
  }
  update(dt: number): void {
    if (!this.controller.isActive || this.session.dead) {
      this.cancel();
      return;
    }
    if (this.held) {
      this.progress += Math.min(dt, 0.25);
      this.breakTargetedBlock(false);
    } else if (this.progress > 0) {
      this.progress = Math.max(0, this.progress - dt * 0.2);
    }
  }
  placeTargetedBlock(): void {
    if (!this.controller.isActive || this.session.dead) return;
    if (this.onItemUse?.()) return;
    const creature = this.creatureTarget();
    if (creature !== null && this.onCreatureUse?.(creature)) return;
    if (creature !== null && this.session.feedCreature(creature)) return;
    const hit = this.raycastFromCamera(this.session.creative ? 6 : 4.5);
    if (
      hit &&
      this.onUseBlock?.(
        hit.blockX,
        hit.blockY,
        hit.blockZ,
        this.world.getBlock(hit.blockX, hit.blockY, hit.blockZ),
      )
    )
      return;
    if (this.session.eat()) return;
    if (!hit) return;
    if (this.session.till(hit.blockX, hit.blockY, hit.blockZ)) return;
    const block = this.hotbar.selectedBlock;
    if (block === BlockId.AIR) return;
    if (isSolid(block) && this.overlapsPlayer(hit.placeX, hit.placeY, hit.placeZ)) return;
    if (this.session.place(hit.placeX, hit.placeY, hit.placeZ))
      this.onPlace?.({ x: hit.placeX, y: hit.placeY, z: hit.placeZ }, block);
  }
  private overlapsPlayer(x: number, y: number, z: number): boolean {
    return aabbIntersectsSolid(
      aabbFromFeetPosition(this.controller.position),
      (bx, by, bz) => bx === x && by === y && bz === z,
    );
  }
}
