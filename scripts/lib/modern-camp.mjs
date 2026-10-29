/** Read-only terrain planning for a naturally accessible hunting area.
 * No movement, terrain edits, spawns, time or inventory setters. Lower scores
 * are better; callers must still use normal travel and their live guard. */
export async function chooseHuntingCamp(page, d, a, village, { radius = 40, spacing = 4 } = {}) {
  void d;
  void a;
  return page.evaluate(
    ({ village, radius, spacing }) => {
      const mc = window.__mc;
      const player = mc.position();
      const state = mc.adventure();
      if (state.dimension !== "overworld") return null;
      const passable = new Set([0, 5, 16, 22, 23, 25, 26, 31, 33, 40, 42, 43]);
      const standingAir = new Set([0, 16, 22, 23, 25]);
      const spawnGround = new Set([1, 2, 9]);
      const walkingGround = new Set([1, 2, 3, 4, 9, 11, 21, 44]);
      const columns = new Map();
      const key = (x, z) => `${x},${z}`;
      function column(x, z) {
        const k = key(x, z);
        if (columns.has(k)) return columns.get(k);
        let groundY = 94;
        while (groundY > 0 && passable.has(mc.blockAt(x, groundY, z))) groundY--;
        const ground = mc.blockAt(x, groundY, z);
        const feet = mc.blockAt(x, groundY + 1, z);
        const head = mc.blockAt(x, groundY + 2, z);
        const open = standingAir.has(feet) && standingAir.has(head);
        const result = {
          x,
          z,
          y: groundY + 1,
          ground,
          walkable: groundY > 0 && open && walkingGround.has(ground),
          spawnable: groundY > 0 && open && spawnGround.has(ground),
          water: feet === 5 || head === 5 || (ground === 4 && groundY < 32),
          tree: ground === 6 || ground === 7 || ground === 27,
        };
        columns.set(k, result);
        return result;
      }
      const middle = (values) => {
        const sorted = [...values].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)] ?? 0;
      };
      const danger = (x, y, z) =>
        state.creatures.filter(
          (m) =>
            (["zombie", "skeleton", "mossling", "spider", "ember"].includes(m.species) ||
              (m.species === "wanderer" && m.fuse === 2)) &&
            Math.hypot(m.position.x - x - 0.5, m.position.y - y, m.position.z - z - 0.5) <
              (m.species === "skeleton" ? 17 : 10),
        ).length;
      const candidates = [];
      const vx = Math.floor(village.x),
        vz = Math.floor(village.z);
      for (let dx = -radius; dx <= radius; dx += spacing)
        for (let dz = -radius; dz <= radius; dz += spacing) {
          const x = vx + dx,
            z = vz + dz;
          const villageDistance = Math.hypot(dx, dz);
          if (villageDistance > radius || villageDistance < 12) continue;
          const center = column(x, z);
          if (!center.spawnable) continue;
          const core = [];
          for (let ox = -4; ox <= 4; ox += 2)
            for (let oz = -4; oz <= 4; oz += 2)
              if (ox * ox + oz * oz <= 25) core.push(column(x + ox, z + oz));
          const safeCore = core.filter((c) => c.walkable && Math.abs(c.y - center.y) <= 1);
          const flatCoreFraction = safeCore.length / core.length;
          if (flatCoreFraction < 0.75) continue;
          const heights = core.filter((c) => c.walkable).map((c) => c.y);
          const coreRange = Math.max(...heights) - Math.min(...heights);
          const coreDeviation =
            heights.reduce((sum, y) => sum + Math.abs(y - center.y), 0) / heights.length;
          const enemies = danger(x, center.y, z);
          candidates.push({
            x,
            z,
            y: center.y,
            villageDistance,
            flatCoreFraction,
            coreRange,
            coreDeviation,
            enemies,
            preliminary:
              (1 - flatCoreFraction) * 24 +
              coreRange * 0.8 +
              coreDeviation * 2 +
              villageDistance * 0.035 +
              enemies * 12,
          });
        }
      candidates.sort((a, b) => a.preliminary - b.preliminary);
      const ringPlans = [];
      for (const candidate of candidates) {
        const ring = [];
        for (const distance of [10, 14, 18, 22, 24])
          for (let angle = 0; angle < 32; angle++) {
            const theta = (angle * Math.PI) / 16;
            ring.push(
              column(
                candidate.x + Math.round(Math.cos(theta) * distance),
                candidate.z + Math.round(Math.sin(theta) * distance),
              ),
            );
          }
        const spawnable = ring.filter((c) => c.spawnable);
        const spawnableFraction = spawnable.length / ring.length;
        const ringHeights = spawnable.map((c) => c.y);
        const medianHeight = middle(ringHeights);
        const ringDeviation = ringHeights.length
          ? ringHeights.reduce((sum, y) => sum + Math.abs(y - candidate.y), 0) / ringHeights.length
          : 32;
        const ringRange = ringHeights.length
          ? Math.max(...ringHeights) - Math.min(...ringHeights)
          : 96;
        const waterFraction = ring.filter((c) => c.water).length / ring.length;
        const treeFraction = ring.filter((c) => c.tree).length / ring.length;
        ringPlans.push({
          ...candidate,
          ring,
          spawnableFraction,
          ringDeviation,
          ringRange,
          medianHeight,
          waterFraction,
          treeFraction,
          ringScore:
            candidate.preliminary +
            (1 - spawnableFraction) * 22 +
            ringDeviation * 0.7 +
            waterFraction * 12 +
            treeFraction * 6,
        });
      }
      ringPlans.sort((a, b) => a.ringScore - b.ringScore);
      const final = [];
      for (const plan of ringPlans.slice(0, 8)) {
        // A flat spawn cell on the other side of a ravine cannot pursue safely.
        // Test actual one-block paths, never a direct line over a cliff or river.
        const reachable = new Set([key(plan.x, plan.z)]);
        const queue = [column(plan.x, plan.z)];
        for (const current of queue) {
          for (const [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const x = current.x + dx,
              z = current.z + dz,
              k = key(x, z);
            if (reachable.has(k) || Math.hypot(x - plan.x, z - plan.z) > 26) continue;
            const next = column(x, z);
            if (!next.walkable || Math.abs(next.y - current.y) > 1) continue;
            reachable.add(k);
            queue.push(next);
          }
        }
        const connectedSpawns = plan.ring.filter(
          (c) => c.spawnable && reachable.has(key(c.x, c.z)),
        ).length;
        const reachableSpawnFraction = connectedSpawns / plan.ring.length;
        const score = plan.ringScore + (1 - reachableSpawnFraction) * 35;
        const warnings = [];
        if (plan.flatCoreFraction < 0.9) warnings.push("中心の足場にも小さな段差が残ります");
        if (reachableSpawnFraction < 0.55)
          warnings.push("湧き範囲の一部は崖や水で分断されています");
        if (plan.ringRange > 5)
          warnings.push("湧き範囲の高低差が大きいため遠い敵を無理に追わないでください");
        if (plan.enemies) warnings.push("現在の敵が近いため移動中も戦闘監視が必要です");
        final.push({
          x: plan.x,
          z: plan.z,
          y: plan.y,
          score,
          position: { x: plan.x + 0.5, y: plan.y, z: plan.z + 0.5 },
          diagnostics: {
            flatCoreFraction: plan.flatCoreFraction,
            coreHeightRange: plan.coreRange,
            spawnableFraction: plan.spawnableFraction,
            reachableSpawnFraction,
            ringHeightRange: plan.ringRange,
            ringAverageHeightDifference: plan.ringDeviation,
            waterFraction: plan.waterFraction,
            treeFraction: plan.treeFraction,
            distanceFromVillage: plan.villageDistance,
            nearbyHostiles: plan.enemies,
            reachableWalkingCells: reachable.size,
            sampledColumns: columns.size,
          },
          warnings,
        });
      }
      final.sort((a, b) => a.score - b.score);
      if (!final.length) return null;
      return {
        ...final[0],
        alternatives: final.slice(1, 4),
        planningOrigin: player,
        evaluatedCandidates: candidates.length,
        scanRadius: radius,
      };
    },
    { village: { x: village.x, z: village.z }, radius, spacing },
  );
}
