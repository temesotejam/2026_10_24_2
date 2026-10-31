/** Escape the narrow pit with real jump-placed blocks after an autosave failure. */
export async function run({ page, d, a, meta, flush, chapter }) {
  a.setGuard(async () => false);
  d.setThreatHandler(null);
  const before = await d.info();
  meta.autosaveRecoveries ??= [];
  meta.autosaveRecoveries.push({
    failedPart: "part-27.mp4",
    failedTime: 5791.69166662446,
    loadedTime: await page.evaluate(() => window.__mc.time()),
    loadedHealth: before.health,
    method: "ordinary-profile-load-after-failed-death-save",
  });
  flush();
  d.setGoal("保存失敗のため、直近の正常な自動保存から再開。足元にブロックを置いて地上へ出ます。");
  await a.pillarTo(meta.village.y + 1);
  await a.eat();
  await chapter("通常の自動保存から再開し、手持ちのブロックで狭い地下から脱出", 4);
}
