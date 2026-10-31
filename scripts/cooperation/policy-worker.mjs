/** An independent, bounded-observation rule policy. It never accesses the browser directly. */
import { parentPort, workerData } from "node:worker_threads";
import { safetyStop } from "./safety.mjs";

const actor = workerData.actor;
const pending = new Map();
let nextId = 0;
parentPort.on("message", (message) => {
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error));
  else request.resolve(message.result);
});
function call(method, ...args) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    parentPort.postMessage({ type: "request", id, method, args });
  });
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const count = (observation, id) =>
  observation.inventory.reduce((n, item) => n + (item?.id === id ? item.count : 0), 0);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function message(observation, type) {
  for (const entry of [...observation.messages].reverse()) {
    try {
      const body = JSON.parse(entry.text);
      if (body.type === type) return body;
    } catch {
      /* Ignore non-protocol chat. */
    }
  }
  return null;
}
async function announce(type, fields = {}) {
  const descriptions = {
    ready: `${actor === "player" ? "探索・建築" : "採取・加工"}を担当します。`,
    wood: "木を見つけました。位置を共有します。",
    "need-wood": "木材を探しています。",
    mining: "木を採取します。",
    accepted: "共有された木の位置へ向かいます。",
    retarget: "到達しにくいため、別の木を探します。",
    crafted: "原木を板材に加工しました。",
    shared: "板材を２個渡しました。",
    built: "受け持った場所に板材を設置しました。",
    finished: "２人の作業を確認しました。",
    danger: "敵を発見。安全確認のため作業を止めます。",
    "safety-stop":
      fields.reason === "bedtime approaching"
        ? "日暮れ前に作業を止めます。"
        : "安全な経路を確認できないため作業を止めます。",
  };
  return call("say", JSON.stringify({ type, text: descriptions[type] ?? type, ...fields }));
}
async function moveToward(from, target, seconds = 0.3) {
  const yaw = Math.atan2(-(target.x - from.x), -(target.z - from.z));
  for (const offset of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
    if (await call("move", { forward: 1, right: 0, jump: false, yaw: yaw + offset }, seconds))
      return true;
  }
  return false;
}

let target = null;
let announced = false;
let mined = false;
let minePending = false;
let pendingAt = 0;
let placed = false;
let shared = false;
let lastAlert = 0;
let lastRequest = 0;
let lastScan = 0;
let lastLook = 0;
let blockedMoves = 0;
const rejectedTargets = new Set();
let bestTargetDistance = Infinity;
let lastProgress = Date.now();
let scan = { wood: [], ground: [], beds: [] };
const started = Date.now();

