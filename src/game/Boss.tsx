import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Mesh, Group } from "three";
import { type BossState, type GameState, spawnFloatingText, spawnGroundHazard, spawnProjectile } from "./GameState";
import { applyDamageReduction } from "./utils/equipment";
import { isWallTile, resolveCollision } from "./maps/collision";
import { bossMovesForType, bossVisualForType, BOSS_COMBAT, TIDEWARDEN_GRAB_TRIGGER_RANGE, TIDEWARDEN_HEAL_PUNISH_WINDOW_MS, type BossMove } from "./utils/bossData";

const BOSS_RADIUS = 0.9;

// The Hollow Wyrm only (feature 5) — every other boss's phase stays "ground"
// forever and never touches this block. Kept modest in scope (see bossData.ts's
// own comment: the flight phase + breath are scripted here rather than being
// BossMoves, since BossMove's shape only covers instant self-centered/lunge/
// ranged hits, not a multi-second untargetable sequence).
const DRAGON_GROUND_PHASE_MS = 16000;
const DRAGON_FLIGHT_DURATION_MS = 4000;
const DRAGON_BREATH_AT_MS = 2000;
const DRAGON_BREATH_HAZARD_COUNT = 5;
const DRAGON_BREATH_SPACING = 1.4;

function hazardColorForBoss(bossType: string): string {
  return `#${bossVisualForType(bossType).tint.toString(16).padStart(6, "0")}`;
}

function stepBossToward(boss: BossState, targetX: number, targetZ: number, dt: number, speed: number, mapData: GameState["mapData"]) {
  const dx = targetX - boss.position.x;
  const dz = targetZ - boss.position.z;
  const len = Math.hypot(dx, dz) || 1;
  boss.position.x += (dx / len) * speed * dt;
  boss.position.z += (dz / len) * speed * dt;
  resolveCollision(mapData, boss.position, BOSS_RADIUS);
}

// Random pick among the boss's move pool, except the Tidewarden (the
// prologue tutorial boss — not reachable from any current AREA_CONFIGS entry,
// but its data/trigger is honored here in case a future area assigns it):
// hugging its legs or healing within the punish window forces its grab
// instead of the normal random arc/slam/sweep pick.
function pickBossMove(boss: BossState, state: GameState, dist: number): number {
  const moves = bossMovesForType(boss.bossType);
  if (boss.bossType === "boss_tidewarden") {
    const healedRecently = performance.now() - state.player.lastHealAtMs <= TIDEWARDEN_HEAL_PUNISH_WINDOW_MS;
    if (dist <= TIDEWARDEN_GRAB_TRIGGER_RANGE || healedRecently) {
      const grabIdx = moves.findIndex((m) => m.lunge && m.unblockable);
      if (grabIdx >= 0) return grabIdx;
    }
  }
  return Math.floor(Math.random() * moves.length);
}

function enterBossWindup(boss: BossState, state: GameState, dist: number) {
  boss.aiState = "windup";
  boss.stateElapsedMs = 0;
  boss.moveIndex = pickBossMove(boss, state, dist);
  boss.windupTargetX = state.player.position.x;
  boss.windupTargetZ = state.player.position.z;
  boss.lungeFromX = boss.position.x;
  boss.lungeFromZ = boss.position.z;
}

function enterBossStrike(boss: BossState, move: BossMove) {
  boss.aiState = "strike";
  boss.stateElapsedMs = 0;
  boss.hasDealtDamageThisStrike = false;
  boss.hasFiredThisStrike = false;
  boss.lastStrikeUnblockable = !!move.unblockable;
  boss.lastStrikeLeavesHazard = !!move.leavesHazard;
}

function enterBossRecover(boss: BossState) {
  boss.aiState = "recover";
  boss.stateElapsedMs = 0;
}

function applyBossHitToPlayer(boss: BossState, state: GameState, move: BossMove) {
  const p = state.player;
  if (p.dead) return;
  if (p.rolling && !move.unblockable) return;
  const raw = Math.round(boss.baseDamage * move.damageMultiplier);
  const dmg = applyDamageReduction(raw, p.equipped, p.upgrades);
  p.hp = Math.max(0, p.hp - dmg);
  p.hitFlashMs = 200;
  spawnFloatingText(state, `${dmg}`, p.position.clone().add(new THREE.Vector3(0, 2, 0)), move.unblockable ? "#ff55ff" : "#ff5555");
  if (p.hp <= 0) p.dead = true;
}

