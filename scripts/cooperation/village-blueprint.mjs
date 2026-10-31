/** Four by three shelter: bed, standing space, open doorway and a full roof. */
export function shelterPlan(center) {
  const { x, y, z } = center;
  const wall = [];
  for (let dy = 0; dy < 2; dy++)
    for (let dx = -1; dx <= 2; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        if ((dx === 0 || dx === 1) && dz === 0) continue;
        if (dx === 0 && dz === -1) continue;
        wall.push({ x: x + dx, y: y + dy, z: z + dz });
      }
  const roof = [];
  // Build the supported perimeter first, followed by the interior and doorway.
  for (let dx = -1; dx <= 2; dx++)
    for (let dz = -1; dz <= 1; dz++)
      if (!((dx === 0 || dx === 1) && dz === 0) && !(dx === 0 && dz === -1))
        roof.push({ x: x + dx, y: y + 2, z: z + dz });
  roof.push({ x: x + 1, y: y + 2, z }, { x, y: y + 2, z }, { x, y: y + 2, z: z - 1 });
  return {
    bed: { x: x + 1, y, z },
    wall,
    roof,
    entrance: { x, y, z: z - 1 },
    standing: { x, y, z },
  };
}
