import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { clearTimeout } from "node:timers";

async function simulate(observation) {
  const worker = new Worker(new URL("./policy-worker.mjs", import.meta.url), {
    workerData: { actor: "companion" },
  });
  const calls = [];
  try {
    const outcome = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("policy did not stop")), 3000);
      worker.on("error", reject);
      worker.on("message", (message) => {
        if (message.type === "request") {
          calls.push(message.method);
          const result = message.method === "observe" ? observation : true;
          worker.postMessage({ id: message.id, result });
        }
        if (message.type === "failed") {
          clearTimeout(timer);
          resolve(message.error);
        }
      });
    });
    return { calls, outcome };
  } finally {
    await worker.terminate();
  }
}

test("an independent policy warns and stops when a real-time hostile appears", async () => {
  const result = await simulate({
    vitals: { health: 20 },
    position: { x: 0, y: 1, z: 0 },
    time: 300,
    night: false,
    creatures: [{ id: 1, hp: 10, species: "zombie", position: { x: 4, y: 1, z: 0 } }],
  });
  assert.match(result.outcome, /zombie/);
  assert.ok(result.calls.includes("say"));
  assert.ok(result.calls.includes("stop"));
  assert.ok(!result.calls.includes("move"));
});

test("an independent policy stops before night when no safe bedtime plan is available", async () => {
  const result = await simulate({
    vitals: { health: 20 },
    position: { x: 0, y: 1, z: 0 },
    time: 620,
    night: false,
    creatures: [],
  });
  assert.match(result.outcome, /before night/);
  assert.ok(result.calls.includes("stop"));
  assert.ok(!result.calls.includes("move"));
});
