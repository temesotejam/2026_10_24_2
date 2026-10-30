export async function run({ page, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  const observed = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = window.indexedDB.open("classic-voxel-survival", 1);
        req.onerror = () => reject(String(req.error));
        req.onsuccess = () => {
          const db = req.result,
            q = db.transaction("worlds", "readonly").objectStore("worlds").get("2026:survival");
          q.onsuccess = () => {
            resolve({
              time: q.result.time,
              loot: q.result.loot.filter((l) => ["enderPearl", "arrow"].includes(l.stack.id)),
            });
            db.close();
          };
        };
      }),
  );
  console.log("READONLY ACTUAL LOOT", JSON.stringify(observed));
  meta.observedRemainingLoot = observed;
  flush();
  await chapter("実際に落ちている素材を確認し、回収場所を調べます", 4);
}
