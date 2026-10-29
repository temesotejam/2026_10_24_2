import { stack } from "./catalog";

/** The current villages have food merchants. Progression items require the
 * corresponding exploration/combat; they are not sold by every farmer. */
export const FOOD_TRADES = [
  {
    id: "sell-wheat",
    label: "小麦20 → エメラルド1",
    costs: { wheat: 20 },
    output: stack("emerald"),
  },
  { id: "sell-fish", label: "生魚6 → エメラルド1", costs: { fish: 6 }, output: stack("emerald") },
  {
    id: "buy-bread",
    label: "エメラルド1 → パン6",
    costs: { emerald: 1 },
    output: stack("bread", 6),
  },
] as const;
