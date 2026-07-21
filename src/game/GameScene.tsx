import { useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { createGameState } from "./GameState";
import { useGameInput } from "./input";
import { generateMap } from "./maps/MapGenerator";
import { Floor, Area, AREA_CONFIGS } from "./utils/constants";
import { DungeonRenderer } from "./DungeonRenderer";
import { Player } from "./Player";
import { Enemy } from "./Enemy";
import { CameraRig } from "./CameraRig";
import { HUD } from "./HUD";
import { TouchControls } from "./TouchControls";
import { AreaDebugPicker } from "./AreaDebugPicker";

// One procedurally-generated floor at a time. `key={area}` on the gameplay
// group below forces a full remount (fresh MapData + fresh GameState) when
// the area changes — simpler and safer than trying to hot-swap state inside
// a live Player/Enemy tree, and area switches are rare (dev testing today,
// the real Ashen Flame travel system later).
function Floor1Gameplay({ area }: { area: Area }) {
  const dungeonGroupRef = useRef<THREE.Group>(null!);
  const mapData = useMemo(() => generateMap(Floor.BASEMENT, area), [area]);
  const stateRef = useRef(createGameState(mapData, area, AREA_CONFIGS[area].enemyDamageMultiplier));
  const input = useGameInput();
  const state = stateRef.current;

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
        <CameraRig state={state} dungeonGroup={dungeonGroupRef} />
      </Canvas>
      <HUD state={state} />
      <TouchControls input={input} state={state} />
    </>
  );
}

export function GameScene() {
  const [area, setArea] = useState<Area>(Area.AREA_1);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", background: "#0a0a12" }}>
      <Floor1Gameplay key={area} area={area} />
      <AreaDebugPicker area={area} onChange={setArea} />
    </div>
  );
}
