import { respawnCandidate } from "./survival/respawn";
import { PlayerAvatar } from "./render/player-avatar";
import { CompanionController, createCompanion } from "./cooperation/companion";
import { give } from "./cooperation/exchange";
import type { MoveInput } from "./player/physics";
import { portalInterior, PortalContact } from "./survival/portal";
import { dragonPosition, dragonMaxHealth } from "./survival/dragon";
import { structuresNear, stronghold, strongholdEntrance } from "./world/adventure-terrain";
import { Adventure } from "./survival/adventure";
import { travelCandidate } from "./survival/adventure-state";
import { AdventureView } from "./render/adventure-view";
import { adventureSky, weatherAt } from "./world/weather";
import { createColumnSampler } from "./world/terrain";
import { FluidSimulator } from "./world/fluids";
import { asyncEvent } from "./core/events";
import { must } from "./core/assert";
import "./style.css";
import * as THREE from "three";
import { ChunkMeshManager } from "./render/chunk-mesh-manager";
import { createChunkMaterial, updateChunkMaterial } from "./render/chunk-material";
import { Clouds } from "./render/clouds";
import { CpuRenderer } from "./render/cpu-renderer";
import { createGameScene } from "./render/scene";
import { skyStateAt } from "./render/sky";
import { createBlockTextureArray } from "./render/texture-atlas";
import { PlayerController } from "./player/controller";
import { BlockInteraction } from "./player/interaction";
import { Hotbar } from "./ui/hotbar";
import { Hud } from "./ui/hud";
import { isTouchDevice, TouchControls } from "./ui/touch-controls";
import { EditStore } from "./world/edit-store";
import { findPleasantSpawn } from "./world/spawn";
import {
  type ChunkGenerator,
  ChunkStreamer,
  createSyncGenerator,
  createWorkerGenerator,
} from "./world/streamer";
import { World } from "./world/world";
import { BlockId, isSolid } from "./world/blocks";
import { affectedChunkCoords } from "./world/coords";
import { SurvivalSession, newSession, type SessionState } from "./survival/session";
import { SaveRepository, saveKey, parseSave, encodeSave } from "./save/persistence";
import { InventoryView } from "./ui/inventory";
import { EntityView } from "./entities/view";
import { SkyBodies } from "./render/sky-bodies";
import { HeldItemView } from "./render/held-item";
import { buildLightField, LIGHT_SIZE } from "./world/light";
import { BlockFragments } from "./render/block-fragments";
import { BlockSounds } from "./audio/block-sounds";
import { blockItem, ITEMS } from "./items/catalog";
import { guiScale } from "./render/view-settings";
const DEFAULT_SEED = 2026;
const STREAM_RADIUS_WEBGL = 4; // greedy meshing makes the extra draw distance affordable
const STREAM_RADIUS_CPU = 4; // rays reach ~52 blocks; a tighter ring is plenty
const WARMUP_RADIUS_CHUNKS = 2;
const MESH_BUDGET_PER_FRAME = 3;
// Read-only debug handle for the visual-check harness (scripts/visual-check.mjs):
// lets an automated browser assert on game state instead of guessing from pixels.
declare global {
  interface Window {
    __coop?: {
      observe: (actor: "player" | "companion") => unknown;
      block: (actor: "player" | "companion", x: number, y: number, z: number) => number | null;
      move: (input: MoveInput, seconds: number) => boolean;
      stop: () => void;
      select: (slot: number) => boolean;
      mine: (x: number, y: number, z: number) => boolean;
      blockingLeaf: (x: number, y: number, z: number) => { x: number; y: number; z: number } | null;
      place: (x: number, y: number, z: number) => boolean;
      eat: () => boolean;
      attack: (id: number) => boolean;
      craft: (id: string, table?: { x: number; y: number; z: number }) => boolean;
      give: (actor: "player" | "companion", slot: number, amount: number) => boolean;
      sleep: (x: number, y: number, z: number) => boolean;
      say: (actor: "player" | "companion", message: string) => boolean;
    };
    __mc?: {
      position: () => {
        x: number;
        y: number;
        z: number;
      };
      blockAt: (x: number, y: number, z: number) => number;
      target: () => {
        x: number;
        y: number;
        z: number;
      } | null;
      pitch: () => number;
      yaw: () => number;
      eyeHeight: () => number;
      mode: () => string;
      renderer: () => "webgl" | "cpu";
      touch: () => boolean;
      loadedChunks: () => number;
      meshedChunks: () => number;
      pendingChunks: () => number;
      inventory: () => SessionState["inventory"];
      health: () => number;
      gameMode: () => string;
      time: () => number;
      cameraFov: () => number;
      cameraView: () => { perspective: number; distance: number };
      adventure: () => unknown;
      effects: () => {
        fragments: number;
        soundEnabled: boolean;
        soundReady: boolean;
        soundsPlayed: number;
        soundPeak: number;
        soundCounts: { break: number; place: number; step: number };
      };
      seed: number;
    };
  }
}
/** A dead "Click to play" button is the worst failure mode a browser game
 * can have. If anything at all goes wrong during boot — and the WebGL and
 * worker paths already have their own fallbacks — say so, visibly, in the
 * overlay the player is already looking at. */