function fireBossProjectile(boss: BossState, state: GameState, move: BossMove) {
  const dx = boss.windupTargetX - boss.position.x;
  const dz = boss.windupTargetZ - boss.position.z;
  const len = Math.hypot(dx, dz) || 1;
  const dmg = Math.round(boss.baseDamage * move.damageMultiplier);
  spawnProjectile(state, boss.position.clone().setY(1.2), new THREE.Vector3(dx / len, 0, dz / len), 6, dmg, 14, hazardColorForBoss(boss.bossType));
}

// Handles the strike itself once the windup(+hold) has elapsed. hasDealtDamageThisStrike
// doubles as "resolved once" — hazard patches drop at the same checkpoint as the direct
// hit regardless of whether that hit actually connected (a slam's lingering patch isn't
// conditional on landing the initial blow).
function resolveBossStrike(boss: BossState, state: GameState, move: BossMove, dist: number) {
  if (move.ranged) {
    if (!boss.hasFiredThisStrike) {
      boss.hasFiredThisStrike = true;
      fireBossProjectile(boss, state, move);
    }
    return;
  }

  if (move.lunge) {
    const t = Math.min(1, boss.stateElapsedMs / move.strikeMs);
    const nx = THREE.MathUtils.lerp(boss.lungeFromX, boss.windupTargetX, t);
    const nz = THREE.MathUtils.lerp(boss.lungeFromZ, boss.windupTargetZ, t);
    if (!isWallTile(state.mapData, Math.floor(nx), Math.floor(boss.position.z))) boss.position.x = nx;
    if (!isWallTile(state.mapData, Math.floor(boss.position.x), Math.floor(nz))) boss.position.z = nz;
  }

  if (!boss.hasDealtDamageThisStrike && boss.stateElapsedMs >= move.strikeMs * 0.5) {
    boss.hasDealtDamageThisStrike = true;
    if (dist <= move.range) applyBossHitToPlayer(boss, state, move);
    if (move.leavesHazard) {
      spawnGroundHazard(state, boss.position, move.range, Math.max(1, Math.round(boss.baseDamage * 0.25)), 4000, hazardColorForBoss(boss.bossType));
    }
  }
}

function updateDragonFlight(boss: BossState, state: GameState, dtMs: number) {
  const before = boss.phaseElapsedMs;
  boss.phaseElapsedMs += dtMs;

  if (before < DRAGON_BREATH_AT_MS && boss.phaseElapsedMs >= DRAGON_BREATH_AT_MS) {
    const p = state.player.position;
    const dx = p.x - boss.position.x;
    const dz = p.z - boss.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const dirX = dx / len;
    const dirZ = dz / len;
    for (let i = 0; i < DRAGON_BREATH_HAZARD_COUNT; i++) {
      const hx = boss.position.x + dirX * DRAGON_BREATH_SPACING * (i + 1);
      const hz = boss.position.z + dirZ * DRAGON_BREATH_SPACING * (i + 1);
      spawnGroundHazard(state, new THREE.Vector3(hx, 0, hz), 1.1, Math.max(1, Math.round(boss.baseDamage * 0.2)), 5000, "#33cc55");
    }
  }

  if (boss.phaseElapsedMs >= DRAGON_FLIGHT_DURATION_MS) {
    boss.phase = "ground";
    boss.phaseElapsedMs = 0;
    boss.aiState = "chase";
    boss.stateElapsedMs = 0;
  }
}

