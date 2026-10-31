import test from "node:test";
import assert from "node:assert/strict";
import { hasParallelMining } from "./overlap.mjs";

test("counts only simultaneous mining of different targets", () => {
  const a = { x: 1, y: 2, z: 3 },
    b = { x: 2, y: 2, z: 3 };
  assert.equal(
    hasParallelMining([
      { actor: "player", method: "mining-start", target: a, peerActivity: { mining: b } },
    ]),
    true,
  );
  assert.equal(
    hasParallelMining([
      { actor: "companion", method: "mine", result: true, args: [b], peerMining: a },
    ]),
    true,
  );
  assert.equal(
    hasParallelMining([
      { actor: "player", method: "mining-start", target: a, peerActivity: { mining: a } },
    ]),
    false,
  );
  assert.equal(
    hasParallelMining([
      { actor: "companion", method: "mine", result: false, args: [b], peerMining: a },
    ]),
    false,
  );
  assert.equal(
    hasParallelMining([
      { actor: "player", method: "mining-start", target: a, peerActivity: { mining: null } },
    ]),
    false,
  );
});
