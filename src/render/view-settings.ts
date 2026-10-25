/** Measured in the official browser Classic: vertical field of view is 70°. */
export const DEFAULT_FOV = 70;

/** Integer HUD magnification keeps our original 16px icons crisp. */
export function guiScale(width: number, height: number): number {
  return Math.max(1, Math.min(3, Math.floor(width / 200), Math.floor(height / 200)));
}
