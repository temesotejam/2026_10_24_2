import { must } from "../core/assert";
import { BlockId, isTransparent, type BlockId as Block } from "./blocks";
export const LIGHT_SIZE = 32;
export interface LightField {
  origin: {
    x: number;
    y: number;
    z: number;
  };
  data: Uint8Array;
}
const index = (x: number, y: number, z: number) => (z * LIGHT_SIZE + y) * LIGHT_SIZE + x;
/** Local two-channel voxel flood fill: skylight and emitted light. Rebuilt
 * only after nearby changes, chunk arrivals or a six-block camera move. */
export function buildLightField(
  position: {
    x: number;
    y: number;
    z: number;
  },
  getBlock: (x: number, y: number, z: number) => Block,
): LightField {
  const n = LIGHT_SIZE;
  const origin = {
    x: Math.floor(position.x) - 16,
    y: Math.max(0, Math.min(64, Math.floor(position.y) - 16)),
    z: Math.floor(position.z) - 16,
  };
  const size = n * n * n;
  const data = new Uint8Array(size * 2);
  const passable = new Uint8Array(size);
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      let sky = true;
      for (let y = 95; y >= origin.y; y--) {
        const id = getBlock(origin.x + x, y, origin.z + z);
        if (!isTransparent(id)) sky = false;
        const ly = y - origin.y;
        if (ly >= n) continue;
        const i = index(x, ly, z);
        passable[i] = isTransparent(id) ? 1 : 0;
        if (sky) data[i * 2] = 15;
        if (
          id === BlockId.TORCH ||
          id === BlockId.LAVA ||
          id === BlockId.GLOWSTONE ||
          id === BlockId.PORTAL ||
          id === BlockId.END_CRYSTAL ||
          id === BlockId.END_GATE
        )
          data[i * 2 + 1] = 14;
      }
    }
  for (let channel = 0; channel < 2; channel++) {
    const queue: number[] = [];
    for (let i = 0; i < size; i++) if (must(data[i * 2 + channel]) > 0) queue.push(i);
    for (const i of queue) {
      const level = must(data[i * 2 + channel]) - 1;
      if (level <= 0) continue;
      const x = i % n,
        y = Math.floor(i / n) % n,
        z = Math.floor(i / (n * n));
      const neighbors = [
        x > 0 ? i - 1 : -1,
        x < n - 1 ? i + 1 : -1,
        y > 0 ? i - n : -1,
        y < n - 1 ? i + n : -1,
        z > 0 ? i - n * n : -1,
        z < n - 1 ? i + n * n : -1,
      ];
      for (const j of neighbors)
        if (j >= 0 && passable[j] && must(data[j * 2 + channel]) < level) {
          data[j * 2 + channel] = level;
          queue.push(j);
        }
    }
  }
  for (let i = 0; i < data.length; i++) data[i] = must(data[i]) * 17;
  return { origin, data };
}
