import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Mesh } from "three";
import { openChest, triggerSecretFight, lootFallenAdventurer, pullVaultLever, openVault, openIllusoryWall, type ChestState, type GameState } from "./GameState";
import type { GameInput } from "./input";

const INTERACT_RANGE = 1.4;

function Chest({ chest }: { chest: ChestState }) {
  const meshRef = useRef<Mesh>(null!);

  useFrame(() => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    mat.color.set(chest.opened ? "#4a3a2a" : "#c9a84c");
    mat.emissive.set(chest.opened ? "#000000" : "#553311");
  });

  return (
    <mesh ref={meshRef} position={[chest.x + 0.5, 0.35, chest.y + 0.5]} castShadow>
      <boxGeometry args={[0.7, 0.7, 0.7]} />
      <meshStandardMaterial color="#c9a84c" emissive="#553311" emissiveIntensity={0.3} />
    </mesh>
  );
}

function FallenAdventurer({ state }: { state: GameState }) {
  const meshRef = useRef<Mesh>(null!);

  useFrame(() => {
    if (meshRef.current) meshRef.current.visible = !state.fallenAdventurerLooted;
  });

  const fa = state.mapData.fallenAdventurerSpawn!;
  return (
    <mesh ref={meshRef} position={[fa.x + 0.5, 0.12, fa.y + 0.5]} rotation={[0, Math.random() * Math.PI, 0]} castShadow>
      <boxGeometry args={[1.1, 0.24, 0.4]} />
      <meshStandardMaterial color="#4a4238" />
    </mesh>
  );
}

// Broken crates just vanish (their souls trickle is instant, no lingering
// visual payoff worth animating) — see Player.tsx's melee-hit resolution
// for where breakCrate() actually gets called.
function Crate({ state, x, y }: { state: GameState; x: number; y: number }) {
  const meshRef = useRef<Mesh>(null!);
  const key = `${x},${y}`;

  useFrame(() => {
    if (meshRef.current) meshRef.current.visible = !state.brokenCrates.has(key);
  });

  return (
    <mesh ref={meshRef} position={[x + 0.5, 0.3, y + 0.5]} castShadow>
      <boxGeometry args={[0.55, 0.55, 0.55]} />
      <meshStandardMaterial color="#8a6a3a" />
    </mesh>
  );
}

function Lever({ state }: { state: GameState }) {
  const meshRef = useRef<Mesh>(null!);
  const sf = state.secretFight!;

  useFrame(() => {
    if (meshRef.current) meshRef.current.visible = !sf.triggered;
  });

  return (
    <mesh ref={meshRef} position={[sf.leverX + 0.5, 0.6, sf.leverY + 0.5]} castShadow>
      <cylinderGeometry args={[0.12, 0.12, 1.2, 8]} />
      <meshStandardMaterial color="#8844ff" emissive="#441188" emissiveIntensity={0.6} />
    </mesh>
  );
}

// Mystery Vault — a distinct dim purple chest (the "subtle tell" that this
// one's a gamble, without revealing which outcome) that only responds once
// its lever's been pulled; the lever itself just tints gold on pull, same
// visual grammar as the secret-fight lever above.
function VaultLever({ state }: { state: GameState }) {
  const meshRef = useRef<Mesh>(null!);
  const v = state.mapData.vaultSpawn!;

  useFrame(() => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    mat.color.set(state.vaultLeverPulled ? "#ffd700" : "#8a8a8a");
    mat.emissive.set(state.vaultLeverPulled ? "#a8890a" : "#000000");
  });

  return (
    <mesh ref={meshRef} position={[v.leverX + 0.5, 0.6, v.leverY + 0.5]} castShadow>
      <cylinderGeometry args={[0.12, 0.12, 1.2, 8]} />
      <meshStandardMaterial color="#8a8a8a" />
    </mesh>
  );
}