try {
  await announce("ready", { role: actor === "player" ? "探索・建築" : "採取・加工" });
  while (Date.now() - started < 90000) {
    const obs = await call("observe");
    const safety = safetyStop(obs);
    if (safety?.type === "dead") throw Error("actor died");
    if (safety?.type === "threat") {
      const { mob: threat } = safety;
      if (Date.now() - lastAlert > 3000) {
        await announce("danger", { species: threat.species });
        lastAlert = Date.now();
      }
      if (safety.distance < 2.8) await call("attack", threat.id);
      // Refuse to advance work into danger; the runner stops rather than waiting through night.
      await call("stop");
      throw Error(`safety stop: ${threat.species} is nearby`);
    }
    if (safety?.type === "bedtime") {
      await announce("safety-stop", { reason: "bedtime approaching" });
      await call("stop");
      throw Error("safety stop: no verified safe return route before night");
    }
    if (Date.now() - lastScan > 1200) {
      scan = await call("scan");
      lastScan = Date.now();
    }

    if (actor === "player") {
      if (obs.other && Date.now() - lastLook > 1200) {
        await call("look", obs.other);
        lastLook = Date.now();
      }
      if (!announced && scan.wood.length) {
        target = scan.wood[0];
        await announce("wood", { target });
        announced = true;
      } else if (!announced && Date.now() - lastRequest > 4000) {
        await announce("need-wood");
        lastRequest = Date.now();
      }
      if (!placed && count(obs, "planks") > 0) {
        const candidates = scan.ground.filter(
          (g) =>
            distance(obs.position, { x: g.x + 0.5, y: g.y + 1, z: g.z + 0.5 }) > 0.8 &&
            (!obs.other || distance(obs.other, { x: g.x + 0.5, y: g.y + 1, z: g.z + 0.5 }) > 1),
        );
        for (const ground of candidates) {
          if (await call("place", "planks", ground)) {
            placed = true;
            await announce("built", { position: { ...ground, y: ground.y + 1 } });
            break;
          }
        }
      }
    } else {
      const found = message(obs, "wood");
      if (!target && found?.target) {
        target = found.target;
        lastProgress = Date.now();
        await announce("accepted", { target });
      }
      if (
        !target &&
        scan.wood.length &&
        (message(obs, "need-wood") || Date.now() - started > 3000)
      ) {
        target = scan.wood[0];
        lastProgress = Date.now();
        await announce("wood", { target });
      }
      if (!placed && count(obs, "planks") > 0 && shared) {
        const slot = obs.inventory.findIndex((item, index) => index < 9 && item?.id === "planks");
        if (slot >= 0) {
          await call("select", slot);
          const candidates = scan.ground.filter(
            (g) =>
              distance(obs.position, { x: g.x + 0.5, y: g.y + 1, z: g.z + 0.5 }) > 0.8 &&
              (!obs.other || distance(obs.other, { x: g.x + 0.5, y: g.y + 1, z: g.z + 0.5 }) > 1),
          );
          for (const ground of candidates) {
            if (await call("place", "planks", ground)) {
              placed = true;
              await announce("built", { position: { ...ground, y: ground.y + 1 } });
              break;
            }
          }
        }
      }
      if (!shared && count(obs, "planks") >= 2) {
        const slot = obs.inventory.findIndex((item) => item?.id === "planks" && item.count >= 2);
        if (slot >= 0 && (await call("give", slot, 2))) {
          shared = true;
          await announce("shared", { item: "planks", count: 2 });
        } else if (obs.other && distance(obs.position, obs.other) > 2.3)
          await moveToward(obs.position, obs.other, 0.2);
      } else if (!shared && count(obs, "log") > 0) {
        if (await call("craft", "planks")) await announce("crafted", { item: "planks" });
      } else if (!shared && target) {
        const block = await call("block", target.x, target.y, target.z);
        const currentDistance = distance(obs.position, {
          x: target.x + 0.5,
          y: target.y,
          z: target.z + 0.5,
        });
        if (currentDistance < bestTargetDistance - 0.2) {
          bestTargetDistance = currentDistance;
          lastProgress = Date.now();
        }
        if (!mined && !minePending && (block === null || Date.now() - lastProgress > 6000)) {
          rejectedTargets.add(`${target.x},${target.y},${target.z}`);
          const alternative = scan.wood.find((p) => !rejectedTargets.has(`${p.x},${p.y},${p.z}`));
          if (!alternative || rejectedTargets.size >= 3) {
            await announce("safety-stop", { reason: "wood route blocked" });
            await call("stop");
            throw Error("safety stop: no progress on a safe route to a known tree");
          }
          target = alternative;
          blockedMoves = 0;
          bestTargetDistance = Infinity;
          lastProgress = Date.now();
          await announce("retarget", { target });
          await pause(350);
          continue;
        }
        if (block === 0) {
          mined = true;
          minePending = false;
        }
        if (mined) {
          const loot = obs.loot
            .filter((l) => l.stack.id === "log")
            .sort(
              (a, b) => distance(obs.position, a.position) - distance(obs.position, b.position),
            )[0];
          if (loot && distance(obs.position, loot.position) > 1.2) {
            if (await moveToward(obs.position, loot.position, 0.25)) blockedMoves = 0;
            else if (++blockedMoves >= 3) {
              await announce("safety-stop", { reason: "loot route blocked" });
              await call("stop");
              throw Error("safety stop: no safe route to collected wood");
            }
          }
        } else if (block === 6 && (!minePending || Date.now() - pendingAt > 10000)) {
          if (await call("mine", target)) {
            minePending = true;
            pendingAt = Date.now();
            await announce("mining", { target });
          } else {
            const moved = await moveToward(
              obs.position,
              { x: target.x + 0.5, y: target.y, z: target.z + 0.5 },
              0.2,
            );
            if (moved) blockedMoves = 0;
            else if (++blockedMoves >= 3) {
              rejectedTargets.add(`${target.x},${target.y},${target.z}`);
              const alternative = scan.wood.find(
                (p) => !rejectedTargets.has(`${p.x},${p.y},${p.z}`),
              );
              if (!alternative) {
                await announce("safety-stop", { reason: "wood route blocked" });
                await call("stop");
                throw Error("safety stop: no safe route to a known tree");
              }
              target = alternative;
              blockedMoves = 0;
              bestTargetDistance = Infinity;
              lastProgress = Date.now();
              await announce("retarget", { target });
            }
          }
        }
      }
    }
    if (placed && message(obs, "built")) {
      await announce("finished");
      parentPort.postMessage({ type: "complete", actor, elapsedMs: Date.now() - started });
      process.exit(0);
    }
    await pause(350);
  }
  throw Error("task timed out before both actors finished");
} catch (error) {
  parentPort.postMessage({ type: "failed", actor, error: String(error) });
  process.exitCode = 1;
}
