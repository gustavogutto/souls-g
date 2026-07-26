import * as THREE from "three";
import { AREA_CONFIGS, BASE_STATS, getMaxStamina, getMaxFP, Floor, type Area, type PlayerStats } from "./utils/constants";
import { ROLE_CONFIG, roleForType, type EnemyRole } from "./utils/enemyRoles";
import { getEffectiveMaxHP, type ItemUpgrades } from "./utils/equipment";
import { getItemDef, RARITY_COLOR, type ItemSlot } from "./utils/items";
import { SECRET_FIGHT_BY_AREA, TOWER_KNIGHT_SPLIT_TYPES } from "./utils/secretFights";
import { ENEMY_BASE_DAMAGE, FLASK_START_CHARGES, PROJECTILE_POOL_SIZE, type MeleeAction } from "./gameConstants";
import { STATUS_EFFECT_CONFIG, CHILL_MAX_STACKS, CHILL_DURATION_MS, CHILL_SLOW_MULTIPLIER_BY_STACKS, type StatusEffectType, type ProjectileEffectType } from "./utils/statusEffects";
import type { MapData } from "./maps/MapGenerator";

export interface PlayerState {
  stats: PlayerStats;
  equipped: Partial<Record<ItemSlot, string>>;
  upgrades: ItemUpgrades;
  inventory: string[]; // flat carried-item ids, same no-instance-identity model as the source game
  stash: string[]; // Hearth personal storage — same flat-list shape as inventory, deposit/withdraw only
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
  deathElapsedMs: number; // ticked while dead; Player.tsx auto-respawns past RESPAWN_DELAY_MS
  flaskCharges: number;
  maxFlaskCharges: number;
  lastHealAtMs: number; // performance.now() timestamp, read by the Tidewarden's heal-punish grab trigger
  statusEffects: { type: StatusEffectType; remainingMs: number; tickCooldownMs: number }[];
  chillStacks: number;
  chillRemainingMs: number;
  blocking: boolean; // right-click held, requires p.equipped.shield — see BLOCK_DAMAGE_REDUCTION
}

export type EnemyAIState = "idle" | "chase" | "windup" | "strike" | "recover" | "retreat" | "cower" | "dead";

export interface EnemyState {
  id: string;
  type: string; // raw spawn type id (e.g. "enemy_frost_archer") — role collapses area-flavor variants together, so this is kept separately for statusEffects.ts's PROJECTILE_EFFECT_BY_TYPE lookup
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
  chillStacks: number; // Moonfrost Lance only — enemies never get poison/burn ticks, only players do
  chillRemainingMs: number;

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
  effectType?: ProjectileEffectType; // enemy-owned only (Ember Archer/Toad/Wyrmling/Molten Archon burn+poison, Frost Archer chill)
  chillStacksOnHit?: number; // player-owned only (Moonfrost Lance) — enemy chill carries an explicit stack count instead of effectType's flat 1
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
  flaviannaMet: boolean; // met once in Area 2 floor 3 (merchantNpcSpawn) — from then on she's a Hearth NPC instead
  // Checkpoint flames (design doc section 2) — keyed by flameKey(area,
  // floor) below. A plain object (not a Set) so it round-trips through
  // JSON in SaveData without a custom (de)serializer.
  discoveredFlames: Partial<Record<string, true>>;
  // Narrative (design doc section 11) — both one-time-per-save, never
  // re-triggered on a revisit. introLoreShown covers the opening crawl;
  // floorLoreShown is keyed the same way as discoveredFlames.
  introLoreShown: boolean;
  floorLoreShown: Partial<Record<string, true>>;
}

export function createProgressFlags(): ProgressFlags {
  return {
    prologueComplete: false,
    areaBossDefeated: {},
    flaviannaMet: false,
    discoveredFlames: {},
    introLoreShown: false,
    floorLoreShown: {},
  };
}

// Called from both the melee (Player.tsx) and spell (Projectiles.tsx) boss
// kill paths — kept as one function so the two sites can't drift.
export function markBossDefeated(state: GameState) {
  state.progress.areaBossDefeated[state.area] = true;
}

