import * as THREE from "three";
import { AREA_CONFIGS, BASE_STATS, getMaxStamina, getMaxFP, Floor, type Area, type PlayerStats } from "./utils/constants";
import { ROLE_CONFIG, roleForType, type EnemyRole } from "./utils/enemyRoles";
import { getEffectiveMaxHP, type ItemUpgrades } from "./utils/equipment";
import { getItemDef, RARITY_COLOR, type ItemSlot } from "./utils/items";
import { SECRET_FIGHT_BY_AREA, TOWER_KNIGHT_SPLIT_TYPES } from "./utils/secretFights";
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
  fp: number;
  maxFp: number;
  casting: boolean;
  castElapsedMs: number;
  castTotalMs: number;
  castSpellId: string | null; // p.equipped.spell, snapshotted at cast start so switching gear mid-cast can't change it
  castFpCost: number; // spent at cast start, refunded if canceled within the first CAST_REFUND_WINDOW_PCT of castTotalMs
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

export interface ChestState {
  x: number;
  y: number;
  itemId: string;
  opened: boolean;
}

// One per area (see MapData.leverSpawn/utils/secretFights.ts). enemyIds
// tracks whichever enemies currently represent "the fight" — for most areas
// that's the single starting spawn, but the Shackled Sentinel/Tower Knight
// transform mid-fight (handleSpecialEnemyDeath below) and swap their own id
// out for the new phase's id(s) so "cleared" still resolves correctly.
export interface SecretFightState {
  name: string;
  leverX: number;
  leverY: number;
  triggered: boolean;
  cleared: boolean;
  rewardItemIds: [string, string];
  enemyIds: string[];
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
  owner: "player" | "enemy"; // which side it damages on hit
  position: THREE.Vector3;
  dir: THREE.Vector3; // normalized, XZ plane
  speed: number; // units/sec
  damage: number;
  traveled: number;
  maxRange: number;
  arcHeight?: number; // toad lob visual only — the x/z motion is a flat lerp either way
  homingDegPerSec?: number; // player spells only (Ashmote) — weak cone-limited steering toward the nearest enemy
  color: string;
}

export interface FloatingText {
  id: number;
  text: string;
  position: THREE.Vector3;
  ageMs: number;
  color: string;
}

// Persists across the Floor1Gameplay remounts that happen on every area
// change (unlike the rest of GameState, which is discarded and rebuilt from
// scratch each time) — GameScene owns the long-lived object and passes the
// same reference into createGameState each time, so mutations here (a boss
// dying, the prologue ending) are visible immediately without a save/reload
// round-trip. Drives Hearth NPC visibility staging (design doc section 2):
// Martyna appears once the prologue is complete, Varn once Area 1's boss
// is dead.
export interface ProgressFlags {
  prologueComplete: boolean;
  areaBossDefeated: Partial<Record<Area, boolean>>;
}

export function createProgressFlags(): ProgressFlags {
  return { prologueComplete: false, areaBossDefeated: {} };
}

// Called from both the melee (Player.tsx) and spell (Projectiles.tsx) boss
// kill paths — kept as one function so the two sites can't drift.
export function markBossDefeated(state: GameState) {
  state.progress.areaBossDefeated[state.area] = true;
}

export interface GameState {
  mapData: MapData;
  area: Area;
  floor: Floor;
  progress: ProgressFlags;
  paused: boolean; // set true while a full-screen UI panel (inventory, etc) is open
  player: PlayerState;
  enemies: EnemyState[];
  nextEnemySpawnId: number;
  boss?: BossState;
  chests: ChestState[];
  secretFight?: SecretFightState;
  hazards: GroundHazard[];
  nextHazardId: number;
  // True while mapData.bossGateDoor should block player movement (see
  // collision.ts's isGateBlocked) — locked as long as the area's boss is
  // alive, forcing the fight instead of letting the player route around it
  // to the end room. Irrelevant (stays false) for areas with no boss.
  gateLocked: boolean;
  // Set once the player steps onto mapData.endPoint's "end_portal" tile (see
  // Player.tsx) — GameScene watches this to travel back to the Hearth.
  // Always false on the Hearth's own map (generateHearthMap sets no endPoint).
  reachedEnd: boolean;
  projectiles: ProjectileState[];
  nextProjectileId: number;
  floatingText: FloatingText[];
  nextTextId: number;
}

