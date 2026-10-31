import assert from "node:assert/strict";
import { wait } from "../lib/survival-driver.mjs";
import { carriedFoodUnits } from "../lib/modern-resources.mjs";

function framePositions(center) {
  const frames = [];
  for (const axis of ["x", "z"])
    for (const side of [-2, 2])
      for (let along = -1; along <= 1; along++) {
        const frame = { ...center };
        frame[axis] += side;
        frame[axis === "x" ? "z" : "x"] += along;
        frames.push(frame);
      }
  return frames;
}
function outsideFrame(frame, center) {
  if (frame.z === center.z + 2) return { x: frame.x + 0.5, z: center.z + 3.5 };
  if (frame.z === center.z - 2) return { x: frame.x + 0.5, z: center.z - 2.5 };
  return { x: center.x + (frame.x > center.x ? 3.5 : -2.5), z: frame.z + 0.5 };
}
async function resumeControls(page, a) {
  await a.boot();
  await page.select("#render-scale", process.env.RECORDING_RENDER_SCALE ?? "0.5");
  if ((await page.evaluate(() => window.__mc.mode())) !== "pointer") {
    await page.locator("#play-button").click();
    await page.waitForFunction(() => window.__mc.mode() === "pointer");
  }
}
async function enterByContact(page, d, a, destination, target, jump = false) {
  await d.aim(target);
  await page.keyboard.down("KeyW");
  if (jump) await page.keyboard.down("Space");
  try {
    // Transfer persists the destination then reloads. Leave time for generation
    // on the recording machine, rather than timing out at ten wall-clock seconds.
    await page.waitForFunction(
      (destination) => window.__mc?.adventure().dimension === destination,
      { timeout: 120000 },
      destination,
    );
  } finally {
    await page.keyboard.up("KeyW");
    await page.keyboard.up("Space");
  }
  await resumeControls(page, a);
}