// Checkpoint flames (design doc section 2) — the Hearth/Prologue don't
// participate in the inter-area fast-travel network, only the 5 real
// areas' floors do, so callers should only ever pass those.
export function flameKey(area: Area, floor: Floor): string {
  return `${area}-${floor}`;
}

export function markFlameDiscovered(state: GameState, area: Area, floor: Floor) {
  state.progress.discoveredFlames[flameKey(area, floor)] = true;
}

// Shared by both boss-kill paths (Player.tsx melee, Projectiles.tsx spell)
// — an echo boss (state.isBonusLayer) must never trigger the real area's
// cleared/gate-unlock flag (design doc section 2's hard separation), so it
// routes to auto-discovering that floor's own checkpoint flame instead.
// state.area/state.floor still mirror the ground floor that spawned this
// bonus layer (see GameState.isBonusLayer's own comment), so this is
// exactly "that floor's" flame, not a guess.
export function handleBossDefeatReward(state: GameState) {
  if (state.isBonusLayer) markFlameDiscovered(state, state.area, state.floor);
  else markBossDefeated(state);
}

export function listDiscoveredFlames(progress: ProgressFlags): { area: Area; floor: Floor }[] {
  return Object.keys(progress.discoveredFlames)
    .filter((k) => progress.discoveredFlames[k])
    .map((k) => {
      const [areaStr, floorStr] = k.split("-");
      return { area: Number(areaStr) as Area, floor: floorStr as Floor };
    });
}

// REST — full heal, matching the 2D source's healFull() (also refills
// flasks, same as its "flasks refill on rest/warp/death-respawn" rule).
export function restAtFlame(state: GameState) {
  const p = state.player;
  p.hp = p.maxHp;
  p.stamina = p.maxStamina;
  p.fp = p.maxFp;
  p.flaskCharges = p.maxFlaskCharges;
  p.statusEffects = [];
  p.chillStacks = 0;
}

const LOCK_ON_MAX_RANGE = 14;
const LOCK_ON_CONE_COS = Math.cos((55 * Math.PI) / 180); // must be roughly in view to lock

export function getLockOnTargetPosition(state: GameState): THREE.Vector3 | null {
  if (!state.lockOn) return null;
  if (state.lockOn.kind === "boss") {
    const boss = state.boss;
    return boss && boss.hp > 0 && boss.aiState !== "dead" ? boss.position : null;
  }
  const enemy = state.enemies.find((e) => e.id === state.lockOn!.id);
  return enemy && enemy.aiState !== "dead" ? enemy.position : null;
}

// Middle-click (design doc combat feedback: mouse+keyboard players want the
// camera to do the aiming, not have to hand-track a target the whole fight).
// Toggles off if already locked; otherwise picks whichever valid target is
// closest to dead-center of the camera's forward cone, matching the "nearest
// thing you're roughly looking at" convention every Souls game uses.
export function toggleLockOn(state: GameState, camForward: THREE.Vector3) {
  if (state.lockOn) {
    state.lockOn = null;
    return;
  }
  const p = state.player;
  let best: { kind: "enemy" | "boss"; id: string } | null = null;
  let bestScore = -Infinity;
  const consider = (kind: "enemy" | "boss", id: string, pos: THREE.Vector3) => {
    const to = new THREE.Vector3().subVectors(pos, p.position);
    const dist = to.length();
    if (dist > LOCK_ON_MAX_RANGE || dist < 0.01) return;
    to.normalize();
    const dot = camForward.dot(to);
    if (dot < LOCK_ON_CONE_COS) return;
    const score = dot - dist * 0.02;
    if (score > bestScore) {
      bestScore = score;
      best = { kind, id };
    }
  };
  for (const e of state.enemies) if (e.aiState !== "dead") consider("enemy", e.id, e.position);
  if (state.boss && state.boss.hp > 0 && state.boss.aiState !== "dead") consider("boss", "boss", state.boss.position);
  state.lockOn = best;
}

