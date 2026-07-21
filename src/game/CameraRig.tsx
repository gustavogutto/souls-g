import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { GameState } from "./GameState";

const DESIRED_OFFSET = new THREE.Vector3(0, 10, 9);
const LOOK_OFFSET = new THREE.Vector3(0, 1, 0);
const MIN_DISTANCE = 3;

// Third-person follow camera with a raycast-based pull-in: real procedural
// corridors will clip a naive fixed-offset camera through walls constantly
// (a problem the source game never had, being isometric 2D) — so instead of
// lerping straight to the desired offset, we raycast from the look target
// toward the desired camera position and pull the camera in front of the
// first wall hit along that ray.
export function CameraRig({ state, dungeonGroup }: { state: GameState; dungeonGroup: React.RefObject<THREE.Object3D | null> }) {
  const { camera } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const currentDistance = useRef(DESIRED_OFFSET.length());

  useFrame((_, dt) => {
    const target = state.player.position;
    const lookAt = new THREE.Vector3().copy(target).add(LOOK_OFFSET);
    const desiredDir = DESIRED_OFFSET.clone().normalize();
    const desiredDistance = DESIRED_OFFSET.length();

    let allowedDistance = desiredDistance;
    const dungeon = dungeonGroup.current;
    if (dungeon) {
      raycaster.current.set(lookAt, desiredDir);
      raycaster.current.far = desiredDistance;
      raycaster.current.near = 0.01;
      const hits = raycaster.current.intersectObject(dungeon, true);
      if (hits.length > 0) allowedDistance = Math.max(MIN_DISTANCE, hits[0].distance - 0.3);
    }

    const alpha = 1 - Math.pow(0.001, dt);
    currentDistance.current += (allowedDistance - currentDistance.current) * Math.min(1, alpha * 3);

    const desired = new THREE.Vector3().copy(lookAt).addScaledVector(desiredDir, currentDistance.current);
    camera.position.lerp(desired, alpha);
    camera.lookAt(lookAt);
  });

  return null;
}
