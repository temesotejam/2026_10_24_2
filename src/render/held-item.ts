import * as THREE from "three";
import { ITEMS, type Stack } from "../items/catalog";
import { isSolid, type BlockId } from "../world/blocks";
import type { Vec3 } from "../player/physics";
import { itemIcon } from "./item-icon";
import { createTextureAtlas } from "./texture-atlas";
import { tileForBlockFace, tileGridPosition, type Face } from "./atlas-layout";

/** Original item sprites and textured blocks in the player's actual hand.
 * Cached materials keep hotbar switching from allocating GPU resources per frame. */
export class HeldItemView {
  private readonly root = new THREE.Group();
  private readonly block = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  private readonly sprite = new THREE.PlaneGeometry(0.32, 0.32);
  private readonly arm = new THREE.BoxGeometry(0.14, 0.35, 0.14);
  private readonly skin = new THREE.MeshBasicMaterial({
    color: 0xcba67d,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  private readonly materials = new Map<string, THREE.Material | THREE.Material[]>();
  private atlas: HTMLCanvasElement | undefined;
  private selected: string | undefined;
  private lastPosition: Vec3 | undefined;
  private stride = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    camera.add(this.root);
  }

  private blockMaterials(id: BlockId): THREE.Material[] {
    if (!this.atlas) {
      const atlas = createTextureAtlas(1);
      this.atlas = atlas.canvas;
      atlas.texture.dispose();
    }
    const atlas = this.atlas;
    return (["east", "west", "top", "bottom", "south", "north"] as Face[]).map((face) => {
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Item canvas is unavailable");
      const tile = tileGridPosition(tileForBlockFace(id, face));
      context.drawImage(atlas, tile.col * 16, tile.row * 16, 16, 16, 0, 0, 16, 16);
      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
    });
  }

  update(item: Stack | null, firstPerson: boolean, position: Vec3): void {
    this.root.visible = firstPerson;
    if (this.lastPosition)
      this.stride += Math.min(
        0.5,
        Math.hypot(position.x - this.lastPosition.x, position.z - this.lastPosition.z),
      );
    this.lastPosition = { ...position };
    this.root.position.set(0.47, -0.34 + Math.sin(this.stride * Math.PI) * 0.012, -0.72);
    const id = item?.id ?? "";
    if (id === this.selected) return;
    this.selected = id;
    this.root.clear();
    const def = item ? ITEMS[item.id] : undefined;
    if (!def) {
      const mesh = new THREE.Mesh(this.arm, this.skin);
      mesh.rotation.z = -0.25;
      mesh.renderOrder = 1000;
      this.root.add(mesh);
      return;
    }
    const block = def.block !== undefined && isSolid(def.block);
    let material = this.materials.get(id);
    if (!material) {
      if (block && def.block !== undefined) material = this.blockMaterials(def.block);
      else {
        const image = new Image();
        const texture = new THREE.Texture(image);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        image.onload = () => {
          texture.needsUpdate = true;
        };
        image.src = itemIcon(id);
        material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          alphaTest: 0.1,
          depthTest: false,
          depthWrite: false,
        });
      }
      this.materials.set(id, material);
    }
    const mesh = new THREE.Mesh(block ? this.block : this.sprite, material);
    mesh.rotation.set(block ? 0.15 : 0, block ? -0.5 : -0.25, block ? 0.1 : -0.12);
    mesh.renderOrder = 1000;
    this.root.add(mesh);
  }
}
