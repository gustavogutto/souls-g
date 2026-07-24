import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Mesh, Group } from "three";
import { type GameState, spawnFloatingText, enemyDamageForRole, handleSpecialEnemyDeath, updateSecretFight, killPlayer, spawnProjectile, markBossDefeated } from "./GameState";
import { computeWeaponDamage, computeSpellDamage, getEffectiveMoveSpeed, getEffectiveStaminaRegenPerSec, getEffectiveHealFraction, applyDamageReduction, applySoulsGainModifier } from "./utils/equipment";
import { CINDER_WRETCH_DETONATE_RADIUS, CINDER_WRETCH_DETONATE_DAMAGE_MULT } from "./utils/enemyRoles";
import { STAMINA_REGEN_PER_SEC } from "./utils/constants";
import { getItemDef } from "./utils/items";
import {
  PLAYER_SPEED,
  LIGHT_ATTACK,
  HEAVY_ATTACK,
  SHIELD_BASH,
  ROLL_DISTANCE,
  ROLL_DURATION_MS,
  ROLL_STAMINA_COST,
  FLASK_HEAL_FRACTION,
  SOULS_PER_KILL,
  SOULS_PER_BOSS,
  FP_REGEN_PER_SEC,
  CAST_MOVE_SPEED_MULT,
  CAST_REFUND_WINDOW_PCT,
  type MeleeAction,
} from "./gameConstants";
import { isGateBlocked, resolveCollision } from "./maps/collision";
import type { GameInput } from "./input";

const ATTACK_ARC_COS = Math.cos((70 * Math.PI) / 180); // +/-70 deg frontal cone
const PLAYER_RADIUS = 0.35;

