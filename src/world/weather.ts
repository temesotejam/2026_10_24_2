import { deriveSeed } from "./rng";
import { skyStateAt, type SkyState } from "../render/sky";
import type { Dimension } from "./adventure-terrain";
export type Weather = "clear" | "rain" | "snow";
/** Weather is world-time based, so pause, sleep, save and reload all agree. */
export function weatherAt(
  seed: number,
  time: number,
  dimension: Dimension,
  snowy = false,
  desert = false,
): Weather {
  if (dimension !== "overworld" || desert) return "clear";
  const period = Math.floor(time / 180);
  if (period === 0 || (deriveSeed(seed, period) >>> 0) % 5 < 3) return "clear";
  return snowy ? "snow" : "rain";
}
export function adventureSky(time: number, dimension: Dimension, weather: Weather): SkyState {
  if (dimension === "end")
    return {
      skyColor: [0.065, 0.045, 0.09],
      sunIntensity: 0.1,
      ambientIntensity: 0.5,
      sunAngle: 0,
      moonAngle: -1,
      celestialVisible: false,
      minimumLight: 0.7,
    };
  if (dimension === "nether")
    return {
      skyColor: [0.19, 0.055, 0.035],
      sunIntensity: 0.1,
      ambientIntensity: 0.48,
      sunAngle: 0,
      moonAngle: -1,
      celestialVisible: false,
      minimumLight: 0.4,
    };
  const base = skyStateAt(time);
  if (weather === "clear") return base;
  return {
    ...base,
    skyColor: base.skyColor.map((v) => v * 0.6) as [number, number, number],
    sunIntensity: base.sunIntensity * 0.5,
    celestialVisible: false,
  };
}
