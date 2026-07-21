import * as THREE from "three";
import { BASE_STATS, getMaxStamina, type Area, type PlayerStats } from "./utils/constants";
import { ROLE_CONFIG, roleForType, type EnemyRole } from "./utils/enemyRoles";
import { getEffectiveMaxHP, type ItemUpgrades } from "./utils/equipment";
import type { ItemSlot } from "./utils/items";
import { ENEMY_BASE_DAMAGE, FLASK_START_CHARGES, PROJECTILE_POOL_SIZE, type MeleeAction } from "./gameConstants";
import type { MapData } from "./maps/MapGenerator";

export interface PlayerState {
  stats: PlayerStats;
  equipped: Partial<Record<ItemSlot, string>>;
  upgrades: ItemUpgrades;
  position: THREE.Vector3;
  facing: number; // radians in the XZ plane, 0 = +Z (south)
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  rolling: boolean;
  rollElapsedMs: number;
  rollDir: THREE.Vector3;
  attackCooldownMs: number;
  attackActiveMs: number; // >0 while the current swing's hit window is live
  attackHitApplied: boolean;
  activeMelee: MeleeAction | null; // which swing is currently resolving (light/heavy/bash)
  hitFlashMs: number;
  dead: boolean;
  flaskCharges: number;
  maxFlaskCharges: number;
}

export type EnemyAIState = "idle" | "chase" | "windup" | "strike" | "recover" | "retreat" | "cower" | "dead";

export interface EnemyState {
  id: string;
  role: EnemyRole;
  areaDamageMultiplier: number;
  position: THREE.Vector3;
  hp: number;
  maxHp: number;
  aiState: EnemyAIState;
  stateElapsedMs: number;
  hitFlashMs: number;
  stunnedMs: number; // externally-forced (shield bash) — overrides the normal state machine while > 0
  path: { x: number; y: number }[]; // BFS waypoints (tile-center coords), consumed front-to-back
  repathMs: number; // countdown until the next repath attempt is allowed

  // Locked at windup start — lunge targets, and ranged/toad shot aim, always
  // fire at where the player WAS at windup start, not a live position.
  windupTargetX: number;
  windupTargetZ: number;
  lungeFromX: number;
  lungeFromZ: number;
  hasDealtDamageThisStrike: boolean;
  hasFiredThisStrike: boolean;

  // Archer/wyrmling (moveShape "ranged") only.
  losClear: boolean;
  losRecheckMs: number;
  sidestepTargetX?: number;
  sidestepTargetZ?: number;
  sidestepCooldownMs: number;

  // Wolf only.
  wolfCircleDir: 1 | -1 | 0; // 0 = not yet rolled this engagement
  wolfCircleRadius: number; // 0 = not yet rolled this bout
  wolfCommitElapsedMs: number;
  wolfCommitThresholdMs: number; // 0 = not yet rolled this bout
  wolfHopFromX: number;
  wolfHopFromZ: number;
  wolfHopTargetX: number;
  wolfHopTargetZ: number;
  wolfHopValid: boolean;

  // Toad only.
  toadHopping: boolean;
  toadHopElapsedMs: number;
  toadPauseElapsedMs: number;
  toadHopFromX: number;
  toadHopFromZ: number;
  toadHopTargetX: number;
  toadHopTargetZ: number;
}

export interface ProjectileState {
  id: number;
  position: THREE.Vector3;
  dir: THREE.Vector3; // normalized, XZ plane
  speed: number; // units/sec
  damage: number;
  traveled: number;
  maxRange: number;
  arcHeight?: number; // toad lob visual only — the x/z motion is a flat lerp either way
  color: string;
}

export interface FloatingText {
  id: number;
  text: string;
  position: THREE.Vector3;
  ageMs: number;
  color: string;
}

export interface GameState {
  mapData: MapData;
  area: Area;
  player: PlayerState;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  nextProjectileId: number;
  floatingText: FloatingText[];
  nextTextId: number;
}

