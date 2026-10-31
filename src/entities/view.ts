import { raycastVoxels } from "../player/raycast";
import { isSolid } from "../world/blocks";
import type { World } from "../world/world";
import { must } from "../core/assert";
import * as THREE from "three";
import { COLORS } from "./creatures";
import { mobGeometry } from "./mob-model";
import { ITEMS } from "../items/catalog";
import type { SessionState } from "../survival/session";
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
      ...(!this.scene && data.companion && data.companion.vitals.health > 0
        ? [
            {
              key: "companion",
              position: data.companion.position,
              color: 0xb36338,
              mob: null,
              age: 0,
            },
          ]
        : []),
    ];
    for (const object of objects) {
      alive.add(object.key);
      if (this.scene) {
        let mesh = this.meshes.get(object.key);
        if (!mesh) {
          mesh = new THREE.Mesh(
            object.mob ? mobGeometry(object.mob.species) : this.geometry,
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
