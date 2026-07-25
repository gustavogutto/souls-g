import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Mesh } from "three";
import { type GameState, spawnFloatingText, killPlayer, handleSpecialEnemyDeath, handleBossDefeatReward, applyChill, applyStatusEffect } from "./GameState";
import { applyDamageReduction, applySoulsGainModifier } from "./utils/equipment";
import { isWallTile } from "./maps/collision";
import { PROJECTILE_POOL_SIZE, SOULS_PER_KILL, SOULS_PER_BOSS, BLOCK_DAMAGE_REDUCTION } from "./gameConstants";

const HIT_RADIUS = 0.45;
const HOMING_RANGE = 6; // units — Ashmote's "6-unit cone" per design doc section 5
const HOMING_HALF_ANGLE = (60 * Math.PI) / 180;

// Weak steering toward the nearest living enemy inside the projectile's
// forward detection cone, capped at homingDegPerSec of turn per second —
// Ashmote's signature (design doc: "90 deg/sec turn, 6-unit cone").
function applyHoming(proj: { position: THREE.Vector3; dir: THREE.Vector3; homingDegPerSec?: number }, state: GameState, dt: number) {
  if (!proj.homingDegPerSec) return;
  let best: THREE.Vector3 | null = null;
  let bestDist = HOMING_RANGE;
  for (const enemy of state.enemies) {
    if (enemy.aiState === "dead") continue;
    const to = new THREE.Vector3().subVectors(enemy.position, proj.position);
    const dist = to.length();
    if (dist > bestDist) continue;
    to.normalize();
    if (proj.dir.dot(to) < Math.cos(HOMING_HALF_ANGLE)) continue;
    bestDist = dist;
    best = to;
  }
  if (!best) return;
  const maxTurn = (proj.homingDegPerSec * Math.PI) / 180 * dt;
  const angle = proj.dir.angleTo(best);
  if (angle < 1e-4) return;
  proj.dir.lerp(best, Math.min(1, maxTurn / angle)).normalize();
}

// A fixed pool of always-mounted meshes (matching Hohenberg's own
// PROJECTILE_POOL_SIZE) driven entirely from state.projectiles via refs —
// no React reconciliation per shot, same pattern as every other entity here.
export function Projectiles({ state }: { state: GameState }) {
  const meshRefs = useRef<(Mesh | null)[]>([]);

  useFrame((_, dt) => {
    if (state.paused) return;
    const list = state.projectiles;
    const p = state.player;

    for (let i = list.length - 1; i >= 0; i--) {
      const proj = list[i];
      if (proj.owner === "player") applyHoming(proj, state, dt);
      proj.position.addScaledVector(proj.dir, proj.speed * dt);
      proj.traveled += proj.speed * dt;

      let remove = false;
      if (isWallTile(state.mapData, Math.floor(proj.position.x), Math.floor(proj.position.z))) {
        remove = true;
      } else if (proj.traveled >= proj.maxRange) {
        remove = true;
      } else if (proj.owner === "enemy") {
        if (!p.dead && !p.rolling) {
          const dx = proj.position.x - p.position.x;
          const dz = proj.position.z - p.position.z;
          if (Math.hypot(dx, dz) < HIT_RADIUS) {
            let dmg = applyDamageReduction(proj.damage, p.equipped, p.upgrades);
            if (p.blocking) dmg = Math.round(dmg * (1 - BLOCK_DAMAGE_REDUCTION));
            p.hp = Math.max(0, p.hp - dmg);
            p.hitFlashMs = 200;
            spawnFloatingText(state, `${dmg}`, p.position.clone().add(new THREE.Vector3(0, 2, 0)), "#ff5555");
            if (proj.effectType === "chill") applyChill(p, 1);
            else if (proj.effectType) applyStatusEffect(p, proj.effectType);
            if (p.hp <= 0) killPlayer(state);
            remove = true;
          }
        }
      } else {
        for (const enemy of state.enemies) {
          if (enemy.aiState === "dead") continue;
          const dx = proj.position.x - enemy.position.x;
          const dz = proj.position.z - enemy.position.z;
          if (Math.hypot(dx, dz) >= HIT_RADIUS) continue;
          enemy.hp = Math.max(0, enemy.hp - proj.damage);
          enemy.hitFlashMs = 150;
          spawnFloatingText(state, `${proj.damage}`, enemy.position.clone().add(new THREE.Vector3(0, 2, 0)), "#8ec4ff");
          if (enemy.hp <= 0 && !handleSpecialEnemyDeath(state, enemy)) {
            enemy.aiState = "dead";
            const souls = applySoulsGainModifier(SOULS_PER_KILL, p.equipped, p.upgrades);
            p.stats.souls += souls;
            spawnFloatingText(state, `SLAIN — +${souls} souls`, enemy.position.clone().add(new THREE.Vector3(0, 2.4, 0)), "#ff5555");
          } else if (proj.chillStacksOnHit) {
            // Moonfrost Lance — only on a non-killing hit, matching the 2D
            // source (an already-destroyed enemy has nothing left to chill).
            applyChill(enemy, proj.chillStacksOnHit);
          }
          remove = true;
          break;
        }
        const boss = state.boss;
        if (!remove && boss && boss.hp > 0 && boss.aiState !== "dead" && boss.phase !== "flight") {
          const dx = proj.position.x - boss.position.x;
          const dz = proj.position.z - boss.position.z;
          if (Math.hypot(dx, dz) < HIT_RADIUS) {
            boss.hp = Math.max(0, boss.hp - proj.damage);
            boss.hitFlashMs = 150;
            spawnFloatingText(state, `${proj.damage}`, boss.position.clone().add(new THREE.Vector3(0, 2.4, 0)), "#8ec4ff");
            if (boss.hp <= 0) {
              boss.aiState = "dead";
              state.gateLocked = false;
              handleBossDefeatReward(state);
              const souls = applySoulsGainModifier(SOULS_PER_BOSS, p.equipped, p.upgrades);
              p.stats.souls += souls;
              spawnFloatingText(state, `SLAIN — +${souls} souls`, boss.position.clone().add(new THREE.Vector3(0, 3, 0)), "#ff5555");
            }
            remove = true;
          }
        }
      }
      if (remove) list.splice(i, 1);
    }

    for (let i = 0; i < PROJECTILE_POOL_SIZE; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      const proj = list[i];
      if (!proj) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      const arcT = proj.arcHeight ? Math.sin(Math.min(1, proj.traveled / proj.maxRange) * Math.PI) * proj.arcHeight * 0.08 : 0;
      mesh.position.set(proj.position.x, 0.9 + arcT, proj.position.z);
      (mesh.material as THREE.MeshStandardMaterial).color.set(proj.color);
    }
  });

  return (
    <group>
      {Array.from({ length: PROJECTILE_POOL_SIZE }).map((_, i) => (
        <mesh key={i} ref={(el) => { meshRefs.current[i] = el; }} visible={false}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color="#ffcc55" emissive="#ff8800" emissiveIntensity={0.6} />
        </mesh>
      ))}
    </group>
  );
}
