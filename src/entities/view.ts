import { raycastVoxels } from "../player/raycast";
import { isSolid } from "../world/blocks";
import type { World } from "../world/world";
import { must } from "../core/assert";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { COLORS, FRIENDLY, type Creature } from "./creatures";
import { ITEMS } from "../items/catalog";
import type { SessionState } from "../survival/session";
function mobGeometry(m: Creature): THREE.BufferGeometry {
  const animal = FRIENDLY.includes(m.species);
  const spider = m.species === "spider";
  const parts: THREE.BufferGeometry[] = [];
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color = COLORS[m.species],
  ) {
    const geometry = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const rgb = new THREE.Color(color);
    const values = new Float32Array(geometry.getAttribute("position").count * 3);
    for (let i = 0; i < values.length; i += 3) {
      values[i] = rgb.r;
      values[i + 1] = rgb.g;
      values[i + 2] = rgb.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(values, 3));
    parts.push(geometry);
  }
  if (m.species === "chicken") {
    box(0.45, 0.5, 0.5, 0, 0.5, 0);
    box(0.32, 0.35, 0.3, 0, 0.85, -0.3);
    box(0.2, 0.1, 0.2, 0, 0.85, -0.52, 0xd2a13c);
    box(0.1, 0.14, 0.08, 0, 0.7, -0.47, 0xb84b3d);
    for (const x of [-0.12, 0.12]) box(0.07, 0.3, 0.1, x, 0.15, 0, 0xc89a43);
    for (const x of [-0.09, 0.09]) box(0.05, 0.05, 0.04, x, 0.92, -0.46, 0x24282b);
  } else if (spider) {
    box(0.8, 0.35, 0.8, 0, 0.38, 0);
    box(0.5, 0.3, 0.4, 0, 0.38, -0.55);
    for (const x of [-0.6, 0.6])
      for (const z of [-0.36, -0.12, 0.12, 0.36]) box(0.75, 0.1, 0.12, x, 0.2, z);
    for (const x of [-0.16, 0.16]) box(0.08, 0.06, 0.04, x, 0.43, -0.77, 0xb14b43);
  } else if (animal) {
    box(m.species === "sheep" ? 0.9 : 0.75, 0.65, 1, 0, 0.75, 0);
    box(0.5, 0.5, 0.45, 0, 0.93, -0.58, m.species === "sheep" ? 0xa79c82 : COLORS[m.species]);
    for (const x of [-0.27, 0.27]) for (const z of [-0.32, 0.32]) box(0.19, 0.45, 0.2, x, 0.25, z);
    if (m.species === "pig") box(0.28, 0.18, 0.1, 0, 0.87, -0.84, 0xbb7b78);
    if (m.species === "cow") {
      for (const x of [-0.23, 0.23]) box(0.1, 0.23, 0.1, x, 1.27, -0.55, 0xe7dfc4);
      box(0.025, 0.3, 0.4, -0.38, 0.78, 0, 0xe2d8c1);
      box(0.025, 0.3, 0.4, 0.38, 0.78, 0.2, 0xe2d8c1);
    }
    for (const x of [-0.14, 0.14]) box(0.08, 0.08, 0.04, x, 1.02, -0.82, 0x24282b);
  } else {
    const skeleton = m.species === "skeleton";
    box(skeleton ? 0.3 : 0.6, 0.75, 0.35, 0, 0.95, 0);
    box(0.6, 0.55, 0.5, 0, 1.58, 0);
    for (const x of [-0.18, 0.18])
      box(
        skeleton ? 0.12 : 0.22,
        0.6,
        0.25,
        x,
        0.3,
        0,
        m.species === "zombie" ? 0x52677e : COLORS[m.species],
      );
    for (const x of [-0.42, 0.42]) box(skeleton ? 0.12 : 0.2, 0.6, 0.2, x, 0.95, -0.15);
    for (const x of [-0.14, 0.14]) box(0.1, 0.1, 0.04, x, 1.65, -0.27, 0x24282b);
    box(0.18, 0.07, 0.04, 0, 1.43, -0.27, 0x343638);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => {
    p.dispose();
  });
  return merged;
}
export class EntityView {
  private scene: THREE.Scene | null;
  private world: World;
  private meshes = new Map<string, THREE.Mesh>();
  private sprites = new Map<string, HTMLDivElement>();
  private root: HTMLElement;
  private geometry = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  constructor(scene: THREE.Scene | null, root: HTMLElement, world: World) {
    this.world = world;
    this.scene = scene;
    this.root = root;
  }
  update(data: SessionState, camera: THREE.PerspectiveCamera): void {
    const alive = new Set<string>();
    const objects = [
      ...data.creatures.map((m) => ({
        key: `m${m.id}`,
        position: m.position,
        color: COLORS[m.species],
        mob: m,
        age: m.age,
      })),
      ...data.loot
        .filter(
          (l) =>
            Math.hypot(
              l.position.x - camera.position.x,
              l.position.y - camera.position.y,
              l.position.z - camera.position.z,
            ) < 32,
        )
        .slice(0, 256)
        .map((l) => ({
          key: `l${l.id}`,
          position: l.position,
          color: must(ITEMS[l.stack.id]).color,
          mob: null,
          age: l.age,
        })),
      ...data.arrows.map((a, i) => ({
        key: `a${i}`,
        position: a.position,
        color: 0xd4c6a4,
        mob: null,
        age: a.age,
      })),
    ];
    for (const object of objects) {
      alive.add(object.key);
      if (this.scene) {
        let mesh = this.meshes.get(object.key);
        if (!mesh) {
          mesh = new THREE.Mesh(
            object.mob ? mobGeometry(object.mob) : this.geometry,
            new THREE.MeshLambertMaterial({
              color: object.mob ? 0xffffff : object.color,
              vertexColors: !!object.mob,
            }),
          );
          this.scene.add(mesh);
          this.meshes.set(object.key, mesh);
        }
        mesh.position.set(
          object.position.x,
          object.position.y + (object.mob ? 0 : 0.3),
          object.position.z,
        );
        if (object.mob) {
          mesh.rotation.y = object.mob.intent;
          mesh.scale.setScalar(object.mob.age < 0 ? 0.6 : 1);
        } else mesh.rotation.y = object.age;
      } else {
        let el = this.sprites.get(object.key);
        if (!el) {
          el = document.createElement("div");
          el.className = "cpu-entity";
          el.style.background = new THREE.Color(object.color).getStyle();
          this.root.append(el);
          this.sprites.set(object.key, el);
        }
        const world = new THREE.Vector3(
          object.position.x,
          object.position.y + 0.5,
          object.position.z,
        );
        const distance = world.distanceTo(camera.position);
        const inFront =
          world.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())) > 0;
        const p = world.project(camera);
        el.hidden =
          !inFront ||
          distance > 35 ||
          Math.abs(p.x) > 1 ||
          Math.abs(p.y) > 1 ||
          raycastVoxels(camera.position, world.clone().sub(camera.position), distance, (x, y, z) =>
            isSolid(this.world.getBlock(x, y, z)),
          ) !== null;
        const size = Math.min(120, (object.mob ? 500 : 150) / Math.max(1, distance));
        el.style.cssText += `;left:${(p.x + 1) * 50}%;top:${(1 - p.y) * 50}%;width:${size}px;height:${object.mob ? size * 1.4 : size}px`;
      }
    }
    for (const [key, mesh] of this.meshes)
      if (!alive.has(key)) {
        this.scene?.remove(mesh);
        if (mesh.geometry !== this.geometry) mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.meshes.delete(key);
      }
    for (const [key, el] of this.sprites)
      if (!alive.has(key)) {
        el.remove();
        this.sprites.delete(key);
      }
  }
}
