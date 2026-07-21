import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Mesh, Group } from "three";
import { type EnemyState, type GameState, enemyDamageForRole, spawnFloatingText } from "./GameState";
import { ROLE_CONFIG } from "./utils/enemyRoles";
import { applyDamageReduction } from "./utils/equipment";
import { hasLineOfSight } from "./utils/lineOfSight";
import { isWallTile, resolveCollision } from "./maps/collision";
import { findPath } from "./maps/pathfinding";

const ENEMY_RADIUS = 0.4;
const REPATH_INTERVAL_MS = 500;

// Deterministic per-role color so all 21 roles (not just the 3 wired so far)
// read as visually distinct once phase 2 spawns the rest, without needing a
// per-role art pass yet.
function colorForRole(role: string): string {
  let hash = 0;
  for (let i = 0; i < role.length; i++) hash = (hash * 31 + role.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 45%, 35%)`;
}

// Idle -> chase -> windup -> strike -> recover, driven by the exact
// ROLE_CONFIG timings/ranges ported from Hohenberg's enemyRoles.ts. Move
// shape (lunge/aoe/ranged/toad) is not yet differentiated (phase 2 of the 3D
// conversion plan) — every role uses the same single-target frontal strike
// for now. Chase navigation is real, though: direct line-of-sight movement
// when clear, a throttled BFS grid path around corners when it isn't.
export function Enemy({ state, enemyState }: { state: GameState; enemyState: EnemyState }) {
  const groupRef = useRef<Group>(null!);
  const bodyRef = useRef<Mesh>(null!);
  const telegraphRef = useRef<Mesh>(null!);

  useFrame((_, dt) => {
    const e = enemyState;
    const p = state.player;
    if (e.aiState === "dead") {
      groupRef.current.visible = false;
      return;
    }
    const dtMs = dt * 1000;
    const cfg = ROLE_CONFIG[e.role];
    if (e.hitFlashMs > 0) e.hitFlashMs = Math.max(0, e.hitFlashMs - dtMs);

    const toPlayer = new THREE.Vector3().subVectors(p.position, e.position);
    const dist = toPlayer.length();

    // Shield Bash knockback/stun overrides the normal state machine —
    // vulnerable and inert until it expires, then falls back into chase/idle.
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
        if (dist < cfg.aggroRadius) {
          e.aiState = "chase";
          e.stateElapsedMs = 0;
        }
        break;
      case "chase": {
        if (dist <= cfg.attackRange) {
          e.aiState = "windup";
          e.stateElapsedMs = 0;
          e.path = [];
        } else if (dist > cfg.aggroRadius * 1.6) {
          e.aiState = "idle";
          e.path = [];
        } else {
          const mapData = state.mapData;
          const clearLOS = hasLineOfSight(e.position.x, e.position.z, p.position.x, p.position.z, (tx, ty) => isWallTile(mapData, tx, ty));
          let moveDir = new THREE.Vector3();
          if (clearLOS) {
            e.path = [];
            moveDir = toPlayer.clone().setY(0).normalize();
          } else {
            e.repathMs -= dtMs;
            if (e.path.length === 0 && e.repathMs <= 0) {
              const found = findPath(mapData, { x: e.position.x, y: e.position.z }, { x: p.position.x, y: p.position.z });
              e.path = found ?? [];
              e.repathMs = REPATH_INTERVAL_MS;
            }
            if (e.path.length > 0) {
              const wp = e.path[0];
              const toWp = new THREE.Vector3(wp.x - e.position.x, 0, wp.y - e.position.z);
              if (toWp.length() < 0.25) e.path.shift();
              if (toWp.length() > 0.01) moveDir = toWp.normalize();
            }
          }
          e.position.addScaledVector(moveDir, cfg.moveSpeed * dt);
          resolveCollision(mapData, e.position, ENEMY_RADIUS);
        }
        break;
      }
      case "windup": {
        e.stateElapsedMs += dtMs;
        if (e.stateElapsedMs >= cfg.windupMs) {
          e.aiState = "strike";
          e.stateElapsedMs = 0;
          if (dist <= cfg.attackRange + 0.5 && !p.rolling && !p.dead) {
            const raw = enemyDamageForRole(e);
            const dmg = applyDamageReduction(raw, p.equipped, p.upgrades);
            p.hp = Math.max(0, p.hp - dmg);
            p.hitFlashMs = 200;
            spawnFloatingText(state, `${dmg}`, p.position.clone().add(new THREE.Vector3(0, 2, 0)), "#ff5555");
            if (p.hp <= 0) p.dead = true;
          }
        }
        break;
      }
      case "strike": {
        e.stateElapsedMs += dtMs;
        if (e.stateElapsedMs >= cfg.strikeMs) {
          e.aiState = "recover";
          e.stateElapsedMs = 0;
        }
        break;
      }
      case "recover": {
        e.stateElapsedMs += dtMs;
        if (e.stateElapsedMs >= cfg.recoverMs) {
          e.aiState = dist < cfg.aggroRadius * 1.6 ? "chase" : "idle";
          e.stateElapsedMs = 0;
        }
        break;
      }
    }

    groupRef.current.visible = true;
    groupRef.current.position.set(e.position.x, 0, e.position.z);
    if (dist > 0.01) groupRef.current.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

    const mat = bodyRef.current.material as THREE.MeshStandardMaterial;
    if (e.hitFlashMs > 0) mat.emissive.setHex(0xffffff);
    else if (e.aiState === "windup") mat.emissive.setHex(0xffaa00);
    else if (e.aiState === "recover") mat.emissive.setHex(0x222222);
    else mat.emissive.setHex(0x000000);

    telegraphRef.current.visible = e.aiState === "windup";
  });

  const cfg = ROLE_CONFIG[enemyState.role];
  const size = THREE.MathUtils.clamp(0.7 + cfg.hpMultiplier * 0.3, 0.6, 1.6);

  return (
    <group ref={groupRef} position={[enemyState.position.x, 0, enemyState.position.z]}>
      <mesh ref={bodyRef} position={[0, 0.9 * size, 0]} castShadow>
        <capsuleGeometry args={[0.4 * size, 0.8 * size, 4, 8]} />
        <meshStandardMaterial color={colorForRole(enemyState.role)} emissive="#000000" />
      </mesh>
      <mesh ref={telegraphRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} visible={false}>
        <ringGeometry args={[cfg.attackRange - 0.1, cfg.attackRange, 24]} />
        <meshBasicMaterial color="#ff4444" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}
