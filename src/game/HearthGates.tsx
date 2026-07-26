import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import type { Area } from "./utils/constants";
import type { GameState } from "./GameState";
import type { GameInput } from "./input";

const INTERACT_RANGE = 1.6;
const GATE_COLOR: Record<number, string> = {
  6: "#4a7a8c", // Prologue — Tidewarden steel-teal
  1: "#4fc3f7", // Area 1 — ice
  2: "#8899aa", // Area 2 — ruins
  3: "#ff8c00", // Area 3 — molten
  4: "#9d7bd8", // Area 4 — spire
  5: "#c93a3a", // Area 5 — Sundered Sky
};

function Gate({ gate }: { gate: { x: number; y: number; area: Area; label: string } }) {
  const ref = useRef<Mesh>(null!);
  const color = GATE_COLOR[gate.area] ?? "#c9a84c";

  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = 1.1 + Math.sin(clock.elapsedTime * 1.5) * 0.08;
  });

  return (
    <group position={[gate.x + 0.5, 0, gate.y + 0.5]}>
      <mesh>
        <cylinderGeometry args={[0.35, 0.45, 2.2, 8]} />
        <meshStandardMaterial color="#3a3a4a" />
      </mesh>
      <mesh ref={ref}>
        <icosahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} />
      </mesh>
    </group>
  );
}

// The Ashen Hearth's real travel system (phase 9) — one gate per area,
// proximity + "E"/USE interact just like chests/the secret-fight lever in
// Interactables.tsx, except this changes area instead of mutating GameState.
export function HearthGates({ state, input, onTravel }: { state: GameState; input: GameInput; onTravel: (area: Area) => void }) {
  const gates = state.mapData.areaGates;
  // See Interactables.tsx's comment on this pattern — only clears
  // state.interactPrompt when this component was the one showing it. Travel
  // is deliberately left unrestricted here (no clear-requirement gating) —
  // the user wants free travel for testing right now.
  const ownsPromptRef = useRef(false);

  useFrame(() => {
    if (!gates || state.paused) return;
    const p = state.player;
    let nearby: (typeof gates)[number] | null = null;
    for (const gate of gates) {
      const dx = gate.x + 0.5 - p.position.x;
      const dz = gate.y + 0.5 - p.position.z;
      if (Math.hypot(dx, dz) <= INTERACT_RANGE) {
        nearby = gate;
        break;
      }
    }

    if (nearby) {
      state.interactPrompt = `Travel to ${nearby.label}`;
      ownsPromptRef.current = true;
    } else if (ownsPromptRef.current) {
      state.interactPrompt = null;
      ownsPromptRef.current = false;
    }

    if (nearby && input.actions.current.interact) {
      input.actions.current.interact = false;
      onTravel(nearby.area);
    }
  });

  if (!gates) return null;
  return (
    <group>
      {gates.map((g, i) => (
        <Gate key={i} gate={g} />
      ))}
    </group>
  );
}

export const HEARTH_GATE_LABELS = (state: GameState): { x: number; label: string }[] =>
  (state.mapData.areaGates ?? []).map((g) => ({ x: g.x, label: g.label }));
