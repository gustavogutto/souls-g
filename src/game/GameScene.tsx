import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Mesh } from "three";
import { createGameState, createProgressFlags, type GameState, type ProgressFlags } from "./GameState";
import { useGameInput } from "./input";
import { generateMap, generateHearthMap, FLOOR_SEQUENCE } from "./maps/MapGenerator";
import { Floor, Area, AREA_CONFIGS } from "./utils/constants";
import { DungeonRenderer } from "./DungeonRenderer";
import { Player } from "./Player";
import { Enemy } from "./Enemy";
import { Boss } from "./Boss";
import { Hazards } from "./Hazards";
import { Interactables } from "./Interactables";
import { HearthGates, HEARTH_GATE_LABELS } from "./HearthGates";
import { HearthNPCs, type HearthNpcId } from "./HearthNPCs";
import { FlaviannaEncounter } from "./FlaviannaEncounter";
import { MartynaPanel, VarnPanel, StashPanel, TideRefusedPanel, FlaviannaPanel } from "./HearthNPCPanels";
import { Flames } from "./Flames";
import { FlamePanel } from "./FlamePanel";
import { Projectiles } from "./Projectiles";
import { CameraRig } from "./CameraRig";
import { HUD } from "./HUD";
import { AreaDebugPicker } from "./AreaDebugPicker";
import { InventoryPanel } from "./InventoryPanel";
import { loadGame, saveGame, applySaveData, toSaveData, type SaveData } from "./saveGame";
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

// Areas with a real 5-floor crawl (as opposed to the Hearth's static hub or
// the prologue's single hand-tuned floor).
function isMultiFloorArea(area: Area): boolean {
  return area !== Area.HEARTH && area !== Area.PROLOGUE;
}

// Watches GameState.reachedEnd (set by Player.tsx once the player steps onto
// the end_portal tile) and fires onReachEnd exactly once — mirrors the
// pulse-consumption pattern Interactables.tsx uses for the "E" action, just
// framed as a one-shot ref guard since reachedEnd itself isn't reset (the
// whole GameState is discarded on area change anyway, via Floor1Gameplay's
// key={area}-{floor} remount). No-op on the Hearth's own map, which never
// sets it.
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
function Floor1Gameplay({
  area,
  floor,
  initialSave,
  progress,
  onStateReady,
  onAreaChange,
  onFloorAdvance,
  onWarpToFlame,
}: {
  area: Area;
  floor: Floor;
  initialSave: SaveData | null;
  progress: ProgressFlags;
  onStateReady: (state: GameState) => void;
  onAreaChange: (a: Area) => void;
  onFloorAdvance: (f: Floor) => void;
  onWarpToFlame: (a: Area, f: Floor) => void;
}) {
  const dungeonGroupRef = useRef<THREE.Group>(null!);
  const mapData = useMemo(() => (area === Area.HEARTH ? generateHearthMap() : generateMap(floor, area)), [area, floor]);
  const theme = useMemo(() => getAreaTheme(area), [area]);
  const [state] = useState<GameState>(() => {
    const s = createGameState(mapData, area, AREA_CONFIGS[area].enemyDamageMultiplier, progress, floor);
    // Always apply whatever the caller passed — GameScene's carrySaveRef is
    // kept current across every transition (see its own comment), not just
    // matched against the very first page-load position.
    if (initialSave) applySaveData(s, initialSave);
    return s;
  });
  const floorIdx = FLOOR_SEQUENCE.indexOf(floor);
  const isFinalFloor = !isMultiFloorArea(area) || floorIdx === FLOOR_SEQUENCE.length - 1;
  const input = useGameInput();
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [activeNpc, setActiveNpc] = useState<HearthNpcId | null>(null);
  const [flameOpen, setFlameOpen] = useState(false);
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
        <FlaviannaEncounter state={state} input={input} onTalk={() => setActiveNpc("flavianna")} />
        {isMultiFloorArea(area) && <Flames state={state} input={input} onInteract={() => setFlameOpen(true)} />}
        <EndPortalWatcher
          state={state}
          onReachEnd={() => {
            if (isMultiFloorArea(area) && !isFinalFloor) onFloorAdvance(FLOOR_SEQUENCE[floorIdx + 1]);
            else onAreaChange(Area.HEARTH);
          }}
        />
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
      <StashPanel state={state} open={activeNpc === "stash"} onClose={() => setActiveNpc(null)} />
      <TideRefusedPanel open={activeNpc === "tide_refused"} onClose={() => setActiveNpc(null)} />
      <FlaviannaPanel state={state} open={activeNpc === "flavianna"} onClose={() => setActiveNpc(null)} />
      <FlamePanel
        state={state}
        open={flameOpen}
        onClose={() => setFlameOpen(false)}
        onWarp={onWarpToFlame}
        onReturnHearth={() => onAreaChange(Area.HEARTH)}
      />
    </>
  );
}

export function GameScene() {
  const initialSave = useMemo(() => loadGame(), []);
  // A brand new game (no save yet) begins in the prologue, not the Hearth —
  // design doc section 2: "leaving [the prologue] for the first time ever
  // drops the player into Area 1"; the Hearth itself is reached only via the
  // prologue's own end (win or lose) or Area 1's completion.
  const [area, setArea] = useState<Area>(initialSave?.area ?? Area.PROLOGUE);
  const [floor, setFloor] = useState<Floor>(initialSave?.floor ?? Floor.BASEMENT);
  const liveStateRef = useRef<GameState | null>(null);
  const progressRef = useRef<ProgressFlags>(initialSave?.progress ?? createProgressFlags());
  // Real bug fix: `initialSave` above is a one-time snapshot from page load
  // and never changes again, but Floor1Gameplay's `key={area}-{floor}`
  // remounts on every single area/floor transition, throwing the live
  // player away and building a brand new default one each time (stats,
  // gear, HP, souls, stash — all of it) unless a save happens to be
  // re-applied. This ref is what actually survives transitions: it's
  // reassigned to the live player's current data immediately before every
  // transition, so the next mount always carries the real player forward
  // instead of resetting to createPlayerState() defaults.
  const carrySaveRef = useRef<SaveData | null>(initialSave);

  const captureCarry = () => {
    if (!liveStateRef.current) return;
    saveGame(liveStateRef.current);
    carrySaveRef.current = toSaveData(liveStateRef.current);
    liveStateRef.current = null;
  };

  const handleAreaChange = (next: Area) => {
    if (area === Area.PROLOGUE) progressRef.current.prologueComplete = true;
    captureCarry();
    setFloor(Floor.BASEMENT); // a fresh area (or the debug picker) always starts at its own floor 1
    setArea(next);
  };

  const handleFloorAdvance = (next: Floor) => {
    captureCarry();
    setFloor(next);
  };

  // TRAVEL — a one-way warp to a specific discovered flame's exact area AND
  // floor (unlike handleAreaChange, which always resets to floor 1).
  const handleWarp = (nextArea: Area, nextFloor: Floor) => {
    captureCarry();
    setArea(nextArea);
    setFloor(nextFloor);
  };

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", background: "#0a0a12" }}>
      <Floor1Gameplay
        key={`${area}-${floor}`}
        area={area}
        floor={floor}
        initialSave={carrySaveRef.current}
        progress={progressRef.current}
        onStateReady={(state) => {
          liveStateRef.current = state;
        }}
        onAreaChange={handleAreaChange}
        onFloorAdvance={handleFloorAdvance}
        onWarpToFlame={handleWarp}
      />
      <AreaDebugPicker area={area} onChange={handleAreaChange} />
    </div>
  );
}
