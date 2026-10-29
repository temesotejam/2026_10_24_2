/** Normal-input mob hunting for the generation-3 survival recording.
 * Observations are read-only. No imports, spawns, teleport, time or item setters.
 * Desired quantities are total inventory counts, not an assumed number of kills. */
import assert from "node:assert/strict";
import { wait } from "./survival-driver.mjs";
import { canMelee, clearSight, hostile, safeRetreat, solid } from "./combat-policy.mjs";

const DROPS = {
  enderPearl: ["wanderer"],
  string: ["spider"],
  feather: ["chicken"],
  arrow: ["skeleton"],
  blazeRod: ["ember"],
  ammo: ["chicken", "skeleton"],
};
const LABELS = {
  enderPearl: "エンダーパール",
  string: "糸",
  feather: "羽根",
  arrow: "矢",
  blazeRod: "ブレイズロッド",
  ammo: "矢と矢の材料",
};
const FRIENDLY = ["pig", "cow", "sheep", "chicken"];
const SWORDS = [
  "enchanted_diamond_sword",
  "diamond_sword",
  "enchanted_iron_sword",
  "iron_sword",
  "stone_sword",
  "wood_sword",
  "iron_axe",
  "stone_axe",
  "iron_pick",
  "stone_pick",
];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const nightAt = (time) => ((time % 1200) + 1200) % 1200 >= 720;

