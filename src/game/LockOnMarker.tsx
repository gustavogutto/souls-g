import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Mesh } from "three";
import { getLockOnTargetPosition, type GameState } from "./GameState";

// Souls-style lock-on reticle — a small billboarded diamond hovering over
// whatever GameState.lockOn currently points at, so there's a visible
// answer to "what am I locked onto" without a screen-space HUD projection.
export function LockOnMarker({ state }: { state: GameState }) {
  const ref = useRef<Mesh>(null!);
  const { camera } = useThree();

  useFrame(() => {
    if (!ref.current) return;
    const pos = getLockOnTargetPosition(state);
    if (!pos) {
      ref.current.visible = false;
      return;
    }
    ref.current.visible = true;
    ref.current.position.set(pos.x, 2.2, pos.z);
    ref.current.quaternion.copy(camera.quaternion);
  });

  return (
    <mesh ref={ref} visible={false}>
      <ringGeometry args={[0.22, 0.3, 4]} />
      <meshBasicMaterial color="#ff3333" side={THREE.DoubleSide} />
    </mesh>
  );
}
