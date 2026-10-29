import * as THREE from "three";
import { isSolid } from "../world/blocks";
import type { World } from "../world/world";
import type { Weather } from "../world/weather";
import type { Adventure } from "../survival/adventure";
import { dragonPosition, dragonYaw } from "../survival/dragon";

/** Bounded procedural precipitation, plus a visible fishing float and line. */
export class AdventureView {
  private rain: THREE.Points;
  private positions = new Float32Array(192 * 3);
  private float: THREE.Mesh;
  private line: THREE.Line;
  private dragon = new THREE.Group();
  private wings: THREE.Mesh[] = [];
  private arrows: THREE.InstancedMesh;
  private arrowMatrix = new THREE.Matrix4();
  constructor(scene: THREE.Scene) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.rain = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: 0xb5cce4, size: 0.08, transparent: true, opacity: 0.75 }),
    );
    this.rain.frustumCulled = false;
    this.float = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.15, 0.13),
      new THREE.MeshBasicMaterial({ color: 0xe74949 }),
    );
    this.line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xe3ded0 }),
    );
    this.line.frustumCulled = false;
    const dark = new THREE.MeshBasicMaterial({ color: 0x25202f });
    const box = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      color = 0x25202f,
    ) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        color === 0x25202f ? dark : new THREE.MeshBasicMaterial({ color }),
      );
      mesh.position.set(x, y, z);
      this.dragon.add(mesh);
    };
    box(2.8, 1.8, 5, 0, 0, 0);
    box(1.3, 1.3, 2.5, 0, 0.3, -3.3);
    box(1.7, 1.2, 2, 0, 0.4, -5);
    box(1.5, 0.35, 2.2, 0, -0.25, -5);
    box(0.2, 0.25, 0.5, -0.85, 0.65, -5.4, 0xcf71e2);
    box(0.2, 0.25, 0.5, 0.85, 0.65, -5.4, 0xcf71e2);
    for (let i = 0; i < 5; i++) box(0.9 - i * 0.12, 0.8 - i * 0.1, 1.5, 0, -0.15 * i, 3 + i * 1.2);
    for (const x of [-1.1, 1.1]) for (const z of [-1.7, 1.7]) box(0.6, 1.6, 0.7, x, -1, z);
    for (const side of [-1, 1]) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [0, 0, -2, side * 8, 0.2, -1, side * 5, 0, 4, 0, 0, -2, side * 5, 0, 4, 0, 0, 2],
          3,
        ),
      );
      const wing = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color: 0x60446e, side: THREE.DoubleSide }),
      );
      wing.position.x = side * 1.1;
      this.wings.push(wing);
      this.dragon.add(wing);
    }
    this.arrows = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.07, 0.07, 0.65),
      new THREE.MeshBasicMaterial({ color: 0xd0c1a5 }),
      32,
    );
    this.arrows.frustumCulled = false;
    this.arrows.count = 0;
    scene.add(this.rain, this.float, this.line, this.dragon, this.arrows);
  }
  update(
    world: World,
    camera: THREE.PerspectiveCamera,
    weather: Weather,
    time: number,
    adventure: Adventure,
  ): void {
    const c = camera.position;
    const state = adventure.state.dragon;
    this.dragon.visible = world.dimension === "end" && !state.defeated;
    if (this.dragon.visible) {
      const p = dragonPosition(state.phase);
      this.dragon.position.set(p.x, p.y, p.z);
      this.dragon.rotation.y = dragonYaw(state.phase);
      this.wings.forEach((wing, i) => {
        wing.rotation.z = Math.sin(time * 5) * 0.35 * (i ? -1 : 1);
      });
    }
    const rotation = new THREE.Quaternion(),
      direction = new THREE.Vector3();
    this.arrows.count = adventure.shots.length;
    adventure.shots.forEach((shot, i) => {
      direction.set(shot.velocity.x, shot.velocity.y, shot.velocity.z).normalize();
      rotation.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      this.arrowMatrix.compose(
        new THREE.Vector3(shot.position.x, shot.position.y, shot.position.z),
        rotation,
        new THREE.Vector3(1, 1, 1),
      );
      this.arrows.setMatrixAt(i, this.arrowMatrix);
    });
    this.arrows.instanceMatrix.needsUpdate = true;
    let sheltered = false;
    for (let y = Math.floor(c.y) + 1; y < 96; y++)
      if (isSolid(world.getBlock(Math.floor(c.x), y, Math.floor(c.z)))) {
        sheltered = true;
        break;
      }
    this.rain.visible = weather !== "clear" && !sheltered;
    if (this.rain.visible) {
      const snow = weather === "snow";
      (this.rain.material as THREE.PointsMaterial).size = snow ? 0.16 : 0.065;
      for (let i = 0; i < 192; i++) {
        this.positions[i * 3] =
          c.x + ((i * 37.17) % 24) - 12 + (snow ? Math.sin(time + i) * 0.3 : 0);
        this.positions[i * 3 + 1] =
          c.y + ((((i * 7.31 - time * (snow ? 1.3 : 15)) % 14) + 14) % 14) - 5;
        this.positions[i * 3 + 2] = c.z + ((i * 17.71) % 24) - 12;
      }
      this.rain.geometry.getAttribute("position").needsUpdate = true;
    }
    const cast = adventure.cast;
    this.float.visible = this.line.visible = cast !== null;
    if (cast) {
      this.float.position.set(
        cast.point.x + 0.5,
        cast.point.y + 0.9 + Math.sin(time * 6) * 0.04,
        cast.point.z + 0.5,
      );
      if (cast.elapsed >= 5) this.float.position.y -= 0.12;
      const attribute = this.line.geometry.getAttribute("position") as THREE.BufferAttribute;
      attribute.setXYZ(0, c.x + 0.2, c.y - 0.25, c.z);
      attribute.setXYZ(1, this.float.position.x, this.float.position.y, this.float.position.z);
      attribute.needsUpdate = true;
    }
  }
}
