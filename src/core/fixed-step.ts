/** 120 Hz keeps even terminal falls shorter than one block per physics step. */
export const PHYSICS_STEP_SECONDS = 1 / 120;
const MAX_CATCHUP_SECONDS = 0.25;

/** Bound catch-up after a suspended tab; never feed a large dt to collision math. */
export class FixedStepClock {
  private accumulated = 0;

  advance(elapsed: number, step: (dt: number) => void): void {
    if (!Number.isFinite(elapsed) || elapsed <= 0) return;
    this.accumulated += Math.min(elapsed, MAX_CATCHUP_SECONDS);
    while (this.accumulated + 1e-10 >= PHYSICS_STEP_SECONDS) {
      step(PHYSICS_STEP_SECONDS);
      this.accumulated = Math.max(0, this.accumulated - PHYSICS_STEP_SECONDS);
    }
  }

  reset(): void {
    this.accumulated = 0;
  }
}
