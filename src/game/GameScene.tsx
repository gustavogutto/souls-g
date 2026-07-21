import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Mesh } from "three";
import { createGameState, type GameState } from "./GameState";
import { useGameInput } from "./input";
import { generateMap } from "./maps/MapGenerator";
import { Floor, Area, AREA_CONFIGS } from "./utils/constants";
import { DungeonRenderer } from "./DungeonRenderer";
import { Player } from "./Player";
import { Enemy } from "./Enemy";
import { Boss } from "./Boss";
import { Hazards } from "./Hazards";
import { Projectiles } from "./Projectiles";
import { CameraRig } from "./CameraRig";
import { HUD } from "./HUD";
import { TouchControls } from "./TouchControls";
import { AreaDebugPicker } from "./AreaDebugPicker";
import { InventoryPanel } from "./InventoryPanel";
import { loadGame, saveGame, applySaveData, type SaveData } from "./saveGame";

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

// One procedurally-generated floor at a time. `key={area}` on the gameplay
// group below forces a full remount (fresh MapData + fresh GameState) when
// the area changes — simpler and safer than trying to hot-swap state inside
// a live Player/Enemy tree, and area switches are rare (dev testing today,
// the real Ashen Flame travel system later).
function Floor1Gameplay({ area, initialSave, onStateReady }: { area: Area; initialSave: SaveData | null; onStateReady: (state: GameState) => void }) {
  const dungeonGroupRef = useRef<THREE.Group>(null!);
  const mapData = useMemo(() => generateMap(Floor.BASEMENT, area), [area]);
  const [state] = useState<GameState>(() => {
    const s = createGameState(mapData, area, AREA_CONFIGS[area].enemyDamageMultiplier);
    if (initialSave && initialSave.area === area) applySaveData(s, initialSave);
    return s;
  });
  const input = useGameInput();
  const [inventoryOpen, setInventoryOpen] = useState(false);

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
        <color attach="background" args={["#0a0a12"]} />
        <fog attach="fog" args={["#0a0a12", 15, 45]} />
        <ambientLight intensity={0.45} />
        <directionalLight position={[8, 14, 6]} intensity={1.2} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
        <pointLight position={[0, 6, 0]} intensity={0.4} color="#ffcc88" />

        <group ref={dungeonGroupRef}>
          <DungeonRenderer mapData={mapData} />
        </group>
        <Player state={state} input={input} />
        {state.enemies.map((e) => (
          <Enemy key={e.id} state={state} enemyState={e} />
        ))}
        {state.boss && <Boss state={state} bossState={state.boss} />}
        <BossGateDoor state={state} />
        <Hazards state={state} />
        <Projectiles state={state} />
        <CameraRig state={state} dungeonGroup={dungeonGroupRef} />
      </Canvas>
      <HUD state={state} />
      <TouchControls input={input} state={state} onToggleInventory={() => setInventoryOpen((o) => !o)} />
      <InventoryPanel state={state} open={inventoryOpen} setOpen={setInventoryOpen} />
    </>
  );
}

export function GameScene() {
  const initialSave = useMemo(() => loadGame(), []);
  const [area, setArea] = useState<Area>(initialSave?.area ?? Area.AREA_1);
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
      />
      <AreaDebugPicker area={area} onChange={handleAreaChange} />
    </div>
  );
}
