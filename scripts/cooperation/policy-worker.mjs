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
    clearing: "邪魔な葉を少し取り除きます。",
    "scout-leaves": "もう一人も苗木を探します。",
    "claim-leaf": "こちらの葉を調べます。",
    "need-sapling": "植え直す苗木を探しています。",
    replanted: "手に入れた苗木を植えました。",
    "bed-plan": "夜に備え、２人分のベッドを確認しました。",
    "bed-ready": "自分のベッドに到着しました。",
    sleeping: "先にベッドへ入りました。",
    slept: "２人で眠り、朝になりました。",
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
  if (await call("navigate", target)) return true;
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
let clearing = null;
let clearedLeaves = 0;
let pendingAt = 0;
let placed = false;
let shared = false;
let replanted = false;
let nextPlantAttempt = 0;
let seedSearchStarted = 0;
let saplingRequested = false;
let lastAlert = 0;
let lastRequest = 0;
let lastScan = 0;
let lastLook = 0;
let blockedMoves = 0;
const rejectedTargets = new Set();
let bestTargetDistance = Infinity;
let lastProgress = Date.now();
let scan = { wood: [], leaves: [], ground: [], beds: [] };
const started = Date.now();
let timeoutMs = 90000;
let sleepPlan = null;
let sleepWaitStarted = 0;
let readyForBed = false;
let inBed = false;
let experiencedNight = false;
let bedtimeMovesFailed = 0;
let scoutLeaves = 0;