function VaultChest({ state }: { state: GameState }) {
  const meshRef = useRef<Mesh>(null!);
  const v = state.mapData.vaultSpawn!;

  useFrame(() => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    if (state.vaultOpened) {
      mat.color.set("#333333");
      mat.opacity = 0.4;
    } else if (state.vaultLeverPulled) {
      mat.color.set("#6a3fa0");
      mat.opacity = 1;
    } else {
      mat.color.set("#6a3fa0");
      mat.opacity = 0.55;
    }
  });

  return (
    <mesh ref={meshRef} position={[v.chestX + 0.5, 0.35, v.chestY + 0.5]} castShadow>
      <boxGeometry args={[0.7, 0.7, 0.7]} />
      <meshStandardMaterial color="#6a3fa0" transparent opacity={0.55} />
    </mesh>
  );
}

// Chests and the area's secret-fight lever (see utils/secretFights.ts), plus
// the proximity + "E"/USE-button interaction that opens/triggers them —
// pulse-consumption follows the same one-shot pattern as Player.tsx's own
// actions (roll/heal/attack), just owned here instead since neither chests
// nor the lever are combat state.
export function Interactables({ state, input, onIllusoryWallRevealed }: { state: GameState; input: GameInput; onIllusoryWallRevealed?: () => void }) {
  useFrame(() => {
    if (state.paused) return;
    const p = state.player;
    const pulse = input.actions.current.interact;

    if (pulse) {
      for (const chest of state.chests) {
        if (chest.opened) continue;
        const dx = chest.x + 0.5 - p.position.x;
        const dz = chest.y + 0.5 - p.position.z;
        if (Math.hypot(dx, dz) <= INTERACT_RANGE) {
          openChest(state, chest);
          break;
        }
      }
      const sf = state.secretFight;
      if (sf && !sf.triggered) {
        const dx = sf.leverX + 0.5 - p.position.x;
        const dz = sf.leverY + 0.5 - p.position.z;
        if (Math.hypot(dx, dz) <= INTERACT_RANGE) triggerSecretFight(state);
      }
      const fa = state.mapData.fallenAdventurerSpawn;
      if (fa && !state.fallenAdventurerLooted) {
        const dx = fa.x + 0.5 - p.position.x;
        const dz = fa.y + 0.5 - p.position.z;
        if (Math.hypot(dx, dz) <= INTERACT_RANGE) lootFallenAdventurer(state);
      }
      const v = state.mapData.vaultSpawn;
      if (v) {
        if (!state.vaultLeverPulled) {
          const dx = v.leverX + 0.5 - p.position.x;
          const dz = v.leverY + 0.5 - p.position.z;
          if (Math.hypot(dx, dz) <= INTERACT_RANGE) pullVaultLever(state);
        } else if (!state.vaultOpened) {
          const dx = v.chestX + 0.5 - p.position.x;
          const dz = v.chestY + 0.5 - p.position.z;
          if (Math.hypot(dx, dz) <= INTERACT_RANGE) openVault(state);
        }
      }
      const iw = state.mapData.illusoryWallSpawn;
      if (iw && !state.illusoryWallOpened) {
        const dx = iw.fromX + 0.5 - p.position.x;
        const dz = iw.fromY + 0.5 - p.position.z;
        if (Math.hypot(dx, dz) <= INTERACT_RANGE && openIllusoryWall(state)) {
          onIllusoryWallRevealed?.();
        }
      }
    }

    input.actions.current.interact = false;
  });

  return (
    <group>
      {state.chests.map((c, i) => (
        <Chest key={i} chest={c} />
      ))}
      {state.mapData.fallenAdventurerSpawn && <FallenAdventurer state={state} />}
      {state.mapData.breakableSpawns?.map((b, i) => (
        <Crate key={i} state={state} x={b.x} y={b.y} />
      ))}
      {state.secretFight && <Lever state={state} />}
      {state.mapData.vaultSpawn && (
        <>
          <VaultLever state={state} />
          <VaultChest state={state} />
        </>
      )}
    </group>
  );
}