function showFatalError(error: unknown): void {
  const content = document.querySelector("#overlay-content");
  if (!content) return;
  const message = error instanceof Error ? error.message : String(error);
  content.innerHTML = "";
  const title = document.createElement("h1");
  title.textContent = "the game couldn't start";
  const detail = document.createElement("p");
  detail.textContent = message;
  const hint = document.createElement("p");
  hint.textContent =
    "Try a hard refresh (Ctrl+Shift+R) or another browser (Chrome/Firefox). " +
    "If it keeps happening, please open an issue with this exact message.";
  content.append(title, detail, hint);
}
/** What the game loop needs from a renderer — satisfied by the Three.js
 * scene when WebGL exists, and by the CPU raycaster when it doesn't. */
interface GameView {
  readonly kind: "webgl" | "cpu";
  readonly camera: THREE.PerspectiveCamera;
  readonly domElement: HTMLElement;
  render(elapsedSeconds: number): void;
  resize(width: number, height: number): void;
  applySky(state: ReturnType<typeof skyStateAt>): void;
  /** Optional adaptive quality hook (WebGL scales its pixel ratio; the CPU
   * renderer already adapts its own internal resolution). */
  tickAdaptive?(frameMs: number): void;
  /** A short label for the HUD describing the current quality target. */
  qualityNote(): string;
  setViewDistance?(radius: number): void;
  setRenderScale?(scale: number | null): void;
}
async function boot(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("#app not found");
  const hotbarContainer = document.querySelector<HTMLDivElement>("#hotbar");
  if (!hotbarContainer) throw new Error("#hotbar not found");
  // A shareable world: ?seed=1234 loads the same terrain for everyone.
  const seedParam = new URLSearchParams(window.location.search).get("seed");
  const parsedSeed = seedParam === null ? NaN : Number.parseInt(seedParam, 10);
  const SEED = Number.isFinite(parsedSeed) ? parsedSeed | 0 : DEFAULT_SEED;
  const mode =
    new URLSearchParams(location.search).get("mode") === "creative" ? "creative" : "survival";
  const cooperative = new URLSearchParams(location.search).get("coop") === "1";
  const saveNamespace = cooperative ? "coop" : "";
  let repository: SaveRepository | null = null;
  let saved: SessionState | null = null;
  let storageWarning = "";
  try {
    repository = await SaveRepository.open(saveNamespace);
  } catch {
    storageWarning = "自動保存を利用できません。バックアップを書き出してください";
  }
  if (repository) {
    try {
      saved = await repository.load(saveKey(SEED, mode, saveNamespace));
    } catch {
      saved = await repository.load(saveKey(SEED, mode, saveNamespace), true);
      if (!saved)
        throw new Error(
          "保存データを読み込めません。既存データを保護するため起動を止めました。別の Seed で開始できます。",
        );
      storageWarning = "直近の保存を読めなかったため、前回の保存から復元しました";
    }
    if (saved && (saved.seed !== SEED || saved.mode !== mode))
      throw new Error("保存先とワールド情報が一致しません");
  }
  const world = new World(SEED, saved?.adventure?.dimension ?? "overworld", saved?.generator ?? 3);
  let entityScene: THREE.Scene | null = null;
  let terrainMaterial: THREE.ShaderMaterial | null = null;
  let lightDirty = true;
  // The renderer: WebGL when the browser can, an in-house CPU raycaster
  // when it can't. Same world, same physics, same controls either way.
  let view: GameView;
  let chunkMeshes: ChunkMeshManager | null = null;
  let clouds: Clouds | null = null;
  let highlight: THREE.LineSegments | null = null;
  let cpuView: CpuRenderer | null = null;
  try {
    const gameScene = createGameScene(app);
    const skyBodies = new SkyBodies(gameScene.scene);
    entityScene = gameScene.scene;
    const chunkMaterial = createChunkMaterial(createBlockTextureArray(SEED));
    terrainMaterial = chunkMaterial;
    view = {
      kind: "webgl",
      camera: gameScene.camera,
      domElement: gameScene.renderer.domElement,
      render: () => {
        gameScene.render();
      },
      resize: gameScene.resize,
      applySky: (state) => {
        gameScene.applySky(state);
        skyBodies.update(gameScene.camera, state);
        updateChunkMaterial(chunkMaterial, state);
      },
      tickAdaptive: gameScene.tickAdaptive,
      setRenderScale: gameScene.setRenderScale,
      setViewDistance: (radius) => {
        gameScene.setViewDistance(radius);
        must(chunkMaterial.uniforms.uFogNear).value = radius * 8;
        must(chunkMaterial.uniforms.uFogFar).value = radius * 14;
      },
      qualityNote: () => `${Math.round(gameScene.pixelRatio() * 100)}% scale`,
    };
    chunkMeshes = new ChunkMeshManager(gameScene.scene, world, chunkMaterial);
    if (world.dimension === "overworld") clouds = new Clouds(gameScene.scene, SEED);
    highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
      new THREE.LineBasicMaterial({ color: 0x000000 }),
    );
    highlight.visible = false;
    gameScene.scene.add(highlight);
  } catch (webglError) {
    console.warn("WebGL unavailable, switching to the CPU raycaster:", webglError);
    const cpu = new CpuRenderer(app, world, SEED);
    cpuView = cpu;
    view = {
      kind: "cpu",
      camera: cpu.camera,
      domElement: cpu.domElement,
      render: (elapsed) => {
        cpu.render(elapsed);
      },
      resize: (w, h) => {
        cpu.resize(w, h);
      },
      applySky: (state) => {
        cpu.applySky(state);
      },
      qualityNote: () => `cpu ${cpu.internalWidth.toString()}p`,
    };
  }
  const storage = new Map<string, string>();
  const legacyKey = EditStore.storageKey(SEED);
  if (saved) storage.set(legacyKey, JSON.stringify(saved.edits));
  else {
    try {
      const legacy = window.localStorage.getItem(legacyKey);
      if (legacy) storage.set(legacyKey, legacy);
    } catch {
      /* Browser may forbid localStorage; IndexedDB remains independent. */
    }
  }
  const editStore = new EditStore(
    {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
    },
    SEED,
    false,
  );
  const streamer = new ChunkStreamer(world, {
    radius: view.kind === "webgl" ? STREAM_RADIUS_WEBGL : STREAM_RADIUS_CPU,
    editStore,
    onUnload: (cx, cz) => {
      chunkMeshes?.removeChunkMesh(cx, cz);
    },
  });
  const receive = (cx: number, cz: number, buffer: Uint8Array): void => {
    streamer.receive(cx, cz, buffer);
  };
  let generator: ChunkGenerator;
  try {
    if (typeof Worker === "undefined") throw new Error("workers unavailable");
    generator = createWorkerGenerator(SEED, receive, world.dimension, world.revision);
  } catch {
    // No module workers? Generate on the main thread — slower on chunk
    // arrival, but the game works everywhere.
    generator = createSyncGenerator(SEED, receive, world.dimension, world.revision);
  }
  streamer.attachGenerator(generator);
  const spawn = findPleasantSpawn(SEED, world.revision);
  // Ground under the player's feet before the first frame; the rest streams in.
  streamer.warmUp(saved?.position.x ?? spawn.x, saved?.position.z ?? spawn.z, WARMUP_RADIUS_CHUNKS);
  const player = new PlayerController(view.camera, view.domElement, world, spawn.x, spawn.z);
  if (saved) player.restore(saved.position, saved.yaw, saved.pitch);
  else player.restore(player.position, spawn.yaw, 0);
  const data = saved ?? newSession(SEED, mode, { ...player.position });
  let fluids: FluidSimulator | null = null;
  const editedChunks = new Map<string, { cx: number; cz: number }>();
  const session = new SurvivalSession(world, data, (x, y, z, id) => {
    if (y < 0 || y >= 96) return;
    const cx = Math.floor(x / 16),
      cz = Math.floor(z / 16);
    if (!world.hasChunk(cx, cz)) {
      const chunk = world.ensureChunk(cx, cz);
      editStore.applyTo(chunk);
    }
    world.setBlock(x, y, z, id);
    lightDirty = true;
    fluids?.notify(x, y, z);
    editStore.record(x, y, z, id);
    for (const c of affectedChunkCoords(x, z)) editedChunks.set(`${c.cx},${c.cz}`, c);
  });
  const companion = cooperative
    ? new CompanionController(session, data.companion ?? createCompanion(session, player.position))
    : null;
  if (companion) data.companion = companion.state;
  fluids = new FluidSimulator(world, data.fluidLevels, (x, y, z, id) => {
    session.edit(x, y, z, id);
  });
  fluids.wake(player.position);
  let lastFluidWake = { ...player.position };
  player.thirdPersonEnabled = view.kind === "webgl";
  if (
    player.thirdPersonEnabled &&
    new URLSearchParams(location.search).get("view") === "third-person"
  )
    player.perspective = 1;
  const avatar = entityScene ? new PlayerAvatar(entityScene) : null;
  const companionAvatar =
    companion && entityScene ? new PlayerAvatar(entityScene, 0xb36338, false) : null;
  player.canSprint = () => session.creative || data.vitals.hunger > 6;
  const hotbar = new Hotbar(hotbarContainer, session);
  const adventure = new Adventure(session);
  const adventureView = entityScene ? new AdventureView(entityScene) : null;
  const sampleColumn = createColumnSampler(SEED, world.revision);
  const inventory = new InventoryView(session, adventure);
  const interaction = new BlockInteraction(
    view.camera,
    view.domElement,
    world,
    chunkMeshes ?? { updateChunk: () => undefined },
    hotbar,
    player,
    session,
  );
  const entities = new EntityView(entityScene, app, world);
  const dimensionLabel = document.createElement("div");
  dimensionLabel.id = "dimension-label";
  app.append(dimensionLabel);
  const bossHud = document.createElement("div");
  bossHud.id = "boss-hud";
  bossHud.hidden = true;
  app.append(bossHud);
  const coopHud = companion ? document.createElement("div") : null;
  const coopMessage = companion ? document.createElement("div") : null;
  if (coopHud && coopMessage) {
    coopHud.id = "coop-hud";
    coopMessage.id = "coop-message";
    app.append(coopHud, coopMessage);
  }
  const toast = must(document.querySelector<HTMLDivElement>("#toast"));
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  session.notice = (text) => {
    toast.textContent = text;
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 4500);
  };
  const saveStatus = must(document.querySelector<HTMLElement>("#save-status"));
  let saveTask: Promise<boolean> | null = null;
  let restoring = false;
  const snapshot = () => {
    data.position = { ...player.position };
    data.yaw = player.eyeYaw;
    data.pitch = player.eyePitch;
    data.edits = editStore.snapshot();
    return data;
  };
  const save = (): Promise<boolean> => {
    if (!repository || restoring) {
      if (!repository) saveStatus.textContent = "自動保存不可 · 書き出しで保管";
      return Promise.resolve(false);
    }
    if (saveTask) return saveTask.then(() => save());
    saveStatus.textContent = "保存中…";
    saveTask = repository
      .save(snapshot())
      .then(() => {
        saveStatus.textContent = "保存済み";
        return true;
      })
      .catch(() => {
        saveStatus.textContent = "保存失敗 · 前の保存は保持";
        session.notice?.("保存に失敗しました。バックアップを書き出してください");
        return false;
      })
      .finally(() => {
        saveTask = null;
      });
    return saveTask;
  };
  inventory.onClose = () => {
    hotbar.refresh();
    void save();
    player.resume();
  };
  player.onMenu = () => {
    if (session.dead) return;
    if (inventory.isOpen) inventory.close();
    else if (player.isActive) {
      player.pause();
      inventory.open();
    }
  };
  interaction.onAttack = () => adventure.attackDragon(player.eyePosition, player.lookDirection);
  interaction.onItemUse = () => adventure.use(player.eyePosition, player.lookDirection);
  interaction.onCreatureUse = (id) => {
    if (data.creatures.find((m) => m.id === id)?.species !== "villager") return false;
    player.pause();
    inventory.open("trade");
    return true;
  };
  let traveling = false;
  const portalContact = new PortalContact();
  adventure.onTravel = (destination) => {
    if (traveling) return;
    if (cooperative) {
      session.notice?.("協力実験では別ディメンションへの移動はまだ使えません");
      return;
    }
    if (!repository) {
      session.notice?.("安全な移動には保存機能が必要です");
      return;
    }
    traveling = true;
    player.pause();
    restoring = true;
    void (async () => {
      try {
        if (saveTask) await saveTask;
        const next = travelCandidate(
          snapshot(),
          destination ?? (world.dimension === "overworld" ? "nether" : "overworld"),
          { x: 0.5, y: 34, z: 0.5 },
        );
        await repository.save(next);
        location.reload();
      } catch {
        traveling = false;
        restoring = false;
        player.resume();
        session.notice?.("移動先を保存できませんでした。現在のワールドで続けられます");
      }
    })();
  };
  interaction.onUseBlock = (x, y, z, id) => {
    if (world.revision >= 3 && (id === BlockId.PORTAL || id === BlockId.END_GATE)) {
      session.notice?.(
        id === BlockId.PORTAL
          ? "ゲートの中に入り、少し待つと移動します"
          : "ゲートに入ると移動します",
      );
      return true;
    }
    if (id === BlockId.END_GATE) {
      adventure.onTravel?.(world.dimension === "end" ? "overworld" : "end");
      return true;
    }
    if (id === BlockId.PORTAL) {
      if (!portalInterior(world, { x, y, z })) {
        session.edit(x, y, z, BlockId.AIR);
        session.notice?.("ゲートの枠が壊れています");
        return true;
      }
      adventure.onTravel?.();
      return true;
    }
    if (id === BlockId.ENCHANT_TABLE || id === BlockId.BREWING) {
      player.pause();
      inventory.open(id === BlockId.ENCHANT_TABLE ? "enchant" : "brew", null, `${x},${y},${z}`);
      return true;
    }
    if (id === BlockId.BED) {
      session.sleep(x, y, z);
      return true;
    }
    if (id !== BlockId.TABLE && id !== BlockId.CHEST && id !== BlockId.FURNACE) return false;
    player.pause();
    if (id === BlockId.TABLE) inventory.open("table");
    else if (id === BlockId.CHEST) inventory.open("chest", session.chest(x, y, z));
    else inventory.open("furnace", session.furnace(x, y, z).slots);
    return true;
  };
  interaction.onProgress = (fraction) => {
    must(document.querySelector<HTMLElement>("#mining-fill")).style.width =
      `${Math.min(1, fraction) * 100}%`;
  };
  session.onDeath = () => {
    player.pause();
    inventory.root.hidden = true;
    must(document.querySelector<HTMLElement>("#death-panel")).hidden = false;
    void save();
  };
  const respawnButton = must(document.querySelector<HTMLButtonElement>("#respawn"));
  respawnButton.addEventListener("click", () => {
    if (data.generator >= 3 && world.dimension !== "overworld") {
      if (!repository || traveling) return;
      traveling = true;
      restoring = true;
      respawnButton.disabled = true;
      void (async () => {
        try {
          if (saveTask) await saveTask;
          await repository.save(respawnCandidate(snapshot()));
          location.reload();
        } catch {
          traveling = false;
          restoring = false;
          respawnButton.disabled = false;
          session.notice?.("通常世界への復活を保存できませんでした。もう一度試してください");
        }
      })();
      return;
    }
    streamer.warmUp(data.spawn.x, data.spawn.z, 1);
    session.respawn();
    player.restore(data.position);
    must(document.querySelector<HTMLElement>("#death-panel")).hidden = true;
    player.resume();
    void save();
  });
  if (session.dead) {
    player.pause();
    must(document.querySelector<HTMLElement>("#death-panel")).hidden = false;
  }
  must(document.querySelector("#save-button")).addEventListener("click", () => {
    void save();
  });
  must(document.querySelector("#export-button")).addEventListener("click", () => {
    try {
      const blob = new Blob([encodeSave(snapshot())], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `voxel-${SEED}-${mode}.json`;
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
    } catch {
      session.notice?.("バックアップを書き出せませんでした");
    }
  });
  must(document.querySelector<HTMLInputElement>("#import-file")).addEventListener(
    "change",
    asyncEvent(async (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > 10 * 1024 * 1024) throw new Error("10 MB 以下のファイルを選んでください");
        const incoming = parseSave(await file.text());
        if (!!incoming.companion !== cooperative)
          throw new Error("１人用と協力実験のセーブは別々に読み込んでください");
        if (!repository) throw new Error("保存機能が使えないため、読み込みを中止しました");
        if (
          !window.confirm(
            `Seed ${incoming.seed} (${incoming.mode}) のバックアップを読み込みます。同じワールドの現在の保存は前回分として残します。続けますか？`,
          )
        )
          return;
        // Serialize against an in-flight autosave before replacing its world.
        if (saveTask) throw new Error("保存中です。完了後に再度読み込んでください");
        restoring = true;
        await repository.save(incoming);
        location.search = `?seed=${incoming.seed}&mode=${incoming.mode}${cooperative ? "&coop=1" : ""}`;
      } catch (error) {
        session.notice?.(error instanceof Error ? error.message : "読み込みに失敗しました");
      } finally {
        input.value = "";
        restoring = false;
      }
    }),
  );
  must(document.querySelector("#recover-button")).addEventListener(
    "click",
    asyncEvent(async () => {
      if (!repository || saveTask) return;
      try {
        const prior = await repository.load(saveKey(SEED, mode, saveNamespace), true);
        if (!prior) {
          session.notice?.("前回の保存はまだありません");
          return;
        }
        if (!confirm("前回の保存に戻しますか？ 現在の保存は前回分として保持します。")) return;
        restoring = true;
        await repository.save(prior);
        location.reload();
      } catch {
        restoring = false;
        session.notice?.("前回の保存を読み込めませんでした");
      }
    }),
  );
  const seedInput = must(document.querySelector<HTMLInputElement>("#world-seed"));
  seedInput.value = String(SEED);
  const modeSelect = must(document.querySelector<HTMLSelectElement>("#world-mode"));
  modeSelect.value = mode;
  must(document.querySelector("#open-world")).addEventListener(
    "click",
    asyncEvent(async () => {
      const seed = Number(seedInput.value);
      if (!Number.isInteger(seed) || seed < -2147483648 || seed > 2147483647) {
        session.notice?.("Seed は32ビット整数で入力してください");
        return;
      }
      if (!(await save()) && repository) return;
      location.search = `?seed=${seed}&mode=${modeSelect.value}${cooperative ? "&coop=1" : ""}`;
    }),
  );
  const distanceSelect = must(document.querySelector<HTMLSelectElement>("#view-distance"));
  distanceSelect.disabled = view.kind === "cpu";
  distanceSelect.addEventListener("change", () => {
    const radius = Number(distanceSelect.value);
    streamer.setRadius(radius);
    view.setViewDistance?.(radius);
  });
  const scaleSelect = must(document.querySelector<HTMLSelectElement>("#render-scale"));
  scaleSelect.disabled = !view.setRenderScale;
  scaleSelect.addEventListener("change", () => {
    view.setRenderScale?.(scaleSelect.value === "auto" ? null : Number(scaleSelect.value));
  });
  const survivalHud = must(document.querySelector<HTMLElement>("#survival-hud"));
  survivalHud.hidden = session.creative;
  setInterval(() => {
    if (!session.dead) void save();
  }, 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      player.pause();
      void save();
    }
  });
  if (storageWarning) session.notice(storageWarning);
  saveStatus.textContent = repository
    ? saved
      ? "保存データを復元しました"
      : "15秒ごとに自動保存"
    : "自動保存不可 · 書き出しで保管";
  let lastUi = 0;
  let lastLight = 0;
  let lightPosition = { x: Infinity, y: Infinity, z: Infinity };
  let lightChunks = -1;
  const lightTexture = terrainMaterial
    ? new THREE.Data3DTexture(
        new Uint8Array(LIGHT_SIZE ** 3 * 2),
        LIGHT_SIZE,
        LIGHT_SIZE,
        LIGHT_SIZE,
      )
    : null;
  if (lightTexture && terrainMaterial) {
    lightTexture.format = THREE.RGFormat;
    lightTexture.type = THREE.UnsignedByteType;
    lightTexture.minFilter = THREE.NearestFilter;
    lightTexture.magFilter = THREE.NearestFilter;
    lightTexture.unpackAlignment = 1;
    must(terrainMaterial.uniforms.uLightField).value = lightTexture;
  }
  const hand = entityScene ? new HeldItemView(view.camera) : null;
  const fragments = entityScene ? new BlockFragments(entityScene) : null;
  const sounds = new BlockSounds();
  interaction.onBreak = (position, block) => {
    const item = blockItem(block);
    fragments?.pool.burst(
      position.x,
      position.y,
      position.z,
      item ? (ITEMS[item]?.color ?? "#887766") : "#887766",
    );
    sounds.play(block, "break");
  };
  interaction.onPlace = (_position, block) => {
    sounds.play(block, "place");
  };
  if (entityScene) entityScene.add(view.camera);
  // On-screen controls for touch devices — joystick, look-drag, jump/place.
  const touchControls = isTouchDevice()
    ? new TouchControls(app, {
        isActive: () => player.isActive,
        onInput: (input) => {
          player.setExternalInput(input);
        },
        onLook: (dx, dy) => {
          player.lookBy(dx, dy);
        },
        onBreak: () => {
          interaction.breakTargetedBlock();
        },
        onPlace: () => {
          interaction.placeTargetedBlock();
        },
      })
    : null;
  let touchVisible = false;
  const hud = new Hud(app);
  const soundToggle = must(document.querySelector<HTMLInputElement>("#sound-enabled"));
  const debugToggle = must(document.querySelector<HTMLInputElement>("#debug-info"));
  const preference = (name: string, fallback: boolean): boolean => {
    try {
      const value = localStorage.getItem(`voxel:${name}`);
      return value === null ? fallback : value === "true";
    } catch {
      return fallback;
    }
  };
  const storePreference = (name: string, enabled: boolean): void => {
    try {
      localStorage.setItem(`voxel:${name}`, String(enabled));
    } catch {
      /* Preferences are optional. */
    }
  };
  soundToggle.checked = preference("sound", true);
  sounds.enabled = soundToggle.checked;
  debugToggle.checked = preference("debug", false);
  hud.setVisible(debugToggle.checked);
  soundToggle.addEventListener("change", () => {
    sounds.setEnabled(soundToggle.checked);
    storePreference("sound", soundToggle.checked);
  });
  const updateDebug = () => {
    hud.setVisible(debugToggle.checked);
    storePreference("debug", debugToggle.checked);
  };
  debugToggle.addEventListener("change", updateDebug);
  app.addEventListener(
    "pointerdown",
    () => {
      sounds.unlock();
    },
    { capture: true },
  );
  window.addEventListener("keydown", (event) => {
    if (player.isActive) sounds.unlock();
    if (
      event.code !== "F3" ||
      event.repeat ||
      (event.target instanceof Element && event.target.matches("input,select,textarea"))
    )
      return;
    event.preventDefault();
    debugToggle.checked = !debugToggle.checked;
    updateDebug();
  });
  const scaleInterface = () => {
    app.style.setProperty("--gui-scale", String(guiScale(window.innerWidth, window.innerHeight)));
  };
  scaleInterface();
  window.addEventListener("resize", () => {
    scaleInterface();
    view.resize(window.innerWidth, window.innerHeight);
  });
  window.__mc = {
    position: () => ({ ...player.position }),
    blockAt: (x, y, z) => world.getBlock(x, y, z),
    target: () => {
      const hit = interaction.raycastFromCamera();
      return hit ? { x: hit.blockX, y: hit.blockY, z: hit.blockZ } : null;
    },
    pitch: () => player.eyePitch,
    yaw: () => player.eyeYaw,
    eyeHeight: () => player.eyePosition.y - player.position.y,
    mode: () => player.mode,
    renderer: () => view.kind,
    touch: () => touchControls !== null,
    loadedChunks: () => world.loadedChunkCount,
    meshedChunks: () => chunkMeshes?.meshedChunkCount ?? world.loadedChunkCount,
    pendingChunks: () => streamer.pendingCount,
    inventory: () => structuredClone(data.inventory),
    health: () => data.vitals.health,
    gameMode: () => data.mode,
    time: () => data.time,
    cameraFov: () => view.camera.fov,
    cameraView: () => ({ perspective: player.perspective, distance: player.cameraSeparation }),
    adventure: () => ({
      ...structuredClone(adventure.state),
      cast: adventure.cast ? structuredClone(adventure.cast) : null,
      shots: structuredClone(adventure.shots),
      generator: world.revision,
      dragonPosition: dragonPosition(adventure.state.dragon.phase),
      creatures: structuredClone(data.creatures),
      stronghold: stronghold(SEED, world.revision),
      entrance: strongholdEntrance(SEED, sampleColumn, world.revision),
      structures: structuresNear(SEED, player.position.x, player.position.z, sampleColumn),
    }),
    effects: () => ({
      fragments: fragments?.pool.particles.length ?? 0,
      soundEnabled: sounds.enabled,
      soundReady: sounds.ready,
      soundsPlayed: sounds.played,
      soundPeak: sounds.peak,
      soundCounts: { ...sounds.counts },
    }),
    seed: SEED,
  };
  if (companion) {
    const messages: { from: "player" | "companion"; text: string; time: number }[] = [];
    const validActor = (actor: unknown): boolean => actor === "player" || actor === "companion";
    window.__coop = {
      observe: (actor) => {
        const s = actor === "companion" ? companion.state : data;
        const p = actor === "companion" ? companion.state.position : player.position;
        const other = actor === "companion" ? player.position : companion.state.position;
        return structuredClone({
          actor,
          time: data.time,
          night: session.isNight,
          position: p,
          onGround: actor === "companion" ? companion.state.onGround : player.onGround,
          activity: actor === "companion" ? companion.activity : null,
          vitals: s.vitals,
          inventory: s.inventory,
          selected: s.selected,
          other: Math.hypot(other.x - p.x, other.y - p.y, other.z - p.z) <= 24 ? other : null,
          creatures: data.creatures.filter(
            (m) =>
              m.hp > 0 &&
              Math.hypot(m.position.x - p.x, m.position.y - p.y, m.position.z - p.z) <= 24,
          ),
          loot: data.loot.filter(
            (item) =>
              Math.hypot(item.position.x - p.x, item.position.y - p.y, item.position.z - p.z) <= 8,
          ),
          messages: messages.filter((m) => m.from !== actor).slice(-20),
        });
      },
      block: (actor, x, y, z) => {
        const p = actor === "companion" ? companion.state.position : player.position;
        if (
          ![x, y, z].every(Number.isInteger) ||
          Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y, z + 0.5 - p.z) > 8 ||
          !world.hasChunk(Math.floor(x / 16), Math.floor(z / 16))
        )
          return null;
        return world.getBlock(x, y, z);
      },
      move: (input, seconds) => companion.move(input, seconds),
      stop: () => {
        companion.stop();
      },
      select: (slot) => companion.select(slot),
      mine: (x, y, z) => companion.mine(x, y, z),
      blockingLeaf: (x, y, z) => companion.blockingLeaf(x, y, z),
      place: (x, y, z) => companion.place(x, y, z),
      eat: () => companion.eat(),
      attack: (id) => companion.attack(id),
      craft: (id, table) => companion.craft(id, table),
      give: (actor, slot, amount) => {
        if (!validActor(actor) || data.vitals.health <= 0 || companion.state.vitals.health <= 0)
          return false;
        if (actor === "player")
          return give(
            data.inventory,
            companion.state.inventory,
            slot,
            amount,
            player.position,
            companion.state.position,
          );
        return give(
          companion.state.inventory,
          data.inventory,
          slot,
          amount,
          companion.state.position,
          player.position,
        );
      },
      sleep: (x, y, z) => companion.sleep(x, y, z),
      say: (actor, text) => {
        if (!validActor(actor) || typeof text !== "string" || !text.trim() || text.length > 200)
          return false;
        messages.push({ from: actor, text, time: data.time });
        if (messages.length > 100) messages.shift();
        let display = text;
        try {
          const message: unknown = JSON.parse(text);
          if (
            message &&
            typeof message === "object" &&
            "text" in message &&
            typeof message.text === "string"
          )
            display = message.text;
        } catch {
          // Plain chat messages are also supported.
        }
        if (coopMessage)
          coopMessage.textContent = `${actor === "player" ? "プレイヤー１" : "プレイヤー２"}：${display}`;
        return true;
      },
    };
  }
  let lastTime = performance.now();
  const frame = (time: number): void => {
    const frameDelta = time - lastTime;
    const dt = frameDelta / 1000; // the player clock bounds catch-up and uses fixed substeps
    lastTime = time;
    const elapsed = data.time;
    // Adaptive quality: feed the real frame cadence so the renderer can
    // trade resolution for a fluid frame rate on weaker (mobile) hardware.
    view.tickAdaptive?.(frameDelta);
    if (touchControls && player.isActive !== touchVisible) {
      touchVisible = player.isActive;
      touchControls.setVisible(touchVisible);
    }
    streamer.update(player.position.x, player.position.z);
    if (
      lightTexture &&
      terrainMaterial &&
      (lastLight === 0 || time - lastLight > 500) &&
      (lightDirty ||
        lightChunks !== world.loadedChunkCount ||
        Math.hypot(
          player.position.x - lightPosition.x,
          player.position.y - lightPosition.y,
          player.position.z - lightPosition.z,
        ) > 6)
    ) {
      const field = buildLightField(player.position, (x, y, z) => world.getBlock(x, y, z));
      must(lightTexture.image.data).set(field.data);
      lightTexture.needsUpdate = true;
      (must(terrainMaterial.uniforms.uLightOrigin).value as THREE.Vector3).set(
        field.origin.x,
        field.origin.y,
        field.origin.z,
      );
      lightPosition = { ...player.position };
      lightChunks = world.loadedChunkCount;
      lastLight = time;
      lightDirty = false;
    }
    player.update(dt);
    if (world.revision >= 3 && !traveling) {
      const destination = portalContact.update(
        dt,
        player.position,
        player.isActive && !session.dead,
        session.creative,
        world.dimension,
        (x, y, z) => world.getBlock(x, y, z),
      );
      if (destination) adventure.onTravel?.(destination);
    }
    if (avatar) {
      avatar.update(player, session.held, dt);
    }
    if (companionAvatar && companion) {
      const s = companion.state;
      companionAvatar.update(
        {
          position: s.position,
          perspective: 1,
          cameraSeparation: s.vitals.health > 0 ? 4 : 0,
          eyeYaw: s.yaw,
          eyePitch: 0,
          isCrouching: false,
          isActive: s.vitals.health > 0,
        },
        s.inventory[s.selected] ?? null,
        dt,
        companion.activity.attacking,
      );
    }
    hand?.update(session.held, player.perspective === 0, player.position);
    interaction.update(dt);
    fragments?.update(dt, (x, y, z) => isSolid(world.getBlock(x, y, z)));
    const feetBlock = world.getBlock(
      Math.floor(player.position.x),
      Math.floor(player.position.y),
      Math.floor(player.position.z),
    );
    sounds.footsteps(
      player.position,
      player.onGround && feetBlock !== BlockId.WATER && feetBlock !== BlockId.LAVA,
      player.isActive,
      player.eyePosition.y - player.position.y < 1.5,
      world.getBlock(
        Math.floor(player.position.x),
        Math.floor(player.position.y - 0.1),
        Math.floor(player.position.z),
      ),
    );
    if (player.isActive || inventory.isOpen) {
      companion?.update(dt);
      fluids.tick(dt);
      if (
        Math.hypot(player.position.x - lastFluidWake.x, player.position.z - lastFluidWake.z) > 8
      ) {
        fluids.wake(player.position);
        lastFluidWake = { ...player.position };
      }
      const beforeTime = data.time;
      session.tick(dt, {
        position: player.position,
        onGround: player.onGround,
        yaw: player.eyeYaw,
        pitch: player.eyePitch,
      });
      adventure.tick(data.time - beforeTime);
    }
    if (time - lastUi > 100) {
      if (coopHud && companion) {
        coopHud.textContent = `２人目 体力 ${Math.ceil(companion.state.vitals.health)}/20 食料 ${Math.ceil(companion.state.vitals.hunger)}/20${companion.state.sleeping ? " 就寝中" : ""}`;
      }
      dimensionLabel.textContent =
        world.dimension === "nether"
          ? world.revision >= 3
            ? "ネザー · 帰還ゲートに入って待つ"
            : "ネザー · 帰還ゲートを右クリック"
          : world.dimension === "end"
            ? "エンド"
            : "通常世界";
      if (portalContact.progress > 0)
        dimensionLabel.textContent = `ゲートで移動中… ${Math.round(portalContact.progress * 100)}%`;
      bossHud.hidden = world.dimension !== "end";
      bossHud.textContent = adventure.state.dragon.defeated
        ? "エンダードラゴン討伐！ · 帰還ゲートが開きました"
        : `エンダードラゴン ${Math.ceil(adventure.state.dragon.health)} / ${dragonMaxHealth(data.generator)}`;
      bossHud.style.setProperty(
        "--boss-health",
        `${(adventure.state.dragon.health / dragonMaxHealth(data.generator)) * 100}%`,
      );
      lastUi = time;
      hotbar.refresh();
      inventory.refresh();
      entities.update(data, view.camera);
      must(document.querySelector<HTMLElement>("#hearts")).textContent =
        "♥".repeat(Math.ceil(data.vitals.health / 2)) +
        "♡".repeat(10 - Math.ceil(data.vitals.health / 2));
      must(document.querySelector<HTMLElement>("#hunger")).textContent =
        `食料 ${Math.ceil(data.vitals.hunger)}/20${data.vitals.air < 10 ? ` · 呼吸 ${Math.ceil(data.vitals.air)}` : ""} · XP ${adventure.state.xp}${adventure.state.fire ? ` · 耐火 ${Math.ceil(adventure.state.fire)}秒` : ""}${adventure.state.strength ? ` · 力 ${Math.ceil(adventure.state.strength)}秒` : ""}`;
      must(document.querySelector<HTMLElement>("#objective")).textContent =
        world.dimension === "end"
          ? adventure.state.dragon.defeated
            ? "ドラゴン討伐！ 帰還ゲートで通常世界へ戻ろう"
            : "クリスタルを弓で破壊 → 中央へ降りたドラゴンを攻撃"
          : world.dimension === "nether"
            ? "炎のロッド・ウォートを集め、帰還ゲートで戻ろう"
            : session.creative
              ? "クリエイティブ · E：所持品 / 作業台"
              : data.inventory.some((s) => s?.id === "diamond")
                ? "黒曜石でゲート作り → ネザー → アイの方角を探索 → エンド · E：冒険ガイド"
                : "原木 → 作業台 → 木・石・鉄のツルハシ → ダイヤ · E：所持品 / レシピ集 · 右クリック：使用";
    }
    let meshBudget = MESH_BUDGET_PER_FRAME;
    for (const [key, c] of editedChunks) {
      if (meshBudget <= 0) break;
      editedChunks.delete(key);
      if (world.hasChunk(c.cx, c.cz)) {
        chunkMeshes?.updateChunk(c.cx, c.cz);
        meshBudget--;
      }
    }
    for (const { cx, cz } of streamer.drainDirty(meshBudget)) {
      chunkMeshes?.updateChunk(cx, cz);
    }
    const profile = sampleColumn(player.position.x, player.position.z);
    const weather = weatherAt(SEED, data.time, world.dimension, profile.isSnowy, profile.isDesert);
    view.applySky(adventureSky(data.time, world.dimension, weather));
    adventureView?.update(world, view.camera, weather, elapsed, adventure);
    clouds?.update(player.position.x, player.position.z, elapsed);
    const hit = interaction.raycastFromCamera();
    if (highlight) {
      highlight.visible = hit !== null;
      if (hit) {
        highlight.position.set(hit.blockX + 0.5, hit.blockY + 0.5, hit.blockZ + 0.5);
      }
    }
    cpuView?.setHighlight(hit ? { x: hit.blockX, y: hit.blockY, z: hit.blockZ } : null);
    hud.frame(time, {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      chunks: world.loadedChunkCount,
      seed: SEED,
      note: view.qualityNote(),
    });
    view.render(elapsed);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
void boot().catch((error: unknown) => {
  console.error(error);
  showFatalError(error);
});