export function createPlayerState(spawn: { x: number; y: number }): PlayerState {
  const stats: PlayerStats = { ...BASE_STATS };
  // Ashmote is start-owned and guaranteed (design doc section 5 / items.ts's
  // nonSellable flag) — every new game begins with it equipped in the spell
  // slot so casting is never locked out before a real spell shop exists.
  const equipped: Partial<Record<ItemSlot, string>> = { weapon: "iron_sword", shield: "knight_shield", spell: "ashmote" };
  const upgrades: ItemUpgrades = {};
  const maxHp = getEffectiveMaxHP(stats.vigor, equipped, upgrades);
  const maxStamina = getMaxStamina(stats.endurance);
  const maxFp = getMaxFP(stats.mind);
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
    fp: maxFp,
    maxFp,
    casting: false,
    castElapsedMs: 0,
    castTotalMs: 0,
    castSpellId: null,
    castFpCost: 0,
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
export function createGameState(mapData: MapData, area: Area, areaDamageMultiplier: number, progress: ProgressFlags = createProgressFlags(), floor: Floor = Floor.BASEMENT): GameState {
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

  const chests: ChestState[] = mapData.chestSpawns.map((c) => ({ x: c.x, y: c.y, itemId: c.itemId, opened: false }));

  const secretConfig = SECRET_FIGHT_BY_AREA[area];
  const secretFight: SecretFightState | undefined =
    secretConfig && mapData.leverSpawn
      ? {
          name: secretConfig.name,
          leverX: mapData.leverSpawn.x,
          leverY: mapData.leverSpawn.y,
          triggered: false,
          cleared: false,
          rewardItemIds: secretConfig.rewardItemIds,
          enemyIds: [],
        }
      : undefined;

  return {
    mapData,
    area,
    floor,
    progress,
    paused: false,
    player: createPlayerState(mapData.playerSpawn),
    enemies,
    nextEnemySpawnId: 0,
    boss,
    chests,
    secretFight,
    hazards: [],
    nextHazardId: 0,
    gateLocked: !!(boss && mapData.bossGateDoor),
    reachedEnd: false,
    projectiles: [],
    nextProjectileId: 0,
    floatingText: [],
    nextTextId: 0,
  };
}

// Runtime enemy spawn (secret-fight lever triggers, and mid-fight
// transforms like the Tower Knight's split) — same shape as the map-driven
// roster in createGameState, just appended after the fact with a
// collision-free id.
export function spawnEnemyAt(state: GameState, type: string, worldX: number, worldZ: number): EnemyState {
  const role = roleForType(type);
  const id = `${type}-secret-${state.nextEnemySpawnId++}`;
  const e = createEnemyState(id, role, new THREE.Vector3(worldX, 0, worldZ), AREA_CONFIGS[state.area].enemyDamageMultiplier);
  state.enemies.push(e);
  return e;
}

// Chests/legendary secret-fight rewards share this: a flask shard raises
// the flask cap instead of occupying an inventory slot (see items.ts's
// ItemDef.isFlaskShard comment); everything else goes straight to the
// carried-item list (equip-only inventory, no stacking/instance identity).
export function grantItem(state: GameState, itemId: string) {
  const def = getItemDef(itemId);
  const p = state.player;
  const textPos = p.position.clone().add(new THREE.Vector3(0, 2.2, 0));
  if (def.isFlaskShard) {
    p.maxFlaskCharges += 1;
    p.flaskCharges += 1;
    spawnFloatingText(state, "+1 FLASK CHARGE", textPos, "#66ff66");
    return;
  }
  p.inventory.push(itemId);
  const color = `#${(RARITY_COLOR[def.rarity] ?? RARITY_COLOR.common).toString(16).padStart(6, "0")}`;
  spawnFloatingText(state, def.name, textPos, color);
}

export function openChest(state: GameState, chest: ChestState) {
  if (chest.opened) return;
  chest.opened = true;
  grantItem(state, chest.itemId);
}

// Spawns the fight's starting roster at the lever and marks it triggered —
// a no-op if already triggered (re-pressing E doesn't respawn the fight).
export function triggerSecretFight(state: GameState) {
  const sf = state.secretFight;
  const config = SECRET_FIGHT_BY_AREA[state.area];
  if (!sf || !config || sf.triggered) return;
  sf.triggered = true;
  sf.enemyIds = config.enemyTypes.map((type, i) => {
    const angle = (i / Math.max(1, config.enemyTypes.length)) * Math.PI * 2;
    const e = spawnEnemyAt(state, type, sf.leverX + 0.5 + Math.cos(angle) * 0.6, sf.leverY + 0.5 + Math.sin(angle) * 0.6);
    return e.id;
  });
  spawnFloatingText(state, sf.name.toUpperCase(), state.player.position.clone().add(new THREE.Vector3(0, 2.5, 0)), "#ffcc55");
}

// Called every frame (see Player.tsx) once a fight is triggered — grants the
// reward pair the instant every currently-tracked enemy id is dead. Safe to
// call repeatedly; `cleared` gates it to firing exactly once.
export function updateSecretFight(state: GameState) {
  const sf = state.secretFight;
  if (!sf || !sf.triggered || sf.cleared || sf.enemyIds.length === 0) return;
  const allDead = sf.enemyIds.every((id) => {
    const e = state.enemies.find((en) => en.id === id);
    return !e || e.aiState === "dead";
  });
  if (!allDead) return;
  sf.cleared = true;
  grantItem(state, sf.rewardItemIds[0]);
  grantItem(state, sf.rewardItemIds[1]);
  spawnFloatingText(state, `${sf.name.toUpperCase()} — CLEARED`, state.player.position.clone().add(new THREE.Vector3(0, 3, 0)), "#ffd700");
}

// Two of the 5 secret fights transform instead of just dying (see
// utils/secretFights.ts). Called from Player.tsx's melee-kill branch before
// it applies the normal aiState="dead"/SLAIN-text handling; returns true if
// it intercepted the "death" (the caller should skip the normal handling).
export function handleSpecialEnemyDeath(state: GameState, enemy: EnemyState): boolean {
  if (enemy.role === "shackled_sentinel") {
    enemy.role = "sentinel_unbound";
    const cfg = ROLE_CONFIG.sentinel_unbound;
    enemy.maxHp = Math.round(160 * cfg.hpMultiplier);
    enemy.hp = enemy.maxHp;
    enemy.aiState = "idle";
    enemy.stateElapsedMs = 0;
    spawnFloatingText(state, "UNBOUND!", enemy.position.clone().add(new THREE.Vector3(0, 2.4, 0)), "#ff8844");
    return true;
  }
  if (enemy.role === "tower_knight") {
    enemy.aiState = "dead";
    const newIds = TOWER_KNIGHT_SPLIT_TYPES.map((type, i) => {
      const angle = (i / TOWER_KNIGHT_SPLIT_TYPES.length) * Math.PI * 2;
      const nx = enemy.position.x + Math.cos(angle) * 1.2;
      const nz = enemy.position.z + Math.sin(angle) * 1.2;
      return spawnEnemyAt(state, type, nx, nz).id;
    });
    const sf = state.secretFight;
    if (sf) sf.enemyIds = sf.enemyIds.filter((id) => id !== enemy.id).concat(newIds);
    spawnFloatingText(state, "SHATTERED!", enemy.position.clone().add(new THREE.Vector3(0, 2.4, 0)), "#ff8844");
    return true;
  }
  return false;
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
  owner: "player" | "enemy",
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  speed: number,
  damage: number,
  maxRange: number,
  color: string,
  arcHeight?: number,
  homingDegPerSec?: number
) {
  if (state.projectiles.length >= PROJECTILE_POOL_SIZE) return;
  state.projectiles.push({
    id: state.nextProjectileId++,
    owner,
    position: origin.clone(),
    dir: dir.clone(),
    speed,
    damage,
    traveled: 0,
    maxRange,
    arcHeight,
    homingDegPerSec,
    color,
  });
}

// Design doc's death economy, simplified for this slice: souls are lost
// immediately on death rather than left as a recoverable marker, because
// generateMap() isn't seeded (see saveGame.ts's own comment on this) — every
// re-entry into an area regenerates a fresh layout, so a marker tied to a
// specific generated position would become unreachable the moment the player
// left and came back. Revisit once floor layouts are cached/seeded.
export function killPlayer(state: GameState) {
  if (state.player.dead) return;
  state.player.dead = true;
  if (state.player.stats.souls > 0) {
    spawnFloatingText(state, "Your souls are lost to the flood", state.player.position.clone().add(new THREE.Vector3(0, 2.5, 0)), "#b04434");
    state.player.stats.souls = 0;
  }
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
