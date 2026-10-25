import * as THREE from "three";
import { mulberry32 } from "../world/rng";
import type { SolidQuery } from "../player/physics";

export const MAX_FRAGMENTS = 128;
interface Fragment {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  lifetime: number;
  size: number;
  shade: number;
  color: string;
}

/** Cosmetic state has its own RNG and never changes world/loot randomness. */
export class FragmentPool {
  readonly particles: Fragment[] = [];
  private random: () => number;
  constructor(seed = 431) {
    this.random = mulberry32(seed);
  }
  burst(x: number, y: number, z: number, color: string): void {
    this.particles.splice(0, Math.max(0, this.particles.length + 12 - MAX_FRAGMENTS));
    for (let i = 0; i < 12; i++)
      this.particles.push({
        x: x + this.random(),
        y: y + this.random(),
        z: z + this.random(),
        vx: (this.random() - 0.5) * 3,
        vy: 1 + this.random() * 3,
        vz: (this.random() - 0.5) * 3,
        age: 0,
        lifetime: 0.45 + this.random() * 0.3,
        size: 0.045 + this.random() * 0.04,
        shade: 0.65 + this.random() * 0.35,
        color,
      });
  }
  step(dt: number, solid: SolidQuery): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const motion = Math.min(dt, 0.05);
    let alive = 0;
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.lifetime) continue;
      p.vy -= 16 * motion;
      p.x += p.vx * motion;
      p.y += p.vy * motion;
      p.z += p.vz * motion;
      if (p.vy < 0 && solid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) {
        p.y = Math.floor(p.y) + 1.01;
        p.vy *= -0.25;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      this.particles[alive++] = p;
    }
    this.particles.length = alive;
  }
}

/** One draw call, shared geometry/material, at most 128 fragments. */
export class BlockFragments {
  private mesh: THREE.InstancedMesh;
  private matrix = new THREE.Matrix4();
  private color = new THREE.Color();
  readonly pool = new FragmentPool();
  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ fog: true }),
      MAX_FRAGMENTS,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(dt: number, solid: SolidQuery): void {
    this.pool.step(dt, solid);
    this.pool.particles.forEach((p, i) => {
      const scale = p.size * Math.min(1, (p.lifetime - p.age) / 0.18);
      this.matrix.makeScale(scale, scale, scale).setPosition(p.x, p.y, p.z);
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, this.color.set(p.color).multiplyScalar(p.shade));
    });
    this.mesh.count = this.pool.particles.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
