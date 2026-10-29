import test from "node:test";
import assert from "node:assert/strict";
import {
  bodyClear,
  drySweep,
  huntingPath,
  huntingCoverPath,
  perpendicularStrafe,
} from "./lib/hunting-path.mjs";
const floor = (_x, y, _z) => (y <= 34 ? 3 : 0);
test("routes around a house wall instead of repeatedly pressing into its corner", () => {
  const blocks = (x, y, z) => (y <= 34 ? 3 : x === 2 && z >= -2 && z <= 1 && y <= 37 ? 10 : 0);
  const from = { x: 0.5, y: 35, z: 0.5 },
    target = { x: 6.5, y: 35, z: 0.5 };
  const plan = huntingPath(from, target, blocks);
  assert.equal(plan.reached, true);
  assert.ok(plan.path.some((p) => p.z >= 2.5 || p.z <= -3.5));
  let p = from;
  for (const next of plan.path) {
    assert.ok(drySweep(p, next, blocks));
    p = next;
  }
});
test("centers off-center feet before turning past a width-sensitive corner", () => {
  const blocks = (x, y, z) => (y <= 34 ? 3 : x === -1 && z >= 1 && y <= 37 ? 10 : 0);
  const from = { x: 0.15, y: 35, z: 0.5 },
    target = { x: 0.5, y: 35, z: 5.5 };
  assert.equal(bodyClear(from, blocks), true);
  assert.equal(drySweep(from, { x: 0.5, y: 35, z: 1.5 }, blocks), false);
  const plan = huntingPath(from, target, blocks);
  assert.equal(plan.reached, true);
  assert.deepEqual(plan.path[0], { x: 0.5, y: 35, z: 0.5 });
});
test("does not cut a diagonal corner or cross a river to pursue a target", () => {
  const corner = (x, y, z) => (y <= 34 ? 3 : x === 1 && z === 1 && y <= 37 ? 10 : 0);
  assert.equal(drySweep({ x: 0.5, y: 35, z: 0.5 }, { x: 1.5, y: 35, z: 1.5 }, corner), false);
  const river = (x, y, _z) => (y <= 33 ? 3 : y === 34 ? (x === 2 ? 5 : 3) : 0);
  const plan = huntingPath({ x: 0.5, y: 35, z: 0.5 }, { x: 6.5, y: 35, z: 0.5 }, river, {
    radius: 5,
  });
  assert.equal(plan.reached, false);
  assert.ok(plan.path.every((p) => p.x < 2));
});
test("permits a normal one-block step only with jump headroom", () => {
  const step = (x, y, _z) => (y <= 34 || (x === 1 && y === 35) ? 3 : 0);
  assert.ok(drySweep({ x: 0.5, y: 35, z: 0.5 }, { x: 1.5, y: 36, z: 0.5 }, step));
  const lowRoof = (x, y, z) => (y === 37 && x === 0 ? 3 : step(x, y, z));
  assert.equal(drySweep({ x: 0.5, y: 35, z: 0.5 }, { x: 1.5, y: 36, z: 0.5 }, lowRoof), false);
  assert.ok(huntingPath({ x: 0.5, y: 35, z: 0.5 }, { x: 5.5, y: 35, z: 0.5 }, floor).reached);
});

test("withdraws behind real cover or beyond ranged reach without crossing water", () => {
  const wall = (x, y, z) => (y <= 34 ? 3 : x === 2 && z >= 1 && z <= 3 && y <= 38 ? 10 : 0);
  const from = { x: 0.5, y: 35, z: 0.5 },
    enemy = { position: { x: 6.5, y: 35, z: 0.5 } };
  const covered = huntingCoverPath(from, [enemy], wall);
  assert.equal(covered.reached, true);
  assert.ok(covered.path.at(-1).z >= 1.5);
  const escaped = huntingCoverPath(from, [enemy], floor);
  assert.equal(escaped.reached, true);
  assert.ok(Math.hypot(escaped.path.at(-1).x - 6.5, escaped.path.at(-1).z - 0.5) > 15);
});

test("bow strafing alternates safely and refuses water, walls and unsupported edges", () => {
  const player = { x: 0.5, y: 35, z: 0.5 },
    target = { x: 7, y: 35, z: 0.5 };
  assert.equal(perpendicularStrafe(player, target, floor, 1).key, "KeyD");
  assert.equal(perpendicularStrafe(player, target, floor, -1).key, "KeyA");
  const wall = (x, y, z) => (y <= 34 ? 3 : z === 1 && y <= 37 ? 10 : 0);
  assert.equal(perpendicularStrafe(player, target, wall, 1).key, "KeyA");
  const island = (x, y, z) => (y <= 34 ? (z === 0 ? 3 : 0) : 0);
  assert.equal(perpendicularStrafe(player, target, island, 1), null);
  const water = (x, y, z) => (y <= 33 ? 3 : y === 34 ? (z === 0 ? 3 : 5) : 0);
  assert.equal(perpendicularStrafe(player, target, water, 1), null);
});
