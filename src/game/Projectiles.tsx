import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Mesh } from "three";
import { type GameState, spawnFloatingText } from "./GameState";
import { applyDamageReduction } from "./utils/equipment";
import { isWallTile } from "./maps/collision";
import { PROJECTILE_POOL_SIZE } from "./gameConstants";

const HIT_RADIUS = 0.45;

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
      proj.position.addScaledVector(proj.dir, proj.speed * dt);
      proj.traveled += proj.speed * dt;

      let remove = false;
      if (isWallTile(state.mapData, Math.floor(proj.position.x), Math.floor(proj.position.z))) {
        remove = true;
      } else if (proj.traveled >= proj.maxRange) {
        remove = true;
      } else if (!p.dead && !p.rolling) {
        const dx = proj.position.x - p.position.x;
        const dz = proj.position.z - p.position.z;
        if (Math.hypot(dx, dz) < HIT_RADIUS) {
          const dmg = applyDamageReduction(proj.damage, p.equipped, p.upgrades);
          p.hp = Math.max(0, p.hp - dmg);
          p.hitFlashMs = 200;
          spawnFloatingText(state, `${dmg}`, p.position.clone().add(new THREE.Vector3(0, 2, 0)), "#ff5555");
          if (p.hp <= 0) p.dead = true;
          remove = true;
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
