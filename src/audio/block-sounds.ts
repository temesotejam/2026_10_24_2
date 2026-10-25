import { BlockId } from "../world/blocks";
import type { Vec3 } from "../player/physics";
import { mulberry32 } from "../world/rng";

export type SoundAction = "break" | "place" | "step";
export type Surface = "soft" | "stone" | "wood";
const WOOD_BLOCKS = new Set<BlockId>([
  BlockId.WOOD,
  BlockId.BIRCH,
  BlockId.PLANKS,
  BlockId.TABLE,
  BlockId.CHEST,
  BlockId.BED,
  BlockId.TORCH,
]);
const SOFT_BLOCKS = new Set<BlockId>([
  BlockId.GRASS,
  BlockId.DIRT,
  BlockId.SAND,
  BlockId.SNOW,
  BlockId.LEAVES,
  BlockId.FARMLAND,
  BlockId.WOOL,
  BlockId.CROP,
  BlockId.RIPE_CROP,
  BlockId.SAPLING,
]);

function surfaceFor(block: BlockId): Surface {
  if (WOOD_BLOCKS.has(block)) return "wood";
  if (SOFT_BLOCKS.has(block)) return "soft";
  return "stone";
}

/** Original short noise/percussion, never sampled from Minecraft assets. */
export function blockWave(surface: Surface, action: SoundAction, sampleRate: number): Float32Array {
  const duration = action === "break" ? 0.11 : action === "place" ? 0.075 : 0.06;
  const wave = new Float32Array(Math.ceil(duration * sampleRate));
  const random = mulberry32(surface === "stone" ? 81 : surface === "wood" ? 125 : 370);
  const cutoff = surface === "wood" ? 0.12 : surface === "soft" ? 0.28 : 0.7;
  const frequency = surface === "wood" ? 180 : surface === "stone" ? 95 : 65;
  const volume = action === "step" ? 0.35 : action === "place" ? 0.5 : 0.65;
  let filtered = 0;
  for (let i = 0; i < wave.length; i++) {
    const t = i / sampleRate;
    const phase = i / (wave.length - 1);
    filtered += (random() * 2 - 1 - filtered) * cutoff;
    const envelope = Math.min(1, t / 0.002) * (1 - phase) ** 2;
    const tone = Math.sin(2 * Math.PI * frequency * t) * (1 - phase);
    wave[i] = (filtered * 0.8 + tone * 0.2) * envelope * volume;
  }
  return wave;
}

/** Gesture-unlocked, bounded Web Audio voices. Sound failure never blocks play. */
export class BlockSounds {
  enabled = true;
  played = 0;
  peak = 0;
  readonly counts = { break: 0, place: 0, step: 0 };
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private samples = new Float32Array(256);
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Set<AudioBufferSourceNode>();
  private previous: Vec3 | null = null;
  private distance = 0;

  get ready(): boolean {
    return this.context?.state === "running";
  }

  unlock(): void {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        this.context = new window.AudioContext();
        this.gain = this.context.createGain();
        this.gain.gain.value = 0.18;
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = this.samples.length;
        this.gain.connect(this.analyser);
        this.analyser.connect(this.context.destination);
      }
      if (this.context.state === "suspended") void this.context.resume().catch(() => undefined);
    } catch {
      /* Optional audio may be unavailable in a browser. */
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.gain) this.gain.gain.value = enabled ? 0.18 : 0;
    if (enabled) this.unlock();
    else {
      for (const voice of this.voices) voice.stop();
      this.voices.clear();
    }
  }

  play(block: BlockId, action: SoundAction): void {
    const context = this.context,
      gain = this.gain;
    if (!this.enabled || !context || !gain) return;
    const surface = surfaceFor(block),
      key = `${surface}:${action}`;
    let buffer = this.buffers.get(key);
    if (!buffer) {
      const wave = blockWave(surface, action, context.sampleRate);
      buffer = context.createBuffer(1, wave.length, context.sampleRate);
      buffer.getChannelData(0).set(wave);
      this.buffers.set(key, buffer);
    }
    if (this.voices.size >= 8) {
      const oldest = this.voices.values().next().value;
      oldest?.stop();
      if (oldest) this.voices.delete(oldest);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 0.94 + (this.played % 5) * 0.03;
    source.connect(gain);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
    };
    this.voices.add(source);
    source.start();
    this.played++;
    this.counts[action]++;
  }

  footsteps(
    position: Vec3,
    grounded: boolean,
    active: boolean,
    crouched: boolean,
    block: BlockId,
  ): void {
    if (this.analyser && this.ready) {
      this.analyser.getFloatTimeDomainData(this.samples);
      for (const sample of this.samples) this.peak = Math.max(this.peak, Math.abs(sample));
    }
    const moved = this.previous
      ? Math.hypot(position.x - this.previous.x, position.z - this.previous.z)
      : 0;
    this.previous = { ...position };
    if (!active || !grounded || crouched || moved > 2) {
      this.distance = 0;
      return;
    }
    this.distance += moved;
    if (this.distance >= 1.6) {
      this.play(block, "step");
      this.distance %= 1.6;
    }
  }
}
