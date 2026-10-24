import * as THREE from "three";

export const SKY_COLOR = 0x87ceeb;
export const FOG_NEAR = 32;
export const FOG_FAR = 56;
const SUN_DISTANCE = 180;

export interface GameScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly sun: THREE.DirectionalLight;
  readonly ambient: THREE.AmbientLight;
  render: () => void;
  resize: (width: number, height: number) => void;
  /** Applies a sky state (see sky.ts) to the background, fog, and lights. */
  applySky: (state: {
    readonly skyColor: readonly [number, number, number];
    readonly sunIntensity: number;
    readonly ambientIntensity: number;
    readonly sunAngle: number;
  }) => void;
  /** Feed each frame's duration; the render scale steps up and down a
   * ladder to hold a fluid frame rate on fill-rate-bound (mobile) GPUs. */
  tickAdaptive: (frameMs: number) => void;
  readonly pixelRatio: () => number;
  setViewDistance: (radius: number) => void;
  setRenderScale: (scale: number | null) => void;
  dispose: () => void;
}

/** Render-scale ladder for the adaptive quality controller, as fractions
 * of the device pixel ratio (capped at 2). */
const SCALE_LADDER = [0.25, 0.35, 0.5, 0.65, 0.8, 1.0] as const;
const ADAPT_DOWN_FRAMES = 20;
const ADAPT_UP_FRAMES = 120;
// Biased toward frame rate: step the render scale down before frames drift
// past ~20ms (~50fps), so phones stay fluid.
const ADAPT_SLOW_MS = 20;
const ADAPT_FAST_MS = 12;

/** Sets up the Three.js scene, camera, renderer, sky, and lighting. No
 * voxel-specific knowledge lives here — ChunkMeshManager adds and removes
 * chunk meshes into `scene` as the world streams in around the player. */
export function createGameScene(parent: HTMLElement): GameScene {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    failIfMajorPerformanceCaveat: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  parent.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const background = new THREE.Color(SKY_COLOR);
  scene.background = background;
  const fog = new THREE.Fog(SKY_COLOR, FOG_NEAR, FOG_FAR);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    FOG_FAR + 60,
  );

  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(60, 120, 40);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  function render(): void {
    renderer.render(scene, camera);
  }

  const basePixelRatio = Math.min(window.devicePixelRatio, 2);
  let scaleIndex = SCALE_LADDER.length - 1;
  let fixedScale: number | null = null;
  let frameMsEma = 16;
  let framesSinceChange = 0;

  function applyScale(): void {
    renderer.setPixelRatio(basePixelRatio * (fixedScale ?? SCALE_LADDER[scaleIndex] ?? 1));
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function tickAdaptive(frameMs: number): void {
    if (fixedScale !== null) return;
    frameMsEma = frameMsEma * 0.9 + frameMs * 0.1;
    framesSinceChange++;
    if (frameMsEma > ADAPT_SLOW_MS && scaleIndex > 0 && framesSinceChange >= ADAPT_DOWN_FRAMES) {
      scaleIndex--;
      applyScale();
      framesSinceChange = 0;
    } else if (
      frameMsEma < ADAPT_FAST_MS &&
      scaleIndex < SCALE_LADDER.length - 1 &&
      framesSinceChange >= ADAPT_UP_FRAMES
    ) {
      scaleIndex++;
      applyScale();
      framesSinceChange = 0;
    }
  }

  function resize(width: number, height: number): void {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function applySky(state: {
    readonly skyColor: readonly [number, number, number];
    readonly sunIntensity: number;
    readonly ambientIntensity: number;
    readonly sunAngle: number;
  }): void {
    background.setRGB(state.skyColor[0], state.skyColor[1], state.skyColor[2]);
    fog.color.copy(background);
    sun.intensity = state.sunIntensity;
    ambient.intensity = state.ambientIntensity;
    // The sun tracks the camera on x/z so its light direction stays stable
    // relative to the player as they roam the infinite world.
    const elevation = Math.sin(state.sunAngle);
    const alongArc = Math.cos(state.sunAngle);
    sun.position.set(
      camera.position.x + alongArc * SUN_DISTANCE,
      Math.max(elevation, 0.08) * SUN_DISTANCE,
      camera.position.z + 40,
    );
    sun.target.position.set(camera.position.x, 0, camera.position.z);
    sun.target.updateMatrixWorld();
  }

  function dispose(): void {
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    scene,
    camera,
    renderer,
    sun,
    ambient,
    render,
    resize,
    applySky,
    tickAdaptive,
    pixelRatio: () => renderer.getPixelRatio(),
    setRenderScale: (scale) => {
      fixedScale =
        scale !== null && Number.isFinite(scale) && scale >= 0.25 && scale <= 1 ? scale : null;
      framesSinceChange = 0;
      applyScale();
    },
    setViewDistance: (radius) => {
      fog.near = radius * 8;
      fog.far = radius * 14;
      camera.far = radius * 16 + 60;
      camera.updateProjectionMatrix();
    },
    dispose,
  };
}
