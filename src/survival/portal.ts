import { BlockId } from "../world/blocks";
import type { World } from "../world/world";
import type { Vec3 } from "../player/physics";
import type { Dimension } from "../world/adventure-terrain";

/** Both upright orientations, a 4x5 frame (corners optional), 2x3 clear interior. */
export function portalInterior(world: Pick<World, "getBlock">, hit: Vec3): Vec3[] | null {
  for (const axis of ["x", "z"] as const)
    for (let dx = -3; dx <= 0; dx++)
      for (let dy = -4; dy <= 0; dy++) {
        const base = { ...hit, [axis]: hit[axis] + dx, y: hit.y + dy };
        if (base.y < 1 || base.y + 4 >= 95) continue;
        const cells: Vec3[] = [];
        let valid = true;
        for (let u = 0; u < 4; u++)
          for (let v = 0; v < 5; v++) {
            const p = { ...base, [axis]: base[axis] + u, y: base.y + v };
            const id = world.getBlock(p.x, p.y, p.z);
            if ((u === 0 || u === 3) && (v === 0 || v === 4)) continue;
            if (u === 0 || u === 3 || v === 0 || v === 4) valid &&= id === BlockId.OBSIDIAN;
            else {
              valid &&= id === BlockId.AIR || id === BlockId.PORTAL;
              cells.push(p);
            }
          }
        if (valid) return cells;
      }
  return null;
}

/** Physical contact, not right-click teleportation. Require leaving an arrival
 * portal before another transfer, so a saved/reloaded world cannot bounce. */
export class PortalContact {
  private seconds = 0;
  private waitingForExit = true;
  update(
    dt: number,
    position: Vec3,
    active: boolean,
    creative: boolean,
    dimension: Dimension,
    getBlock: (x: number, y: number, z: number) => BlockId,
  ): Dimension | null {
    let portal: Vec3 | null = null;
    let end = false;
    for (let x = Math.floor(position.x - 0.29); x <= Math.floor(position.x + 0.29); x++)
      for (let y = Math.floor(position.y); y <= Math.floor(position.y + 1.7); y++)
        for (let z = Math.floor(position.z - 0.29); z <= Math.floor(position.z + 0.29); z++) {
          const id = getBlock(x, y, z);
          if (id === BlockId.PORTAL) portal = { x, y, z };
          if (id === BlockId.END_GATE && y === Math.floor(position.y)) end = true;
        }
    if (!portal && !end) {
      this.waitingForExit = false;
      this.seconds = 0;
      return null;
    }
    if (!active || this.waitingForExit) {
      this.seconds = 0;
      return null;
    }
    if (end) {
      this.waitingForExit = true;
      return dimension === "end" ? "overworld" : "end";
    }
    if (!portal || dimension === "end" || !portalInterior({ getBlock }, portal)) {
      this.seconds = 0;
      return null;
    }
    this.seconds += Math.min(0.25, Math.max(0, dt));
    if (creative || this.seconds >= 4) {
      this.waitingForExit = true;
      this.seconds = 0;
      return dimension === "overworld" ? "nether" : "overworld";
    }
    return null;
  }
  get progress(): number {
    return Math.min(1, this.seconds / 4);
  }
}
