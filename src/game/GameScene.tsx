import { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { createGameState } from "./GameState";
import { useKeyboard } from "./useKeyboard";
import { Arena } from "./Arena";
import { Player } from "./Player";
import { Enemy } from "./Enemy";
import { CameraRig } from "./CameraRig";
import { HUD } from "./HUD";

export function GameScene() {
  const stateRef = useRef(createGameState());
  const keys = useKeyboard();
  const state = stateRef.current;

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", background: "#0a0a12" }}>
      <Canvas shadows camera={{ fov: 45, near: 0.1, far: 200 }}>
        <color attach="background" args={["#0a0a12"]} />
        <fog attach="fog" args={["#0a0a12", 15, 45]} />
        <ambientLight intensity={0.45} />
        <directionalLight
          position={[8, 14, 6]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <pointLight position={[0, 6, 0]} intensity={0.4} color="#ffcc88" />

        <Arena />
        <Player state={state} keys={keys} />
        {state.enemies.map((e) => (
          <Enemy key={e.id} state={state} enemyState={e} />
        ))}
        <CameraRig state={state} />
      </Canvas>
      <HUD state={state} />
    </div>
  );
}
