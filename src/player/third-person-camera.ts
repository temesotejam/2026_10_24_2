import { raycastVoxels } from "./raycast";
import type { SolidQuery, Vec3 } from "./physics";

const DISTANCE = 4;
const turnDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const direction = (yaw: number, pitch: number, front: boolean): Vec3 => {
  const sign = front ? 1 : -1;
  return {
    x: -Math.sin(yaw) * Math.cos(pitch) * sign,
    y: Math.sin(pitch) * sign,
    z: -Math.cos(yaw) * Math.cos(pitch) * sign,
  };
};

/** A collision-safe camera boom. Look ahead before reaching a wall, keep a
 * short distance through brief gaps, then return slowly to the wide view. */
export class ThirdPersonCamera {
  distance = DISTANCE;
  yaw = 0;
  pitch = 0;
  private releaseDelay = 0;

  private clearance(eye: Vec3, behind: Vec3, solid: SolidQuery): number {
    let allowed = DISTANCE;
    for (const x of [-0.15, 0.15])
      for (const y of [-0.15, 0.15])
        for (const z of [-0.15, 0.15]) {
          const hit = raycastVoxels(
            { x: eye.x + x, y: eye.y + y, z: eye.z + z },
            behind,
            DISTANCE,
            solid,
          );
          if (hit) allowed = Math.min(allowed, Math.max(0, hit.distance - 0.18));
        }
    return allowed;
  }

  update(
    eye: Vec3,
    velocity: Vec3,
    yaw: number,
    pitch: number,
    front: boolean,
    dt: number,
    reset: boolean,
    solid: SolidQuery,
  ): Vec3 {
    const step = Math.max(0, Math.min(dt, 0.05));
    const turn = reset ? 1 : 1 - Math.exp(-8 * step);
    const yawChange = turnDelta(this.yaw, yaw) * turn;
    const pitchChange = (pitch - this.pitch) * turn;
    let fraction = 1;
    // A fast mouse turn can sweep the boom into a wall in a single frame.
    // Slow that visible orbit while the boom contracts, without delaying aim.
    if (
      !reset &&
      this.clearance(eye, direction(this.yaw + yawChange, this.pitch + pitchChange, front), solid) <
        this.distance - 6 * step
    ) {
      let low = 0,
        high = 1;
      for (let i = 0; i < 8; i++) {
        const middle = (low + high) / 2;
        if (
          this.clearance(
            eye,
            direction(this.yaw + yawChange * middle, this.pitch + pitchChange * middle, front),
            solid,
          ) >=
          this.distance - 6 * step
        )
          low = middle;
        else high = middle;
      }
      fraction = low;
    }
    this.yaw += yawChange * fraction;
    this.pitch += pitchChange * fraction;
    const behind = direction(this.yaw, this.pitch, front);
    const allowed = this.clearance(eye, behind, solid);
    let target = allowed;
    // Anticipate walking and camera turns. Skip predicted eye positions inside
    // walls: physics will stop the player there rather than travel through them.
    for (const time of [0.15, 0.3, 0.45]) {
      const futureEye = { x: eye.x + velocity.x * time, y: eye.y, z: eye.z + velocity.z * time };
      if (solid(Math.floor(futureEye.x), Math.floor(futureEye.y), Math.floor(futureEye.z)))
        continue;
      const aheadTurn = 1 - Math.exp(-8 * time);
      const futureDirection = direction(
        this.yaw + turnDelta(this.yaw, yaw) * aheadTurn,
        this.pitch + (pitch - this.pitch) * aheadTurn,
        front,
      );
      target = Math.min(target, this.clearance(futureEye, futureDirection, solid));
    }
    if (target <= this.distance + 0.025 && target < DISTANCE - 0.025) this.releaseDelay = 0.6;
    if (reset) {
      this.distance = allowed;
      this.releaseDelay = 0.6;
    } else if (target < this.distance) {
      this.releaseDelay = 0.6;
      this.distance += Math.max(-6 * step, (target - this.distance) * (1 - Math.exp(-10 * step)));
    } else {
      this.releaseDelay = Math.max(0, this.releaseDelay - step);
      if (this.releaseDelay === 0 && target - this.distance > 0.025)
        this.distance += Math.min(1.6 * step, (target - this.distance) * (1 - Math.exp(-2 * step)));
    }
    // A new block or teleport can invalidate prediction. Collision safety is
    // authoritative; smoothing must never reveal the far side of a wall.
    this.distance = Math.min(this.distance, allowed);
    return behind;
  }
}
