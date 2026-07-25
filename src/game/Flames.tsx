import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { restAtFlame, spawnFloatingText, type GameState } from "./GameState";
import type { GameInput } from "./input";

const INTERACT_RANGE = 1.5;

function FlameProp({ x, y }: { x: number; y: number }) {
  return (
    <mesh position={[x + 0.5, 0.5, y + 0.5]} castShadow>
      <coneGeometry args={[0.25, 0.9, 8]} />
      <meshStandardMaterial color="#ff8c00" emissive="#ff6600" emissiveIntensity={0.9} />
    </mesh>
  );
}

// Checkpoint flames (design doc section 2) — ashenFlameSpawn (mid-floor)
// and startFlameSpawn (start-of-floor), both opening the same menu. Only
// on the 5 real areas' floors — the Hearth is its own hub with no flame of
// its own, and the prologue doesn't participate in the fast-travel network.
export function Flames({ state, input, onInteract }: { state: GameState; input: GameInput; onInteract: () => void }) {
  const spots = [state.mapData.ashenFlameSpawn, state.mapData.startFlameSpawn].filter(
    (s): s is { x: number; y: number } => !!s
  );

  useFrame(() => {
    if (state.paused || spots.length === 0) return;
    if (!input.actions.current.interact) return;
    const p = state.player;
    for (const spot of spots) {
      const dx = spot.x + 0.5 - p.position.x;
      const dz = spot.y + 0.5 - p.position.z;
      if (Math.hypot(dx, dz) <= INTERACT_RANGE) {
        input.actions.current.interact = false;
        onInteract();
        return;
      }
    }
  });

  return (
    <group>
      {spots.map((s, i) => (
        <FlameProp key={i} x={s.x} y={s.y} />
      ))}
    </group>
  );
}

// The bonus labyrinth's own dedicated checkpoint (design doc section 2,
// MapData.layerFlameSpawn) — rest-only, deliberately NOT routed through
// FlamePanel: that panel auto-marks the current floor's flame discovered
// the moment it's opened and offers a TRAVEL/ASHEN HEARTH escape hatch,
// either of which would let the player claim the echo boss's real reward
// (see handleBossDefeatReward) for free just by walking up to this flame,
// no boss fight required.
export function LayerFlame({ state, input }: { state: GameState; input: GameInput }) {
  const spot = state.mapData.layerFlameSpawn;

  useFrame(() => {
    if (state.paused || !spot) return;
    if (!input.actions.current.interact) return;
    const p = state.player;
    const dx = spot.x + 0.5 - p.position.x;
    const dz = spot.y + 0.5 - p.position.z;
    if (Math.hypot(dx, dz) <= INTERACT_RANGE) {
      input.actions.current.interact = false;
      restAtFlame(state);
      spawnFloatingText(state, "Restored", p.position.clone().add(new THREE.Vector3(0, 2, 0)), "#ff8c00");
    }
  });

  if (!spot) return null;
  return <FlameProp x={spot.x} y={spot.y} />;
}
