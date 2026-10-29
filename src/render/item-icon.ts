import { must } from "../core/assert";
import { ITEMS } from "../items/catalog";
import { createTextureAtlas } from "./texture-atlas";
import { ATLAS_TILE_SIZE, tileForBlockFace, tileGridPosition } from "./atlas-layout";
const cache = new Map<string, string>();
let atlas: HTMLCanvasElement | undefined;
/** Small original procedural icons: no emoji, network assets or game textures. */
export function itemIcon(id: string): string {
  const existing = cache.get(id);
  if (existing) return existing;
  const def = ITEMS[id];
  if (!def) return "";
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  if (def.block !== undefined && id !== "torch" && id !== "seeds" && id !== "sapling") {
    if (!atlas) {
      const created = createTextureAtlas(1);
      atlas = created.canvas;
      created.texture.dispose();
    }
    const draw = (face: "top" | "east", matrix: number[], shade: number) => {
      const p = tileGridPosition(tileForBlockFace(must(def.block), face));
      ctx.save();
      ctx.setTransform(
        matrix[0] ?? 1,
        matrix[1] ?? 0,
        matrix[2] ?? 0,
        matrix[3] ?? 1,
        matrix[4] ?? 0,
        matrix[5] ?? 0,
      );
      ctx.drawImage(
        must(atlas),
        p.col * ATLAS_TILE_SIZE,
        p.row * ATLAS_TILE_SIZE,
        16,
        16,
        0,
        0,
        16,
        16,
      );
      if (shade) {
        ctx.fillStyle = `rgba(0,0,0,${shade})`;
        ctx.fillRect(0, 0, 16, 16);
      }
      ctx.restore();
    };
    draw("top", [14 / 16, 8 / 16, -14 / 16, 8 / 16, 16, 2], 0);
    draw("east", [14 / 16, 8 / 16, 0, 12 / 16, 2, 10], 0.1);
    draw("east", [14 / 16, -8 / 16, 0, 12 / 16, 16, 18], 0.25);
  } else {
    ctx.scale(2, 2);
    const pixel = (color: string, x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    };
    if (def.tool) {
      // Diagonal wooden grip, with a material-specific head.
      for (let i = 0; i < 8; i++) pixel("#6e4d2d", 4 + i, 13 - i, 2, 2);
      const c = def.color;
      if (def.tool === "pick") {
        pixel(c, 2, 2, 9, 2);
        pixel(c, 10, 3, 3, 3);
        pixel("#e9e0ba", 3, 2, 6, 1);
      }
      if (def.tool === "axe") {
        pixel(c, 3, 2, 7, 6);
        pixel(c, 2, 3, 2, 4);
      }
      if (def.tool === "shovel") {
        pixel(c, 8, 2, 5, 5);
        pixel(c, 9, 1, 3, 1);
      }
      if (def.tool === "hoe") {
        pixel(c, 3, 2, 8, 2);
        pixel(c, 3, 3, 2, 3);
      }
      if (def.tool === "sword") {
        for (let i = 0; i < 9; i++) pixel(c, 5 + i, 10 - i, 2, 3);
        pixel("#54402e", 3, 9, 5, 2);
      }
      if (def.enchanted) for (let i = 0; i < 4; i++) pixel("#bc82ef", 4 + i * 2, 8 - i, 2, 1);
    } else if (id === "fishingRod" || id === "bow") {
      for (let i = 0; i < 10; i++) pixel("#a27b48", 3 + i / 2, 13 - i, 2, 2);
      pixel("#e3ded0", 10, 3, 1, 10);
      if (id === "fishingRod") {
        pixel("#e3ded0", 9, 12, 2, 1);
        pixel("#df4a4a", 8, 12, 2, 2);
      } else {
        pixel("#a27b48", 8, 12, 3, 2);
        pixel("#a27b48", 8, 2, 3, 2);
      }
    } else if (id.endsWith("Potion") || id === "bottle" || id === "waterBottle") {
      pixel("#b6d9e3", 6, 2, 4, 4);
      pixel("#b6d9e3", 4, 6, 8, 7);
      if (id !== "bottle") pixel(def.color, 5, 8, 6, 4);
      pixel("#916948", 6, 1, 4, 2);
      pixel("#edf8fc", 4, 7, 1, 4);
    } else if (id === "feather") {
      for (let i = 0; i < 9; i++) {
        pixel("#e9e4d6", 4 + i, 11 - i, 3, 3);
        pixel("#c5bdab", 4 + i, 13 - i, 1, 1);
      }
    } else if (id === "arrow") {
      for (let i = 0; i < 10; i++) pixel("#b19a73", 3 + i, 12 - i, 1, 1);
      pixel("#c9d2dc", 11, 1, 3, 3);
      pixel("#eee9d9", 2, 10, 3, 3);
    } else if (id.endsWith("Bucket") || id === "bucket") {
      pixel("#bbc5ce", 3, 5, 10, 8);
      pixel("#e4eaf0", 4, 3, 8, 2);
      pixel(id === "bucket" ? "#4d5158" : def.color, 4, 6, 8, 3);
    } else if (id === "enderEye" || id === "enderPearl" || id === "emerald") {
      pixel(def.color, 4, 3, 8, 10);
      pixel(def.color, 2, 5, 12, 6);
      pixel("#b9ead0", 4, 4, 3, 2);
      if (id === "enderEye") pixel("#28302d", 6, 5, 4, 6);
    } else if (id === "torch") {
      pixel("#79532e", 7, 5, 2, 9);
      pixel("#e68a28", 6, 2, 4, 4);
      pixel("#fff3a6", 7, 1, 2, 4);
    } else if (id === "stick") {
      for (let i = 0; i < 10; i++) pixel("#a27b48", 3 + i, 12 - i, 2, 2);
    } else if (id === "wheat") {
      pixel("#9b9b4e", 7, 3, 1, 11);
      for (let y = 2; y < 10; y += 2) {
        pixel("#dfc664", 4, y, 3, 2);
        pixel("#e9cf72", 8, y - 1, 3, 2);
      }
    } else if (id === "sapling") {
      pixel("#8b6539", 7, 7, 2, 7);
      pixel("#4f873a", 3, 3, 10, 6);
      pixel("#79a347", 5, 1, 6, 3);
    } else if (id === "seeds") {
      for (const [x, y] of [
        [3, 4],
        [7, 9],
        [10, 3],
        [3, 11],
      ])
        pixel("#91b75e", x ?? 0, y ?? 0, 3, 2);
    } else if (id === "iron" || id === "gold") {
      pixel(def.color, 3, 5, 10, 6);
      pixel("#f7ecd5", 4, 4, 8, 2);
      pixel("#5e6c6b", 3, 11, 10, 1);
    } else if (id === "diamond") {
      pixel(def.color, 5, 2, 6, 3);
      pixel(def.color, 3, 5, 10, 4);
      pixel(def.color, 5, 9, 6, 3);
      pixel("#b7fff1", 5, 3, 2, 4);
      pixel(def.color, 7, 12, 2, 2);
    } else if (id === "bone") {
      for (let i = 0; i < 8; i++) pixel("#e2dfcc", 4 + i, 11 - i, 2, 2);
      pixel("#e2dfcc", 2, 10, 3, 4);
      pixel("#e2dfcc", 10, 1, 4, 3);
    } else {
      pixel(def.color, 4, 3, 8, 10);
      pixel(def.color, 2, 5, 12, 6);
      pixel(id === "coal" ? "#52545c" : "#edc48c", 4, 4, 3, 2);
      pixel("#0004", 4, 11, 8, 2);
    }
  }
  const url = canvas.toDataURL();
  cache.set(id, url);
  return url;
}
