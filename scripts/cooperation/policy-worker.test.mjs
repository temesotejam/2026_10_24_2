import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { clearTimeout } from "node:timers";

async function simulate(observation, actor = "companion") {
  const worker = new Worker(new URL("./policy-worker.mjs", import.meta.url), {
    workerData: { actor },
  });
  const calls = [];
  try {
    const outcome = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("policy did not stop")), 3000);
      worker.on("error", reject);
      worker.on("message", (message) => {
        if (message.type === "request") {
          calls.push(message.method);
          const result =
            message.method === "observe"
              ? observation
              : message.method === "scan"
                ? { beds: [] }
                : true;
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
  const result = await simulate(
    {
      vitals: { health: 20 },
      position: { x: 0, y: 1, z: 0 },
      time: 620,
      night: false,
      creatures: [],
    },
    "player",
  );
  assert.match(result.outcome, /before night/);
  assert.ok(result.calls.includes("stop"));
  assert.ok(!result.calls.includes("move"));
});

test("two independent policies coordinate distinct beds and observe morning", async () => {
  const beds = [
    { x: 0, y: 1, z: 0 },
    { x: 2, y: 1, z: 0 },
  ];
  const game = {
    time: 620,
    night: false,
    messages: [],
    ready: new Set(),
    sleeping: false,
    slept: new Set(),
  };
  const workers = ["player", "companion"].map((actor) => ({
    actor,
    worker: new Worker(new URL("./policy-worker.mjs", import.meta.url), { workerData: { actor } }),
  }));
  const calls = [];
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("coordinated sleep timed out")), 7000);
      for (const { actor, worker } of workers) {
        worker.on("error", reject);
        worker.on("message", (m) => {
          if (m.type === "failed") {
            clearTimeout(timer);
            reject(Error(m.error));
            return;
          }
          if (m.type !== "request") return;
          calls.push({ actor, method: m.method, args: m.args });
          let result = true;
          if (m.method === "observe")
            result = {
              position: actor === "player" ? { x: 0.5, y: 1, z: 1.5 } : { x: 2.5, y: 1, z: 1.5 },
              vitals: { health: 20 },
              inventory: [],
              creatures: [],
              other: null,
              time: game.time,
              night: game.night,
              messages: game.messages.filter((entry) => entry.from !== actor),
            };
          else if (m.method === "scan") result = { beds, wood: [], ground: [] };
          else if (m.method === "block") result = 15;
          else if (m.method === "say") {
            const text = m.args[0],
              body = JSON.parse(text);
            game.messages.push({ from: actor, text });
            if (body.type === "bed-ready") {
              game.ready.add(actor);
              if (game.ready.size === 2) {
                game.time = 750;
                game.night = true;
              }
            }
            if (body.type === "slept" && body.result === "morning observed") {
              game.slept.add(actor);
              if (game.slept.size === 2) {
                clearTimeout(timer);
                resolve();
              }
            }
          } else if (m.method === "sleep") {
            if (actor === "companion") game.sleeping = true;
            else if (game.sleeping) {
              game.time = 1500;
              game.night = false;
            } else result = false;
          }
          worker.postMessage({ id: m.id, result });
        });
      }
    });
    const sleeping = calls.filter((c) => c.method === "sleep");
    assert.equal(sleeping.length, 2);
    assert.equal(sleeping[0].actor, "companion");
    assert.notDeepEqual(sleeping[0].args[0], sleeping[1].args[0]);
    assert.equal(game.time, 1500);
  } finally {
    await Promise.all(workers.map(({ worker }) => worker.terminate()));
  }
});
