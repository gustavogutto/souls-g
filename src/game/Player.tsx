import { useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Mesh, Group } from "three";
import { type GameState, spawnFloatingText } from "./GameState";
import { computeWeaponDamage, getEffectiveMoveSpeed, getEffectiveStaminaRegenPerSec } from "./utils/equipment";
import { STAMINA_REGEN_PER_SEC } from "./utils/constants";
import { PLAYER_SPEED, LIGHT_ATTACK, ROLL_DISTANCE, ROLL_DURATION_MS, ROLL_STAMINA_COST } from "./gameConstants";
import { ARENA_HALF_SIZE } from "./Arena";
import type { KeyboardState } from "./useKeyboard";

const ATTACK_ARC_COS = Math.cos((70 * Math.PI) / 180); // +/-70 deg frontal cone

export function Player({ state, keys }: { state: GameState; keys: RefObject<KeyboardState> }) {
  const groupRef = useRef<Group>(null!);
  const bodyRef = useRef<Mesh>(null!);
  const attackPrevRef = useRef(false);
  const rollPrevRef = useRef(false);

  useFrame((_, dt) => {
    const p = state.player;
    if (p.dead) return;
    const dtMs = dt * 1000;
    const k = keys.current;

    // Stamina regen (paused briefly by rolling/attacking, matching Hohenberg's feel)
    const regen = getEffectiveStaminaRegenPerSec(STAMINA_REGEN_PER_SEC, p.equipped, p.upgrades);
    if (!p.rolling) p.stamina = Math.min(p.maxStamina, p.stamina + regen * dt);

    // Cooldown timers
    if (p.attackCooldownMs > 0) p.attackCooldownMs = Math.max(0, p.attackCooldownMs - dtMs);
    if (p.attackActiveMs > 0) p.attackActiveMs = Math.max(0, p.attackActiveMs - dtMs);
    if (p.hitFlashMs > 0) p.hitFlashMs = Math.max(0, p.hitFlashMs - dtMs);

    // Roll (dodge) — edge-triggered, i-frames not modeled yet in this slice
    const rollPressed = k.roll && !rollPrevRef.current;
    rollPrevRef.current = k.roll;
    if (rollPressed && !p.rolling && p.stamina >= ROLL_STAMINA_COST) {
      let dirX = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      let dirZ = (k.back ? 1 : 0) - (k.forward ? 1 : 0);
      if (dirX === 0 && dirZ === 0) {
        dirX = Math.sin(p.facing);
        dirZ = Math.cos(p.facing);
      }
      const len = Math.hypot(dirX, dirZ) || 1;
      p.rollDir.set(dirX / len, 0, dirZ / len);
      p.rolling = true;
      p.rollElapsedMs = 0;
      p.stamina -= ROLL_STAMINA_COST;
    }

    if (p.rolling) {
      p.rollElapsedMs += dtMs;
      const speed = ROLL_DISTANCE / (ROLL_DURATION_MS / 1000);
      p.position.addScaledVector(p.rollDir, speed * dt);
      p.facing = Math.atan2(p.rollDir.x, p.rollDir.z);
      if (p.rollElapsedMs >= ROLL_DURATION_MS) p.rolling = false;
    } else {
      // Normal movement, fixed world axes (matches Hohenberg's non-camera-relative feel)
      let moveX = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      let moveZ = (k.back ? 1 : 0) - (k.forward ? 1 : 0);
      if (moveX !== 0 || moveZ !== 0) {
        const len = Math.hypot(moveX, moveZ);
        moveX /= len;
        moveZ /= len;
        let speed = getEffectiveMoveSpeed(PLAYER_SPEED, p.equipped, p.upgrades);
        if (k.sprint) speed *= 1.4;
        p.position.x += moveX * speed * dt;
        p.position.z += moveZ * speed * dt;
        p.facing = Math.atan2(moveX, moveZ);
      }

      // Attack — edge-triggered
      const attackPressed = k.attack && !attackPrevRef.current;
      if (attackPressed && p.attackCooldownMs <= 0 && p.stamina >= LIGHT_ATTACK.staminaCost) {
        p.stamina -= LIGHT_ATTACK.staminaCost;
        p.attackCooldownMs = LIGHT_ATTACK.cooldownMs;
        p.attackActiveMs = 150;
        p.attackHitApplied = false;
      }
    }
    attackPrevRef.current = k.attack;

    // Resolve the swing's single hit window
    if (p.attackActiveMs > 0 && !p.attackHitApplied) {
      const forward = new THREE.Vector3(Math.sin(p.facing), 0, Math.cos(p.facing));
      for (const enemy of state.enemies) {
        if (enemy.aiState === "dead") continue;
        const toEnemy = new THREE.Vector3().subVectors(enemy.position, p.position);
        const dist = toEnemy.length();
        if (dist > LIGHT_ATTACK.range + 0.6) continue;
        toEnemy.normalize();
        if (forward.dot(toEnemy) < ATTACK_ARC_COS) continue;
        const dmg = Math.round(computeWeaponDamage(p.stats, p.equipped, p.upgrades) * LIGHT_ATTACK.damageMultiplier);
        enemy.hp = Math.max(0, enemy.hp - dmg);
        enemy.hitFlashMs = 150;
        spawnFloatingText(state, `${dmg}`, enemy.position.clone().add(new THREE.Vector3(0, 2, 0)), "#ffcc55");
        if (enemy.hp <= 0) {
          enemy.aiState = "dead";
          spawnFloatingText(state, "SLAIN", enemy.position.clone().add(new THREE.Vector3(0, 2.4, 0)), "#ff5555");
        }
      }
      p.attackHitApplied = true;
    }

    // Clamp to arena
    const bound = ARENA_HALF_SIZE - 1;
    p.position.x = THREE.MathUtils.clamp(p.position.x, -bound, bound);
    p.position.z = THREE.MathUtils.clamp(p.position.z, -bound, bound);

    // Push to the render objects
    groupRef.current.position.set(p.position.x, 0, p.position.z);
    groupRef.current.rotation.y = p.facing;

    const mat = bodyRef.current.material as THREE.MeshStandardMaterial;
    if (p.hitFlashMs > 0) mat.emissive.setHex(0xff2222);
    else if (p.attackActiveMs > 0) mat.emissive.setHex(0x66aaff);
    else mat.emissive.setHex(0x000000);
  });

  return (
    <group ref={groupRef}>
      <mesh ref={bodyRef} position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.45, 0.9, 4, 8]} />
        <meshStandardMaterial color="#c9a84c" emissive="#000000" />
      </mesh>
      {/* Facing wedge — a small nose so the player's orientation reads clearly */}
      <mesh position={[0, 0.9, 0.55]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.15, 0.4, 8]} />
        <meshStandardMaterial color="#ffe08a" />
      </mesh>
    </group>
  );
}