export function createModernHunting(page, d, a, options = {}) {
  const stats = {
    kills: {},
    meleeSwings: 0,
    arrowsSpent: 0,
    patrols: 0,
    waits: 0,
    blockedTargets: 0,
  };
  const ignored = new Map();
  const corpses = [];
  let focus = null,
    fighting = false,
    active = false;
  let guarding = false;
  let currentConfig = {};
  let permanentGuard = false;
  const countResource = async (id) =>
    id === "ammo" ? (await d.count("arrow")) + 4 * (await d.count("feather")) : d.count(id);
  const record = async (name, detail = {}) => {
    if (options.onEvent) await options.onEvent({ name, ...detail, at: new Date().toISOString() });
  };
  const release = async () => {
    await d.releaseAttack();
    for (const key of ["KeyW", "KeyS", "KeyA", "KeyD", "Space", "ControlLeft"])
      await page.keyboard.up(key);
  };
  // Limit the local terrain copy to the player's immediate walking/retreat area.
  const observe = () =>
    page.evaluate(() => {
      const p = window.__mc.position(),
        state = window.__mc.adventure(),
        cells = [];
      for (let x = Math.floor(p.x) - 3; x <= Math.floor(p.x) + 3; x++)
        for (let z = Math.floor(p.z) - 3; z <= Math.floor(p.z) + 3; z++)
          for (let y = Math.floor(p.y) - 3; y <= Math.floor(p.y) + 3; y++)
            cells.push([`${x},${y},${z}`, window.__mc.blockAt(x, y, z)]);
      return {
        position: p,
        eye: window.__mc.eyeHeight(),
        health: window.__mc.health(),
        time: window.__mc.time(),
        dimension: state.dimension,
        creatures: state.creatures,
        inventory: window.__mc.inventory(),
        cells,
      };
    });
  const blockQuery = (state) => {
    const cells = new Map(state.cells);
    return (x, y, z) => cells.get(`${x},${y},${z}`) ?? 0;
  };
  const alive = (state) => state.creatures.filter((m) => m.hp > 0);
  const nearestDanger = (state) =>
    alive(state)
      .filter(
        (m) =>
          hostile(m) &&
          ((ignored.get(m.id) ?? 0) < Date.now() ||
            canMelee(state.position, state.eye, m.position)) &&
          distance(m.position, state.position) < (m.species === "skeleton" ? 14 : 5.5),
      )
      .sort(
        (x, y) => distance(x.position, state.position) - distance(y.position, state.position),
      )[0];
  const rangedVisible = (state, mob) =>
    page.evaluate(
      ({ from, to }) => {
        const dx = to.x - from.x,
          dy = to.y - from.y,
          dz = to.z - from.z,
          length = Math.hypot(dx, dy, dz);
        for (let t = 0.2; t < length - 0.4; t += 0.2) {
          const id = window.__mc.blockAt(
            Math.floor(from.x + (dx * t) / length),
            Math.floor(from.y + (dy * t) / length),
            Math.floor(from.z + (dz * t) / length),
          );
          if (![0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43].includes(id)) return false;
        }
        return true;
      },
      {
        from: { ...state.position, y: state.position.y + state.eye },
        to: { ...mob.position, y: mob.position.y + 1 },
      },
    );
  const chooseWeapon = async (state) => {
    const usableSword = (state) =>
      SWORDS.find(
        (id) =>
          id.endsWith("_sword") &&
          state.inventory.some((stack) => stack?.id === id && (stack.durability ?? 1) >= 4),
      );
    let id = usableSword(state);
    if (!id && options.ensureWeapon && (!fighting || !nearestDanger(state))) {
      await release();
      await options.ensureWeapon(state);
      state = await observe();
      id = usableSword(state);
    }
    id ??= SWORDS.find((id) => state.inventory.some((stack) => stack?.id === id));
    if (id) await d.equip(id);
    else {
      const empty = state.inventory.slice(0, 9).findIndex((stack) => stack === null);
      await page.keyboard.press(`Digit${Math.max(0, empty) + 1}`);
    }
  };
  const enqueueKill = async (mob, state) => {
    if (alive(state).some((m) => m.id === mob.id)) return false;
    if (corpses.some((p) => p.id === mob.id)) return true;
    corpses.push({ id: mob.id, species: mob.species, position: { ...mob.position } });
    stats.kills[mob.species] = (stats.kills[mob.species] ?? 0) + 1;
    await record("mob-defeated", { id: mob.id, species: mob.species, position: mob.position });
    return true;
  };
  async function stepToward(state, target, away = false) {
    const at = state.position,
      blockAt = blockQuery(state),
      y = Math.round(at.y);
    if (away) {
      const retreat = safeRetreat(at, target.position, blockAt);
      if (!retreat) return false;
      await d.aim({ x: retreat.x, y: at.y + state.eye, z: retreat.z }, 0);
      await page.keyboard.down("ControlLeft");
      await page.keyboard.down("KeyW");
      if (retreat.jump) await page.keyboard.down("Space");
      await wait(280);
      await release();
      return true;
    }
    const choices = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4,
        dx = Math.cos(angle),
        dz = Math.sin(angle);
      const x = Math.floor(at.x + dx * 0.85),
        z = Math.floor(at.z + dz * 0.85);
      const height = [y, y + 1, y - 1].find(
        (h) =>
          solid(blockAt(x, h - 1, z)) &&
          !solid(blockAt(x, h, z)) &&
          !solid(blockAt(x, h + 1, z)) &&
          ![5, 26, 43].includes(blockAt(x, h, z)) &&
          ![5, 26, 43].includes(blockAt(x, h - 1, z)),
      );
      if (height === undefined) continue;
      choices.push({
        x: at.x + dx * 1.3,
        z: at.z + dz * 1.3,
        jump: height > y,
        score:
          Math.hypot(at.x + dx - target.position.x, at.z + dz - target.position.z) +
          Math.abs(height - target.position.y) * 0.3,
      });
    }
    choices.sort((x, y) => x.score - y.score);
    if (!choices.length) return false;
    const next = choices[0];
    await d.aim({ x: next.x, y: at.y + state.eye, z: next.z }, 0);
    await page.keyboard.down("ControlLeft");
    await page.keyboard.down("KeyW");
    if (next.jump) await page.keyboard.down("Space");
    await wait(140);
    await release();
    return true;
  }
  async function fight(id) {
    if (fighting) return false;
    fighting = true;
    const until = Date.now() + (currentConfig.fightTimeoutMs ?? 15000);
    let bestRange = Infinity,
      lastProgress = Date.now();
    try {
      await release();
      while (Date.now() < until) {
        const state = await observe();
        assert.ok(state.health > 0, "survive ordinary-input hunting combat");
        const primary = alive(state).find((m) => m.id === id);
        if (!primary) return true;
        const danger = nearestDanger(state);
        const mob =
          danger &&
          distance(danger.position, state.position) < 2.5 &&
          distance(primary.position, state.position) > 2.8
            ? danger
            : primary;
        const range = distance(mob.position, state.position);
        if (range < bestRange - 0.15) {
          bestRange = range;
          lastProgress = Date.now();
        }
        const surrounded =
          alive(state).filter(
            (other) => hostile(other) && distance(other.position, state.position) < 4.5,
          ).length >= 2;
        if (state.health <= 8 && surrounded) {
          await stepToward(state, mob, true);
          await a.eat();
        }
        await chooseWeapon(state);
        if (
          canMelee(state.position, state.eye, mob.position) &&
          clearSight(
            { ...state.position, y: state.position.y + state.eye },
            { ...mob.position, y: mob.position.y + 1 },
            blockQuery(state),
          )
        ) {
          await d.aim({ ...mob.position, y: mob.position.y + 1 }, 0);
          await page.mouse.down();
          await wait(450);
          await d.releaseAttack();
          stats.meleeSwings++;
          const after = await observe();
          await enqueueKill(mob, after);
          lastProgress = Date.now();
          if (!alive(after).some((m) => m.id === id)) return true;
        } else {
          const reserve = currentConfig.arrowReserve ?? options.arrowReserve ?? 32;
          const arrows = state.inventory
            .filter((s) => s?.id === "arrow")
            .reduce((n, s) => n + s.count, 0);
          if (
            Date.now() - lastProgress > 2200 &&
            range < 16 &&
            arrows > reserve &&
            state.inventory.some((s) => s?.id === "bow") &&
            (await rangedVisible(state, mob))
          ) {
            await d.equip("bow");
            const t = range / 22;
            await d.aim(
              {
                x: mob.position.x + mob.velocity.x * t,
                y: mob.position.y + 1 + 1.2 * t * t,
                z: mob.position.z + mob.velocity.z * t,
              },
              0,
            );
            await a.right();
            await wait(450);
            stats.arrowsSpent++;
            await enqueueKill(mob, await observe());
            lastProgress = Date.now();
          } else if (!(await stepToward(state, mob)) || Date.now() - lastProgress > 4500) {
            ignored.set(id, Date.now() + 20000);
            stats.blockedTargets++;
            return false;
          }
        }
      }
      ignored.set(id, Date.now() + 30000);
      stats.blockedTargets++;
      return false;
    } finally {
      await release();
      fighting = false;
    }
  }
  async function huntingGuard() {
    if (fighting || guarding) return false;
    const pickTarget = (state) => {
      const danger = nearestDanger(state);
      const selected =
        focus &&
        alive(state).find(
          (m) =>
            m.id === focus.id &&
            distance(m.position, state.position) < 4.5 &&
            ((ignored.get(m.id) ?? 0) < Date.now() ||
              canMelee(state.position, state.eye, m.position)),
        );
      return danger ?? selected;
    };
    const saved = await observe();
    let target = pickTarget(saved);
    if (!target) {
      const idle = await page.evaluate(() => ({
        open: !document.querySelector("#inventory-panel").hidden,
        mode: window.__mc.mode(),
        hunger: Number(document.querySelector("#hunger").textContent.match(/食料 (\d+)/)?.[1]),
        selected: Number(document.querySelector("#hotbar .selected .hotbar-key")?.textContent) - 1,
      }));
      // Leave crafting grids alone. The runner restores food before starting a job.
      if (idle.open || idle.mode !== "pointer") return false;
      if (idle.hunger < 18 && saved.inventory.some((stack) => stack?.id === "bread")) {
        guarding = true;
        const held = saved.inventory[idle.selected]?.id;
        try {
          await release();
          await a.eat();
          if (held && (await d.count(held))) await d.equip(held);
          else {
            const now = await d.info();
            const empty = now.inventory.slice(0, 9).findIndex((stack) => stack === null);
            if (empty >= 0) await page.keyboard.press(`Digit${empty + 1}`);
          }
          return true;
        } finally {
          await release();
          guarding = false;
        }
      }
      if (saved.dimension !== "end" && saved.health < 16 && idle.hunger >= 18) {
        await release();
        await wait(1000);
        return true;
      }
      return false;
    }
    guarding = true;
    const ui = await page.evaluate(() => ({
      open: !document.querySelector("#inventory-panel").hidden,
      title: document.querySelector("#inventory-panel h2")?.textContent,
      station: window.__mc.target(),
      selected: Number(document.querySelector("#hotbar .selected .hotbar-key")?.textContent) - 1,
    }));
    const held = saved.inventory[ui.selected]?.id;
    try {
      await release();
      if (ui.open) await d.close();
      await fight(target.id);
      // Normal work must resume at its original mining/crafting position.
      // During the hunt itself, staying by the defeated target helps collect loot.
      if (!active || ui.open) {
        let returned = false;
        const until = Date.now() + 90000;
        while (!returned && Date.now() < until) {
          target = pickTarget(await observe());
          if (target) await fight(target.id);
          returned = await d.walk(saved.position.x, saved.position.z, false, 0.35, 80, async () =>
            Boolean(pickTarget(await observe())),
          );
        }
        assert.ok(returned, "return safely to interrupted work after hunting guard combat");
      }
      if (ui.open) {
        if (ui.title !== "所持品" && ui.station) {
          const now = await observe();
          const tool = SWORDS.find((id) => now.inventory.some((stack) => stack?.id === id));
          if (tool) await d.equip(tool);
          else {
            const empty = now.inventory.slice(0, 9).findIndex((stack) => stack === null);
            await page.keyboard.press(`Digit${Math.max(0, empty) + 1}`);
          }
          await a.useAt(ui.station);
          await page.waitForSelector("#inventory-panel:not([hidden])", { timeout: 5000 });
        } else await d.open();
      } else if (held && (await d.count(held))) await d.equip(held);
      return true;
    } finally {
      await release();
      guarding = false;
    }
  }
  async function collectDrops() {
    for (let i = 0; i < 8 && corpses.length; i++) {
      const drop = corpses.shift();
      const here = (await d.info()).position;
      if (Math.hypot(drop.position.x - here.x, drop.position.z - here.z) > 32) continue;
      await a.surfaceTo({ x: Math.floor(drop.position.x), z: Math.floor(drop.position.z) });
      await wait(300);
      await record("visited-drop-position", { species: drop.species, position: drop.position });
    }
  }
  async function patrol(home, index) {
    const state = await observe();
    const angle = (index * Math.PI) / 4;
    const wanted = {
      x: Math.floor(home.x + Math.cos(angle) * 12),
      z: Math.floor(home.z + Math.sin(angle) * 12),
    };
    await a.surfaceTo(wanted);
    stats.patrols++;
    await wait(500);
    assert.ok((await d.info()).health > 0, "survive hunting patrol");
    return state;
  }
  async function gather(targets, config = {}) {
    assert.ok(!active, "do not run two hunts on the same browser concurrently");
    for (const [item, count] of Object.entries(targets)) {
      assert.ok(DROPS[item], `unsupported hunting resource ${item}`);
      assert.ok(Number.isInteger(count) && count >= 0, `valid desired total for ${item}`);
    }
    active = true;
    currentConfig = config;
    const start = await observe(),
      home = config.home ?? { ...start.position };
    const expectedDimension =
      config.dimension ??
      (Object.keys(targets).every((k) => k === "blazeRod") ? "nether" : "overworld");
    const until = Date.now() + (config.timeoutMs ?? options.timeoutMs ?? 1800000);
    let idle = 0,
      patrolIndex = 0;
    d.setThreatHandler(huntingGuard);
    try {
      await release();
      while (true) {
        let state = await observe();
        assert.equal(state.dimension, expectedDimension, "hunt in the expected realm");
        assert.ok(state.health > 0, "survive hunting expedition");
        const missing = [];
        for (const [item, total] of Object.entries(targets))
          if ((await countResource(item)) < total) missing.push(item);
        if (!missing.length)
          return {
            counts: Object.fromEntries(
              await Promise.all(
                Object.keys(targets).map(async (id) => [id, await countResource(id)]),
              ),
            ),
            stats,
          };
        assert.ok(Date.now() < until, `natural-spawn hunting timed out: ${missing.join(", ")}`);
        if (options.maintain && !nearestDanger(state)) {
          await options.maintain(state);
          state = await observe();
          assert.equal(
            state.dimension,
            expectedDimension,
            "maintenance stays in the hunting realm",
          );
          assert.ok(state.health > 0, "survive normal-input hunting maintenance");
        }
        if (
          options.ensureWeapon &&
          !nearestDanger(state) &&
          !state.inventory.some(
            (stack) => stack?.id.endsWith("_sword") && (stack.durability ?? 1) >= 4,
          )
        )
          await chooseWeapon(state);
        if (state.health < 13 && !nearestDanger(state)) {
          await collectDrops();
          if (options.recover) await options.recover(18);
          else {
            await a.eat();
            await a.recover(18);
          }
          continue;
        }
        await huntingGuard();
        await collectDrops();
        const latest = await observe();
        const candidates = alive(latest)
          .filter((m) => missing.some((item) => DROPS[item].includes(m.species)))
          .filter(
            (m) =>
              (ignored.get(m.id) ?? 0) < Date.now() || distance(m.position, latest.position) < 3,
          )
          .sort(
            (x, y) => distance(x.position, latest.position) - distance(y.position, latest.position),
          );
        focus = candidates[0] ?? null;
        if (!focus && config.cullForSpawns !== false) {
          const population = alive(latest);
          const night = expectedDimension === "nether" || nightAt(latest.time);
          const crowded =
            population.filter((m) =>
              night
                ? !FRIENDLY.includes(m.species) && m.species !== "villager"
                : FRIENDLY.includes(m.species),
            ).length >= (night ? 10 : 10);
          if (crowded)
            focus =
              population
                .filter(
                  (m) =>
                    m.species !== "villager" &&
                    (night ? !FRIENDLY.includes(m.species) : FRIENDLY.includes(m.species)),
                )
                .sort(
                  (x, y) =>
                    distance(x.position, latest.position) - distance(y.position, latest.position),
                )[0] ?? null;
        }
        if (focus) {
          idle = 0;
          const desired = missing.find((item) => DROPS[item].includes(focus.species));
          if (desired) d.narrate(`${LABELS[desired]}を集めるため、見つけた生物に近づきます。`, 1);
          await a.surfaceTo({ x: Math.floor(focus.position.x), z: Math.floor(focus.position.z) });
          await huntingGuard();
          await collectDrops();
        } else {
          idle++;
          stats.waits++;
          if (idle % 6 === 0) await patrol(home, patrolIndex++);
          else {
            await a.eat();
            await wait(1000);
          }
        }
      }
    } finally {
      focus = null;
      active = false;
      await release();
      d.setThreatHandler(permanentGuard ? huntingGuard : (options.restoreGuard ?? a.guard));
    }
  }
  const one = (item, count, config) => gather({ [item]: count }, config);
  return {
    guard: huntingGuard,
    gather,
    activate: () => {
      permanentGuard = true;
      if (a.setGuard) a.setGuard(huntingGuard);
      else d.setThreatHandler(huntingGuard);
    },
    deactivate: () => {
      permanentGuard = false;
      if (a.setGuard) a.setGuard(null);
      else d.setThreatHandler(options.restoreGuard ?? a.guard);
    },
    stats,
    collectDrops,
    collectPearls: (count = 13, config = {}) => one("enderPearl", count, config),
    collectString: (count = 3, config = {}) => one("string", count, config),
    collectFeathers: (count = 8, config = {}) => one("feather", count, config),
    collectArrows: (count = 32, config = {}) =>
      one("arrow", count, { arrowReserve: Infinity, ...config }),
    collectAmmo: (count = 32, config = {}) =>
      one("ammo", count, { arrowReserve: Infinity, ...config }),
    collectRods: (count = 7, config = {}) =>
      one("blazeRod", count, { dimension: "nether", ...config }),
  };
}