export function Player({ state, input }: { state: GameState; input: GameInput }) {
  const groupRef = useRef<Group>(null!);
  const bodyRef = useRef<Mesh>(null!);
  const { camera } = useThree();
  const aimDirRef = useRef(new THREE.Vector3(0, 0, 1));

  useFrame((_, dt) => {
    const p = state.player;
    if (p.dead || state.paused) return;
    const dtMs = dt * 1000;
    const axes = input.axes.current;
    const actions = input.actions.current;

    // Stamina regen (paused briefly by rolling/attacking, matching Hohenberg's feel)
    const regen = getEffectiveStaminaRegenPerSec(STAMINA_REGEN_PER_SEC, p.equipped, p.upgrades);
    if (!p.rolling) p.stamina = Math.min(p.maxStamina, p.stamina + regen * dt);
    p.fp = Math.min(p.maxFp, p.fp + FP_REGEN_PER_SEC * dt);

    // Aim reticle direction — the camera's forward vector flattened onto the
    // ground plane. Design doc section 1: since this build's camera is a
    // locked-mouse-look orbit (not a free cursor), aiming is the "reticle/
    // soft-lock" alternative it explicitly allows, not a ground-plane cursor
    // raycast (which needs a visible, unlocked cursor the orbit camera can't
    // also use). Whatever this points at when a cast's windup completes is
    // the fired direction — never the direction at the initial keypress.
    camera.getWorldDirection(aimDirRef.current);
    aimDirRef.current.y = 0;
    if (aimDirRef.current.lengthSq() < 1e-6) aimDirRef.current.set(Math.sin(p.facing), 0, Math.cos(p.facing));
    aimDirRef.current.normalize();

    // Cooldown timers
    if (p.attackCooldownMs > 0) p.attackCooldownMs = Math.max(0, p.attackCooldownMs - dtMs);
    if (p.attackActiveMs > 0) p.attackActiveMs = Math.max(0, p.attackActiveMs - dtMs);
    if (p.hitFlashMs > 0) p.hitFlashMs = Math.max(0, p.hitFlashMs - dtMs);

    // Camera-relative movement basis: pressing W always moves the player
    // away from the camera regardless of which way the camera currently
    // orbits, per design doc section 1. yaw=0 reproduces the old fixed
    // (0, 10, 9) camera's forward direction exactly, so this is a drop-in
    // replacement for the previous world-axis-aligned WASD mapping.
    const yaw = input.look.current.yaw;
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);
    const forward = { x: -sinYaw, z: -cosYaw };
    const right = { x: cosYaw, z: -sinYaw };
    const inputForward = (axes.forward ? 1 : 0) - (axes.back ? 1 : 0);
    const inputRight = (axes.right ? 1 : 0) - (axes.left ? 1 : 0);

    let moveX = right.x * inputRight + forward.x * inputForward;
    let moveZ = right.z * inputRight + forward.z * inputForward;
    const moveLen = Math.hypot(moveX, moveZ);
    if (moveLen > 1) {
      moveX /= moveLen;
      moveZ /= moveLen;
    }
    const sprinting = axes.sprint;

    // Roll (dodge) — one-shot pulse from Space. Always cancels an in-progress
    // cast (design doc section 4); FP is only refunded if canceled within
    // the first CAST_REFUND_WINDOW_PCT of the cast's total time.
    if (actions.roll && !p.rolling && p.stamina >= ROLL_STAMINA_COST) {
      let dirX = moveX;
      let dirZ = moveZ;
      if (Math.hypot(dirX, dirZ) < 0.01) {
        dirX = Math.sin(p.facing);
        dirZ = Math.cos(p.facing);
      }
      const len = Math.hypot(dirX, dirZ) || 1;
      p.rollDir.set(dirX / len, 0, dirZ / len);
      p.rolling = true;
      p.rollElapsedMs = 0;
      p.stamina -= ROLL_STAMINA_COST;
      if (p.casting) {
        if (p.castElapsedMs < p.castTotalMs * CAST_REFUND_WINDOW_PCT) p.fp = Math.min(p.maxFp, p.fp + p.castFpCost);
        p.casting = false;
        p.castSpellId = null;
      }
    }
    actions.roll = false;

    // Cast (spell) — Q, one-shot pulse. FP is spent up front at windup
    // start (see the roll block above for the cancel/refund rule). Only
    // "projectile" spells are wired up yet (Ashmote/Hearthlance/Moonfrost
    // Lance/Stonefall) — ground_aoe/ground_hazard/buff_rune/beam spells
    // (Gravewake, Terra Sigil, Comet's End) can still be equipped via the
    // inventory screen but won't fire, so casting them is blocked here
    // rather than silently spending FP for nothing.
    if (actions.cast && !p.casting && !p.rolling) {
      const spellId = p.equipped.spell;
      const def = spellId ? getItemDef(spellId) : null;
      if (def?.spell && def.spell.castType === "projectile" && p.fp >= def.spell.fpCost) {
        p.fp -= def.spell.fpCost;
        p.casting = true;
        p.castElapsedMs = 0;
        p.castTotalMs = def.spell.castTimeMs;
        p.castSpellId = spellId!;
        p.castFpCost = def.spell.fpCost;
      }
    }
    actions.cast = false;

    if (p.rolling) {
      p.rollElapsedMs += dtMs;
      const speed = ROLL_DISTANCE / (ROLL_DURATION_MS / 1000);
      p.position.addScaledVector(p.rollDir, speed * dt);
      p.facing = Math.atan2(p.rollDir.x, p.rollDir.z);
      if (p.rollElapsedMs >= ROLL_DURATION_MS) p.rolling = false;
    } else {
      if (moveLen > 0.01) {
        let speed = getEffectiveMoveSpeed(PLAYER_SPEED, p.equipped, p.upgrades);
        if (sprinting) speed *= 1.4;
        if (p.casting) speed *= CAST_MOVE_SPEED_MULT;
        p.position.x += moveX * speed * dt;
        p.position.z += moveZ * speed * dt;
        if (!p.casting) p.facing = Math.atan2(moveX, moveZ);
      }

      // Light/heavy/bash — I/J/L keys. Blocked while casting (design doc
      // section 4: a spell windup blocks melee/heal).
      const tryStartMelee = (config: MeleeAction) => {
        if (p.attackCooldownMs > 0 || p.stamina < config.staminaCost) return;
        p.stamina -= config.staminaCost;
        p.attackCooldownMs = config.cooldownMs;
        p.attackActiveMs = 150;
        p.attackHitApplied = false;
        p.activeMelee = config;
      };
      if (!p.casting) {
        if (actions.attackHeavy) tryStartMelee(HEAVY_ATTACK);
        else if (actions.shieldBash) tryStartMelee(SHIELD_BASH);
        else if (actions.attackLight) tryStartMelee(LIGHT_ATTACK);
      }

      // Cast windup — facing follows the aim reticle (camera forward) while
      // channeling, then fires using whichever direction that is at the
      // instant the windup completes, per the "locked at release, not at
      // keypress" rule.
      if (p.casting) {
        p.facing = Math.atan2(aimDirRef.current.x, aimDirRef.current.z);
        p.castElapsedMs += dtMs;
        if (p.castElapsedMs >= p.castTotalMs && p.castSpellId) {
          const def = getItemDef(p.castSpellId);
          if (def.spell) {
            const dmg = computeSpellDamage(p.stats, def.spell, p.upgrades, p.castSpellId);
            const origin = p.position.clone().addScaledVector(aimDirRef.current, 0.5).setY(0.9);
            spawnProjectile(state, "player", origin, aimDirRef.current.clone(), def.spell.speed ?? 8, dmg, def.spell.range, def.spell.color, undefined, def.spell.homingDegPerSec);
          }
          p.casting = false;
          p.castSpellId = null;
        }
      }
    }
    actions.attackLight = false;
    actions.attackHeavy = false;
    actions.shieldBash = false;

    // Heal — F key. Blocked while casting.
    if (!p.casting && actions.heal && p.flaskCharges > 0 && p.hp < p.maxHp) {
      p.flaskCharges -= 1;
      const healFrac = getEffectiveHealFraction(FLASK_HEAL_FRACTION, p.equipped, p.upgrades);
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * healFrac);
      p.lastHealAtMs = performance.now();
      spawnFloatingText(state, "+HP", p.position.clone().add(new THREE.Vector3(0, 2, 0)), "#66ff66");
    }
    actions.heal = false;

    // Resolve the swing's single hit window
    if (p.attackActiveMs > 0 && !p.attackHitApplied && p.activeMelee) {
      const config = p.activeMelee;
      const forward = new THREE.Vector3(Math.sin(p.facing), 0, Math.cos(p.facing));
      for (const enemy of state.enemies) {
        if (enemy.aiState === "dead") continue;
        const toEnemy = new THREE.Vector3().subVectors(enemy.position, p.position);
        const dist = toEnemy.length();
        if (dist > config.range + 0.6) continue;
        toEnemy.normalize();
        if (forward.dot(toEnemy) < ATTACK_ARC_COS) continue;
        const dmg = Math.round(computeWeaponDamage(p.stats, p.equipped, p.upgrades) * config.damageMultiplier);
        enemy.hp = Math.max(0, enemy.hp - dmg);
        enemy.hitFlashMs = 150;
        if (config.knockback) enemy.position.addScaledVector(toEnemy, config.knockback);
        if (config.stunMs) enemy.stunnedMs = Math.max(enemy.stunnedMs, config.stunMs);
        spawnFloatingText(state, `${dmg}`, enemy.position.clone().add(new THREE.Vector3(0, 2, 0)), "#ffcc55");
        if (enemy.hp <= 0 && !handleSpecialEnemyDeath(state, enemy)) {
          enemy.aiState = "dead";
          const souls = applySoulsGainModifier(SOULS_PER_KILL, p.equipped, p.upgrades);
          p.stats.souls += souls;
          spawnFloatingText(state, `SLAIN — +${souls} souls`, enemy.position.clone().add(new THREE.Vector3(0, 2.4, 0)), "#ff5555");
          // Cinder Wretch — detonates on death regardless of kill method,
          // damaging the player if they're standing too close.
          if (enemy.role === "cinder_wretch") {
            const blastDist = enemy.position.distanceTo(p.position);
            if (blastDist <= CINDER_WRETCH_DETONATE_RADIUS && !p.rolling) {
              const raw = Math.round(enemyDamageForRole(enemy) * CINDER_WRETCH_DETONATE_DAMAGE_MULT);
              const blastDmg = applyDamageReduction(raw, p.equipped, p.upgrades);
              p.hp = Math.max(0, p.hp - blastDmg);
              p.hitFlashMs = 200;
              spawnFloatingText(state, `${blastDmg}`, p.position.clone().add(new THREE.Vector3(0, 2, 0)), "#ff8800");
              if (p.hp <= 0) killPlayer(state);
            }
          }
        }
      }

      const boss = state.boss;
      if (boss && boss.hp > 0 && boss.aiState !== "dead" && boss.phase !== "flight") {
        const toBoss = new THREE.Vector3().subVectors(boss.position, p.position);
        const dist = toBoss.length();
        if (dist <= config.range + 0.6) {
          toBoss.normalize();
          if (forward.dot(toBoss) >= ATTACK_ARC_COS) {
            const dmg = Math.round(computeWeaponDamage(p.stats, p.equipped, p.upgrades) * config.damageMultiplier);
            boss.hp = Math.max(0, boss.hp - dmg);
            boss.hitFlashMs = 150;
            spawnFloatingText(state, `${dmg}`, boss.position.clone().add(new THREE.Vector3(0, 2.4, 0)), "#ffcc55");
            if (boss.hp <= 0) {
              boss.aiState = "dead";
              state.gateLocked = false;
              markBossDefeated(state);
              const souls = applySoulsGainModifier(SOULS_PER_BOSS, p.equipped, p.upgrades);
              p.stats.souls += souls;
              spawnFloatingText(state, `SLAIN — +${souls} souls`, boss.position.clone().add(new THREE.Vector3(0, 3, 0)), "#ff5555");
            }
          }
        }
      }

      p.attackHitApplied = true;
    }

    updateSecretFight(state);

    // Ground hazards (boss slam/breath patches) — flat per-second tick applied
    // while standing in the radius, same "no i-frame interaction" precedent
    // as Hohenberg's own DoT patches (rolling doesn't save you from these).
    // Owns expiry too (Hazards.tsx is visual-only, driven off this same array).
    for (let i = state.hazards.length - 1; i >= 0; i--) {
      const hazard = state.hazards[i];
      hazard.remainingMs -= dtMs;
      if (hazard.remainingMs <= 0) {
        state.hazards.splice(i, 1);
        continue;
      }
      if (!p.dead && p.position.distanceTo(hazard.position) <= hazard.radius) {
        const dmg = applyDamageReduction(Math.round(hazard.damagePerSec * dt), p.equipped, p.upgrades);
        if (dmg > 0) {
          p.hp = Math.max(0, p.hp - dmg);
          p.hitFlashMs = 200;
          if (p.hp <= 0) killPlayer(state);
        }
      }
    }

    // Tile-grid collision (walls resolved against the 2D grid, not the 3D mesh) —
    // the boss gate door additionally blocks passage while the area's boss is alive.
    resolveCollision(state.mapData, p.position, PLAYER_RADIUS, (tx, ty) => isGateBlocked(state.mapData, state.gateLocked, tx, ty));

    // Reached the end portal (only ever reachable once the boss gate has
    // unlocked, since the gate physically blocks the path there while the
    // boss is alive) — GameScene watches this flag and travels back to the
    // Hearth. No-op on the Hearth's own map, which sets no endPoint.
    if (!state.reachedEnd && state.mapData.endPoint) {
      const ep = state.mapData.endPoint;
      const dx = ep.x + 0.5 - p.position.x;
      const dz = ep.y + 0.5 - p.position.z;
      if (Math.hypot(dx, dz) <= 0.6) state.reachedEnd = true;
    }

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
