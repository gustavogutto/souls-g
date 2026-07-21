// Numeric combat tuning ported from Hohenberg's GameScene.ts (they lived as
// local consts there, not in constants.ts, so they're re-declared here rather
// than imported).
export const PLAYER_SPEED = 3.2; // units/sec, matches Hohenberg's tiles/sec

export interface MeleeAction {
  damageMultiplier: number;
  staminaCost: number;
  cooldownMs: number;
  range: number;
  knockback?: number; // units, pushes the enemy away from the player
  stunMs?: number; // forces the enemy into a vulnerable, non-acting state
}

export const LIGHT_ATTACK: MeleeAction = { damageMultiplier: 1, staminaCost: 12, cooldownMs: 400, range: 1.1 };
export const HEAVY_ATTACK: MeleeAction = { damageMultiplier: 1.8, staminaCost: 26, cooldownMs: 900, range: 1.2 };
export const SHIELD_BASH: MeleeAction = { damageMultiplier: 0.3, staminaCost: 20, cooldownMs: 650, range: 1.3, knockback: 2.5, stunMs: 1200 };

export const ROLL_DISTANCE = 2.0;
export const ROLL_DURATION_MS = 400;
export const ROLL_STAMINA_COST = 28;
export const ENEMY_BASE_DAMAGE = 70;

// Hohenberg's ATK touch button: tap-vs-hold, heavy fires the instant the
// hold threshold is reached (not on release).
export const ATK_HEAVY_HOLD_MS = 200;

// Flask charges (design doc Step 4) — simplified for this slice: fixed
// starting charges, no refill mechanic yet (no rest points/area-clears here).
export const FLASK_START_CHARGES = 3;
export const FLASK_HEAL_FRACTION = 0.4;
