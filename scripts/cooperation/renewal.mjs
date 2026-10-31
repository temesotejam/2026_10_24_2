/** A sapling needs soil, an empty planting cell and four clear growth cells. */
export function canPlantSapling(cells) {
  return (
    Array.isArray(cells) &&
    cells.length === 6 &&
    [1, 2].includes(cells[0]) &&
    cells.slice(1).every((block) => block === 0)
  );
}
