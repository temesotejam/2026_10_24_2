/** Restock real arrows before the final pearl hunt, using the same native hunt. */
export async function run(ctx) {
  const { d, chapter } = ctx;
  if (!(await d.count("table"))) {
    await d.open();
    await d.make("table");
    await d.close();
  }
  const hunt = await import("./phase-4.mjs");
  await hunt.run(
    {
      ...ctx,
      chapter: async () =>
        chapter(`実際の羽根と火打ち石から矢${await d.count("arrow")}本を用意`, 4),
    },
    { enderPearl: await d.count("enderPearl"), string: 0, ammo: 24 },
  );
}
