import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, MeshStandardMaterial } from "three";
import type { GameState } from "./GameState";

// Boss slam/breath damage-over-time patches (GameState.hazards). Same fixed-pool-
// of-always-mounted-meshes pattern as Projectiles.tsx — expiry/damage tick itself
// lives in Player.tsx (next to the rest of the per-frame player-state update),
// this component only owns the visual.
const HAZARD_POOL_SIZE = 16;

export function Hazards({ state }: { state: GameState }) {
  const meshRefs = useRef<(Mesh | null)[]>([]);

  useFrame(() => {
    const list = state.hazards;
    for (let i = 0; i < HAZARD_POOL_SIZE; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      const hazard = list[i];
      if (!hazard) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(hazard.position.x, 0.03, hazard.position.z);
      mesh.scale.setScalar(hazard.radius);
      (mesh.material as MeshStandardMaterial).color.set(hazard.color);
    }
  });

  return (
    <group>
      {Array.from({ length: HAZARD_POOL_SIZE }).map((_, i) => (
        <mesh key={i} ref={(el) => { meshRefs.current[i] = el; }} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <circleGeometry args={[1, 20]} />
          <meshStandardMaterial color="#33cc55" transparent opacity={0.45} emissive="#116622" emissiveIntensity={0.5} />
        </mesh>
      ))}
    </group>
  );
}
