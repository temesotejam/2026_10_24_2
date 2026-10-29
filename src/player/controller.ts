import * as THREE from "three";
import { raycastVoxels } from "./raycast";
import { FixedStepClock } from "../core/fixed-step";
import { BlockId, isSolid } from "../world/blocks";
import { CHUNK_HEIGHT } from "../world/coords";
import type { World } from "../world/world";
import {
  CROUCH_EYE_HEIGHT,
  findGroundHeight,
  PLAYER_EYE_HEIGHT,
  type PlayerPhysicsState,
  stepPhysics,
} from "./physics";

const MOUSE_SENSITIVITY = 0.0022;
const DRAG_SENSITIVITY = 0.0035;
const MAX_PITCH = Math.PI / 2 - 0.01;
/** How long to wait for pointerlockchange before deciding the browser
 * refused (silently, as some do) and falling back to drag-look. */
const POINTER_LOCK_WATCHDOG_MS = 600;

const KEY_BINDINGS: Record<
  string,
  "forward" | "back" | "left" | "right" | "jump" | "sprint" | "crouch"
> = {
  KeyW: "forward",
  KeyS: "back",
  KeyA: "left",
  KeyD: "right",
  Space: "jump",
  ControlLeft: "sprint",
  ControlRight: "sprint",
  ShiftLeft: "crouch",
  ShiftRight: "crouch",
};

export type ControlMode = "idle" | "pointer" | "drag";

/** Pointer-lock FPS movement with a graceful degradation path: if the
 * browser never grants pointer lock (extensions, permissions, embedded
 * contexts — it happens, silently), the game switches to drag-to-look
 * instead of leaving a dead "Click to play" button. The overlay/DOM dance
 * and key tracking live here because they're inherently browser glue; the
 * actual physics is pure and tested separately. */
export class PlayerController {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private readonly overlay: HTMLElement | null;
  private readonly world: Pick<World, "getBlock">;

