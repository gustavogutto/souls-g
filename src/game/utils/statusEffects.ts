// Status effects — poison (Sunken Courtyard's Toad) and burn (Molten
// Sanctum's Ember Archer/Molten Archon, Area 5's Wyrmling). Ported from the
// 2D source's client/src/game/utils/statusEffects.ts — same dps/duration/
// tick numbers, same "no stacking, refresh just extends duration" rule.
// This port uses countdown-style remainingMs (decremented by dt each frame)
// rather than the 2D game's absolute expiresAt/performance.now() timestamps,
// matching every other timer in this codebase (GroundHazard.remainingMs,
// EnemyState.stunnedMs, etc.) rather than mixing timing conventions.
export type StatusEffectType = "poison" | "burn";

export interface StatusEffectConfig {
  dps: number;
  durationMs: number;
  tickIntervalMs: number;
  color: string; // floating-text color for each tick
}

export const STATUS_EFFECT_CONFIG: Record<StatusEffectType, StatusEffectConfig> = {
  poison: { dps: 6, durationMs: 6000, tickIntervalMs: 1000, color: "#7fdb5a" },
  burn: { dps: 10, durationMs: 3000, tickIntervalMs: 500, color: "#ff8c3a" },
};

// Which enemy/boss type ids apply which effect on a projectile hit — only
// ever applied to the player (2D source precedent: no enemy-on-enemy status
// effects exist). Chill isn't a StatusEffectType (no damage tick, see the
// chill constants below) so this union is wider than STATUS_EFFECT_CONFIG's
// keys.
export type ProjectileEffectType = StatusEffectType | "chill";

export const PROJECTILE_EFFECT_BY_TYPE: Partial<Record<string, ProjectileEffectType>> = {
  enemy_ember_archer: "burn",
  enemy_bog_toad: "poison",
  enemy_frost_archer: "chill",
  enemy_wyrmling: "burn",
  boss_molten_archon: "burn",
};

// Chill — a stacking slow, not a damage tick. Enemy-inflicted chill (Frost
// Archer) is always 1 stack per hit; player-inflicted chill (Moonfrost
// Lance) carries its own stack count from the spell's `chillStacks` field.
// The whole stack count expires together on durationMs elapsing (refreshed,
// not extended, on reapplication), not per-stack decay.
export const CHILL_MAX_STACKS = 3;
export const CHILL_DURATION_MS = 5000;
// Index = current stack count (0 = no chill, uninflicted).
export const CHILL_SLOW_MULTIPLIER_BY_STACKS: number[] = [1, 0.85, 0.7, 0.55];
