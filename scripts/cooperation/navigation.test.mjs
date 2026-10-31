import test from "node:test";
import assert from "node:assert/strict";
import { safePath } from "./navigation.mjs";
const k = (x, y, z) => `${x},${y},${z}`;
function empty() {
  const b = {};
  for (let x = -3; x <= 5; x++)
    for (let z = -3; z <= 3; z++) for (let y = 0; y <= 5; y++) b[k(x, y, z)] = y === 0 ? 1 : 0;
  return b;
}
test("finds a supported detour around a solid barrier", () => {
  const blocks = empty();
  blocks[k(1, 1, 0)] = 3;
  blocks[k(1, 2, 0)] = 3;
  const route = safePath({
    position: { x: 0.5, y: 1, z: 0.5 },
    target: { x: 3.5, y: 1, z: 0.5 },
    blocks,
    radius: 0.6,
  });
  assert.ok(route);
  assert.ok(route.some((p) => p.z !== 0));
  assert.equal(route.at(-1).x, 3);
});
test("rejects water and unknown support instead of walking into a gap", () => {
  const blocks = empty();
  for (let z = -3; z <= 3; z++) blocks[k(1, 0, z)] = 5;
  assert.equal(
    safePath({
      position: { x: 0.5, y: 1, z: 0.5 },
      target: { x: 3.5, y: 1, z: 0.5 },
      blocks,
      radius: 0.6,
    }),
    null,
  );
});
test("permits one block down but not a two-block drop", () => {
  const blocks = empty();
  for (let x = 1; x <= 5; x++)
    for (let z = -3; z <= 3; z++) {
      blocks[k(x, 0, z)] = 0;
      blocks[k(x, -1, z)] = 1;
    }
  const route = safePath({
    position: { x: 0.5, y: 1, z: 0.5 },
    target: { x: 2.5, y: 0, z: 0.5 },
    blocks,
    radius: 0.6,
  });
  assert.ok(route);
  assert.ok(route.some((p) => p.y === 0));
  for (let x = 1; x <= 5; x++)
    for (let z = -3; z <= 3; z++) {
      blocks[k(x, -1, z)] = 0;
      blocks[k(x, -2, z)] = 1;
    }
  assert.equal(
    safePath({
      position: { x: 0.5, y: 1, z: 0.5 },
      target: { x: 2.5, y: -1, z: 0.5 },
      blocks,
      radius: 0.6,
    }),
    null,
  );
});
test("requires headroom before climbing one block", () => {
  const blocks = empty();
  for (let z = -3; z <= 3; z++) blocks[k(1, 1, z)] = 1;
  const route = safePath({
    position: { x: 0.5, y: 1, z: 0.5 },
    target: { x: 2.5, y: 1, z: 0.5 },
    blocks,
    radius: 0.6,
  });
  assert.ok(route.some((p) => p.y === 2));
  for (let z = -3; z <= 3; z++) blocks[k(0, 3, z)] = 3;
  assert.equal(
    safePath({
      position: { x: 0.5, y: 1, z: 0.5 },
      target: { x: 2.5, y: 1, z: 0.5 },
      blocks,
      radius: 0.6,
    }),
    null,
  );
});
