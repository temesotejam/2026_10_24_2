import * as THREE from "three";
import type { SkyState } from "./sky";

/** Pixel-art celestial bodies, positioned relative to the camera so walking
 * never moves the sky. Both textures are generated locally from simple shapes. */
export class SkyBodies {
  private readonly sun: THREE.Mesh;
  private readonly moon: THREE.Mesh;
  constructor(scene: THREE.Scene) {
    this.sun = this.body(false);
    this.moon = this.body(true);
    scene.add(this.sun, this.moon);
  }
  private body(moon: boolean): THREE.Mesh {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Sky canvas unavailable");
    context.fillStyle = moon ? "#d7dfdc" : "#fff5c2";
    context.fillRect(0, 0, 16, 16);
    if (moon) {
      context.fillStyle = "#9faeac";
      for (const [x, y, w, h] of [
        [2, 3, 4, 3],
        [9, 8, 5, 4],
        [3, 12, 3, 2],
        [10, 2, 2, 3],
      ])
        context.fillRect(x ?? 0, y ?? 0, w ?? 1, h ?? 1);
    } else {
      context.fillStyle = "#fffceb";
      context.fillRect(3, 3, 10, 10);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      fog: false,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(moon ? 8 : 10, moon ? 8 : 10), material);
    mesh.renderOrder = -100;
    return mesh;
  }
  update(camera: THREE.PerspectiveCamera, sky: SkyState): void {
    const bodies: [[THREE.Mesh, number], [THREE.Mesh, number]] = [
      [this.sun, sky.sunAngle],
      [this.moon, sky.moonAngle],
    ];
    this.sun.visible = sky.celestialVisible !== false && sky.moonAngle < 0;
    this.moon.visible = sky.celestialVisible !== false && sky.moonAngle >= 0;
    for (const [mesh, angle] of bodies) {
      mesh.position.set(
        camera.position.x + Math.cos(angle) * 78,
        camera.position.y + Math.sin(angle) * 78,
        camera.position.z - 60,
      );
      mesh.quaternion.copy(camera.quaternion);
    }
  }
}
