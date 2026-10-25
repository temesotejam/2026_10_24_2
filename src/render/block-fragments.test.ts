import { expect, it } from "vitest";
import { FragmentPool, MAX_FRAGMENTS } from "./block-fragments";

it("keeps particle count bounded during a large burst of mining", () => {
  const pool = new FragmentPool();
  for (let i = 0; i < 1000; i++) pool.burst(i, 1, 0, "#887766");
  expect(pool.particles).toHaveLength(MAX_FRAGMENTS);
  pool.step(1, () => false);
  expect(pool.particles).toHaveLength(0);
});

it("bounces cosmetic fragments on terrain without going through the floor", () => {
  const pool = new FragmentPool();
  pool.burst(0, 0, 0, "#887766");
  for (let i = 0; i < 12; i++) pool.step(0.05, (_x, y) => y < 0);
  expect(pool.particles.length).toBeGreaterThan(0);
  for (const p of pool.particles) {
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
  }
});
