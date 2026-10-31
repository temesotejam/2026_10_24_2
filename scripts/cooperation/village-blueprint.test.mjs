import test from "node:test";
import assert from "node:assert/strict";
import { shelterPlan } from "./village-blueprint.mjs";

test("a shelter has a reachable doorway, standing space, bed and complete roof", () => {
  const plan = shelterPlan({ x: 10, y: 20, z: 30 });
  const key = (p) => `${p.x},${p.y},${p.z}`;
  const occupied = new Set([plan.bed, ...plan.wall, ...plan.roof].map(key));
  assert.equal(occupied.size, 31);
  assert.equal(plan.wall.length, 18);
  assert.equal(plan.roof.length, 12);
  for (const cell of [
    plan.entrance,
    { ...plan.entrance, y: 21 },
    plan.standing,
    { ...plan.standing, y: 21 },
  ])
    assert.equal(occupied.has(key(cell)), false);
  assert.equal(occupied.has(key({ ...plan.standing, y: 22 })), true);
  assert.equal(occupied.has(key({ ...plan.bed, y: 22 })), true);
});
