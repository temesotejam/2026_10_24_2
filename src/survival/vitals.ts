export interface Vitals {
  health: number;
  hunger: number;
  air: number;
  exhaustion: number;
  damageCooldown: number;
  regen: number;
  hazard: number;
}
export function newVitals(): Vitals {
  return { health: 20, hunger: 20, air: 10, exhaustion: 0, damageCooldown: 0, regen: 0, hazard: 0 };
}
export function damage(v: Vitals, amount: number): boolean {
  if (v.damageCooldown > 0 || v.health <= 0 || amount <= 0) return false;
  v.health = Math.max(0, v.health - amount);
  v.damageCooldown = 0.65;
  return true;
}
export function tickVitals(
  v: Vitals,
  dt: number,
  distance: number,
  underwater: boolean,
  hot: boolean,
  suffocating: boolean,
): void {
  v.damageCooldown = Math.max(0, v.damageCooldown - dt);
  v.exhaustion += dt * 0.015 + distance * 0.06;
  while (v.exhaustion >= 4) {
    v.hunger = Math.max(0, v.hunger - 1);
    v.exhaustion -= 4;
  }
  v.air = underwater ? Math.max(0, v.air - dt) : Math.min(10, v.air + dt * 4);
  if ((underwater && v.air <= 0) || hot || suffocating || v.hunger === 0) {
    v.hazard += dt;
    if (v.hazard >= 1) {
      damage(v, hot ? 4 : 1);
      v.hazard = 0;
    }
  } else v.hazard = 0;
  if (v.hunger >= 18 && v.health < 20 && v.health > 0) {
    v.regen += dt;
    if (v.regen >= 4) {
      v.health = Math.min(20, v.health + 1);
      v.exhaustion += 3;
      v.regen = 0;
    }
  } else v.regen = 0;
}
