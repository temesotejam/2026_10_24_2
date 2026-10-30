import { restInVillage } from "../lib/village-rest.mjs";

export async function run({ page, d, a, meta, flush, chapter }) {
  await restInVillage(page, d, a, meta.village, meta, flush);
  await chapter("村のベッドを使い、遠征前の拠点を確保", 4);
}
