import { parentPort, workerData } from "node:worker_threads";
import { shelterPlan } from "./village-blueprint.mjs";
import { safetyStop } from "./safety.mjs";

const { actor, center } = workerData;
let next = 0;
const pending = new Map();
parentPort.on("message", (message) => {
  const p = pending.get(message.id);
  if (!p) return;
  pending.delete(message.id);
  if (message.error) p.reject(new Error(message.error));
  else p.resolve(message.result);
});
const call = (method, ...args) =>
  new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    parentPort.postMessage({ id, method, args });
  });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function check() {
  const status = safetyStop(await call("observe"));
  if (status) throw Error(`safety stop: ${status.type}`);
}
async function travel(target, radius = 2.6) {
  let failures = 0;
  let lastPosition = null;
  for (let n = 0; n < 180; n++) {
    await check();
    const obs = await call("observe");
    if (
      lastPosition &&
      Math.hypot(
        obs.position.x - lastPosition.x,
        obs.position.y - lastPosition.y,
        obs.position.z - lastPosition.z,
      ) < 0.02
    )
      failures++;
    else failures = 0;
    lastPosition = obs.position;
    if (failures > 8) throw Error(`movement blocked on route to ${JSON.stringify(target)}`);
    if (
      Math.hypot(
        obs.position.x - target.x - 0.5,
        obs.position.y - target.y,
        obs.position.z - target.z - 0.5,
      ) < radius
    )
      return;
    if (!(await call("navigate", { ...target, radius: Math.min(1, radius * 0.7) })))
      if (++failures > 8) throw Error(`no safe route to ${JSON.stringify(target)}`);
    await wait(50);
  }
  throw Error("navigation timed out");
}
try {
  const plan = shelterPlan(center);
  await call(
    "say",
    `${actor === "player" ? "プレイヤー" : "パートナー"}：担当の住まいへ向かいます。`,
  );
  await travel(center, 3.3);
  await check();
  if ((await call("block", plan.bed)) !== 15 && !(await call("place", "bed", plan.bed)))
    throw Error("could not place the bed on the chosen site");
  await call("say", "寝床を設置しました。周囲に壁を作ります。");
  let outstanding = [...plan.wall, ...plan.roof];
  const vantage = [
    { x: center.x, y: center.y, z: center.z - 3 },
    { x: center.x + 4, y: center.y, z: center.z },
    { x: center.x, y: center.y, z: center.z + 3 },
    { x: center.x - 3, y: center.y, z: center.z },
  ];
  for (let pass = 0; pass < 12 && outstanding.length; pass++) {
    let progress = 0;
    for (const cell of [...outstanding]) {
      await check();
      if ((await call("block", cell)) === 11 || (await call("place", "cobble", cell))) {
        outstanding = outstanding.filter((other) => other !== cell);
        progress++;
      }
    }
    if (!outstanding.length) break;
    if (!progress) {
      try {
        await travel(vantage[pass % vantage.length], 1.5);
      } catch {
        /* Try a different side of the building on the next pass. */
      }
    }
  }
  if (outstanding.length) throw Error(`unfinished cells: ${JSON.stringify(outstanding)}`);
  await call("say", "寝床の周囲に壁を作りました。");
  parentPort.postMessage({ type: "complete", actor, plan });
} catch (error) {
  parentPort.postMessage({ type: "failed", actor, error: String(error) });
}
