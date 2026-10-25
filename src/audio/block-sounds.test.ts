import { expect, it } from "vitest";
import { blockWave, BlockSounds, type SoundAction, type Surface } from "./block-sounds";
import { BlockId } from "../world/blocks";

it("synthesizes finite unclipped pulses with silent ends for every material/action", () => {
  for (const surface of ["soft", "stone", "wood"] as Surface[])
    for (const action of ["break", "place", "step"] as SoundAction[]) {
      const wave = blockWave(surface, action, 48000);
      expect(wave.length).toBeLessThanOrEqual(5280);
      expect(wave[0]).toBeCloseTo(0, 8);
      expect(wave.at(-1)).toBeCloseTo(0, 8);
      let peak = 0;
      for (const value of wave) {
        expect(Number.isFinite(value)).toBe(true);
        peak = Math.max(peak, Math.abs(value));
      }
      expect(peak).toBeGreaterThan(0.01);
      expect(peak).toBeLessThan(0.7);
    }
});

it("gives stone, wood and soil distinct independently generated waveforms", () => {
  const soft = blockWave("soft", "break", 8000);
  expect(soft).not.toEqual(blockWave("stone", "break", 8000));
  expect(soft).not.toEqual(blockWave("wood", "break", 8000));
});

it("spaces footsteps by travel and suppresses them when crouched, airborne or teleported", () => {
  class Recorder extends BlockSounds {
    events: SoundAction[] = [];
    override play(_block: BlockId, action: SoundAction): void {
      this.events.push(action);
    }
  }
  const sound = new Recorder();
  for (let i = 0; i <= 50; i++)
    sound.footsteps({ x: i * 0.1, y: 1, z: 0 }, true, true, false, BlockId.GRASS);
  expect(sound.events.length).toBe(3);
  const before = sound.events.length;
  sound.footsteps({ x: 100, y: 1, z: 0 }, true, true, false, BlockId.GRASS);
  sound.footsteps({ x: 101, y: 2, z: 0 }, false, true, false, BlockId.GRASS);
  sound.footsteps({ x: 102, y: 1, z: 0 }, true, true, true, BlockId.GRASS);
  sound.footsteps({ x: 103, y: 1, z: 0 }, true, false, false, BlockId.GRASS);
  expect(sound.events.length).toBe(before);
});
