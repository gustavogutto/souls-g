import { useFrame } from "@react-three/fiber";
import type { GameState } from "./GameState";
import { PLAYER_RADIUS } from "./Player";
import { ENEMY_RADIUS } from "./Enemy";
import { BOSS_RADIUS } from "./Boss";
import { isGateBlocked, isShortcutDoorBlocked, resolveCollision } from "./maps/collision";

// Player/enemy/boss movement (see Player.tsx, Enemy.tsx's stepToward, Boss.tsx's
// stepBossToward/resolveBossStrike) only ever resolves against the wall grid —
// nothing anywhere pushed entities apart from *each other*, so the player could
// stand fully inside an enemy (and enemies inside each other, and either inside
// the boss) with zero physical feedback. Runs once per frame, after every
// entity has already moved and resolved against walls this frame, applying a
// plain symmetric circle-vs-circle push-apart to every overlapping pair.
// Purely positional — doesn't touch damage/hit-detection, which already works
// off its own distance checks regardless of physical overlap.
function separate(a: { x: number; z: number }, ra: number, b: { x: number; z: number }, rb: number) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const minDist = ra + rb;
  if (dist >= minDist || dist < 1e-4) return;
  const overlap = (minDist - dist) / 2;
  const nx = dx / dist;
  const nz = dz / dist;
  a.x -= nx * overlap;
  a.z -= nz * overlap;
  b.x += nx * overlap;
  b.z += nz * overlap;
}

export function EntitySeparation({ state }: { state: GameState }) {
  useFrame(() => {
    if (state.paused) return;
    const enemies = state.enemies;
    const p = state.player;
    const boss = state.boss;
    const bossAlive = !!boss && boss.aiState !== "dead";

    if (!p.dead) {
      for (const e of enemies) {
        if (e.aiState === "dead") continue;
        separate(p.position, PLAYER_RADIUS, e.position, ENEMY_RADIUS);
      }
      if (bossAlive) separate(p.position, PLAYER_RADIUS, boss!.position, BOSS_RADIUS);
    }

    for (let i = 0; i < enemies.length; i++) {
      if (enemies[i].aiState === "dead") continue;
      for (let j = i + 1; j < enemies.length; j++) {
        if (enemies[j].aiState === "dead") continue;
        separate(enemies[i].position, ENEMY_RADIUS, enemies[j].position, ENEMY_RADIUS);
      }
      if (bossAlive) separate(enemies[i].position, ENEMY_RADIUS, boss!.position, BOSS_RADIUS);
    }

    // separate() only ever knows about other entities, never the wall grid —
    // with enemy counts now regularly in the dozens per room, several
    // overlapping pushes can stack on the same entity in a single frame and
    // shove it clean through a 1-unit wall with nothing to stop it (this is
    // almost certainly the "walls disappear, I can walk into the void" bug
    // reported right after this file was added). Re-resolve everyone against
    // walls immediately after applying this frame's pushes so a separation
    // shove can never leave anyone clipped into or through geometry.
    if (!p.dead) {
      resolveCollision(state.mapData, p.position, PLAYER_RADIUS, (tx, ty) =>
        isGateBlocked(state.mapData, state.gateLocked, tx, ty) || isShortcutDoorBlocked(state.mapData, state.shortcutDoorOpened, tx, ty)
      );
    }
    for (const e of enemies) {
      if (e.aiState === "dead") continue;
      resolveCollision(state.mapData, e.position, ENEMY_RADIUS);
    }
    if (bossAlive) resolveCollision(state.mapData, boss!.position, BOSS_RADIUS);
  });
  return null;
}
