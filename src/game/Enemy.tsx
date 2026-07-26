import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Mesh, Group } from "three";
import { type EnemyState, type GameState, enemyDamageForRole, spawnFloatingText, spawnProjectile, killPlayer, tickChill, chillSlowMultiplier } from "./GameState";
import {
  ROLE_CONFIG,
  ARCHER_RETREAT_TRIGGER_DIST,
  ARCHER_RETREAT_RELEASE_DIST,
  ARCHER_RETREAT_SPEED,
  ARCHER_LOS_CHECK_INTERVAL_MS,
  ARCHER_PROJECTILE_SPEED,
  ARCHER_PROJECTILE_MAX_RANGE,
  WOLF_CIRCLE_ENTER_DIST,
  WOLF_CIRCLE_RADIUS_MIN,
  WOLF_CIRCLE_RADIUS_MAX,
  WOLF_COMMIT_MIN_MS,
  WOLF_COMMIT_MAX_MS,
  WOLF_DIRECT_APPROACH_WINDUP_DIST,
  WOLF_RECOVER_HOP_DIST,
  TOAD_HOP_DIST,
  TOAD_HOP_DURATION_MS,
  TOAD_HOP_PAUSE_MS,
  TOAD_LOB_ARC_HEIGHT,
} from "./utils/enemyRoles";
import { applyDamageReduction } from "./utils/equipment";
import { PROJECTILE_EFFECT_BY_TYPE } from "./utils/statusEffects";
import { hasLineOfSight } from "./utils/lineOfSight";
import { isWallTile, resolveCollision } from "./maps/collision";
import { findPath } from "./maps/pathfinding";
import { BLOCK_DAMAGE_REDUCTION, clampDt } from "./gameConstants";

export const ENEMY_RADIUS = 0.4;
const REPATH_INTERVAL_MS = 500;

