import { BlockId, isSolid } from "./blocks";
import type { World } from "./world";
import { blockKey, parseBlockKey } from "../survival/session";

/** Deliberately bounded, local fluid propagation. Sources flow down first,
 * then at most four cells sideways (lava: two). Levels survive with the save. */
export class FluidSimulator {
  private world: World;
  private levels: Record<string, number>;
  private edit: (x: number, y: number, z: number, id: BlockId) => void;
  private queue: string[] = [];
  private queued = new Set<string>();
  private clock = 0;
  private volume = 0;
  constructor(
    world: World,
    levels: Record<string, number>,
    edit: (x: number, y: number, z: number, id: BlockId) => void,
  ) {
    this.world = world;
    this.levels = levels;
    this.volume = Object.keys(levels).length;
    this.edit = edit;
  }
  private removeLevel(key: string): void {
    if (Object.hasOwn(this.levels, key)) {
      Reflect.deleteProperty(this.levels, key);
      this.volume--;
    }
  }
  notify(x: number, y: number, z: number): void {
    for (const [dx, dy, dz] of [
      [0, 0, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]) {
      const xx = x + (dx ?? 0),
        yy = y + (dy ?? 0),
        zz = z + (dz ?? 0);
      if (!this.world.hasChunk(Math.floor(xx / 16), Math.floor(zz / 16))) continue;
      const id = this.world.getBlock(xx, yy, zz);
      const key = blockKey(xx, yy, zz);
      if (id !== BlockId.WATER && id !== BlockId.LAVA) {
        this.removeLevel(key);
        continue;
      }
      if (this.queued.has(key) || this.queue.length >= 4096) continue;
      this.queued.add(key);
      this.queue.push(key);
    }
  }
  wake(position: { x: number; y: number; z: number }): void {
    for (const key of Object.keys(this.levels)) {
      const [x, y, z] = parseBlockKey(key);
      if (Math.hypot(x - position.x, y - position.y, z - position.z) < 24) this.notify(x, y, z);
    }
    for (let dx = -6; dx <= 6; dx++)
      for (let dz = -6; dz <= 6; dz++)
        for (let dy = -4; dy <= 4; dy++)
          this.notify(
            Math.floor(position.x) + dx,
            Math.floor(position.y) + dy,
            Math.floor(position.z) + dz,
          );
  }
  tick(dt: number): void {
    this.clock += Math.min(dt, 0.25);
    if (this.clock < 0.2) return;
    this.clock = 0;
    for (let work = 0; work < 24 && this.queue.length; work++) {
      const key = this.queue.shift();
      if (!key) break;
      this.queued.delete(key);
      const [x, y, z] = parseBlockKey(key);
      if (!this.world.hasChunk(Math.floor(x / 16), Math.floor(z / 16))) continue;
      const kind = this.world.getBlock(x, y, z);
      if (kind !== BlockId.WATER && kind !== BlockId.LAVA) {
        this.removeLevel(key);
        continue;
      }
      const level = this.levels[key] ?? 0;
      const offer = (xx: number, yy: number, zz: number, nextLevel: number): boolean => {
        if (yy < 1 || yy >= 96 || !this.world.hasChunk(Math.floor(xx / 16), Math.floor(zz / 16)))
          return false;
        const target = this.world.getBlock(xx, yy, zz);
        const targetKey = blockKey(xx, yy, zz);
        if (
          (target === BlockId.WATER && kind === BlockId.LAVA) ||
          (target === BlockId.LAVA && kind === BlockId.WATER)
        ) {
          this.edit(xx, yy, zz, BlockId.COBBLE);
          this.removeLevel(targetKey);
          return false;
        }
        if (target !== BlockId.AIR || this.volume >= 10000) return false;
        this.levels[targetKey] = nextLevel;
        this.volume++;
        this.edit(xx, yy, zz, kind);
        this.notify(xx, yy, zz);
        return true;
      };
      if (offer(x, y - 1, z, 0)) continue;
      if (!isSolid(this.world.getBlock(x, y - 1, z)) && this.world.getBlock(x, y - 1, z) !== kind)
        continue;
      if (level < (kind === BlockId.WATER ? 4 : 2))
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ])
          offer(x + (dx ?? 0), y, z + (dz ?? 0), level + 1);
    }
  }
}