// Called every frame — drops the lock the instant its target dies, so combat
// never gets stuck facing/orbiting a corpse.
export function clearLockOnIfInvalid(state: GameState) {
  if (state.lockOn && !getLockOnTargetPosition(state)) state.lockOn = null;
}

export interface GameState {
  mapData: MapData;
  area: Area;
  floor: Floor;
  // Seamless-portal system (design doc section 2) — true for a bonus
  // labyrinth's own GameState (see GameScene's handleEnterPortal). area/
  // floor still mirror whichever ground floor spawned it, so
  // markBossDefeated's own state.area/state.floor read stays meaningful —
  // only the boss-death branch (Player.tsx/Projectiles.tsx) actually reads
  // this flag, to route the echo boss's reward at a checkpoint-flame
  // discovery instead of the real area-cleared/gate-unlock logic.
  isBonusLayer: boolean;
  progress: ProgressFlags;
  paused: boolean; // set true while a full-screen UI panel (inventory, etc) is open
  player: PlayerState;
  enemies: EnemyState[];
  nextEnemySpawnId: number;
  boss?: BossState;
  chests: ChestState[];
  secretFight?: SecretFightState;
  fallenAdventurerLooted: boolean;
  brokenCrates: Set<string>; // `${x},${y}` keys into mapData.breakableSpawns
  vaultLeverPulled: boolean;
  vaultOpened: boolean;
  illusoryWallOpened: boolean;
  shortcutDoorOpened: boolean;
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
  // Souls-style lock-on (middle-click, see input.ts) — id is an EnemyState.id
  // for "enemy", meaningless/unused for "boss" (only one can ever exist).
  lockOn: { kind: "enemy" | "boss"; id: string } | null;
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
    stash: [],
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
    deathElapsedMs: 0,
    flaskCharges: FLASK_START_CHARGES,
    maxFlaskCharges: FLASK_START_CHARGES,
    lastHealAtMs: -Infinity,
    statusEffects: [],
    chillStacks: 0,
    chillRemainingMs: 0,
    blocking: false,
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

export function createEnemyState(id: string, type: string, role: EnemyRole, position: THREE.Vector3, areaDamageMultiplier: number): EnemyState {
  const cfg = ROLE_CONFIG[role];
  const maxHp = Math.round(160 * cfg.hpMultiplier);
  return {
    id,
    type,
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
    chillStacks: 0,
    chillRemainingMs: 0,
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
export function createGameState(mapData: MapData, area: Area, areaDamageMultiplier: number, progress: ProgressFlags = createProgressFlags(), floor: Floor = Floor.BASEMENT, isBonusLayer = false): GameState {
  const enemies = mapData.enemySpawns.map((spawn, i) => {
    const role = roleForType(spawn.type);
    return createEnemyState(`${spawn.type}-${i}`, spawn.type, role, new THREE.Vector3(spawn.x + 0.5, 0, spawn.y + 0.5), areaDamageMultiplier);
  });

  const areaConfig = AREA_CONFIGS[area];
  const boss =
    mapData.bossSpawn && areaConfig.bossType
      ? createBossState(
          mapData.bossSpawn.type,
          // "Reduced narrative weight" (design doc section 2) — same stats
          // and moves as the real fight, just labeled as a lesser echo of it.
          isBonusLayer ? `Echo of ${areaConfig.bossName}` : areaConfig.bossName,
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
    isBonusLayer,
    progress,
    paused: false,
    player: createPlayerState(mapData.playerSpawn),
    enemies,
    nextEnemySpawnId: 0,
    boss,
    chests,
    secretFight,
    fallenAdventurerLooted: false,
    brokenCrates: new Set(),
    vaultLeverPulled: false,
    vaultOpened: false,
    illusoryWallOpened: false,
    shortcutDoorOpened: false,
    hazards: [],
    nextHazardId: 0,
    gateLocked: !!(boss && mapData.bossGateDoor),
    reachedEnd: false,
    projectiles: [],
    nextProjectileId: 0,
    floatingText: [],
    nextTextId: 0,
    lockOn: null,
  };
}

// Runtime enemy spawn (secret-fight lever triggers, and mid-fight
// transforms like the Tower Knight's split) — same shape as the map-driven
// roster in createGameState, just appended after the fact with a
// collision-free id.
export function spawnEnemyAt(state: GameState, type: string, worldX: number, worldZ: number): EnemyState {
  const role = roleForType(type);
  const id = `${type}-secret-${state.nextEnemySpawnId++}`;
  const e = createEnemyState(id, type, role, new THREE.Vector3(worldX, 0, worldZ), AREA_CONFIGS[state.area].enemyDamageMultiplier);
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

// Hearth stash — deposit/withdraw between inventory and stash, both flat
// uncapped string[] with no instance identity (2D source precedent). Won't
// deposit an item's only copy if it's the one currently equipped, since
// p.equipped would be left pointing at an id no longer in inventory.
export function depositItem(p: PlayerState, itemId: string) {
  const idx = p.inventory.indexOf(itemId);
  if (idx < 0) return;
  const equippedIds = new Set(Object.values(p.equipped));
  const remainingCopies = p.inventory.filter((id) => id === itemId).length;
  if (remainingCopies <= 1 && equippedIds.has(itemId)) return;
  p.inventory.splice(idx, 1);
  p.stash.push(itemId);
}

export function withdrawItem(p: PlayerState, itemId: string) {
  const idx = p.stash.indexOf(itemId);
  if (idx < 0) return;
  p.stash.splice(idx, 1);
  p.inventory.push(itemId);
}

export function openChest(state: GameState, chest: ChestState) {
  if (chest.opened) return;
  chest.opened = true;
  grantItem(state, chest.itemId);
}

// Design doc section 13's fallen adventurer — one guaranteed item plus a
// line of flavor text, pure environmental storytelling.
export function lootFallenAdventurer(state: GameState) {
  const fa = state.mapData.fallenAdventurerSpawn;
  if (!fa || state.fallenAdventurerLooted) return;
  state.fallenAdventurerLooted = true;
  grantItem(state, fa.itemId);
  spawnFloatingText(state, fa.flavorText, new THREE.Vector3(fa.x + 0.5, 2.6, fa.y + 0.5), "#9fae9f");
}

// Design doc section 13's breakable crates — a small souls trickle, no
// hp/hit-stop machinery needed for a static prop (2D source precedent:
// 3-8 souls).
export function breakCrate(state: GameState, x: number, y: number) {
  const key = `${x},${y}`;
  if (state.brokenCrates.has(key)) return;
  state.brokenCrates.add(key);
  const souls = 3 + Math.floor(Math.random() * 6);
  state.player.stats.souls += souls;
  spawnFloatingText(state, `+${souls}`, new THREE.Vector3(x + 0.5, 1.6, y + 0.5), "#ffd700");
}

// Mystery Vault (design doc section 13) — the lever must be pulled before
// the paired chest responds at all.
export function pullVaultLever(state: GameState) {
  if (!state.mapData.vaultSpawn || state.vaultLeverPulled) return;
  state.vaultLeverPulled = true;
  spawnFloatingText(state, "The lever gives way with a groan.", state.player.position.clone().add(new THREE.Vector3(0, 2, 0)), "#c9a84c");
}

// Outcome was pre-rolled at generation time (MapGenerator.ts's vaultSpawn) —
// this only ever applies it, never re-rolls. Cursed spawns an ambush
// instead of granting loot (2D source precedent: bounded scope, reuses the
// same enemy roster/tuning every normal spawn already uses).
export function openVault(state: GameState) {
  const v = state.mapData.vaultSpawn;
  if (!v || !state.vaultLeverPulled || state.vaultOpened) return;
  state.vaultOpened = true;
  const textPos = new THREE.Vector3(v.chestX + 0.5, 2.2, v.chestY + 0.5);
  if (v.outcome === "jackpot") {
    grantItem(state, v.itemId);
    state.player.stats.souls += 300;
    spawnFloatingText(state, "Jackpot — and souls besides.", textPos, "#ffd700");
  } else if (v.outcome === "decent") {
    grantItem(state, v.itemId);
    spawnFloatingText(state, "A fair haul.", textPos, "#ffd700");
  } else {
    spawnFloatingText(state, "Something was waiting.", textPos, "#ff5555");
    const enemyTypes = AREA_CONFIGS[state.area].enemyTypes;
    if (enemyTypes.length > 0) {
      for (const [ox, oy] of [[1, 0], [-1, 0]] as const) {
        const type = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
        spawnEnemyAt(state, type, v.chestX + 0.5 + ox, v.chestY + 0.5 + oy);
      }
    }
  }
}

// Illusory wall (design doc section 13) — flips both the wall tile and its
// hidden alcove to real "floor" TileData so the existing tile-grid
// collision (isWallTile) picks it up immediately, no separate walkability
// override needed. Returns whether it just fired (false if already opened
// or there's no spawn on this floor) so the caller (Interactables.tsx)
// knows whether to force DungeonRenderer to rebuild its merged geometry —
// mutating mapData.tiles in place doesn't itself trigger DungeonRenderer's
// useMemo, since neither `mapData` nor `theme` (its only deps) change.
export function openIllusoryWall(state: GameState): boolean {
  const iw = state.mapData.illusoryWallSpawn;
  if (!iw || state.illusoryWallOpened) return false;
  state.illusoryWallOpened = true;
  for (const [tx, ty] of [[iw.wallX, iw.wallY], [iw.revealX, iw.revealY]] as const) {
    const index = ty * state.mapData.width + tx;
    const tile = state.mapData.tiles[index];
    if (tile) tile.type = "floor";
  }
  grantItem(state, iw.itemId);
  spawnFloatingText(state, "The wall gives way.", new THREE.Vector3(iw.wallX + 0.5, 2, iw.wallY + 0.5), "#9fae9f");
  return true;
}

// "The Ring" archetype's locked shortcut door — permanently unlocked once
// opened (no tile-type mutation needed here, unlike the illusory wall: the
// gate tiles were always real floor, only ever blocked by
// isShortcutDoorBlocked's runtime check, matching the boss gate door's own
// "plain floor tile, solid only while a flag says so" treatment).
export function openShortcutDoor(state: GameState) {
  if (!state.mapData.shortcutDoorSpawn || state.shortcutDoorOpened) return;
  state.shortcutDoorOpened = true;
  spawnFloatingText(state, "The shortcut opens.", state.player.position.clone().add(new THREE.Vector3(0, 2, 0)), "#9fae9f");
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
  homingDegPerSec?: number,
  effectType?: ProjectileEffectType,
  chillStacksOnHit?: number
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
    effectType,
    chillStacksOnHit,
    color,
  });
}

// Shared by PlayerState and EnemyState (both carry chillStacks/
// chillRemainingMs) — Moonfrost Lance/Frost Archer's stacking slow.
interface ChillHolder {
  chillStacks: number;
  chillRemainingMs: number;
}

export function applyChill(holder: ChillHolder, stacks: number) {
  holder.chillStacks = Math.min(CHILL_MAX_STACKS, holder.chillStacks + stacks);
  holder.chillRemainingMs = CHILL_DURATION_MS; // refreshed, not extended — the whole stack expires together
}

export function tickChill(holder: ChillHolder, dtMs: number) {
  if (holder.chillStacks <= 0) return;
  holder.chillRemainingMs -= dtMs;
  if (holder.chillRemainingMs <= 0) holder.chillStacks = 0;
}

export function chillSlowMultiplier(holder: ChillHolder): number {
  return CHILL_SLOW_MULTIPLIER_BY_STACKS[holder.chillStacks] ?? 1;
}

// No stacking — reapplying the same type just extends/refreshes its
// duration, same as the 2D source, to avoid a repeated-hits damage spiral.
export function applyStatusEffect(p: PlayerState, type: StatusEffectType) {
  const cfg = STATUS_EFFECT_CONFIG[type];
  const existing = p.statusEffects.find((e) => e.type === type);
  if (existing) existing.remainingMs = cfg.durationMs;
  else p.statusEffects.push({ type, remainingMs: cfg.durationMs, tickCooldownMs: cfg.tickIntervalMs });
}

// Ticks poison/burn DoTs on the player — called every frame from Player.tsx
// regardless of rolling. Dodge-roll i-frames deliberately do NOT block an
// already-applied tick (design doc section 6): poison already in your
// system keeps hurting mid-roll, unlike a fresh hit.
export function updateStatusEffects(state: GameState, dtMs: number) {
  const p = state.player;
  for (let i = p.statusEffects.length - 1; i >= 0; i--) {
    const effect = p.statusEffects[i];
    effect.remainingMs -= dtMs;
    if (effect.remainingMs <= 0) {
      p.statusEffects.splice(i, 1);
      continue;
    }
    effect.tickCooldownMs -= dtMs;
    if (effect.tickCooldownMs > 0) continue;
    const cfg = STATUS_EFFECT_CONFIG[effect.type];
    effect.tickCooldownMs = cfg.tickIntervalMs;
    if (p.dead) continue;
    const tickDamage = Math.round(cfg.dps * (cfg.tickIntervalMs / 1000));
    p.hp = Math.max(0, p.hp - tickDamage);
    spawnFloatingText(state, `-${tickDamage}`, p.position.clone().add(new THREE.Vector3(0, 2, 0)), cfg.color);
    if (p.hp <= 0) killPlayer(state);
  }
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

// Auto-respawn (Player.tsx ticks state.player.deathElapsedMs and calls this
// once it passes RESPAWN_DELAY_MS) — drops the player back at this floor's
// own checkpoint (its start-of-floor flame if it has one, otherwise the
// floor's spawn point) and fully restores them, matching the "die, wake up
// at the last flame" loop every Souls game runs on. No cross-area/floor
// travel here (unlike FlamePanel's TRAVEL) — same reasoning as killPlayer's
// own comment: floor layouts aren't seeded, so there is no stable "last
// rested flame" position to travel back to once you've left the floor it
// was generated on.
export function respawnAtCheckpoint(state: GameState) {
  const p = state.player;
  const spot = state.mapData.startFlameSpawn ?? state.mapData.playerSpawn;
  p.position.set(spot.x + 0.5, 0, spot.y + 0.5);
  p.dead = false;
  p.deathElapsedMs = 0;
  p.casting = false;
  p.rolling = false;
  p.blocking = false;
  p.attackActiveMs = 0;
  p.activeMelee = null;
  restAtFlame(state);
}

// Real, unbounded memory leak found 2026-07-26: this pushed a new entry
// (with its own cloned Vector3) for every hit/heal/kill for the entire game
// session — HUD.tsx only ever reads the last 4 via slice(-4), nothing
// anywhere removed old ones. `ageMs` looks like it was meant to drive expiry
// but was never ticked or checked by anything. Reported as progressively
// worsening FPS over a play session (144fps down to 27fps across a few
// back-to-back measurements in the same static scene) — capping here
// instead of adding a new per-frame tick elsewhere, since nothing reads
// more than the last few entries anyway.
const MAX_FLOATING_TEXT = 30;

export function spawnFloatingText(state: GameState, text: string, position: THREE.Vector3, color: string) {
  state.floatingText.push({
    id: state.nextTextId++,
    text,
    position: position.clone(),
    ageMs: 0,
    color,
  });
  if (state.floatingText.length > MAX_FLOATING_TEXT) {
    state.floatingText.splice(0, state.floatingText.length - MAX_FLOATING_TEXT);
  }
}

// Matches Hohenberg's GameScene.ts formula exactly (ENEMY_BASE_DAMAGE tuned
// there to land ~15-20% of level-1 max HP per hit for a SOLDIER).
export function enemyDamageForRole(state: EnemyState): number {
  const cfg = ROLE_CONFIG[state.role];
  return Math.round(ENEMY_BASE_DAMAGE * state.areaDamageMultiplier * cfg.damageMultiplier);
}