try {
  await announce("ready", { role: actor === "player" ? "探索・建築" : "採取・加工" });
  while (Date.now() - started < timeoutMs) {
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
      const cycle = Math.floor(obs.time / 1200);
      if (!sleepPlan) {
        if (actor === "player") {
          const available = (await call("scan")).beds;
          const beds = available.slice().sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y);
          if (beds.length < 2) {
            await announce("safety-stop", { reason: "bedtime approaching" });
            await call("stop");
            throw Error("safety stop: fewer than two observed beds before night");
          }
          sleepPlan = { player: beds[0], companion: beds[1], cycle };
          await announce("bed-plan", sleepPlan);
        } else {
          const plan = message(obs, "bed-plan");
          if (!plan?.player || !plan?.companion || plan.cycle !== cycle) {
            if (!sleepWaitStarted) sleepWaitStarted = Date.now();
            if (Date.now() - sleepWaitStarted > 5000) {
              await call("stop");
              throw Error("safety stop: no shared bed plan before night");
            }
            await pause(100);
            continue;
          }
          sleepPlan = { player: plan.player, companion: plan.companion, cycle };
        }
        timeoutMs = Math.max(timeoutMs, Date.now() - started + 240000);
      }
      const bed = sleepPlan[actor];
      if ((await call("block", bed.x, bed.y, bed.z)) !== 15) {
        await call("stop");
        throw Error("safety stop: assigned bed is not currently observable");
      }
      if (distance(obs.position, { x: bed.x + 0.5, y: bed.y, z: bed.z + 0.5 }) > 2.4) {
        if (await moveToward(obs.position, { x: bed.x + 0.5, y: bed.y, z: bed.z + 0.5 }, 0.2))
          bedtimeMovesFailed = 0;
        else if (++bedtimeMovesFailed >= 3) {
          await call("stop");
          throw Error("safety stop: no safe route to the assigned bed");
        }
        await pause(100);
        continue;
      }
      if (!readyForBed) {
        await call("stop");
        await announce("bed-ready", { bed });
        readyForBed = true;
      }
      if (obs.night) {
        experiencedNight = true;
        if (actor === "companion" && !inBed && (await call("sleep", bed))) {
          inBed = true;
          await announce("sleeping", { bed, cycle });
        }
        if (
          actor === "player" &&
          message(obs, "sleeping")?.cycle === cycle &&
          (await call("sleep", bed))
        )
          await announce("slept", { bed, cycle });
      }
      await pause(800);
      continue;
    }
    if (sleepPlan && experiencedNight && !obs.night) {
      sleepPlan = null;
      readyForBed = false;
      inBed = false;
      experiencedNight = false;
      await announce("slept", { result: "morning observed" });
    }
    if (Date.now() - lastScan > 1200) {
      scan = await call("scan");
      lastScan = Date.now();
    }

    if (actor === "companion" && clearing) {
      const leaf = await call("block", clearing.x, clearing.y, clearing.z);
      if (leaf === 0) {
        clearing = null;
        lastProgress = Date.now();
      } else if (Date.now() - pendingAt > 6000) {
        await announce("safety-stop", { reason: "leaf clearing blocked" });
        await call("stop");
        throw Error("safety stop: could not clear the observed obstruction");
      }
      await pause(100);
      continue;
    }
    const plantedByPeer = message(obs, "replanted");
    if (
      !replanted &&
      plantedByPeer?.position &&
      (await call(
        "block",
        plantedByPeer.position.x,
        plantedByPeer.position.y,
        plantedByPeer.position.z,
      )) === 25
    )
      replanted = true;

    if (
      !replanted &&
      !minePending &&
      !clearing &&
      count(obs, "sapling") > 0 &&
      Date.now() >= nextPlantAttempt
    ) {
      nextPlantAttempt = Date.now() + 200;
      const slot = obs.inventory.findIndex((item, index) => index < 9 && item?.id === "sapling");
      const peerBusy = actor === "companion" && (await call("peerBusy"));
      if (!peerBusy && (actor === "player" || (slot >= 0 && (await call("select", slot))))) {
        const candidates = scan.ground
          .filter(
            (g) =>
              [1, 2].includes(g.support) &&
              distance(obs.position, { x: g.x + 0.5, y: g.y + 1, z: g.z + 0.5 }) > 0.8 &&
              distance(obs.position, { x: g.x + 0.5, y: g.y + 1, z: g.z + 0.5 }) < 3.7 &&
              (!obs.other || distance(obs.other, { x: g.x + 0.5, y: g.y + 1, z: g.z + 0.5 }) > 1),
          )
          .slice(0, 12);
        for (const ground of candidates) {
          if (await call("place", "sapling", ground)) {
            replanted = true;
            await announce("replanted", {
              position: { x: ground.x, y: ground.y + 1, z: ground.z },
            });
            break;
          }
        }
      }
    }

    if (actor === "player") {
      if (message(obs, "need-sapling") && count(obs, "sapling") > 0 && !replanted) {
        const slot = obs.inventory.findIndex((item) => item?.id === "sapling");
        if (slot >= 0) await call("give", slot, 1);
      }
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
      if (
        announced &&
        target &&
        !replanted &&
        count(obs, "sapling") === 0 &&
        message(obs, "need-sapling") &&
        scoutLeaves < 4
      ) {
        const leaves = (scan.leaves ?? []).filter((leaf) => {
          const claimed = message(obs, "clearing")?.target;
          return (
            Math.hypot(leaf.x - target.x, leaf.y - target.y, leaf.z - target.z) <= 4.5 &&
            (!claimed || claimed.x !== leaf.x || claimed.y !== leaf.y || claimed.z !== leaf.z)
          );
        });
        let worked = false;
        for (const leaf of leaves.slice(0, 8)) {
          if ((await call("block", leaf.x, leaf.y, leaf.z)) !== 7) continue;
          await announce("claim-leaf", { target: leaf });
          if (await call("mine", leaf)) {
            scoutLeaves++;
            await announce("scout-leaves", { target: leaf });
            worked = true;
            break;
          }
        }
        if (!worked && leaves.length && distance(obs.position, leaves[0]) > 2.5)
          await call("navigate", { x: leaves[0].x + 0.5, y: obs.position.y, z: leaves[0].z + 0.5 });
      }
      if (!placed && count(obs, "planks") > 0) {
        const candidates = scan.ground
          .filter(
            (g) =>
              distance(obs.position, { x: g.x + 0.5, y: g.y + 1, z: g.z + 0.5 }) > 0.8 &&
              distance(obs.position, { x: g.x + 0.5, y: g.y + 1, z: g.z + 0.5 }) < 3.7 &&
              (!obs.other || distance(obs.other, { x: g.x + 0.5, y: g.y + 1, z: g.z + 0.5 }) > 1),
          )
          .slice(0, 12);
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
      if (target && !replanted && !shared) {
        if (!seedSearchStarted) seedSearchStarted = Date.now();
        if (!saplingRequested) {
          await announce("need-sapling");
          saplingRequested = true;
        }
        if (Date.now() - seedSearchStarted > 30000) {
          await announce("safety-stop", { reason: "no replacement sapling" });
          await call("stop");
          throw Error("safety stop: replacement sapling could not be planted");
        }
        if (count(obs, "sapling") > 0) {
          await pause(100);
          continue;
        }
        const dropped = obs.loot.find((item) => item.stack.id === "sapling");
        if (dropped) {
          if (distance(obs.position, dropped.position) > 1.2)
            await moveToward(obs.position, dropped.position, 0.2);
          await pause(100);
          continue;
        }
        if (clearedLeaves >= 8) {
          await announce("safety-stop", { reason: "no replacement sapling" });
          await call("stop");
          throw Error("safety stop: no replacement sapling after eight leaves");
        }
        const candidates = (scan.leaves ?? []).filter((leaf) => {
          const claimed = message(obs, "claim-leaf")?.target;
          return (
            Math.hypot(leaf.x - target.x, leaf.y - target.y, leaf.z - target.z) <= 4.5 &&
            (!claimed || claimed.x !== leaf.x || claimed.y !== leaf.y || claimed.z !== leaf.z)
          );
        });
        let leafStarted = false;
        for (const leaf of candidates) {
          if (await call("mine", leaf)) {
            clearing = leaf;
            clearedLeaves++;
            pendingAt = Date.now();
            await announce("clearing", { target: leaf });
            leafStarted = true;
            break;
          }
        }
        if (!leafStarted)
          await moveToward(
            obs.position,
            { x: target.x + 0.5, y: target.y, z: target.z + 0.5 },
            0.2,
          );
        await pause(100);
        continue;
      }
      if (!placed && count(obs, "planks") > 0 && shared) {
        const slot = obs.inventory.findIndex((item, index) => index < 9 && item?.id === "planks");
        if (slot >= 0) {
          await call("select", slot);
          const candidates = scan.ground
            .filter(
              (g) =>
                distance(obs.position, { x: g.x + 0.5, y: g.y + 1, z: g.z + 0.5 }) > 0.8 &&
                distance(obs.position, { x: g.x + 0.5, y: g.y + 1, z: g.z + 0.5 }) < 3.7 &&
                (!obs.other || distance(obs.other, { x: g.x + 0.5, y: g.y + 1, z: g.z + 0.5 }) > 1),
            )
            .slice(0, 12);
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
          await pause(100);
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
            const leaf = clearedLeaves < 8 ? await call("blockingLeaf", target) : null;
            if (leaf && (await call("mine", leaf))) {
              clearing = leaf;
              clearedLeaves++;
              pendingAt = Date.now();
              await announce("clearing", { target: leaf });
              await pause(100);
              continue;
            }
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
    await pause(100);
  }
  throw Error("task timed out before both actors finished");
} catch (error) {
  parentPort.postMessage({ type: "failed", actor, error: String(error) });
  process.exitCode = 1;
}
