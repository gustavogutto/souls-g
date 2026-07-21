import * as THREE from "three";
import { AREA_CONFIGS, BASE_STATS, getMaxStamina, type Area, type PlayerStats } from "./utils/constants";
import { ROLE_CONFIG, roleForType, type EnemyRole } from "./utils/enemyRoles";
import { getEffectiveMaxHP, type ItemUpgrades } from "./utils/equipment";
import type { ItemSlot } from "./utils/items";
import { ENEMY_BASE_DAMAGE, FLASK_START_CHARGES, PROJECTILE_POOL_SIZE, type MeleeAction } from "./gameConstants";
import type { MapData } from "./maps/MapGenerator";

export interface PlayerState {
  stats: PlayerStats;
  equipped: Partial<Record<ItemSlot, string>>;
  upgrades: ItemUpgrades;
  inventory: string[]; // flat carried-item ids, same no-instance-identity model as the source game
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
  lastHealAtMs: number; // performance.now() timestamp, read by the Tidewarden's heal-punish grab trigger
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

// Bosses reuse the same idle->aggro->windup->strike->recover shape as
// EnemyState (see Boss.tsx), but their move data (BossMove, from
// bossData.ts) and per-move flags (unblockable/lunge/ranged/leavesHazard)
// don't fit RoleConfig's shape, so they get their own state type rather
// than being shoehorned into EnemyState/EnemyRole.
export type BossPhase = "ground" | "flight"; // only the Dragon ever leaves "ground"

export interface BossState {
  bossType: string;
  name: string;
  position: THREE.Vector3;
  hp: number;
  maxHp: number;
  baseDamage: number;
  aiState: EnemyAIState;
  stateElapsedMs: number;
  hitFlashMs: number;
  moveIndex: number; // index into bossMovesForType(bossType), picked at windup entry
  hasDealtDamageThisStrike: boolean;
  hasFiredThisStrike: boolean;
  windupTargetX: number;
  windupTargetZ: number;
  lungeFromX: number;
  lungeFromZ: number;
  // Set at strike-entry each time, read by GameScene/Boss's own damage
  // application (mirrors Enemy.ts's lastStrikeUnblockable/lastStrikeLeavesHazard
  // plumbing described in bossData.ts).
  lastStrikeUnblockable: boolean;
  lastStrikeLeavesHazard: boolean;
  // The Hollow Wyrm only — every other boss stays in "ground" forever and
  // ignores these two fields.
  phase: BossPhase;
  phaseElapsedMs: number;
}

export interface GroundHazard {
  id: number;
  position: THREE.Vector3;
  radius: number;
  damagePerSec: number;
  remainingMs: number;
  color: string;
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
  paused: boolean; // set true while a full-screen UI panel (inventory, etc) is open
  player: PlayerState;
  enemies: EnemyState[];
  boss?: BossState;
  hazards: GroundHazard[];
  nextHazardId: number;
  // True while mapData.bossGateDoor should block player movement (see
  // collision.ts's isGateBlocked) — locked as long as the area's boss is
  // alive, forcing the fight instead of letting the player route around it
  // to the end room. Irrelevant (stays false) for areas with no boss.
  gateLocked: boolean;
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
    // Temporary starter items so the equip-only inventory panel (phase 4)
    // has something to show before chests grant real loot (phase 5).
    inventory: ["chainmail_armor", "fallen_knight_helm", "leather_pants", "wanderers_ring", "travelers_pendant"],
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
    lastHealAtMs: -Infinity,
  };
}

export function createBossState(bossType: string, name: string, maxHp: number, baseDamage: number, position: THREE.Vector3): BossState {
  return {
    bossType,
    name,
    position: position.clone(),
    hp: maxHp,
    maxHp,
    baseDamage,
    aiState: "idle",
    stateElapsedMs: 0,
    hitFlashMs: 0,
    moveIndex: 0,
    hasDealtDamageThisStrike: false,
    hasFiredThisStrike: false,
    windupTargetX: 0,
    windupTargetZ: 0,
    lungeFromX: 0,
    lungeFromZ: 0,
    lastStrikeUnblockable: false,
    lastStrikeLeavesHazard: false,
    phase: "ground",
    phaseElapsedMs: 0,
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

  const areaConfig = AREA_CONFIGS[area];
  const boss =
    mapData.bossSpawn && areaConfig.bossType
      ? createBossState(
          mapData.bossSpawn.type,
          areaConfig.bossName,
          areaConfig.bossHP,
          areaConfig.bossDamage,
          new THREE.Vector3(mapData.bossSpawn.x + 0.5, 0, mapData.bossSpawn.y + 0.5)
        )
      : undefined;

  return {
    mapData,
    area,
    paused: false,
    player: createPlayerState(mapData.playerSpawn),
    enemies,
    boss,
    hazards: [],
    nextHazardId: 0,
    gateLocked: !!(boss && mapData.bossGateDoor),
    projectiles: [],
    nextProjectileId: 0,
    floatingText: [],
    nextTextId: 0,
  };
}

// Matches Hohenberg's pool precedent (see spawnProjectile below) — no hard
// cap here since hazards are few and short-lived (a handful of boss slams
// at once, tens of seconds each), unlike the pooled-and-capped projectiles.
export function spawnGroundHazard(state: GameState, position: THREE.Vector3, radius: number, damagePerSec: number, durationMs: number, color: string) {
  state.hazards.push({
    id: state.nextHazardId++,
    position: position.clone(),
    radius,
    damagePerSec,
    remainingMs: durationMs,
    color,
  });
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
