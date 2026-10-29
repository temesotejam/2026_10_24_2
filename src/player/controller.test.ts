import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerController } from "./controller";
import { CROUCH_EYE_HEIGHT, PLAYER_EYE_HEIGHT, MOVE_SPEED, SPRINT_MULTIPLIER } from "./physics";
import { BlockId } from "../world/blocks";

function setup(coarse = true) {
  const doc = Object.assign(new EventTarget(), {
    pointerLockElement: null,
    exitPointerLock: vi.fn(),
    querySelector: (selector: string) => (selector === "#play-button" ? play : overlay),
  });
  const win = Object.assign(new EventTarget(), { matchMedia: () => ({ matches: coarse }) });
  const play = new EventTarget();
  const overlay = { classList: { toggle: vi.fn() } };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
  const camera = new THREE.PerspectiveCamera();
  const world = {
    getBlock: (_x: number, y: number, _z: number) => (y <= 1 ? BlockId.STONE : BlockId.AIR),
  };
  const canvas = Object.assign(new EventTarget(), {
    requestPointerLock: vi.fn(() => Promise.resolve()),
  });
  const player = new PlayerController(camera, canvas as unknown as HTMLElement, world, 0.5, 0.5);
  function key(code: string, type = "keydown") {
    const event = Object.assign(new Event(type, { cancelable: true }), { code });
    doc.dispatchEvent(event);
    return event;
  }
  function advance() {
    for (let i = 0; i < 60; i++) player.update(1 / 60);
  }
  return { player, camera, doc, win, play, key, advance, canvas, world };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("classic keyboard controls", () => {
  it("maps either Ctrl to sprint, either Shift to crouch, and lowers the camera", () => {
    for (const side of ["Left", "Right"]) {
      const { player, camera, play, key, advance } = setup();
      play.dispatchEvent(new Event("click"));
      key("KeyW");
      advance();
      const walked = 0.5 - player.position.z;
      expect(walked).toBeCloseTo(MOVE_SPEED);
      key(`Control${side}`);
      advance();
      const sprinted = 0.5 - player.position.z - walked;
      expect(sprinted / walked).toBeCloseTo(SPRINT_MULTIPLIER);
      expect(key(`Shift${side}`).defaultPrevented).toBe(true);
      advance();
      const crouched = 0.5 - player.position.z - walked - sprinted;
      expect(crouched / walked).toBeCloseTo(0.3);
      expect(camera.position.y - player.position.y).toBeCloseTo(CROUCH_EYE_HEIGHT);
      key(`Shift${side}`, "keyup");
      key(`Control${side}`, "keyup");
      player.update(1 / 60);
      expect(camera.position.y - player.position.y).toBeCloseTo(PLAYER_EYE_HEIGHT);
    }
  });

  it("ignores menu key presses and clears movement, crouch and external input on pause", () => {
    const { player, camera, play, key, advance } = setup();
    key("KeyW");
    play.dispatchEvent(new Event("click"));
    advance();
    expect(player.position.z).toBe(0.5);
    key("ShiftLeft");
    player.setExternalInput({ forward: 1, right: 0, jump: false, sprint: true });
    advance();
    key("Escape");
    expect(player.isActive).toBe(false);
    const before = { ...player.position };
    advance();
    expect(player.position).toEqual(before);
    play.dispatchEvent(new Event("click"));
    advance();
    expect(player.position).toEqual(before);
    expect(camera.position.y - player.position.y).toBeCloseTo(PLAYER_EYE_HEIGHT);
  });

  it("pauses and clears held keyboard input on window blur", () => {
    const { player, play, key, advance, win } = setup();
    play.dispatchEvent(new Event("click"));
    key("KeyW");
    key("ControlLeft");
    advance();
    win.dispatchEvent(new Event("blur"));
    expect(player.isActive).toBe(false);
    const z = player.position.z;
    play.dispatchEvent(new Event("click"));
    advance();
    expect(player.position.z).toBe(z);
  });
});

it("does not resume from a stale pointer-lock rejection or watchdog after blur", async () => {
  vi.useFakeTimers();
  for (const rejectRequest of [false, true]) {
    const { player, play, win, canvas } = setup(false);
    let reject: (reason?: unknown) => void = vi.fn();
    canvas.requestPointerLock.mockReturnValue(
      new Promise<void>((_resolve, rejectPromise) => {
        reject = rejectPromise;
      }),
    );
    play.dispatchEvent(new Event("click"));
    win.dispatchEvent(new Event("blur"));
    if (rejectRequest) reject(new Error("pointer lock denied"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(player.mode).toBe("idle");
  }
});

it("F5 cycles behind/front/first person without moving the physical player or aim", () => {
  const { player, camera, play, key } = setup();
  play.dispatchEvent(new Event("click"));
  const start = { ...player.position };
  const aim = player.lookDirection;
  expect(key("F5").defaultPrevented).toBe(true);
  player.update(1 / 60);
  expect(player.perspective).toBe(1);
  expect(camera.position.z).toBeCloseTo(start.z + 4);
  key("F5");
  player.update(1 / 60);
  expect(player.perspective).toBe(2);
  expect(camera.position.z).toBeCloseTo(start.z - 4);
  key("F5");
  player.update(1 / 60);
  expect(player.perspective).toBe(0);
  expect(camera.position.z).toBeCloseTo(start.z);
  expect(player.position.x).toBe(start.x);
  expect(player.lookDirection).toEqual(aim);
});

it("keeps camera corners in front of a wall that misses the center ray", () => {
  const { player, camera, play, key, world } = setup();
  player.restore({ x: 0.9, y: 2, z: 0.5 });
  vi.spyOn(world, "getBlock").mockImplementation((x, y, z) =>
    y <= 1 || (x === 1 && z === 2) ? BlockId.STONE : BlockId.AIR,
  );
  play.dispatchEvent(new Event("click"));
  key("F5");
  player.update(1 / 60);
  expect(camera.position.z).toBeLessThan(1.8);
  expect(player.cameraSeparation).toBeLessThan(1.3);
  expect(player.eyePosition.y - player.position.y).toBe(PLAYER_EYE_HEIGHT);
});

it("contracts immediately at a wall and eases outward after it is removed", () => {
  const { player, play, key, world } = setup();
  let blocked = true;
  vi.spyOn(world, "getBlock").mockImplementation((_x, y, z) =>
    y <= 1 || (blocked && z === 2) ? BlockId.STONE : BlockId.AIR,
  );
  play.dispatchEvent(new Event("click"));
  key("F5");
  player.update(1 / 60);
  const close = player.cameraSeparation;
  expect(close).toBeLessThan(1.3);
  blocked = false;
  for (let i = 0; i < 45; i++) player.update(1 / 60);
  expect(player.cameraSeparation).toBeGreaterThan(close);
  expect(player.cameraSeparation).toBeLessThan(2);
  for (let i = 0; i < 240; i++) player.update(1 / 60);
  expect(player.cameraSeparation).toBeCloseTo(4, 1);
  blocked = true;
  player.update(1 / 60);
  expect(player.cameraSeparation).toBeCloseTo(close);
});
