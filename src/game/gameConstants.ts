// Numeric combat tuning ported from Hohenberg's GameScene.ts (they lived as
// local consts there, not in constants.ts, so they're re-declared here rather
// than imported).
export const PLAYER_SPEED = 3.2; // units/sec, matches Hohenberg's tiles/sec
export const LIGHT_ATTACK = {
  damageMultiplier: 1,
  staminaCost: 12,
  cooldownMs: 400,
  range: 1.1,
};
export const ROLL_DISTANCE = 2.0;
export const ROLL_DURATION_MS = 400;
export const ROLL_STAMINA_COST = 28;
export const ENEMY_BASE_DAMAGE = 70;
