import { describe, expect, it } from "vitest";
import { FixedStepClock, PHYSICS_STEP_SECONDS } from "./fixed-step";
import {
  type PlayerPhysicsState,
  stepPhysics,
  TERMINAL_VELOCITY,
  MOVE_SPEED,
} from "../player/physics";

function simulate(fps: number) {
  const clock = new FixedStepClock();
  let state: PlayerPhysicsState = {
    position: { x: 0.5, y: 1, z: 0.5 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
  };
  let steps = 0;
  let apex = 1;
  let landedAt = 0;
  for (let frame = 0; frame < fps * 2; frame++) {
    clock.advance(1 / fps, (dt) => {
      state = stepPhysics(
        state,
        { forward: 1, right: 0, jump: steps === 0, yaw: 0 },
        dt,
        (_x, y) => y === 0,
      );
      steps++;
      apex = Math.max(apex, state.position.y);
      if (state.onGround && landedAt === 0) landedAt = steps * dt;
    });
  }
  return { state, steps, apex, landedAt };
}

describe("fixed physics clock", () => {
  it("preserves movement distance, jump apex and landing time at 30, 60 and 144 FPS", () => {
    const baseline = simulate(60);
    expect(baseline.steps).toBe(240);
    expect(baseline.state.position.z).toBeCloseTo(0.5 - MOVE_SPEED * 2, 6);
    expect(baseline.apex).toBeGreaterThan(2.2);
    expect(baseline.apex).toBeLessThan(2.3);
    expect(baseline.landedAt).toBeGreaterThan(0.5);
    expect(baseline.landedAt).toBeLessThan(0.6);
    expect(simulate(30)).toEqual(baseline);
    expect(simulate(144)).toEqual(baseline);
  });

  it("keeps fractional time across jittery render frames", () => {
    const clock = new FixedStepClock();
    const steps: number[] = [];
    for (const elapsed of [0.001, 0.004, 0.02, 0.075]) {
      clock.advance(elapsed, (dt) => steps.push(dt));
    }
    expect(steps).toHaveLength(12);
    expect(steps.every((dt) => dt === PHYSICS_STEP_SECONDS)).toBe(true);
  });

  it("bounds catch-up after a suspended tab and rejects invalid deltas", () => {
    const clock = new FixedStepClock();
    let count = 0;
    const step = () => count++;
    for (const dt of [NaN, Infinity, -1, 0]) clock.advance(dt, step);
    expect(count).toBe(0);
    clock.advance(60, step);
    expect(count).toBe(30);
  });

  it("drops fractional time when paused", () => {
    const clock = new FixedStepClock();
    let count = 0;
    clock.advance(0.004, () => count++);
    clock.reset();
    clock.advance(0.005, () => count++);
    expect(count).toBe(0);
  });

  it("cannot tunnel through a one-block floor at terminal velocity after a long frame", () => {
    const clock = new FixedStepClock();
    let state: PlayerPhysicsState = {
      position: { x: 0.5, y: 3, z: 0.5 },
      velocity: { x: 0, y: TERMINAL_VELOCITY, z: 0 },
      onGround: false,
    };
    clock.advance(1, (dt) => {
      state = stepPhysics(
        state,
        { forward: 0, right: 0, jump: false, yaw: 0 },
        dt,
        (_x, y) => y === 0,
      );
    });
    expect(state.onGround).toBe(true);
    expect(state.position.y).toBeCloseTo(1, 4);
  });
});
