import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Mesh, Group } from "three";
import { type EnemyState, type GameState, enemyDamageForRole, spawnFloatingText } from "./GameState";
import { ROLE_CONFIG } from "./utils/enemyRoles";
import { applyDamageReduction } from "./utils/equipment";

const ROLE_COLOR: Record<string, string> = {
  soldier: "#8a3a3a",
  brute: "#5a3a7a",
  swarmer: "#3a7a5a",
};

// Idle -> chase -> windup -> strike -> recover, driven by the exact
// ROLE_CONFIG timings/ranges ported from Hohenberg's enemyRoles.ts. Move
// shape (lunge/aoe/ranged) is not yet differentiated in this first 3D slice —
// every role uses the same single-target frontal strike for now.
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
        } else if (dist > cfg.aggroRadius * 1.6) {
          e.aiState = "idle";
        } else {
          toPlayer.normalize();
          e.position.addScaledVector(toPlayer, cfg.moveSpeed * dt);
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
  const size = enemyState.role === "brute" ? 1.3 : enemyState.role === "swarmer" ? 0.7 : 1.0;

  return (
    <group ref={groupRef} position={[enemyState.position.x, 0, enemyState.position.z]}>
      <mesh ref={bodyRef} position={[0, 0.9 * size, 0]} castShadow>
        <capsuleGeometry args={[0.4 * size, 0.8 * size, 4, 8]} />
        <meshStandardMaterial color={ROLE_COLOR[enemyState.role] ?? "#8a3a3a"} emissive="#000000" />
      </mesh>
      <mesh ref={telegraphRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} visible={false}>
        <ringGeometry args={[cfg.attackRange - 0.1, cfg.attackRange, 24]} />
        <meshBasicMaterial color="#ff4444" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}
