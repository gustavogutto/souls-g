import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getLockOnTargetPosition, type GameState } from "./GameState";
import type { LookState } from "./input";

const LOCK_ON_YAW_TURN_RATE = 6; // higher = snappier re-centering onto the target

const LOOK_OFFSET = new THREE.Vector3(0, 1.3, 0);
// The wall-pull-in raycast below only tests against dungeon geometry, never
// the player's own body — so MIN_DISTANCE has to clear the character's own
// capsule (radius 0.45) by a wide margin on its own, or a nearby wall pulls
// the camera in close enough to clip through/behind the character's own
// head (verified live: 1.6 put the lens essentially inside the model).
const MIN_DISTANCE = 2.6;
// Pulled in from the old fixed (0, 10, 9) offset's ~13.4 units — that was a
// carryover from the isometric 2D source's camera math, not a real
// third-person distance. User feedback: "closer, like a 3rd view."
const DESIRED_DISTANCE = 5.5;

// Third-person orbit camera with a raycast-based pull-in: real procedural
// corridors will clip a naive fixed-offset camera through walls constantly
// (a problem the source game never had, being isometric 2D) — so instead of
// lerping straight to the desired offset, we raycast from the look target
// toward the desired camera position and pull the camera in front of the
// first wall hit along that ray. Orbit direction itself comes from `look`
// (mouse yaw/pitch, see input.ts) rather than a fixed world-space vector.
export function CameraRig({ state, dungeonGroup, look }: { state: GameState; dungeonGroup: React.RefObject<THREE.Object3D | null>; look: React.MutableRefObject<LookState> }) {
  const { camera } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const currentDistance = useRef(DESIRED_DISTANCE);

  useFrame((_, dt) => {
    const target = state.player.position;
    const lookAt = new THREE.Vector3().copy(target).add(LOOK_OFFSET);

    // Lock-on (design doc combat feedback: mouse+keyboard shouldn't need
    // constant manual re-aiming mid-fight) — smoothly snaps yaw to keep
    // facing whatever's targeted. Pitch is left alone, still mouse-driven,
    // so the player can still angle the camera up/down while locked.
    const lockPos = getLockOnTargetPosition(state);
    if (lockPos) {
      const desiredYaw = Math.atan2(target.x - lockPos.x, target.z - lockPos.z);
      let diff = desiredYaw - look.current.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      look.current.yaw += diff * Math.min(1, dt * LOCK_ON_YAW_TURN_RATE);
    }

    const { yaw, pitch } = look.current;
    const desiredDir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

    let allowedDistance = DESIRED_DISTANCE;
    const dungeon = dungeonGroup.current;
    if (dungeon) {
      raycaster.current.set(lookAt, desiredDir);
      raycaster.current.far = DESIRED_DISTANCE;
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
