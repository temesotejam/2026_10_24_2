import { test } from "node:test";
import assert from "node:assert/strict";
import { canMelee, chooseThreat, safeRetreat } from "./lib/combat-policy.mjs";
const player = { x: 0.5, y: 34, z: 0.5 };
const mob = (id, species, x, y = 34, z = 0.5) => ({ id, species, hp: 16, position: { x, y, z } });
test("ignores villagers and passive wanderers but responds to an angry wanderer", () => {
  assert.equal(
    chooseThreat(player, [mob(1, "villager", 1.5), mob(2, "wanderer", 2)], () => 0),
    null,
  );
  assert.equal(chooseThreat(player, [{ ...mob(2, "wanderer", 2), fuse: 2 }], () => 0)?.id, 2);
});
test("prioritizes an imminent explosion over a distant ranged enemy", () => {
  assert.equal(
    chooseThreat(player, [mob(1, "skeleton", 10), mob(2, "mossling", 3)], () => 0)?.id,
    2,
  );
});
test("does not attack through solid walls or chase melee mobs below a high bridge", () => {
  assert.equal(
    chooseThreat(player, [mob(1, "zombie", 3.5)], (x, y) => (x === 2 && y >= 34 ? 3 : 0)),
    null,
  );
  assert.equal(
    chooseThreat(player, [mob(2, "ember", 0.5, 25)], () => 0),
    null,
  );
});
test("detects a visible skeleton at its firing distance and loses a removed target", () => {
  assert.equal(chooseThreat(player, [mob(1, "skeleton", 12)], () => 0)?.id, 1);
  assert.equal(
    chooseThreat(player, [{ ...mob(1, "skeleton", 12), hp: 0 }], () => 0),
    null,
  );
});
test("retreats on supported ground rather than into lava or over a cliff", () => {
  const terrain = (x, y, z) => (y === 33 ? (x < 0 || z < 0 ? 26 : 3) : 0);
  const p = safeRetreat(player, { x: -2, z: 0.5 }, terrain);
  assert.ok(p);
  assert.ok(p.x > player.x);
  assert.ok(p.z >= 0);
  assert.equal(
    safeRetreat(player, { x: -2, z: 0.5 }, () => 0),
    null,
  );
});

test("melee reach uses the eye and target body, including vertical ledges", () => {
  assert.equal(canMelee({ x: 0, y: 34, z: 0 }, 1.62, { x: 2.7, y: 33, z: 0 }), false);
  assert.equal(canMelee({ x: 0, y: 34, z: 0 }, 1.62, { x: 2.4, y: 34, z: 0 }), true);
});

test("keeps a pursuing melee enemy in view during a defensive retreat", () => {
  const enemy = mob(1, "ember", 8);
  assert.equal(
    chooseThreat(player, [enemy], () => 0),
    null,
  );
  assert.equal(chooseThreat(player, [enemy], () => 0, 14)?.id, 1);
});
test("finds a retreat over a single safe step", () => {
  const terrain = (x, y) => (y <= (x >= 1 ? 34 : 33) ? 3 : 0);
  const p = safeRetreat(player, { x: -2, z: 0.5 }, terrain);
  assert.ok(p && p.x > player.x);
  assert.equal(p.y, 35);
  assert.equal(p.jump, true);
});
