import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { GameState } from "./GameState";

const OFFSET = new THREE.Vector3(0, 10, 9);
const LOOK_OFFSET = new THREE.Vector3(0, 1, 0);

export function CameraRig({ state }: { state: GameState }) {
  const { camera } = useThree();

  useFrame((_, dt) => {
    const target = state.player.position;
    const desired = new THREE.Vector3().copy(target).add(OFFSET);
    const alpha = 1 - Math.pow(0.001, dt);
    camera.position.lerp(desired, alpha);
    const lookAt = new THREE.Vector3().copy(target).add(LOOK_OFFSET);
    camera.lookAt(lookAt);
  });

  return null;
}
