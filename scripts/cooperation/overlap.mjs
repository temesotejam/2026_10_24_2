/** Count parallel work only when both actors are mining different blocks. */
export function hasParallelMining(events) {
  const distinct = (a, b) =>
    a &&
    b &&
    ["x", "y", "z"].every((k) => Number.isInteger(a[k]) && Number.isInteger(b[k])) &&
    (a.x !== b.x || a.y !== b.y || a.z !== b.z);
  return events.some(
    (event) =>
      (event.actor === "player" &&
        event.method === "mining-start" &&
        distinct(event.target, event.peerActivity?.mining)) ||
      (event.actor === "companion" &&
        event.method === "mine" &&
        event.result === true &&
        distinct(event.args?.[0], event.peerMining)),
  );
}
