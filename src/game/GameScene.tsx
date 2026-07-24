import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Mesh } from "three";
import { createGameState, type GameState } from "./GameState";
import { useGameInput } from "./input";
import { generateMap, generateHearthMap } from "./maps/MapGenerator";
import { Floor, Area, AREA_CONFIGS } from "./utils/constants";
import { DungeonRenderer } from "./DungeonRenderer";
import { Player } from "./Player";
import { Enemy } from "./Enemy";
import { Boss } from "./Boss";
import { Hazards } from "./Hazards";
import { Interactables } from "./Interactables";
import { HearthGates, HEARTH_GATE_LABELS } from "./HearthGates";
import { HearthNPCs } from "./HearthNPCs";
import { MartynaPanel, VarnPanel } from "./HearthNPCPanels";
import { Projectiles } from "./Projectiles";
import { CameraRig } from "./CameraRig";
import { HUD } from "./HUD";
import { AreaDebugPicker } from "./AreaDebugPicker";
import { InventoryPanel } from "./InventoryPanel";
import { loadGame, saveGame, applySaveData, type SaveData } from "./saveGame";
import { getAreaTheme } from "./utils/areaThemes";

const AUTOSAVE_INTERVAL_MS = 5000;

// The corridor tile connecting the boss room to the end room — solid for as
// long as GameState.gateLocked is true (see collision.ts's isGateBlocked),
// so the player can't just walk around the boss to reach the exit.
function BossGateDoor({ state }: { state: GameState }) {
  const ref = useRef<Mesh>(null!);
  const door = state.mapData.bossGateDoor;

  useFrame(() => {
    if (ref.current) ref.current.visible = state.gateLocked;
  });

  if (!door) return null;
  return (
    <mesh ref={ref} position={[door.x + 0.5, 1.2, door.y + 0.5]} castShadow>
      <boxGeometry args={[1, 2.4, 1]} />
      <meshStandardMaterial color="#661a1a" emissive="#440000" emissiveIntensity={0.3} />
    </mesh>
  );
}

// Watches GameState.reachedEnd (set by Player.tsx once the player steps onto
// the end_portal tile) and fires onReachEnd exactly once — mirrors the
// pulse-consumption pattern Interactables.tsx uses for the "E" action, just
// framed as a one-shot ref guard since reachedEnd itself isn't reset (the
// whole GameState is discarded on area change anyway, via Floor1Gameplay's
// key={area} remount). No-op on the Hearth's own map, which never sets it.
function EndPortalWatcher({ state, onReachEnd }: { state: GameState; onReachEnd: () => void }) {
  const fired = useRef(false);
  useFrame(() => {
    if (state.reachedEnd && !fired.current) {
      fired.current = true;
      onReachEnd();
    }
  });
  return null;
}

// One procedurally-generated floor (or the hand-authored Hearth) at a time.
// `key={area}` on the gameplay group below forces a full remount (fresh
// MapData + fresh GameState) when the area changes — simpler and safer than
// trying to hot-swap state inside a live Player/Enemy tree.
function Floor1Gameplay({ area, initialSave, onStateReady, onAreaChange }: { area: Area; initialSave: SaveData | null; onStateReady: (state: GameState) => void; onAreaChange: (a: Area) => void }) {
  const dungeonGroupRef = useRef<THREE.Group>(null!);
  const mapData = useMemo(() => (area === Area.HEARTH ? generateHearthMap() : generateMap(Floor.BASEMENT, area)), [area]);
  const theme = useMemo(() => getAreaTheme(area), [area]);
  const [state] = useState<GameState>(() => {
    const s = createGameState(mapData, area, AREA_CONFIGS[area].enemyDamageMultiplier);
    if (initialSave && initialSave.area === area) applySaveData(s, initialSave);
    return s;
  });
  const input = useGameInput();
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [activeNpc, setActiveNpc] = useState<"martyna" | "varn" | null>(null);
  const gateLabels = area === Area.HEARTH ? HEARTH_GATE_LABELS(state) : [];

  useEffect(() => {
    onStateReady(state);
    const interval = setInterval(() => saveGame(state), AUTOSAVE_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      saveGame(state);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Canvas shadows camera={{ fov: 45, near: 0.1, far: 200 }}>
        <color attach="background" args={[theme.background]} />
        <fog attach="fog" args={[theme.fogColor, theme.fogNear, theme.fogFar]} />
        <ambientLight intensity={theme.ambientIntensity} color={theme.ambientColor} />
        <directionalLight position={[8, 14, 6]} intensity={theme.sunIntensity} color={theme.sunColor} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
        <pointLight position={[0, 6, 0]} intensity={0.4} color={theme.special} />

        <group ref={dungeonGroupRef}>
          <DungeonRenderer mapData={mapData} theme={theme} />
        </group>
        <Player state={state} input={input} />
        {state.enemies.map((e) => (
          <Enemy key={e.id} state={state} enemyState={e} />
        ))}
        {state.boss && <Boss state={state} bossState={state.boss} />}
        <BossGateDoor state={state} />
        <Hazards state={state} />
        <Interactables state={state} input={input} />
        <HearthGates state={state} input={input} onTravel={onAreaChange} />
        <HearthNPCs state={state} input={input} onTalk={setActiveNpc} />
        <EndPortalWatcher state={state} onReachEnd={() => onAreaChange(Area.HEARTH)} />
        <Projectiles state={state} />
        <CameraRig state={state} dungeonGroup={dungeonGroupRef} look={input.look} />
      </Canvas>
      <HUD state={state} look={input.look} />
      {gateLabels.length > 0 && (
        <div style={{ position: "absolute", top: 90, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 18, fontFamily: "Georgia, serif", fontSize: 11, color: "#e8e0d4", opacity: 0.75, textShadow: "1px 1px 2px black", pointerEvents: "none" }}>
          {gateLabels.map((g) => (
            <span key={g.x}>{g.label}</span>
          ))}
        </div>
      )}
      <InventoryPanel state={state} open={inventoryOpen} setOpen={setInventoryOpen} />
      <MartynaPanel state={state} open={activeNpc === "martyna"} onClose={() => setActiveNpc(null)} />
      <VarnPanel state={state} open={activeNpc === "varn"} onClose={() => setActiveNpc(null)} />
    </>
  );
}

export function GameScene() {
  const initialSave = useMemo(() => loadGame(), []);
  const [area, setArea] = useState<Area>(initialSave?.area ?? Area.HEARTH);
  const liveStateRef = useRef<GameState | null>(null);

  const handleAreaChange = (next: Area) => {
    if (liveStateRef.current) saveGame(liveStateRef.current);
    liveStateRef.current = null;
    setArea(next);
  };

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", background: "#0a0a12" }}>
      <Floor1Gameplay
        key={area}
        area={area}
        initialSave={initialSave}
        onStateReady={(state) => {
          liveStateRef.current = state;
        }}
        onAreaChange={handleAreaChange}
      />
      <AreaDebugPicker area={area} onChange={handleAreaChange} />
    </div>
  );
}
