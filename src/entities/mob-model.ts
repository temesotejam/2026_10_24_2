import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { COLORS, type Species } from "./creatures";

/** Species silhouettes and pixel details, merged into one draw call per creature.
 * Feet sit at y=0 and faces point toward -Z, matching movement intent. */
export function mobGeometry(species: Species): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const base = COLORS[species];
  const ink = 0x24212b;
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color = base,
    rotation = 0,
  ) {
    const g = new THREE.BoxGeometry(w, h, d).rotateZ(rotation).translate(x, y, z);
    const rgb = new THREE.Color(color);
    const colors = new Float32Array(g.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([rgb.r, rgb.g, rgb.b], i);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    parts.push(g);
  }
  function eyes(x: number, y: number, z: number, color = ink, size = 0.075) {
    for (const side of [-1, 1]) box(size, size, 0.025, side * x, y, z, color);
  }
  function legs(x: number, z: number, height: number, color = base) {
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        box(0.17, height, 0.19, side * x, height / 2, end * z, color);
        box(0.18, 0.12, 0.2, side * x, 0.06, end * z, species === "pig" ? 0x9a5861 : 0x443d37);
      }
  }
  switch (species) {
    case "pig":
      box(0.74, 0.55, 1.05, 0, 0.66, 0, 0xe5a0a7);
      legs(0.25, 0.34, 0.42, 0xcc8991);
      box(0.53, 0.46, 0.46, 0, 0.8, -0.6, 0xefafb4);
      box(0.33, 0.2, 0.12, 0, 0.72, -0.88, 0xcf7786);
      for (const s of [-1, 1]) {
        box(0.16, 0.2, 0.12, s * 0.22, 1.07, -0.55, 0xd88494, s * 0.24);
        box(0.055, 0.065, 0.018, s * 0.085, 0.73, -0.95, 0x7a3e50);
      }
      eyes(0.16, 0.88, -0.842);
      box(0.08, 0.09, 0.23, 0, 0.74, 0.61, 0xd88494);
      box(0.14, 0.08, 0.07, 0.04, 0.82, 0.71, 0xd88494);
      break;
    case "cow":
      box(0.8, 0.72, 1.15, 0, 0.92, 0, 0x674e3c);
      legs(0.28, 0.4, 0.58, 0xf1e6cf);
      box(0.53, 0.58, 0.5, 0, 1.04, -0.72, 0xeee6d6);
      box(0.47, 0.24, 0.14, 0, 0.88, -1.03, 0xba8c80);
      eyes(0.17, 1.15, -0.982);
      for (const s of [-1, 1]) {
        box(0.24, 0.12, 0.22, s * 0.33, 1.19, -0.65, 0x674e3c);
        box(0.095, 0.27, 0.1, s * 0.22, 1.43, -0.68, 0xd7c89e);
        box(0.018, 0.38, 0.42, s * 0.409, 1.02, -0.17, 0xeee6d6);
        box(0.018, 0.25, 0.24, s * 0.409, 0.79, 0.38, 0xeee6d6);
        box(0.06, 0.045, 0.018, s * 0.12, 0.9, -1.108, 0x60484b);
      }
      box(0.3, 0.15, 0.4, 0, 0.5, 0.2, 0xc89a91);
      box(0.08, 0.46, 0.08, 0, 0.75, 0.64);
      box(0.14, 0.15, 0.14, 0, 0.48, 0.64, 0x352c29);
      break;
    case "sheep":
      box(0.94, 0.7, 1.14, 0, 0.86, 0, 0xe8e5d7);
      legs(0.29, 0.37, 0.51, 0x8c7b68);
      for (const s of [-1, 1])
        for (const z of [-0.35, 0.05, 0.4]) box(0.13, 0.43, 0.29, s * 0.48, 0.85, z, 0xd4d2c1);
      box(0.57, 0.53, 0.46, 0, 1.03, -0.65, 0xe8e5d7);
      box(0.39, 0.31, 0.07, 0, 0.98, -0.918, 0x8e7f70);
      for (const s of [-1, 1]) box(0.2, 0.12, 0.17, s * 0.31, 1.04, -0.65, 0x8e7f70);
      eyes(0.12, 1.045, -0.96);
      box(0.12, 0.065, 0.025, 0, 0.9, -0.963, 0x584c48);
      box(0.2, 0.22, 0.2, 0, 0.83, 0.65, 0xe8e5d7);
      break;
    case "chicken":
      box(0.47, 0.47, 0.54, 0, 0.5, 0, 0xf2efe0);
      box(0.32, 0.37, 0.32, 0, 0.84, -0.27, 0xfff8e6);
      box(0.23, 0.12, 0.18, 0, 0.82, -0.51, 0xe6ac31);
      box(0.11, 0.16, 0.07, 0, 0.67, -0.46, 0xc94636);
      box(0.09, 0.15, 0.27, 0, 1.09, -0.26, 0xc94636);
      for (const s of [-1, 1]) {
        box(0.1, 0.3, 0.4, s * 0.27, 0.53, 0.02, 0xd9d8c6, s * 0.14);
        box(0.065, 0.29, 0.07, s * 0.12, 0.18, 0, 0xd9a23c);
        box(0.16, 0.05, 0.22, s * 0.12, 0.025, -0.06, 0xd9a23c);
      }
      box(0.28, 0.29, 0.12, 0, 0.68, 0.34, 0xd9d8c6);
      eyes(0.1, 0.91, -0.438, ink, 0.055);
      break;
    case "spider":
      box(0.78, 0.4, 0.8, 0, 0.43, 0.23, 0x38323e);
      box(0.52, 0.3, 0.44, 0, 0.39, -0.44, 0x51404b);
      for (const s of [-1, 1])
        for (let i = 0; i < 4; i++) {
          const z = -0.46 + i * 0.29;
          box(0.63, 0.1, 0.1, s * 0.61, 0.4, z, 0x51404b, s * 0.38);
          box(0.1, 0.42, 0.1, s * 0.92, 0.21, z + (i - 1.5) * 0.09, 0x38323e, s * 0.24);
        }
      eyes(0.16, 0.44, -0.674, 0xed5141, 0.1);
      eyes(0.055, 0.52, -0.674, 0xf18a57, 0.06);
      for (const s of [-1, 1]) box(0.06, 0.16, 0.08, s * 0.13, 0.25, -0.67, 0xd4bdb0);
      break;
    case "skeleton": {
      const bone = 0xd9d5bd;
      box(0.1, 0.68, 0.13, 0, 1.02, 0.04, bone);
      for (const y of [0.86, 1.02, 1.18]) {
        box(0.48, 0.07, 0.25, 0, y, 0, bone);
        for (const s of [-1, 1]) box(0.065, 0.12, 0.08, s * 0.22, y - 0.03, -0.11, bone);
      }
      box(0.4, 0.14, 0.23, 0, 0.7, 0, bone);
      box(0.51, 0.48, 0.45, 0, 1.6, 0, bone);
      eyes(0.13, 1.66, -0.238, 0x332d33, 0.13);
      box(0.065, 0.09, 0.02, 0, 1.55, -0.238, 0x332d33);
      for (const x of [-0.13, 0, 0.13]) box(0.045, 0.07, 0.025, x, 1.4, -0.24, 0x665c52);
      for (const s of [-1, 1]) {
        box(0.12, 0.63, 0.13, s * 0.15, 0.34, 0, bone);
        box(0.15, 0.1, 0.29, s * 0.15, 0.05, -0.07, bone);
        box(0.12, 0.56, 0.13, s * 0.34, 1.04, -0.17, bone, -s * 0.14);
      }
      // Segmented bow and a taut, pale string are visible from either side.
      for (const y of [0.77, 0.97, 1.17])
        box(0.065, 0.24, 0.07, -0.46, y, y === 0.97 ? -0.48 : -0.39, 0x966337);
      box(0.018, 0.65, 0.018, -0.46, 0.97, -0.3, 0xd6d0ac);
      break;
    }
    case "zombie":
      box(0.61, 0.69, 0.34, 0, 1.02, 0, 0x3b8c8b);
      box(0.58, 0.52, 0.48, 0, 1.64, 0, 0x739d50);
      box(0.59, 0.1, 0.49, 0, 1.9, 0, 0x46613b);
      for (const s of [-1, 1]) {
        box(0.22, 0.65, 0.27, s * 0.17, 0.34, 0, 0x494b79);
        box(0.24, 0.12, 0.36, s * 0.17, 0.06, -0.05, 0x343b43);
        box(0.2, 0.21, 0.3, s * 0.41, 1.2, -0.12, 0x3b8c8b);
        box(0.18, 0.19, 0.43, s * 0.41, 1.18, -0.43, 0x739d50);
      }
      eyes(0.145, 1.68, -0.253, 0x263829, 0.1);
      box(0.22, 0.065, 0.025, 0, 1.47, -0.253, 0x384a2d);
      box(0.12, 0.13, 0.018, -0.18, 0.77, -0.179, 0x739d50);
      break;
    case "villager":
      box(0.67, 1.02, 0.46, 0, 0.77, 0, 0x855940);
      box(0.49, 0.69, 0.49, 0, 1.62, 0, 0xba8b6b);
      box(0.53, 0.13, 0.52, 0, 1.99, 0, 0x644232);
      box(0.42, 0.62, 0.02, 0, 0.68, -0.24, 0xc1aa7a);
      for (const s of [-1, 1]) box(0.22, 0.25, 0.32, s * 0.17, 0.125, -0.035, 0x493b31);
      box(0.72, 0.2, 0.25, 0, 1.09, -0.32, 0x684633);
      box(0.24, 0.14, 0.09, 0, 1.09, -0.49, 0xba8b6b);
      eyes(0.135, 1.7, -0.259, 0x395541, 0.075);
      box(0.4, 0.055, 0.035, 0, 1.8, -0.27, 0x503b30);
      box(0.15, 0.29, 0.21, 0, 1.53, -0.36, 0xa87757);
      break;
    case "wanderer":
      box(0.36, 0.7, 0.25, 0, 1.35, 0, 0x292330);
      box(0.44, 0.4, 0.4, 0, 1.94, 0, 0x332b40);
      for (const s of [-1, 1]) {
        box(0.115, 1, 0.12, s * 0.125, 0.5, 0, 0x292330);
        box(0.1, 1.18, 0.11, s * 0.29, 1.05, 0, 0x393047);
        box(0.13, 0.18, 0.14, s * 0.29, 0.42, -0.015, 0x53405f);
        box(0.15, 0.055, 0.025, s * 0.115, 1.97, -0.212, 0xe0a0fa);
        box(0.045, 0.07, 0.028, s * 0.115, 1.97, -0.215, 0x9744cc);
      }
      break;
    case "ember":
      // No humanoid legs: a suspended coal core and a crown of golden rods.
      box(0.43, 0.56, 0.4, 0, 1.13, 0, 0x9c4620);
      box(0.57, 0.48, 0.5, 0, 1.66, 0, 0xf2bd52);
      box(0.42, 0.1, 0.022, 0, 1.56, -0.264, 0x683424);
      eyes(0.14, 1.74, -0.265, 0xfff0b0, 0.11);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const x = Math.cos(a) * 0.53,
          z = Math.sin(a) * 0.53;
        const y = i % 2 ? 0.72 : 1.26;
        box(0.12, 0.55, 0.12, x, y, z, 0xe9a331, Math.cos(a) * 0.12);
        box(0.13, 0.12, 0.13, x, y + 0.22, z, 0xffdc73);
      }
      box(0.18, 0.27, 0.18, 0, 0.62, 0, 0xf6cc62);
      break;
    case "mossling":
      // A rooted moss creature: leafy crown, stone snout, four short roots.
      box(0.69, 0.78, 0.52, 0, 0.83, 0, 0x507649);
      legs(0.22, 0.19, 0.47, 0x665d42);
      box(0.64, 0.54, 0.56, 0, 1.42, -0.02, 0x71975a);
      for (const s of [-1, 1]) {
        box(0.17, 0.45, 0.21, s * 0.43, 0.99, 0, 0x65884b, s * 0.23);
        box(0.2, 0.26, 0.23, s * 0.23, 1.78, 0.02, 0x8ba45d, s * 0.27);
        box(0.16, 0.14, 0.025, s * 0.16, 1.46, -0.315, 0x293d32);
      }
      box(0.28, 0.24, 0.15, 0, 1.24, -0.34, 0xa1a07c);
      box(0.17, 0.08, 0.02, 0, 1.22, -0.425, 0x354d35);
      box(0.25, 0.16, 0.025, -0.12, 0.87, -0.272, 0x94a162);
      break;
  }
  const merged = mergeGeometries(parts);
  parts.forEach((part) => {
    part.dispose();
  });
  merged.computeBoundingSphere();
  return merged;
}
