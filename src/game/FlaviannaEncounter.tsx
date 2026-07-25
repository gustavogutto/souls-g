import { useFrame } from "@react-three/fiber";
import type { GameState } from "./GameState";
import type { GameInput } from "./input";

const INTERACT_RANGE = 1.6;

// A single one-time in-world encounter — Area 2, floor index 2 only (see
// MapGenerator.ts's merchantNpcSpawn comment). Only rendered/interactable
// before she's been met; once met she's gone from the field and only
// reachable at the Hearth instead (HearthNPCs.tsx), same as the 2D source.
export function FlaviannaEncounter({ state, input, onTalk }: { state: GameState; input: GameInput; onTalk: () => void }) {
  const spawn = state.mapData.merchantNpcSpawn;

  useFrame(() => {
    if (!spawn || state.progress.flaviannaMet || state.paused) return;
    if (!input.actions.current.interact) return;
    const p = state.player;
    const dx = spawn.x + 0.5 - p.position.x;
    const dz = spawn.y + 0.5 - p.position.z;
    if (Math.hypot(dx, dz) <= INTERACT_RANGE) {
      input.actions.current.interact = false;
      onTalk();
    }
  });

  if (!spawn || state.progress.flaviannaMet) return null;
  return (
    <group position={[spawn.x + 0.5, 0, spawn.y + 0.5]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.4, 0.9, 4, 8]} />
        <meshStandardMaterial color="#aa44cc" emissive="#aa44cc" emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}
