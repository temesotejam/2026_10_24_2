import { BLOCKS } from "../world/blocks";
import { validStack } from "../items/catalog";
import type { Slots } from "../items/inventory";
import type { SessionState } from "../survival/session";
import { REALM_FIELDS } from "../survival/adventure-state";

export const MAX_SAVE_BYTES = 10 * 1024 * 1024;
const numeric = (v: unknown, min = 0, max = 1e10): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min = 0, max = 1e10) => numeric(v, min, max) && Number.isInteger(v);
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const position = (v: unknown) =>
  record(v) && numeric(v.x, -3e7, 3e7) && numeric(v.y, -512, 256) && numeric(v.z, -3e7, 3e7);
const slots = (v: unknown, length: number): v is Slots =>
  Array.isArray(v) && v.length === length && v.every((s) => s === null || validStack(s));
const blockKey = (key: string) =>
  /^-?\d+,-?\d+,-?\d+$/.test(key) && key.split(",").every((v) => integer(Number(v), -3e7, 3e7));
function assert(ok: unknown, field: string): asserts ok {
  if (!ok) throw new Error(`セーブ形式が不正です: ${field}`);
}
/** Validate every persisted field before making any changes to the current world. */
export function validateSave(value: unknown): SessionState {
  assert(record(value), "root");
  const d = value;
  assert(
    d.version === 1 && (d.generator === 1 || d.generator === 2 || d.generator === 3),
    "version / generator",
  );
  assert(
    integer(d.seed, -2147483648, 2147483647) && (d.mode === "survival" || d.mode === "creative"),
    "world",
  );
  assert(slots(d.inventory, 36) && integer(d.selected, 0, 8), "inventory");
  assert(
    (d.gridSize === 2 || d.gridSize === 3) && slots(d.grid, d.gridSize * d.gridSize),
    "craft grid",
  );
  assert(
    position(d.position) &&
      position(d.spawn) &&
      numeric(d.yaw, -1e6, 1e6) &&
      numeric(d.pitch, -Math.PI / 2, Math.PI / 2),
    "player",
  );
  assert(numeric(d.time) && integer(d.nextId, 1), "clock / ids");
  assert(record(d.vitals), "vitals");
  for (const [key, max] of Object.entries({
    health: 20,
    hunger: 20,
    air: 10,
    exhaustion: 100,
    damageCooldown: 1,
    regen: 4,
    hazard: 1,
  }))
    assert(numeric(d.vitals[key], 0, max), `vitals.${key}`);
  assert(record(d.edits) && Object.keys(d.edits).length <= 20000, "edits");
  let editCount = 0;
  for (const [key, cells] of Object.entries(d.edits)) {
    assert(
      /^-?\d+,-?\d+$/.test(key) &&
        key.split(",").every((v) => integer(Number(v), -2e6, 2e6)) &&
        record(cells),
      "chunk",
    );
    for (const [i, id] of Object.entries(cells)) {
      assert(
        integer(Number(i), 0, 16 * 16 * 96 - 1) && integer(id, 0, 255) && Number(id) in BLOCKS,
        "block",
      );
      editCount++;
    }
  }
  assert(editCount <= 500000, "edit count");
  for (const name of ["chests", "furnaces", "growth"] as const)
    assert(record(d[name]) && Object.keys(d[name]).length <= 10000, name);
  for (const [key, v] of Object.entries(d.chests as Record<string, unknown>))
    assert(blockKey(key) && slots(v, 27), "chest");
  for (const [key, v] of Object.entries(d.furnaces as Record<string, unknown>)) {
    assert(
      blockKey(key) &&
        record(v) &&
        slots(v.slots, 3) &&
        numeric(v.fuel, 0, 80) &&
        numeric(v.progress, 0, 8) &&
        (v.recipe === null ||
          (typeof v.recipe === "string" &&
            ["iron", "gold", "meat", "coal", "stone", "glass", "cookedFish"].includes(v.recipe))),
      "furnace",
    );
  }
  for (const [key, v] of Object.entries(d.growth as Record<string, unknown>))
    assert(blockKey(key) && numeric(v, 0, 1e8), "growth");
  assert(
    Array.isArray(d.creatures) &&
      d.creatures.length <= 28 &&
      Array.isArray(d.loot) &&
      d.loot.length <= 10000 &&
      Array.isArray(d.arrows) &&
      d.arrows.length <= 100,
    "entities",
  );
  const ids: number[] = [];
  for (const m of d.creatures) {
    assert(
      record(m) &&
        integer(m.id, 1) &&
        [
          "pig",
          "cow",
          "sheep",
          "chicken",
          "zombie",
          "skeleton",
          "mossling",
          "spider",
          "villager",
          "ember",
          "wanderer",
        ].includes(String(m.species)) &&
        position(m.position) &&
        position(m.velocity) &&
        typeof m.onGround === "boolean" &&
        numeric(m.hp, 0, 30) &&
        numeric(m.age, -120, 1e10) &&
        numeric(m.cooldown, 0, 3) &&
        numeric(m.intent, -7, 7) &&
        numeric(m.love, 0, 30) &&
        (m.fuse === undefined || numeric(m.fuse, 0, 2)),
      "creature",
    );
    ids.push(m.id as number);
  }
  for (const l of d.loot) {
    assert(
      record(l) &&
        integer(l.id, 1) &&
        position(l.position) &&
        validStack(l.stack) &&
        numeric(l.age, 0, 600),
      "loot",
    );
    ids.push(l.id as number);
  }
  for (const a of d.arrows)
    assert(
      record(a) && position(a.position) && position(a.velocity) && numeric(a.age, 0, 4),
      "arrow",
    );
  assert(
    new Set(ids).size === ids.length && ids.every((id) => id < (d.nextId as number)),
    "entity ids",
  );
  const fluidLevels = d.fluidLevels ?? {};
  assert(record(fluidLevels) && Object.keys(fluidLevels).length <= 10000, "fluids");
  for (const [key, level] of Object.entries(fluidLevels))
    assert(blockKey(key) && integer(level, 0, 4), "fluid level");
  if (d.adventure !== undefined) {
    const a = d.adventure;
    assert(
      record(a) &&
        ["overworld", "nether", "end"].includes(String(a.dimension)) &&
        integer(a.xp, 0, 1000000) &&
        numeric(a.fire, 0, 60) &&
        numeric(a.strength, 0, 60),
      "adventure",
    );
    assert(
      record(a.dragon) &&
        numeric(a.dragon.health, 0, 200) &&
        numeric(a.dragon.phase) &&
        typeof a.dragon.defeated === "boolean" &&
        a.dragon.defeated === (a.dragon.health === 0),
      "dragon",
    );
    if (a.eyeThrows !== undefined) assert(integer(a.eyeThrows, 0, 1000000), "eye throws");
    assert(record(a.opened) && Object.keys(a.opened).length <= 10000, "opened structures");
    for (const [key, opened] of Object.entries(a.opened))
      assert(
        /^(overworld|nether|end):/.test(key) &&
          blockKey(key.slice(key.indexOf(":") + 1)) &&
          opened === true,
        "opened structure",
      );
    assert(record(a.brewing) && Object.keys(a.brewing).length <= 1000, "brewing");
    for (const [key, job] of Object.entries(a.brewing))
      assert(
        /^(overworld|nether|end):/.test(key) &&
          blockKey(key.slice(key.indexOf(":") + 1)) &&
          record(job) &&
          numeric(job.remaining, 0, 5) &&
          ["healingPotion", "firePotion", "strengthPotion"].includes(String(job.output)),
        "brew",
      );
    assert(record(a.realms) && Object.keys(a.realms).length <= 3, "realms");
    for (const [dimension, realm] of Object.entries(a.realms)) {
      assert(
        ["overworld", "nether", "end"].includes(dimension) &&
          record(realm) &&
          Object.keys(realm).length === REALM_FIELDS.length &&
          REALM_FIELDS.every((key) => Object.hasOwn(realm, key)),
        "realm",
      );
      validateSave({ ...d, ...realm, adventure: undefined });
    }
    assert(a.dimension === "overworld" || Object.hasOwn(a.realms, "overworld"), "return realm");
  }
  return {
    ...structuredClone(value),
    fluidLevels: structuredClone(fluidLevels),
  } as unknown as SessionState;
}
export function parseSave(text: string): SessionState {
  if (new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES)
    throw new Error("セーブは 10 MB 以下にしてください");
  return validateSave(JSON.parse(text));
}
export function encodeSave(data: SessionState): string {
  const text = JSON.stringify(validateSave(data));
  if (new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES)
    throw new Error("セーブは 10 MB 以下にしてください");
  return text;
}
export const saveKey = (seed: number, mode: string) => `${seed}:${mode}`;
export class SaveRepository {
  private db: IDBDatabase;
  private constructor(db: IDBDatabase) {
    this.db = db;
  }
  static async open(): Promise<SaveRepository> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("classic-voxel-survival", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("worlds");
      };
      request.onsuccess = () => {
        resolve(new SaveRepository(request.result));
      };
      request.onerror = () => {
        reject(request.error ?? new Error("保存領域を開けません"));
      };
      request.onblocked = () => {
        reject(new Error("別のタブを閉じて保存を再試行してください"));
      };
    });
  }
  async load(key: string, previous = false): Promise<SessionState | null> {
    return new Promise((resolve, reject) => {
      const req = this.db
        .transaction("worlds", "readonly")
        .objectStore("worlds")
        .get(previous ? `${key}:previous` : key);
      req.onerror = () => {
        reject(req.error ?? new Error("読み込みに失敗しました"));
      };
      req.onsuccess = () => {
        try {
          resolve(req.result === undefined ? null : validateSave(req.result));
        } catch (error) {
          reject(error instanceof Error ? error : new Error("保存データが不正です"));
        }
      };
    });
  }
  async save(data: SessionState): Promise<void> {
    const safe = validateSave(data);
    if (new TextEncoder().encode(JSON.stringify(safe)).byteLength > MAX_SAVE_BYTES)
      throw new Error("セーブは 10 MB 以下にしてください");
    const key = saveKey(safe.seed, safe.mode);
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("worlds", "readwrite");
      const store = tx.objectStore("worlds");
      const prior = store.get(key);
      prior.onsuccess = () => {
        try {
          if (prior.result !== undefined) store.put(prior.result, `${key}:previous`);
          store.put(safe, key);
        } catch (error) {
          tx.abort();
          reject(error instanceof Error ? error : new Error("書き込みに失敗しました"));
        }
      };
      tx.oncomplete = () => {
        resolve();
      };
      tx.onabort = () => {
        reject(tx.error ?? new Error("保存が中断されました"));
      };
      tx.onerror = () => {
        reject(tx.error ?? new Error("書き込みに失敗しました"));
      };
    });
  }
}
