import { must } from "../core/assert";
import * as THREE from "three";
import type { PlayerController } from "../player/controller";
import type { Stack } from "../items/catalog";
import { itemIcon } from "./item-icon";

type AvatarPlayer = Pick<
  PlayerController,
  | "position"
  | "perspective"
  | "cameraSeparation"
  | "eyeYaw"
  | "eyePitch"
  | "isCrouching"
  | "isActive"
>;

/** Original block character. Limb motion follows actual travel, even during
 * automated play; aiming and camera distance never change the physical body. */
export class PlayerAvatar {
  private root = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private arms = [new THREE.Group(), new THREE.Group()];
  private legs = [new THREE.Group(), new THREE.Group()];
  private held = new THREE.Group();
  private materials = new Map<string, THREE.MeshBasicMaterial>();
  private selected = "";
  private previous: { x: number; z: number } | undefined;
  private stride = 0;
  private swing = 0;
  private attacking = false;

  constructor(scene: THREE.Scene, shirt = 0x3f8f85, listenToPointer = true) {
    this.root.add(this.body);
    const box = (
      parent: THREE.Group,
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      color: number,
    ) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color }),
      );
      mesh.position.set(x, y, z);
      parent.add(mesh);
    };
    box(this.body, 0.5, 0.65, 0.28, 0, 0.975, 0, shirt);
    this.head.position.y = 1.5;
    box(this.head, 0.5, 0.5, 0.5, 0, 0, 0, 0xc8a180);
    box(this.head, 0.51, 0.17, 0.51, 0, 0.19, 0, 0x3f3030);
    box(this.head, 0.51, 0.3, 0.07, 0, 0.05, 0.23, 0x3f3030);
    for (const x of [-0.11, 0.11]) box(this.head, 0.07, 0.06, 0.012, x, 0.02, -0.255, 0x263b42);
    box(this.head, 0.13, 0.04, 0.012, 0, -0.12, -0.255, 0x775447);
    this.body.add(this.head);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const arm = must(this.arms[i]),
        leg = must(this.legs[i]);
      arm.position.set(side * 0.35, 1.28, 0);
      box(arm, 0.2, 0.58, 0.22, 0, -0.29, 0, 0xc8a180);
      box(arm, 0.21, 0.23, 0.23, 0, -0.105, 0, shirt);
      leg.position.set(side * 0.14, 0.65, 0);
      box(leg, 0.23, 0.65, 0.26, 0, -0.325, 0, 0x465276);
      box(leg, 0.24, 0.13, 0.28, 0, -0.585, -0.01, 0x303a4b);
      this.body.add(arm, leg);
    }
    this.held.position.set(0, -0.53, -0.13);
    must(this.arms[1]).add(this.held);
    if (listenToPointer) {
      document.addEventListener("mousedown", (e) => {
        if (e.button === 0) this.attacking = true;
      });
      document.addEventListener("mouseup", () => {
        this.attacking = false;
      });
      document.addEventListener("pointerlockchange", () => {
        this.attacking = false;
      });
      window.addEventListener("blur", () => {
        this.attacking = false;
      });
    }
    scene.add(this.root);
  }

  update(player: AvatarPlayer, item: Stack | null, dt: number, attacking = this.attacking): void {
    const p = player.position;
    const distance = this.previous ? Math.hypot(p.x - this.previous.x, p.z - this.previous.z) : 0;
    this.previous = { x: p.x, z: p.z };
    this.stride += Math.min(distance, 0.5) * 3;
    const target = distance > 0.001 ? Math.sin(this.stride) * 0.65 : 0;
    this.swing += (target - this.swing) * (1 - Math.exp(-18 * dt));
    // Hide only when a cramped space brings the lens inside the character.
    this.root.visible = player.perspective !== 0 && player.cameraSeparation > 0.75;
    this.root.position.set(p.x, p.y, p.z);
    this.root.rotation.y = player.eyeYaw;
    this.body.position.y = player.isCrouching ? -0.2 : 0;
    this.head.rotation.x = player.eyePitch;
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? 1 : -1;
      must(this.legs[i]).rotation.x = this.swing * sign;
      must(this.arms[i]).rotation.x = -this.swing * sign;
    }
    if (attacking && player.isActive)
      must(this.arms[1]).rotation.x = -0.9 - Math.sin(performance.now() / 90) * 0.55;
    else if (item) must(this.arms[1]).rotation.x -= 0.25;
    const id = item?.id ?? "";
    if (id === this.selected) return;
    this.selected = id;
    this.held.clear();
    if (!id) return;
    let material = this.materials.get(id);
    if (!material) {
      const image = new Image();
      const texture = new THREE.Texture(image);
      texture.magFilter = texture.minFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      image.onload = () => {
        texture.needsUpdate = true;
      };
      image.src = itemIcon(id);
      material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.2,
        side: THREE.DoubleSide,
      });
      this.materials.set(id, material);
    }
    const sprite = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), material);
    sprite.rotation.set(-0.3, Math.PI / 2, 0.3);
    this.held.add(sprite);
  }
}
