import test from "node:test";
import assert from "node:assert/strict";
import { blockBeforeTargetSphere } from "./lib/modern-hunting.mjs";
const eye = { x: 0.5, y: 36.62, z: 0.5 },
  body = { x: 0.5, y: 35.7, z: 4.5 };
test("close low cover before the target sphere is an actual obstruction", () =>
  assert.equal(blockBeforeTargetSphere(eye, body, { x: 0, y: 35, z: 3 }), true));
test("terrain behind a creature is not its obstruction", () =>
  assert.equal(blockBeforeTargetSphere(eye, body, { x: 0, y: 35, z: 5 }), false));
test("a floor below the ray is not an obstruction", () =>
  assert.equal(blockBeforeTargetSphere(eye, body, { x: 0, y: 34, z: 2 }), false));
test("an off-axis wall is not an obstruction", () =>
  assert.equal(blockBeforeTargetSphere(eye, body, { x: 1, y: 35, z: 3 }), false));
test("a block touching the target sphere is not removed as cover", () =>
  assert.equal(
    blockBeforeTargetSphere(
      { x: 0.5, y: 0.5, z: 0.5 },
      { x: 0.5, y: 0.5, z: 3.2 },
      { x: 0, y: 0, z: 3 },
    ),
    false,
  ));
