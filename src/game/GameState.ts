import * as THREE from "three";
import { BASE_STATS, getMaxStamina, type PlayerStats } from "./utils/constants";
import { ROLE_CONFIG, type EnemyRole } from "./utils/enemyRoles";
import { getEffectiveMaxHP, type ItemUpgrades } from "./utils/equipment";
import type { ItemSlot } from "./utils/items";
import { ENEMY_BASE_DAMAGE, FLASK_START_CHARGES, type MeleeAction } from "./gameConstants";

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

export type EnemyAIState = "idle" | "chase" | "windup" | "strike" | "recover" | "dead";

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
}

export interface FloatingText {
  id: number;
  text: string;
  position: THREE.Vector3;
  ageMs: number;
  color: string;
}

export interface GameState {
  player: PlayerState;
  enemies: EnemyState[];
  floatingText: FloatingText[];
  nextTextId: number;
}

export function createPlayerState(): PlayerState {
  const stats: PlayerStats = { ...BASE_STATS };
  const equipped: Partial<Record<ItemSlot, string>> = { weapon: "iron_sword", shield: "knight_shield" };
  const upgrades: ItemUpgrades = {};
  const maxHp = getEffectiveMaxHP(stats.vigor, equipped, upgrades);
  const maxStamina = getMaxStamina(stats.endurance);
  return {
    stats,
    equipped,
    upgrades,
    position: new THREE.Vector3(0, 0, 0),
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
  };
}

export function createGameState(): GameState {
  return {
    player: createPlayerState(),
    enemies: [
      createEnemyState("soldier-1", "soldier", new THREE.Vector3(6, 0, -2), 1.0),
      createEnemyState("brute-1", "brute", new THREE.Vector3(-7, 0, 4), 1.0),
      createEnemyState("swarmer-1", "swarmer", new THREE.Vector3(3, 0, 6), 1.0),
    ],
    floatingText: [],
    nextTextId: 0,
  };
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
