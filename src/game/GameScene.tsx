import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { createGameState, type GameState } from "./GameState";
import { useGameInput } from "./input";
import { generateMap } from "./maps/MapGenerator";
import { Floor, Area, AREA_CONFIGS } from "./utils/constants";
import { DungeonRenderer } from "./DungeonRenderer";
import { Player } from "./Player";
import { Enemy } from "./Enemy";
import { Projectiles } from "./Projectiles";
import { CameraRig } from "./CameraRig";
import { HUD } from "./HUD";
import { TouchControls } from "./TouchControls";
import { AreaDebugPicker } from "./AreaDebugPicker";
import { InventoryPanel } from "./InventoryPanel";
import { loadGame, saveGame, applySaveData, type SaveData } from "./saveGame";

const AUTOSAVE_INTERVAL_MS = 5000;

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
