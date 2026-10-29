export async function run({ page, a }) {
  a.setGuard(async () => false);
  console.log(
    "TERRAIN",
    JSON.stringify(
      await page.evaluate(() => {
        const p = window.__mc.position(),
          layers = [];
        for (let y = 32; y < 42; y++) {
          const rows = [];
          for (let z = -65; z <= -57; z++) {
            let row = "";
            for (let x = 269; x <= 277; x++)
              row += window.__mc.blockAt(x, y, z).toString(36).padStart(2, " ");
            rows.push(row);
          }
          layers.push({ y, rows });
        }
        return {
          p,
          layers,
          m: window.__mc
            .adventure()
            .creatures.map((m) => ({ s: m.species, hp: m.hp, p: m.position })),
        };
      }),
    ),
  );
  await a.save();
}
