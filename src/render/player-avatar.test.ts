import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { PlayerAvatar } from "./player-avatar";
import { must } from "../core/assert";

afterEach(() => vi.unstubAllGlobals());

it("animates the companion from its own action rather than the player's mouse", () => {
  const doc = new EventTarget();
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", new EventTarget());
  const scene = new THREE.Scene();
  const player = new PlayerAvatar(scene);
  const companion = new PlayerAvatar(scene, 0xb36338, false);
  const pose = {
    position: { x: 0, y: 1, z: 0 },
    perspective: 1 as const,
    cameraSeparation: 4,
    eyeYaw: 0,
    eyePitch: 0,
    isCrouching: false,
    isActive: true,
  };
  const rightArm = (i: number) => must(must(must(scene.children[i]).children[0]).children[4]);
  const press = new Event("mousedown");
  Object.defineProperty(press, "button", { value: 0 });
  doc.dispatchEvent(press);
  player.update(pose, null, 1 / 60);
  companion.update(pose, null, 1 / 60, false);
  expect(rightArm(0).rotation.x).toBeLessThan(-0.3);
  expect(rightArm(1).rotation.x).toBeCloseTo(0);
  companion.update(pose, null, 1 / 60, true);
  expect(rightArm(1).rotation.x).toBeLessThan(-0.3);
});