// Idle -> chase -> windup(+hold) -> strike -> recover, the same shape as
// Enemy.ts's mob state machine (see bossData.ts's header comment) but driven
// by BossMove data instead of RoleConfig, with the Dragon's ground/flight
// phase toggle layered on top for that one boss type only.
export function Boss({ state, bossState }: { state: GameState; bossState: BossState }) {
  const groupRef = useRef<Group>(null!);
  const bodyRef = useRef<Mesh>(null!);
  const telegraphRef = useRef<Mesh>(null!);

  useFrame((_, dt) => {
    const boss = bossState;
    if (boss.aiState === "dead") {
      groupRef.current.visible = false;
      return;
    }
    if (state.paused) return;
    const dtMs = dt * 1000;
    if (boss.hitFlashMs > 0) boss.hitFlashMs = Math.max(0, boss.hitFlashMs - dtMs);
    const p = state.player;

    if (boss.phase === "flight") {
      updateDragonFlight(boss, state, dtMs);
      groupRef.current.visible = true;
      groupRef.current.position.set(boss.position.x, Math.sin(Math.min(1, boss.phaseElapsedMs / DRAGON_FLIGHT_DURATION_MS) * Math.PI) * 4, boss.position.z);
      telegraphRef.current.visible = false;
      const mat = bodyRef.current.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(0x33cc55);
      return;
    }

    const toPlayer = new THREE.Vector3().subVectors(p.position, boss.position);
    const dist = toPlayer.length();
    const moves = bossMovesForType(boss.bossType);

    switch (boss.aiState) {
      case "idle":
      case "chase": {
        if (dist > BOSS_COMBAT.aggroRadius) {
          boss.aiState = "idle";
          break;
        }
        if (boss.bossType === "boss_dragon") {
          boss.phaseElapsedMs += dtMs;
          if (boss.phaseElapsedMs >= DRAGON_GROUND_PHASE_MS) {
            boss.phase = "flight";
            boss.phaseElapsedMs = 0;
            break;
          }
        }
        if (dist <= BOSS_COMBAT.attackRange) {
          enterBossWindup(boss, state, dist);
          break;
        }
        boss.aiState = "chase";
        stepBossToward(boss, p.position.x, p.position.z, dt, BOSS_COMBAT.moveSpeed, state.mapData);
        break;
      }
      case "windup": {
        boss.stateElapsedMs += dtMs;
        const move = moves[boss.moveIndex];
        if (boss.stateElapsedMs >= move.windupMs + (move.holdMs ?? 0)) enterBossStrike(boss, move);
        break;
      }
      case "strike": {
        boss.stateElapsedMs += dtMs;
        const move = moves[boss.moveIndex];
        resolveBossStrike(boss, state, move, dist);
        if (boss.stateElapsedMs >= move.strikeMs) enterBossRecover(boss);
        break;
      }
      case "recover": {
        boss.stateElapsedMs += dtMs;
        if (boss.stateElapsedMs >= BOSS_COMBAT.recoverMs) {
          boss.aiState = dist < BOSS_COMBAT.aggroRadius ? "chase" : "idle";
          boss.stateElapsedMs = 0;
        }
        break;
      }
    }

    groupRef.current.visible = true;
    groupRef.current.position.set(boss.position.x, 0, boss.position.z);
    if (dist > 0.01) groupRef.current.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

    const mat = bodyRef.current.material as THREE.MeshStandardMaterial;
    if (boss.hitFlashMs > 0) mat.emissive.setHex(0xffffff);
    else if (boss.aiState === "windup") mat.emissive.setHex(moves[boss.moveIndex]?.unblockable ? 0xff00ff : 0xffaa00);
    else if (boss.aiState === "recover") mat.emissive.setHex(0x222222);
    else mat.emissive.setHex(0x000000);

    const showTelegraph = boss.aiState === "windup" && !moves[boss.moveIndex]?.ranged;
    telegraphRef.current.visible = showTelegraph;
    if (showTelegraph) telegraphRef.current.scale.setScalar(moves[boss.moveIndex].range);
  });

  const visual = bossVisualForType(bossState.bossType);
  const tintColor = `#${visual.tint.toString(16).padStart(6, "0")}`;

  return (
    <group ref={groupRef} position={[bossState.position.x, 0, bossState.position.z]}>
      <mesh ref={bodyRef} position={[0, 1.5, 0]} castShadow>
        <capsuleGeometry args={[0.9, 1.6, 4, 8]} />
        <meshStandardMaterial color={tintColor} emissive="#000000" />
      </mesh>
      {/* Unit ring (radius 1) — scaled per-frame to the active move's range, since
          different boss moves have different reach and are picked at windup-entry. */}
      <mesh ref={telegraphRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} visible={false}>
        <ringGeometry args={[0.9, 1, 24]} />
        <meshBasicMaterial color="#ff4444" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}