  private state: PlayerPhysicsState;
  private readonly clock = new FixedStepClock();
  private crouching = false;
  canSprint: () => boolean = () => true;
  perspective: 0 | 1 | 2 = 0;
  thirdPersonEnabled = true;
  onMenu: (() => void) | undefined;
  private cameraDistance = 4;
  private lastPerspective = 0;
  private yaw = 0;
  private pitch = 0;
  private readonly pressed = new Set<string>();
  private controlMode: ControlMode = "idle";
  private dragging = false;
  private controlRequest = 0;
  private lockWatchdog: ReturnType<typeof setTimeout> | undefined;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    world: Pick<World, "getBlock">,
    spawnX = 8,
    spawnZ = 8,
  ) {
    this.camera = camera;
    this.camera.rotation.order = "YXZ";
    this.domElement = domElement;
    this.overlay = document.querySelector("#overlay");
    this.world = world;

    const groundY = findGroundHeight(
      Math.floor(spawnX),
      Math.floor(spawnZ),
      CHUNK_HEIGHT - 1,
      (x, y, z) => isSolid(this.world.getBlock(x, y, z)),
    );
    this.state = {
      position: { x: spawnX, y: groundY, z: spawnZ },
      velocity: { x: 0, y: 0, z: 0 },
      onGround: false,
    };

    this.bindEvents();
    this.syncCamera();
  }

  private enterMode(mode: ControlMode): void {
    this.controlMode = mode;
    this.overlay?.classList.toggle("hidden", mode !== "idle");
    if (mode === "idle") {
      this.controlRequest++;
      if (this.lockWatchdog) clearTimeout(this.lockWatchdog);
      this.lockWatchdog = undefined;
      this.pressed.clear();
      this.external = null;
      this.dragging = false;
      this.crouching = false;
      this.clock.reset();
    }
  }

  private bindEvents(): void {
    const playButton = document.querySelector<HTMLButtonElement>("#play-button");
    playButton?.addEventListener("click", () => {
      this.requestControl();
    });

    document.addEventListener("pointerlockchange", () => {
      const locked = document.pointerLockElement === this.domElement;
      if (locked) {
        if (this.lockWatchdog) clearTimeout(this.lockWatchdog);
        this.enterMode("pointer");
      } else if (this.controlMode === "pointer") {
        this.enterMode("idle");
      }
    });

    document.addEventListener("mousemove", (e) => {
      if (this.controlMode === "pointer") {
        this.applyLook(e.movementX, e.movementY, MOUSE_SENSITIVITY);
      } else if (this.controlMode === "drag" && this.dragging) {
        this.applyLook(e.movementX, e.movementY, DRAG_SENSITIVITY);
      }
    });

    this.domElement.addEventListener("mousedown", (e) => {
      if (this.controlMode === "drag" && e.button === 0) this.dragging = true;
    });
    document.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.dragging = false;
    });

    document.addEventListener("keydown", (e) => {
      if (e.code === "KeyE" && !e.repeat) {
        e.preventDefault();
        this.onMenu?.();
        return;
      }
      if (e.code === "Escape" && this.controlMode === "drag") {
        this.enterMode("idle");
        return;
      }
      if (this.controlMode === "idle") return;
      if (e.code === "F5") {
        e.preventDefault();
        if (!e.repeat && this.thirdPersonEnabled)
          this.perspective = ((this.perspective + 1) % 3) as 0 | 1 | 2;
        return;
      }
      this.pressed.add(e.code);
      // The page must not scroll or focus-hop while playing.
      if (e.code in KEY_BINDINGS || e.code.startsWith("Arrow")) {
        e.preventDefault();
      }
    });
    document.addEventListener("keyup", (e) => {
      this.pressed.delete(e.code);
    });
    window.addEventListener("blur", () => {
      this.enterMode("idle");
      if (document.pointerLockElement === this.domElement) document.exitPointerLock();
    });

    this.domElement.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });
  }

  /** Ask for pointer lock; if the browser quietly never grants it, fall
   * back to drag-look so the game starts regardless. Touch-first devices
   * skip the pointer-lock dance entirely — there is no pointer to lock. */
  private requestControl(): void {
    if (window.matchMedia("(pointer: coarse)").matches) {
      this.enterMode("drag");
      return;
    }
    if (this.lockWatchdog) clearTimeout(this.lockWatchdog);
    const request = ++this.controlRequest;
    const fallback = () => {
      if (request !== this.controlRequest) return;
      if (this.lockWatchdog) clearTimeout(this.lockWatchdog);
      if (this.controlMode === "idle") this.enterMode("drag");
    };
    this.lockWatchdog = setTimeout(fallback, POINTER_LOCK_WATCHDOG_MS);

    try {
      // Returns a promise in Chromium, undefined elsewhere; a rejection
      // means the watchdog path takes over immediately.
      const result: unknown = this.domElement.requestPointerLock();
      if (result instanceof Promise) {
        result.catch(fallback);
      }
    } catch {
      fallback();
    }
  }

  private applyLook(movementX: number, movementY: number, sensitivity: number): void {
    this.yaw -= movementX * sensitivity;
    this.pitch -= movementY * sensitivity;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
  }

  /** Camera rotation from an external source (the touch controls' look
   * surface), in pixels of drag. */
  lookBy(pixelsX: number, pixelsY: number): void {
    if (this.controlMode === "idle") return;
    this.applyLook(pixelsX, pixelsY, DRAG_SENSITIVITY);
  }

  /** Movement from an external source (the touch controls' joystick),
   * merged with whatever the keyboard says every frame. */
  setExternalInput(
    input: { forward: number; right: number; jump: boolean; sprint: boolean } | null,
  ): void {
    this.external = input;
  }

  private external: { forward: number; right: number; jump: boolean; sprint: boolean } | null =
    null;

  private currentInput() {
    let forward = 0;
    let right = 0;
    let jump = false;
    let sprint = false;
    let crouch = false;
    for (const code of this.pressed) {
      const action = KEY_BINDINGS[code];
      if (action === "forward") forward += 1;
      else if (action === "back") forward -= 1;
      else if (action === "right") right += 1;
      else if (action === "left") right -= 1;
      else if (action === "jump") jump = true;
      else if (action === "sprint") sprint = true;
      else if (action === "crouch") crouch = true;
    }
    if (this.external) {
      forward = Math.max(-1, Math.min(1, forward + this.external.forward));
      right = Math.max(-1, Math.min(1, right + this.external.right));
      jump = jump || this.external.jump;
      sprint = sprint || this.external.sprint;
    }
    return { forward, right, jump, sprint, crouch };
  }

  get eyePosition() {
    return {
      ...this.state.position,
      y: this.state.position.y + (this.crouching ? CROUCH_EYE_HEIGHT : PLAYER_EYE_HEIGHT),
    };
  }
  get lookDirection() {
    const cos = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cos, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cos };
  }
  private syncCamera(dt = 0): void {
    const eye = this.eyePosition;
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.y = this.yaw;
    if (this.perspective !== 0) {
      const dir = this.lookDirection;
      const sign = this.perspective === 1 ? -1 : 1;
      const behind = { x: dir.x * sign, y: dir.y * sign, z: dir.z * sign };
      // Test the camera's volume, not only its center ray. This also protects
      // the near-plane corners when turning beside a wall or under a ceiling.
      let allowed = 4;
      for (const x of [-0.15, 0.15])
        for (const y of [-0.15, 0.15])
          for (const z of [-0.15, 0.15]) {
            const hit = raycastVoxels(
              { x: eye.x + x, y: eye.y + y, z: eye.z + z },
              behind,
              4,
              (bx, by, bz) => isSolid(this.world.getBlock(bx, by, bz)),
            );
            if (hit) allowed = Math.min(allowed, Math.max(0, hit.distance - 0.18));
          }
      if (this.lastPerspective !== this.perspective || allowed < this.cameraDistance)
        this.cameraDistance = allowed;
      else this.cameraDistance += (allowed - this.cameraDistance) * (1 - Math.exp(-8 * dt));
      const distance = this.cameraDistance;
      this.camera.position.addScaledVector(
        new THREE.Vector3(behind.x, behind.y, behind.z),
        distance,
      );
      if (this.perspective === 2) {
        this.camera.rotation.y += Math.PI;
        this.camera.rotation.x = -this.pitch;
      }
    }
    this.lastPerspective = this.perspective;
  }

  get cameraSeparation(): number {
    return this.perspective === 0 ? 0 : this.cameraDistance;
  }

  get isCrouching(): boolean {
    return this.crouching;
  }

  update(dt: number): void {
    if (this.controlMode !== "idle") {
      const { forward, right, jump, sprint, crouch } = this.currentInput();
      this.crouching = crouch;
      this.clock.advance(dt, (step) => {
        this.state = stepPhysics(
          this.state,
          { forward, right, jump, sprint: sprint && this.canSprint(), crouch, yaw: this.yaw },
          step,
          (x, y, z) => isSolid(this.world.getBlock(x, y, z)),
          (x, y, z) => this.world.getBlock(x, y, z) === BlockId.WATER,
        );
      });
    }
    this.syncCamera(dt);
  }

  pause(): void {
    this.enterMode("idle");
    if (document.pointerLockElement === this.domElement) document.exitPointerLock();
  }

  resume(): void {
    this.requestControl();
  }

  restore(position: { x: number; y: number; z: number }, yaw = 0, pitch = 0): void {
    this.state = { position: { ...position }, velocity: { x: 0, y: 0, z: 0 }, onGround: false };
    this.yaw = yaw;
    this.pitch = pitch;
    this.clock.reset();
    this.syncCamera();
  }

  get onGround(): boolean {
    return this.state.onGround;
  }

  get mode(): ControlMode {
    return this.controlMode;
  }

  get isActive(): boolean {
    return this.controlMode !== "idle";
  }

  get isLocked(): boolean {
    return this.controlMode === "pointer";
  }

  get position(): PlayerPhysicsState["position"] {
    return this.state.position;
  }

  get eyeYaw(): number {
    return this.yaw;
  }

  get eyePitch(): number {
    return this.pitch;
  }
}
