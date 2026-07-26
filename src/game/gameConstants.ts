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

export const LIGHT_ATTACK: MeleeAction = { damageMultiplier: 1, staminaCost: 12, cooldownMs: 400, range: 1.4 };
export const HEAVY_ATTACK: MeleeAction = { damageMultiplier: 1.8, staminaCost: 26, cooldownMs: 900, range: 1.5 };
export const SHIELD_BASH: MeleeAction = { damageMultiplier: 0.3, staminaCost: 20, cooldownMs: 650, range: 1.6, knockback: 2.5, stunMs: 1200 };

// The swing's hit check used to resolve instantly on the same frame the
// attack button was pressed — a pure hit-scan with zero travel time, which
// combined with facing being decoupled from camera aim (see Player.tsx's
// facing fix) made melee feel like swinging at nothing even when it visually
// should've connected. ATTACK_HIT_DELAY_MS defers the check partway through
// the swing instead, and MELEE_LUNGE_DISTANCE nudges the player a step
// toward their facing at swing-start so borderline range no longer whiffs.
export const ATTACK_ACTIVE_MS = 150;
export const ATTACK_HIT_DELAY_MS = 70;
export const MELEE_LUNGE_DISTANCE = 0.4;

export const ROLL_DISTANCE = 2.0;
export const ROLL_DURATION_MS = 400;
export const ROLL_STAMINA_COST = 28;
export const ENEMY_BASE_DAMAGE = 70;

// Flask charges (design doc Step 4) — simplified for this slice: fixed
// starting charges, no refill mechanic yet (no rest points/area-clears here).
export const FLASK_START_CHARGES = 3;
export const FLASK_HEAL_FRACTION = 0.4;

// Matches Hohenberg's PROJECTILE_POOL_SIZE — archer/toad shots today,
// spell projectiles will share this same pool once phase 8 lands. Spawning
// past this cap silently drops the shot (same precedent as the source).
export const PROJECTILE_POOL_SIZE = 24;

// Souls economy (design doc Step 6 / Hohenberg's GameScene.ts) — exact same
// per-kill/per-boss values as the 2D source. Never awarded anywhere until
// this pass: PlayerStats.souls existed since phase 1 but nothing incremented
// it, so Martyna's leveling/Varn's shop had no currency to spend.
export const SOULS_PER_KILL = 12;
export const SOULS_PER_BOSS = 150;

// FP (mana) regen — no Hohenberg-source precedent for an exact number
// (its GameScene.ts never actually ticked FP outside combat), matched to
// stamina's own regen feel instead. Design doc section 4: casting slows
// movement to 40%, cancels are only refunded in the cast's first 40%.
export const FP_REGEN_PER_SEC = 4;
export const CAST_MOVE_SPEED_MULT = 0.4;
export const CAST_REFUND_WINDOW_PCT = 0.4;

// Right-click block (requires p.equipped.shield) — reduces incoming melee/
// projectile/boss damage (never applied to a move flagged `unblockable`,
// same gate the roll i-frame check already used) and slows movement while held.
export const BLOCK_DAMAGE_REDUCTION = 0.75;
export const BLOCK_MOVE_SPEED_MULT = 0.5;

// How long the "YOU DIED" screen holds before auto-respawning at the
// floor's checkpoint (see GameState.respawnAtCheckpoint) — no button, no
// manual refresh, matching every Souls game's own death loop.
export const RESPAWN_DELAY_MS = 2600;

// Every wall check in this game (player/enemy/boss resolveCollision, the
// enemy/boss lunge point-checks, the projectile isWallTile check) is a
// discrete end-of-step test against wherever an entity/projectile lands
// that frame — none of them sweep the path travelled during the frame. That's
// fine at a steady 60fps (nothing moves more than a fraction of a tile per
// frame) but a single hitch (GC pause, floor-load rebuild, tab switch) hands
// every useFrame callback one huge raw dt for that frame, and a fast mover
// can land clean on the far side of a 1-unit wall without ever landing a
// sample point inside it. Capping dt bounds every frame's travel distance
// regardless of how long the frame actually took — worst case, the fastest
// player spell (13u/s) travels 13 * MAX_DT ≈ 0.43 units, safely under one
// wall's thickness. A hitch now reads as brief slow motion instead of
// tunneling.
export const MAX_DT = 1 / 30;
export function clampDt(dt: number): number {
  return Math.min(dt, MAX_DT);
}