export async function run({ page, d, a, meta, flush = () => undefined, chapter, out }) {
  const mission = (meta.endMission ??= {});
  // A new run can spend an earned eye on the native direction throw.
  // Older recordings retain their disclosed known-entrance route.
  mission.useKnownEntrance = !meta.directionalNavigation;
  mission.requiredEyes = mission.useKnownEntrance || mission.directionChecked ? 11 : 12;
  let state = await a.adventure();
  assert.ok(state.generator >= 3, "complete the new survival progression");
  // A resumed ordinary save remembers real eye throws even if the previous
  // recording ended before writing its mission progress metadata.
  if ((state.eyeThrows ?? 0) > 0) {
    mission.directionChecked = true;
    mission.requiredEyes = 11;
  }
  if (state.dimension === "overworld" && !state.dragon.defeated) {
    const bestSword = () =>
      d
        .info()
        .then(
          (s) =>
            s.inventory
              .filter((slot) => slot?.id === "iron_sword")
              .sort((a, b) => (b.durability ?? 0) - (a.durability ?? 0))[0],
        );
    if (((await bestSword())?.durability ?? 0) < 100 && (await d.count("iron")) >= 2) {
      d.setGoal("戦闘で消耗した剣を、手持ちの鉄から作り直します。");
      const table = await d.station("table");
      if (!(await d.count("stick"))) await d.make("sticks");
      await d.make("iron_sword");
      await d.close();
      await d.mine(table);
      await wait(500);
      await d.collect("table", 1);
    }
    const inventory = (await d.info()).inventory;
    const sword = await bestSword();
    const bow = inventory.find((slot) => slot?.id === "bow");
    const arrows = await d.count("arrow"),
      bread = await d.count("bread"),
      foodUnits = await carriedFoodUnits(d);
    mission.endSupplies = {
      arrows,
      bread,
      foodUnits,
      swordDurability: sword?.durability ?? 0,
      bowDurability: bow?.durability ?? 0,
    };
    flush();
    // Once the player enters the End there is no ordinary supply trip back.
    // Check reserves before consuming eyes or walking into the activated gate.
    assert.ok(
      sword && (sword.durability ?? 0) >= 40,
      "carry an iron sword with enough durability for the full 200HP battle",
    );
    assert.ok(
      bow && (bow.durability ?? 0) >= 24,
      "carry a bow with enough durability for crystal-shot retries",
    );
    assert.ok(arrows >= 12, "carry twelve real arrows for six crystals with retry reserves");
    assert.ok(foodUnits >= 40, "carry food for withdrawal and ordinary health regeneration");
    d.setGoal("素材がそろいました。エンダーアイを作り、地下遺跡へ向かいます。");
    await d.open();
    // Use the already observed entrance and reserve real eyes for actual frames.
    while (
      (await d.count("blazePowder")) + (await d.count("enderEye")) < mission.requiredEyes &&
      (await d.count("blazeRod"))
    )
      await d.make("blazePowder");
    while ((await d.count("enderPearl")) && (await d.count("blazePowder")))
      await d.make("enderEye");
    await d.close();
    if (!mission.directionChecked && !mission.useKnownEntrance) {
      assert.ok(
        (await d.count("enderEye")) >= 12,
        "carry eyes for eleven empty frames plus the breakable directional throw",
      );
      await d.equip("enderEye");
      const p = (await d.info()).position;
      const entrance = (await a.adventure()).entrance;
      await d.aim({ x: entrance.x + 0.5, y: p.y + 3, z: entrance.z + 0.5 });
      await a.right();
      mission.directionChecked = true;
      mission.eyesAfterDirection = await d.count("enderEye");
      flush();
      d.narrate("エンダーアイで遺跡の方向を確認し、地上を進みます。", 2);
      await wait(1500);
    }
    if (mission.useKnownEntrance) {
      mission.navigation = {
        method: "previously-observed-readonly-map",
        directionThrowSkipped: true,
        entrance: { ...(await a.adventure()).entrance },
      };
      d.narrate(
        "既に観測した地図の入口座標を利用。方向投げは省略して、実際に集めた11個のアイを枠へ入れます。",
        2,
      );
      flush();
    }
    if (!mission.useKnownEntrance) {
      mission.navigation = {
        method: "native-eye-confirmation-with-readonly-map-route",
        directionThrowSkipped: false,
      };
      d.narrate("投げたアイで方向を確認。観測用の地図で道を選び、遺跡へ向かいます。", 2);
      flush();
    }
    const c = (await a.adventure()).stronghold;
    // Stop outside first: an already activated gate must not interrupt recovery
    // or the remaining preparation after an ordinary-save resume.
    await a.enterStronghold({ stopOutside: true });
    await d.light();
    const frames = framePositions(c),
      empty = [];
    for (const frame of frames) if ((await d.block(frame)) === 38) empty.push(frame);
    assert.ok(
      (await d.count("enderEye")) >= empty.length,
      "own a genuinely crafted eye for every actual empty frame",
    );
    if (empty.length) {
      const last =
        empty.find((frame) => frame.z === c.z + 2 && frame.x === c.x) ??
        empty.find((frame) => frame.z === c.z + 2) ??
        empty[empty.length - 1];
      assert.ok(last);
      await a.move(c.x + 0.5, c.z + 0.5, true);
      await d.equip("enderEye");
      for (const frame of empty.filter((frame) => frame !== last)) {
        await a.useAt(frame);
        assert.equal(await d.block(frame), 39, "place each genuinely crafted eye");
      }
      const outside = outsideFrame(last, c);
      await a.move(outside.x, outside.z, true, 0.15);
      await a.eat();
      await a.recover(20);
      await d.equip("enderEye");
      await a.useAt(last);
      assert.equal(await d.block(last), 39, "place the last eye from outside the portal");
      mission.framesFilled = empty.length;
    } else {
      await a.eat();
      await a.recover(20);
    }
    assert.equal(await d.block(c), 40, "activate the actual End gateway");
    assert.equal(
      (await a.adventure()).dimension,
      "overworld",
      "last-eye placement remains outside the newly activated portal",
    );
    mission.portalActivated = true;
    flush();
    await d.equip("iron_sword");
    await enterByContact(page, d, a, "end", { x: c.x + 0.5, y: c.y + 1.4, z: c.z + 0.5 }, true);
    await chapter("全ての空枠にエンダーアイを入れ、エンドへ進入", 8);
    state = await a.adventure();
  }
  if (state.dimension === "end") {
    if (!state.dragon.defeated) {
      assert.ok(
        (await d.count("iron_sword")) && (await d.count("bow")),
        "carry the hunted-and-crafted battle equipment",
      );
      let remainingCrystals = 0;
      for (let index = 0; index < 6; index++) {
        const angle = (index * Math.PI) / 3;
        if (
          (await d.block({
            x: Math.round(Math.cos(angle) * 16),
            y: 39 + (index % 3) * 2,
            z: Math.round(Math.sin(angle) * 16),
          })) === 42
        )
          remainingCrystals++;
      }
      assert.ok(
        (await d.count("arrow")) >= remainingCrystals,
        "one real arrow for each remaining crystal",
      );
      d.setGoal("クリスタルを壊してから、ドラゴンを討伐します。");
      // The recording allows ten minutes for the 200HP fight, including
      // ordinary food recovery, other enemies and 24-second flight/perch cycles.
      await a.defeatDragon({ timeoutMs: 600000 });
    }
    assert.ok((await d.info()).health > 0, "survive the dragon battle");
    assert.equal(await d.count("dragonEgg"), 1, "own the actual victory egg");
    await page.screenshot({ path: `${out}/victory.png` });
    d.narrate("エンダードラゴンを討伐。卵を持って通常世界へ帰ります。", 2);
    await wait(3000);
    // A normal-save resume can start touching the victory gate. Leave it
    // through ordinary movement before entering again.
    await a.move(0.5, 4, false, 0.15);
    await enterByContact(page, d, a, "overworld", { x: 0.5, y: 35.4, z: 0.5 });
  }
  if ((await d.count("dragonEgg")) === 1) {
    d.narrate("通常世界へ生還。持ち帰ったドラゴンの卵を確認します。", 2);
    const eggSlot = (await d.info()).inventory.findIndex((slot) => slot?.id === "dragonEgg");
    await d.open();
    await page.hover(`[data-area="inventory"][data-slot="${eggSlot}"]`);
    await wait(3500);
    await page.screenshot({ path: `${out}/completion-inventory.png` });
    await d.close();
  }
  const final = await a.adventure();
  assert.equal(final.dimension, "overworld", "return by physical contact with the victory gate");
  assert.ok(final.dragon.defeated);
  assert.equal(await d.count("dragonEgg"), 1);
  assert.ok((await d.info()).health > 0, "return alive with the reward");
  meta.combat = a.combatStats;
  meta.final = {
    health: (await d.info()).health,
    dragon: final.dragon,
    eggCount: await d.count("dragonEgg"),
    dimension: final.dimension,
  };
  await chapter("ドラゴン討伐・卵入手・通常世界へ帰還", 9);
  meta.completed = true;
  delete meta.error;
  flush();
}
