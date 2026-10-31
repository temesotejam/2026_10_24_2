import test from "node:test";
import assert from "node:assert/strict";
import { safetyStop } from "./safety.mjs";

const observation = () => ({
  position: { x: 0, y: 1, z: 0 },
  vitals: { health: 20 },
  creatures: [],
  night: false,
  time: 300,
});
const mob = (species, x, extra = {}) => ({
  species,
  id: 1,
  hp: 10,
  position: { x, y: 1, z: 0 },
  ...extra,
});

test("stops for a live skeleton at range while ignoring friendly and dead creatures", () => {
  const o = observation();
  o.creatures = [mob("pig", 1), mob("zombie", 2, { hp: 0 }), mob("skeleton", 17)];
  assert.equal(safetyStop(o)?.mob.species, "skeleton");
  o.creatures.pop();
  assert.equal(safetyStop(o), null);
});

test("a neutral wanderer is ignored until angry and bedtime stops work", () => {
  const o = observation();
  o.creatures = [mob("wanderer", 3)];
  assert.equal(safetyStop(o), null);
  o.creatures[0].fuse = 2;
  assert.equal(safetyStop(o)?.type, "threat");
  o.creatures = [];
  o.time = 620;
  assert.equal(safetyStop(o)?.type, "bedtime");
});

test("safety decisions are based on each actor's position and real-time observation", () => {
  const a = observation(),
    b = observation();
  a.creatures = b.creatures = [mob("zombie", 8)];
  b.position = { x: -20, y: 1, z: 0 };
  assert.equal(safetyStop(a)?.type, "threat");
  assert.equal(safetyStop(b), null);
  a.creatures[0].position.x = 12;
  assert.equal(safetyStop(a), null);
});
