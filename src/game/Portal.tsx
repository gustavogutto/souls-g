import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GameState } from "./GameState";
import type { GameInput } from "./input";

const INTERACT_RANGE = 1.4;

function PortalRing({ x, y, color, emissive }: { x: number; y: number; color: string; emissive: string }) {
  return (
    <mesh position={[x + 0.5, 0.05, y + 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.3, 0.55, 24]} />
      <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.9} transparent opacity={0.85} side={THREE.DoubleSide} />
    </mesh>
  );
}

// Ground-side entry marker for the seamless-portal system (design doc
// section 2) — only ever rendered by GameScene on the two eligible floors
// of a multi-floor area (never the boss-adjacent floor), at
// MapData.portalAnchor. onEnter is expected to capture the player, build
// the bonus labyrinth, and swap GameScene's layer to "bonus" — a hard
// camera-cut, not a loading screen, per the design doc's own framing.
export function PortalEntry({ state, input, onEnter }: { state: GameState; input: GameInput; onEnter: () => void }) {
  const anchor = state.mapData.portalAnchor;

  useFrame(() => {
    if (state.paused || !anchor) return;
    if (!input.actions.current.interact) return;
    const p = state.player;
    const dx = anchor.x + 0.5 - p.position.x;
    const dz = anchor.y + 0.5 - p.position.z;
    if (Math.hypot(dx, dz) <= INTERACT_RANGE) {
      input.actions.current.interact = false;
      onEnter();
    }
  });

  if (!anchor) return null;
  return <PortalRing x={anchor.x} y={anchor.y} color="#8844ff" emissive="#441188" />;
}

// Bonus-side return marker (MapData.portals[0]) — the labyrinth's own
// player spawn point doubles as the way back out, matching the 2D source.
export function PortalReturn({ state, input, onReturn }: { state: GameState; input: GameInput; onReturn: () => void }) {
  const portal = state.mapData.portals?.[0];

  useFrame(() => {
    if (state.paused || !portal) return;
    if (!input.actions.current.interact) return;
    const p = state.player;
    const dx = portal.x + 0.5 - p.position.x;
    const dz = portal.y + 0.5 - p.position.z;
    if (Math.hypot(dx, dz) <= INTERACT_RANGE) {
      input.actions.current.interact = false;
      onReturn();
    }
  });

  if (!portal) return null;
  return <PortalRing x={portal.x} y={portal.y} color="#ffd700" emissive="#8a6a0a" />;
}
