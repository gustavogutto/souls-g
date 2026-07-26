import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { restAtFlame, spawnFloatingText, type GameState } from "./GameState";
import type { GameInput } from "./input";

const INTERACT_RANGE = 1.5;

function FlameProp({ x, y }: { x: number; y: number }) {
  return (
    <mesh position={[x + 0.5, 0.5, y + 0.5]}>
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
  // See Interactables.tsx's comment on this pattern — only clears
  // state.interactPrompt when this component was the one showing it.
  const ownsPromptRef = useRef(false);

  useFrame(() => {
    if (state.paused || spots.length === 0) return;
    const p = state.player;
    let inRange = false;
    for (const spot of spots) {
      const dx = spot.x + 0.5 - p.position.x;
      const dz = spot.y + 0.5 - p.position.z;
      if (Math.hypot(dx, dz) <= INTERACT_RANGE) {
        inRange = true;
        break;
      }
    }

    if (inRange) {
      state.interactPrompt = "Rest";
      ownsPromptRef.current = true;
    } else if (ownsPromptRef.current) {
      state.interactPrompt = null;
      ownsPromptRef.current = false;
    }

    if (inRange && input.actions.current.interact) {
      input.actions.current.interact = false;
      onInteract();
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
  const ownsPromptRef = useRef(false);

  useFrame(() => {
    if (state.paused || !spot) return;
    const p = state.player;
    const dx = spot.x + 0.5 - p.position.x;
    const dz = spot.y + 0.5 - p.position.z;
    const inRange = Math.hypot(dx, dz) <= INTERACT_RANGE;

    if (inRange) {
      state.interactPrompt = "Rest";
      ownsPromptRef.current = true;
    } else if (ownsPromptRef.current) {
      state.interactPrompt = null;
      ownsPromptRef.current = false;
    }

    if (inRange && input.actions.current.interact) {
      input.actions.current.interact = false;
      restAtFlame(state);
      spawnFloatingText(state, "Restored", p.position.clone().add(new THREE.Vector3(0, 2, 0)), "#ff8c00");
    }
  });

  if (!spot) return null;
  return <FlameProp x={spot.x} y={spot.y} />;
}
