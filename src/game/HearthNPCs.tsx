import { useFrame } from "@react-three/fiber";
import type { GameState } from "./GameState";
import { Area } from "./utils/constants";
import type { GameInput } from "./input";

const INTERACT_RANGE = 1.6;

export type HearthNpcId = "martyna" | "varn" | "stash" | "tide_refused";

// Design doc section 2's staging rule: Martyna is present the moment the
// prologue ends, Varn unlocks after Area 1's boss dies, the Tide-Refused
// wanderer unlocks after Area 2's boss dies. The stash has no staging gate —
// it's just personal storage, always available.
function isNpcVisible(id: HearthNpcId, progress: GameState["progress"]): boolean {
  if (id === "martyna") return progress.prologueComplete;
  if (id === "varn") return !!progress.areaBossDefeated[Area.AREA_1];
  if (id === "tide_refused") return !!progress.areaBossDefeated[Area.AREA_2];
  return true; // stash
}
const NPC_COLOR: Record<HearthNpcId, string> = {
  martyna: "#c9a84c", // ember-gold — Keeper of the Hearth
  varn: "#8899aa", // iron-grey — the blacksmith
  tide_refused: "#5a6a5a", // dull, warmthless green-grey — an outsider, not Order-robed
  stash: "#6a4a2c", // worn wood/iron chest
};

function NPCFigure({ npc }: { npc: { id: HearthNpcId; x: number; y: number } }) {
  const color = NPC_COLOR[npc.id];
  if (npc.id === "stash") {
    return (
      <group position={[npc.x + 0.5, 0, npc.y + 0.5]}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <boxGeometry args={[0.8, 0.7, 0.5]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    );
  }
  return (
    <group position={[npc.x + 0.5, 0, npc.y + 0.5]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.4, 0.9, 4, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

// Martyna/Varn/the stash/The Tide-Refused — proximity + "E"/USE interact
// opens the matching DOM panel (HearthNPCPanels.tsx), same pattern as
// chests/levers/gates.
export function HearthNPCs({ state, input, onTalk }: { state: GameState; input: GameInput; onTalk: (npc: HearthNpcId) => void }) {
  const npcs = state.mapData.npcs?.filter((n) => isNpcVisible(n.id, state.progress));

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