export function createPlayerState(spawn: { x: number; y: number }): PlayerState {
  const stats: PlayerStats = { ...BASE_STATS };
  const equipped: Partial<Record<ItemSlot, string>> = { weapon: "iron_sword", shield: "knight_shield" };
  const upgrades: ItemUpgrades = {};
  const maxHp = getEffectiveMaxHP(stats.vigor, equipped, upgrades);
  const maxStamina = getMaxStamina(stats.endurance);
  return {
    stats,
    equipped,
    upgrades,
    position: new THREE.Vector3(spawn.x + 0.5, 0, spawn.y + 0.5),
    facing: 0,
    hp: maxHp,
    maxHp,
    stamina: maxStamina,
    maxStamina,
    rolling: false,
    rollElapsedMs: 0,
    rollDir: new THREE.Vector3(0, 0, 1),
    attackCooldownMs: 0,
    attackActiveMs: 0,
    attackHitApplied: false,
    activeMelee: null,
    hitFlashMs: 0,
    dead: false,
    flaskCharges: FLASK_START_CHARGES,
    maxFlaskCharges: FLASK_START_CHARGES,
  };
}

export function createEnemyState(id: string, role: EnemyRole, position: THREE.Vector3, areaDamageMultiplier: number): EnemyState {
  const cfg = ROLE_CONFIG[role];
  const maxHp = Math.round(160 * cfg.hpMultiplier);
  return {
    id,
    role,
    areaDamageMultiplier,
    position: position.clone(),
    hp: maxHp,
    maxHp,
    aiState: "idle",
    stateElapsedMs: 0,
    hitFlashMs: 0,
    stunnedMs: 0,
    path: [],
    repathMs: 0,
    windupTargetX: 0,
    windupTargetZ: 0,
    lungeFromX: 0,
    lungeFromZ: 0,
    hasDealtDamageThisStrike: false,
    hasFiredThisStrike: false,
    losClear: true,
    losRecheckMs: 0,
    sidestepCooldownMs: 0,
    wolfCircleDir: 0,
    wolfCircleRadius: 0,
    wolfCommitElapsedMs: 0,
    wolfCommitThresholdMs: 0,
    wolfHopFromX: 0,
    wolfHopFromZ: 0,
    wolfHopTargetX: 0,
    wolfHopTargetZ: 0,
    wolfHopValid: false,
    toadHopping: false,
    toadHopElapsedMs: 0,
    toadPauseElapsedMs: 9999,
    toadHopFromX: 0,
    toadHopFromZ: 0,
    toadHopTargetX: 0,
    toadHopTargetZ: 0,
  };
}

// Builds a fresh GameState from a generated floor. Enemy spawn types come
// straight from MapData.enemySpawns (real per-area rosters from
// AREA_CONFIGS, via MapGenerator) mapped to a role through enemyRoles.ts's
// own roleForType() — no hardcoded demo enemy list anymore.
export function createGameState(mapData: MapData, area: Area, areaDamageMultiplier: number): GameState {
  const enemies = mapData.enemySpawns.map((spawn, i) => {
    const role = roleForType(spawn.type);
    return createEnemyState(`${spawn.type}-${i}`, role, new THREE.Vector3(spawn.x + 0.5, 0, spawn.y + 0.5), areaDamageMultiplier);
  });
  return {
    mapData,
    area,
    player: createPlayerState(mapData.playerSpawn),
    enemies,
    projectiles: [],
    nextProjectileId: 0,
    floatingText: [],
    nextTextId: 0,
  };
}

// Matches Hohenberg's pool precedent — spawning past the cap silently drops
// the shot rather than growing an unbounded array.
export function spawnProjectile(
  state: GameState,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  speed: number,
  damage: number,
  maxRange: number,
  color: string,
  arcHeight?: number
) {
  if (state.projectiles.length >= PROJECTILE_POOL_SIZE) return;
  state.projectiles.push({
    id: state.nextProjectileId++,
    position: origin.clone(),
    dir: dir.clone(),
    speed,
    damage,
    traveled: 0,
    maxRange,
    arcHeight,
    color,
  });
}

export function spawnFloatingText(state: GameState, text: string, position: THREE.Vector3, color: string) {
  state.floatingText.push({
    id: state.nextTextId++,
    text,
    position: position.clone(),
    ageMs: 0,
    color,
  });
}

// Matches Hohenberg's GameScene.ts formula exactly (ENEMY_BASE_DAMAGE tuned
// there to land ~15-20% of level-1 max HP per hit for a SOLDIER).
export function enemyDamageForRole(state: EnemyState): number {
  const cfg = ROLE_CONFIG[state.role];
  return Math.round(ENEMY_BASE_DAMAGE * state.areaDamageMultiplier * cfg.damageMultiplier);
}
