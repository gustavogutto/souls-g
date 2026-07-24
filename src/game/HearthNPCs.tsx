import { useFrame } from "@react-three/fiber";
import type { GameState } from "./GameState";
import type { GameInput } from "./input";

const INTERACT_RANGE = 1.6;
const NPC_COLOR: Record<"martyna" | "varn", string> = {
  martyna: "#c9a84c", // ember-gold — Keeper of the Hearth
  varn: "#8899aa", // iron-grey — the blacksmith
};

function NPCFigure({ npc }: { npc: { id: "martyna" | "varn"; x: number; y: number } }) {
  const color = NPC_COLOR[npc.id];
  return (
    <group position={[npc.x + 0.5, 0, npc.y + 0.5]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.4, 0.9, 4, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

// Martyna and Varn — proximity + "E"/USE interact opens the matching DOM
// panel (HearthNPCPanels.tsx), same pattern as chests/levers/gates.
export function HearthNPCs({ state, input, onTalk }: { state: GameState; input: GameInput; onTalk: (npc: "martyna" | "varn") => void }) {
  const npcs = state.mapData.npcs;

  useFrame(() => {
    if (!npcs || state.paused) return;
    const pulse = input.actions.current.interact;
    if (!pulse) return;
    const p = state.player;
    for (const npc of npcs) {
      const dx = npc.x + 0.5 - p.position.x;
      const dz = npc.y + 0.5 - p.position.z;
      if (Math.hypot(dx, dz) <= INTERACT_RANGE) {
        input.actions.current.interact = false;
        onTalk(npc.id);
        return;
      }
    }
  });

  if (!npcs) return null;
  return (
    <group>
      {npcs.map((n) => (
        <NPCFigure key={n.id} npc={n} />
      ))}
    </group>
  );
}
