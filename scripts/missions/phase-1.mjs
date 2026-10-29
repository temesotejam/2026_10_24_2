import { prepareUnderground } from "../lib/modern-resources.mjs";
export async function run({ page, d, a, chapter }) {
  await prepareUnderground(d, page, a, { diamondTarget: 3, ironTarget: 9, coalTarget: 3 });
  await chapter("追加の鉱石を採掘し、ダイヤのツルハシ・鉄の剣・バケツを製作", 2);
}