function colorForRole(role: string): string {
  let hash = 0;
  for (let i = 0; i < role.length; i++) hash = (hash * 31 + role.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 45%, 35%)`;
}

function isWall(mapData: GameState["mapData"], x: number, z: number): boolean {
  return isWallTile(mapData, Math.floor(x), Math.floor(z));
}

function stepToward(e: EnemyState, targetX: number, targetZ: number, dt: number, speed: number, mapData: GameState["mapData"]): boolean {
  const dx = targetX - e.position.x;
  const dz = targetZ - e.position.z;
  const len = Math.hypot(dx, dz) || 1;
  const before = { x: e.position.x, z: e.position.z };
  e.position.x += (dx / len) * speed * dt;
  e.position.z += (dz / len) * speed * dt;
  resolveCollision(mapData, e.position, ENEMY_RADIUS);
  return Math.hypot(e.position.x - before.x, e.position.z - before.z) > 0.001;
}

function enterWindup(e: EnemyState, state: GameState) {
  e.aiState = "windup";
  e.stateElapsedMs = 0;
  e.windupTargetX = state.player.position.x;
  e.windupTargetZ = state.player.position.z;
  e.lungeFromX = e.position.x;
  e.lungeFromZ = e.position.z;
}

function enterStrike(e: EnemyState) {
  e.aiState = "strike";
  e.stateElapsedMs = 0;
  e.hasDealtDamageThisStrike = false;
  e.hasFiredThisStrike = false;
}

function enterRecover(e: EnemyState, state: GameState) {
  e.aiState = "recover";
  e.stateElapsedMs = 0;
  if (e.role === "wolf") {
    const p = state.player.position;
    const dx = e.position.x - p.x;
    const dz = e.position.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    e.wolfHopFromX = e.position.x;
    e.wolfHopFromZ = e.position.z;
    e.wolfHopTargetX = e.position.x + (dx / len) * WOLF_RECOVER_HOP_DIST;
    e.wolfHopTargetZ = e.position.z + (dz / len) * WOLF_RECOVER_HOP_DIST;
    e.wolfHopValid = !isWall(state.mapData, e.wolfHopTargetX, e.wolfHopTargetZ);
    e.wolfCommitElapsedMs = 0;
    e.wolfCommitThresholdMs = 0;
    e.wolfCircleRadius = 0;
  }
}

function applyMeleeHitToPlayer(e: EnemyState, state: GameState, damageMultiplier: number) {
  const p = state.player;
  if (p.rolling || p.dead) return;
  const raw = Math.round(enemyDamageForRole(e) * damageMultiplier);
  let dmg = applyDamageReduction(raw, p.equipped, p.upgrades);
  if (p.blocking) dmg = Math.round(dmg * (1 - BLOCK_DAMAGE_REDUCTION));
  p.hp = Math.max(0, p.hp - dmg);
  p.hitFlashMs = 200;
  spawnFloatingText(state, `${dmg}`, p.position.clone().add(new THREE.Vector3(0, 2, 0)), "#ff5555");
  if (p.hp <= 0) killPlayer(state);
}

// ---- Chase (default melee roles) ----
function updateChase(e: EnemyState, state: GameState, dist: number, dt: number, dtMs: number) {
  const cfg = ROLE_CONFIG[e.role];
  if (dist <= cfg.attackRange) {
    e.aiState = "windup";
    enterWindup(e, state);
    e.path = [];
    return;
  }
  const mapData = state.mapData;
  const p = state.player.position;
  const clearLOS = hasLineOfSight(e.position.x, e.position.z, p.x, p.z, (tx, ty) => isWallTile(mapData, tx, ty));
  const speed = cfg.moveSpeed * chillSlowMultiplier(e);
  if (clearLOS) {
    e.path = [];
    stepToward(e, p.x, p.z, dt, speed, mapData);
  } else {
    e.repathMs -= dtMs;
    if (e.path.length === 0 && e.repathMs <= 0) {
      const found = findPath(mapData, { x: e.position.x, y: e.position.z }, { x: p.x, y: p.z });
      e.path = found ?? [];
      e.repathMs = REPATH_INTERVAL_MS;
    }
    if (e.path.length > 0) {
      const wp = e.path[0];
      if (Math.hypot(wp.x - e.position.x, wp.y - e.position.z) < 0.25) e.path.shift();
      else stepToward(e, wp.x, wp.y, dt, speed, mapData);
    }
  }
}

// ---- Archer/Wyrmling (moveShape "ranged") ----
function updateArcherAggro(e: EnemyState, state: GameState, dist: number, dt: number, dtMs: number) {
  const p = state.player.position;
  const wasRetreating = e.aiState === "retreat" || e.aiState === "cower";
  const shouldRetreat = wasRetreating ? dist <= ARCHER_RETREAT_RELEASE_DIST : dist < ARCHER_RETREAT_TRIGGER_DIST;
  const mapData = state.mapData;

  if (shouldRetreat) {
    e.sidestepTargetX = undefined;
    e.sidestepTargetZ = undefined;
    const dx = e.position.x - p.x;
    const dz = e.position.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    const moved = stepToward(e, e.position.x + (dx / len), e.position.z + (dz / len), dt, ARCHER_RETREAT_SPEED * chillSlowMultiplier(e), mapData);
    e.aiState = moved ? "retreat" : "cower";
    return;
  }

  e.aiState = "chase"; // "aggro" — reusing the chase slot for "engaged, not yet windup-ready"
  // Sidestep-when-an-ally-blocks-the-shot is not yet triggered anywhere
  // (needs an isBlockingFiringLine check against other enemies, deferred) —
  // this only advances an in-flight sidestep if one's already set.
  if (e.sidestepTargetX !== undefined && e.sidestepTargetZ !== undefined) {
    const dx = e.sidestepTargetX - e.position.x;
    const dz = e.sidestepTargetZ - e.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) {
      e.sidestepTargetX = undefined;
      e.sidestepTargetZ = undefined;
    } else {
      stepToward(e, e.sidestepTargetX, e.sidestepTargetZ, dt, ARCHER_RETREAT_SPEED * chillSlowMultiplier(e), mapData);
    }
    return;
  }

  e.losRecheckMs -= dtMs;
  if (e.losRecheckMs <= 0) {
    e.losRecheckMs = ARCHER_LOS_CHECK_INTERVAL_MS;
    e.losClear = hasLineOfSight(e.position.x, e.position.z, p.x, p.z, (tx, ty) => isWallTile(mapData, tx, ty));
  }
  if (!e.losClear) return;

  enterWindup(e, state);
}

function fireRangedShot(e: EnemyState, state: GameState) {
  const cfg = ROLE_CONFIG[e.role];
  const dx = e.windupTargetX - e.position.x;
  const dz = e.windupTargetZ - e.position.z;
  const len = Math.hypot(dx, dz) || 1;
  const dmg = Math.round(enemyDamageForRole(e));
  spawnProjectile(
    state,
    "enemy",
    e.position.clone().setY(0.9),
    new THREE.Vector3(dx / len, 0, dz / len),
    ARCHER_PROJECTILE_SPEED,
    dmg,
    ARCHER_PROJECTILE_MAX_RANGE,
    "#88ddff",
    undefined,
    undefined,
    PROJECTILE_EFFECT_BY_TYPE[e.type]
  );
  void cfg;
}

// ---- Wolf (bespoke circle-strafe aggro; strike/recover use moveShape "lunge") ----
function updateWolfAggro(e: EnemyState, state: GameState, dist: number, dt: number, dtMs: number) {
  const cfg = ROLE_CONFIG[e.role];
  const speed = cfg.moveSpeed * chillSlowMultiplier(e);
  const p = state.player.position;
  const mapData = state.mapData;
  if (e.wolfCircleDir === 0) e.wolfCircleDir = Math.random() < 0.5 ? 1 : -1;
  e.aiState = "chase";

  if (dist > WOLF_CIRCLE_ENTER_DIST) {
    e.wolfCommitElapsedMs = 0;
    e.wolfCommitThresholdMs = 0;
    e.wolfCircleRadius = 0;
    stepToward(e, p.x, p.z, dt, speed, mapData);
    return;
  }

  if (e.wolfCircleRadius === 0) e.wolfCircleRadius = WOLF_CIRCLE_RADIUS_MIN + Math.random() * (WOLF_CIRCLE_RADIUS_MAX - WOLF_CIRCLE_RADIUS_MIN);
  if (e.wolfCommitThresholdMs === 0) e.wolfCommitThresholdMs = WOLF_COMMIT_MIN_MS + Math.random() * (WOLF_COMMIT_MAX_MS - WOLF_COMMIT_MIN_MS);

  const angle = Math.atan2(e.position.z - p.z, e.position.x - p.x);
  const angularSpeed = speed / e.wolfCircleRadius;
  const newAngle = angle + e.wolfCircleDir * angularSpeed * dt;
  const targetX = p.x + Math.cos(newAngle) * e.wolfCircleRadius;
  const targetZ = p.z + Math.sin(newAngle) * e.wolfCircleRadius;
  const moved = stepToward(e, targetX, targetZ, dt, speed, mapData);

  if (!moved) {
    if (dist <= WOLF_DIRECT_APPROACH_WINDUP_DIST) enterWindup(e, state);
    return;
  }
  e.wolfCommitElapsedMs += dtMs;
  if (e.wolfCommitElapsedMs >= e.wolfCommitThresholdMs) enterWindup(e, state);
}

// ---- Toad (hop-pause aggro; own lobbed shot) ----
function updateToadAggro(e: EnemyState, state: GameState, dist: number, dt: number) {
  const cfg = ROLE_CONFIG[e.role];
  const p = state.player.position;
  const mapData = state.mapData;
  e.aiState = "chase";

  if (dist <= cfg.attackRange) {
    e.toadHopping = false;
    enterWindup(e, state);
    return;
  }

  if (e.toadHopping) {
    e.toadHopElapsedMs += dt * 1000;
    const t = Math.min(1, e.toadHopElapsedMs / TOAD_HOP_DURATION_MS);
    e.position.x = THREE.MathUtils.lerp(e.toadHopFromX, e.toadHopTargetX, t);
    e.position.z = THREE.MathUtils.lerp(e.toadHopFromZ, e.toadHopTargetZ, t);
    if (t >= 1) {
      e.toadHopping = false;
      e.toadPauseElapsedMs = 0;
    }
    return;
  }

  e.toadPauseElapsedMs += dt * 1000;
  if (e.toadPauseElapsedMs < TOAD_HOP_PAUSE_MS) return;

  const dx = p.x - e.position.x;
  const dz = p.z - e.position.z;
  const len = Math.hypot(dx, dz) || 1;
  const tx = e.position.x + (dx / len) * TOAD_HOP_DIST;
  const tz = e.position.z + (dz / len) * TOAD_HOP_DIST;
  if (isWall(mapData, tx, tz)) return;
  e.toadHopFromX = e.position.x;
  e.toadHopFromZ = e.position.z;
  e.toadHopTargetX = tx;
  e.toadHopTargetZ = tz;
  e.toadHopping = true;
  e.toadHopElapsedMs = 0;
}

function fireToadShot(e: EnemyState, state: GameState) {
  const dx = e.windupTargetX - e.position.x;
  const dz = e.windupTargetZ - e.position.z;
  const len = Math.hypot(dx, dz) || 1;
  const dmg = Math.round(enemyDamageForRole(e));
  spawnProjectile(state, "enemy", e.position.clone().setY(0.5), new THREE.Vector3(dx / len, 0, dz / len), 5, dmg, len, "#66ff44", TOAD_LOB_ARC_HEIGHT, undefined, PROJECTILE_EFFECT_BY_TYPE[e.type]);
}

// Idle -> chase -> windup -> strike -> recover, driven by ROLE_CONFIG timings.
// Move shape (RoleConfig.moveShape) dispatches the strike itself: lunge
// travels to the locked windup target, aoe uses a wider self-centered
// radius, ranged/toad fire a pooled projectile instead of a melee check.
// Archer/wyrmling and Wolf/Toad additionally own their own pre-windup aggro
// behavior (retreat+sidestep; circle-strafe; hop-pause) instead of the
// shared straight-line/pathfound chase every other role uses.
export function Enemy({ state, enemyState }: { state: GameState; enemyState: EnemyState }) {
  const groupRef = useRef<Group>(null!);
  const bodyRef = useRef<Mesh>(null!);
  const telegraphRef = useRef<Mesh>(null!);

  useFrame((_, rawDt) => {
    const dt = clampDt(rawDt);
    const e = enemyState;
    const p = state.player;
    if (e.aiState === "dead") {
      groupRef.current.visible = false;
      return;
    }
    if (state.paused) return;
    const dtMs = dt * 1000;
    const cfg = ROLE_CONFIG[e.role];
    if (e.hitFlashMs > 0) e.hitFlashMs = Math.max(0, e.hitFlashMs - dtMs);
    tickChill(e, dtMs);

    // Plain numbers, not a THREE.Vector3 — this runs unconditionally for every
    // enemy on the floor every frame (even idle, off-screen ones), and floor
    // enemy counts now scale with the bigger 2026-07-26 maps (2-3 per room
    // across many more rooms, plus wolves/archers/toads/etc on top). A fresh
    // Vector3 per enemy per frame at that count was real, constant GC
    // pressure that scaled directly with map size, on top of the pathfinding
    // GC bug already fixed earlier this session.
    const toPlayerX = p.position.x - e.position.x;
    const toPlayerZ = p.position.z - e.position.z;
    const dist = Math.hypot(toPlayerX, toPlayerZ);

    if (e.stunnedMs > 0) {
      e.stunnedMs = Math.max(0, e.stunnedMs - dtMs);
      groupRef.current.visible = true;
      groupRef.current.position.set(e.position.x, 0, e.position.z);
      const mat = bodyRef.current.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(e.hitFlashMs > 0 ? 0xffffff : 0x4444ff);
      telegraphRef.current.visible = false;
      if (e.stunnedMs <= 0) {
        e.aiState = dist < cfg.aggroRadius * 1.6 ? "chase" : "idle";
        e.stateElapsedMs = 0;
      }
      return;
    }

    switch (e.aiState) {
      case "idle":
      case "chase":
      case "retreat":
      case "cower": {
        if (dist > cfg.aggroRadius) {
          e.aiState = "idle";
          e.wolfCircleDir = 0;
          e.path = [];
        } else if (e.role === "archer" || e.role === "wyrmling") {
          updateArcherAggro(e, state, dist, dt, dtMs);
        } else if (e.role === "wolf") {
          updateWolfAggro(e, state, dist, dt, dtMs);
        } else if (e.role === "toad") {
          updateToadAggro(e, state, dist, dt);
        } else {
          updateChase(e, state, dist, dt, dtMs);
        }
        break;
      }
      case "windup": {
        e.stateElapsedMs += dtMs;
        if (e.stateElapsedMs >= cfg.windupMs) enterStrike(e);
        break;
      }
      case "strike": {
        e.stateElapsedMs += dtMs;
        switch (cfg.moveShape) {
          case "ranged":
            if (!e.hasFiredThisStrike) {
              e.hasFiredThisStrike = true;
              fireRangedShot(e, state);
            }
            break;
          case "toad":
            if (!e.hasFiredThisStrike) {
              e.hasFiredThisStrike = true;
              fireToadShot(e, state);
            }
            break;
          case "lunge": {
            // Same radius-blind point check the boss's own lunge had — see
            // Boss.tsx's resolveBossStrike comment. resolveCollision keeps
            // the enemy's actual capsule (ENEMY_RADIUS) from sinking into
            // the wall face instead of only stopping once its center tile
            // flips to "wall".
            const t = Math.min(1, e.stateElapsedMs / cfg.strikeMs);
            e.position.x = THREE.MathUtils.lerp(e.lungeFromX, e.windupTargetX, t);
            e.position.z = THREE.MathUtils.lerp(e.lungeFromZ, e.windupTargetZ, t);
            resolveCollision(state.mapData, e.position, ENEMY_RADIUS);
            if (!e.hasDealtDamageThisStrike && e.stateElapsedMs >= cfg.strikeMs * 0.5 && dist <= cfg.attackRange) {
              e.hasDealtDamageThisStrike = true;
              applyMeleeHitToPlayer(e, state, 1);
            }
            break;
          }
          case "aoe": {
            const range = cfg.aoeRadius ?? cfg.attackRange;
            if (!e.hasDealtDamageThisStrike && e.stateElapsedMs >= cfg.strikeMs * 0.5 && dist <= range) {
              e.hasDealtDamageThisStrike = true;
              applyMeleeHitToPlayer(e, state, 1);
            }
            break;
          }
          default:
            if (!e.hasDealtDamageThisStrike && e.stateElapsedMs >= cfg.strikeMs * 0.5 && dist <= cfg.attackRange) {
              e.hasDealtDamageThisStrike = true;
              applyMeleeHitToPlayer(e, state, 1);
            }
            break;
        }
        if (e.stateElapsedMs >= cfg.strikeMs) enterRecover(e, state);
        break;
      }
      case "recover": {
        e.stateElapsedMs += dtMs;
        if (e.role === "wolf" && e.wolfHopValid) {
          const t = Math.min(1, e.stateElapsedMs / cfg.recoverMs);
          e.position.x = THREE.MathUtils.lerp(e.wolfHopFromX, e.wolfHopTargetX, t);
          e.position.z = THREE.MathUtils.lerp(e.wolfHopFromZ, e.wolfHopTargetZ, t);
        }
        if (e.stateElapsedMs >= cfg.recoverMs) {
          e.aiState = dist < cfg.aggroRadius * 1.6 ? "chase" : "idle";
          e.stateElapsedMs = 0;
        }
        break;
      }
    }

    groupRef.current.visible = true;
    groupRef.current.position.set(e.position.x, 0, e.position.z);
    if (dist > 0.01) groupRef.current.rotation.y = Math.atan2(toPlayerX, toPlayerZ);

    const mat = bodyRef.current.material as THREE.MeshStandardMaterial;
    if (e.hitFlashMs > 0) mat.emissive.setHex(0xffffff);
    else if (e.aiState === "windup") mat.emissive.setHex(0xffaa00);
    else if (e.aiState === "recover") mat.emissive.setHex(0x222222);
    else if (e.aiState === "cower") mat.emissive.setHex(0x111133);
    else mat.emissive.setHex(0x000000);

    telegraphRef.current.visible = e.aiState === "windup" && cfg.moveShape !== "ranged" && cfg.moveShape !== "toad";
  });

  const cfg = ROLE_CONFIG[enemyState.role];
  const size = THREE.MathUtils.clamp(0.7 + cfg.hpMultiplier * 0.3, 0.6, 1.6);
  const telegraphRadius = cfg.moveShape === "aoe" ? cfg.aoeRadius ?? cfg.attackRange : cfg.attackRange;

  return (
    <group ref={groupRef} position={[enemyState.position.x, 0, enemyState.position.z]}>
      <mesh ref={bodyRef} position={[0, 0.9 * size, 0]} castShadow>
        <capsuleGeometry args={[0.4 * size, 0.8 * size, 4, 8]} />
        <meshStandardMaterial color={colorForRole(enemyState.role)} emissive="#000000" />
      </mesh>
      <mesh ref={telegraphRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} visible={false}>
        <ringGeometry args={[Math.max(0.1, telegraphRadius - 0.1), telegraphRadius, 24]} />
        <meshBasicMaterial color="#ff4444" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}
