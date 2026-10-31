import test from "node:test";
import assert from "node:assert/strict";
import { canPlantSapling } from "./renewal.mjs";

test("plant only when soil and the entire growth space are known and clear", () => {
  assert.equal(canPlantSapling([1, 0, 0, 0, 0, 0]), true);
  assert.equal(canPlantSapling([2, 0, 0, 0, 0, 0]), true);
  assert.equal(canPlantSapling([3, 0, 0, 0, 0, 0]), false);
  assert.equal(canPlantSapling([1, 0, 7, 0, 0, 0]), false);
  assert.equal(canPlantSapling([1, 0, 0, null, 0, 0]), false);
});
