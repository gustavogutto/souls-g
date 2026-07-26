import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Mesh } from "three";
import { createGameState, createProgressFlags, type GameState, type ProgressFlags } from "./GameState";
import { useGameInput } from "./input";
import { generateMap, generateHearthMap, generatePortalLabyrinth, FLOOR_SEQUENCE, type MapData } from "./maps/MapGenerator";
import { Floor, Area, AREA_CONFIGS } from "./utils/constants";
import { DungeonRenderer } from "./DungeonRenderer";
import { Player } from "./Player";
import { Enemy } from "./Enemy";
import { Boss } from "./Boss";
import { EntitySeparation } from "./EntitySeparation";
import { Hazards } from "./Hazards";
import { Interactables } from "./Interactables";
import { HearthGates, HEARTH_GATE_LABELS } from "./HearthGates";
import { HearthNPCs, type HearthNpcId } from "./HearthNPCs";
import { FlaviannaEncounter } from "./FlaviannaEncounter";
import { MartynaPanel, VarnPanel, StashPanel, TideRefusedPanel, FlaviannaPanel } from "./HearthNPCPanels";
import { Flames, LayerFlame } from "./Flames";
import { FlamePanel } from "./FlamePanel";
import { PortalEntry, PortalReturn } from "./Portal";
import { LockOnMarker } from "./LockOnMarker";
import { Projectiles } from "./Projectiles";
import { CameraRig } from "./CameraRig";
import { HUD } from "./HUD";
import { InventoryPanel } from "./InventoryPanel";
import { loadGame, saveGame, applySaveData, toSaveData, type SaveData } from "./saveGame";
import { getAreaTheme } from "./utils/areaThemes";
import { INTRO_CRAWL_LINES, FLOOR_LORE } from "./utils/loreText";
import { LoreOverlay } from "./LoreOverlay";
import { PauseMenu } from "./PauseMenu";
import { Minimap } from "./Minimap";

const AUTOSAVE_INTERVAL_MS = 5000;
// See the lighting comment at the <Canvas> lights below — compensates for
// three.js removing legacy-lights PI-normalization around r155.
const LIGHT_INTENSITY_SCALE = Math.PI;

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
    <mesh ref={ref} position={[door.x + 0.5, 1.2, door.y + 0.5]}>
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

// Seamless-portal eligibility (design doc section 2: "floors 2-3 of every
// area, never the floor right before a boss"). FLOOR_SEQUENCE is
// [BASEMENT, GROUND, SECOND, THIRD, TOP] — GROUND/SECOND are indices 1-2;
// THIRD immediately precedes the final TOP boss floor, so it's excluded.
function isPortalEligibleFloor(floor: Floor): boolean {
  return floor === Floor.GROUND || floor === Floor.SECOND;
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
  layer,
  portalReturnAnchor,
  initialSave,
  progress,
  onStateReady,
  onAreaChange,
  onFloorAdvance,
  onWarpToFlame,
  onReturnToTitle,
  onEnterPortal,
  onExitPortal,
}: {
  area: Area;
  floor: Floor;
  layer: "ground" | "bonus";
  portalReturnAnchor: { x: number; y: number } | null;
  initialSave: SaveData | null;
  progress: ProgressFlags;
  onStateReady: (state: GameState) => void;
  onAreaChange: (a: Area) => void;
  onFloorAdvance: (f: Floor) => void;
  onWarpToFlame: (a: Area, f: Floor) => void;
  onReturnToTitle: () => void;
  onEnterPortal: (anchor: { x: number; y: number }) => void;
  onExitPortal: () => void;
}) {
  const dungeonGroupRef = useRef<THREE.Group>(null!);
  const mapData: MapData = useMemo(() => {
    if (area === Area.HEARTH) return generateHearthMap();
    if (layer === "bonus") return generatePortalLabyrinth(floor, area, portalReturnAnchor?.x ?? 0, portalReturnAnchor?.y ?? 0);
    return generateMap(floor, area);
  }, [area, floor, layer, portalReturnAnchor]);
  const theme = useMemo(() => getAreaTheme(area), [area]);
  const [state] = useState<GameState>(() => {
    const s = createGameState(mapData, area, AREA_CONFIGS[area].enemyDamageMultiplier, progress, floor, layer === "bonus");
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
  const [wallRevealVersion, setWallRevealVersion] = useState(0);
  const [pauseOpen, setPauseOpen] = useState(false);
  const gateLabels = area === Area.HEARTH ? HEARTH_GATE_LABELS(state) : [];

  // Narrative (design doc section 11) — both one-time-per-save. The intro
  // crawl marks itself shown immediately (matching the 2D source: it
  // shouldn't re-trigger just because the player closes the tab mid-crawl).
  // Floor-clear lore instead defers its actual area/floor transition until
  // the overlay is dismissed, via pendingAfterLoreRef, instead of racing it.
  const [loreLines, setLoreLines] = useState<string[] | null>(null);
  const pendingAfterLoreRef = useRef<(() => void) | null>(null);

  const anyNamedOverlayOpen = loreLines !== null || activeNpc !== null || inventoryOpen || flameOpen;

  useEffect(() => {
    state.paused = anyNamedOverlayOpen || pauseOpen;
  }, [anyNamedOverlayOpen, pauseOpen, state]);

  // Pause menu (design doc section 15) — Escape toggles it, but only when
  // no other named overlay currently owns the screen (each of those already
  // has its own Escape-closes-me listener; registering ours at the same
  // time would double-fire on the exact same keypress, since DOM listeners
  // don't know about each other). Not registering this listener at all
  // while another overlay is up sidesteps that race entirely, rather than
  // trying to out-guess ordering between independent listeners.
  useEffect(() => {
    if (anyNamedOverlayOpen && !pauseOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") setPauseOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyNamedOverlayOpen, pauseOpen]);

  useEffect(() => {
    onStateReady(state);
    if (area === Area.PROLOGUE && !progress.introLoreShown) {
      progress.introLoreShown = true;
      setLoreLines(INTRO_CRAWL_LINES);
    }
    const interval = setInterval(() => saveGame(state), AUTOSAVE_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      saveGame(state);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advanceFloor = () => {
    if (isMultiFloorArea(area) && !isFinalFloor) onFloorAdvance(FLOOR_SEQUENCE[floorIdx + 1]);
    else onAreaChange(Area.HEARTH);
  };

  const handleReachEnd = () => {
    const loreKey = `${area}-${floor}`;
    const loreLine = FLOOR_LORE[area]?.[floorIdx];
    if (loreLine && !progress.floorLoreShown[loreKey]) {
      progress.floorLoreShown[loreKey] = true;
      pendingAfterLoreRef.current = advanceFloor;
      setLoreLines([loreLine]);
    } else {
      advanceFloor();
    }
  };

  const handleLoreDone = () => {
    setLoreLines(null);
    const pending = pendingAfterLoreRef.current;
    pendingAfterLoreRef.current = null;
    pending?.();
  };

  return (
    <>
      {/* dpr defaults to [1,2] in r3f — on any display with devicePixelRatio
          above 1 (extremely common: laptop displays at 125-200% OS scaling,
          most 4K monitors, all Retina/HiDPI screens) that's up to 4x the
          shaded pixels of a plain 1:1 canvas. Fullscreen also covers far more
          physical screen area than a windowed tab (no browser chrome eating
          into it), so both effects compound — measured live: 54fps windowed
          vs 15fps fullscreen on this user's hardware, a ~3.5x drop that
          tracks almost exactly with dpr/area scaling, not entity count (already
          confirmed separately: cutting enemies 96->24 didn't move this at all).
          Capping dpr at 1 trades some supersampling sharpness for directly
          undoing that multiplier. */}
      {/* Shadows removed entirely (2026-07-26): every enemy (up to 24/floor),
          the boss, player, every interactable/NPC, and the merged dungeon
          mesh all had castShadow set, meaning all of it got rendered a SECOND
          time every frame for the shadow depth pass, plus per-fragment shadow
          map sampling in the main pass. On top of that, the directional
          light's shadow camera never followed the player and used three's
          default (small, fixed near world origin) frustum — on maps now up
          to 315 units across, shadows were almost certainly not rendering
          correctly most of the time anyway. Paying real GPU cost for a
          feature that mostly wasn't working. */}
      <Canvas dpr={1} camera={{ fov: 45, near: 0.1, far: 200 }}>
        <color attach="background" args={[theme.background]} />
        <fog attach="fog" args={[theme.fogColor, theme.fogNear, theme.fogFar]} />
        {/* All light intensities below are scaled by LIGHT_INTENSITY_SCALE (~pi).
            three.js removed the old "legacy lights" PI-normalization around r155
            (this project is on 0.185.1) — every light in the scene now renders
            about 3x dimmer than the same intensity number used to under the old
            default. Theme intensities (ambientIntensity/sunIntensity, all small
            "legacy-style" round numbers like 0.4-1.5) were never rescaled for
            that change, so any surface relying only on ambient (a wall facing
            away from the single directional light) reads as near-flat-black —
            reported repeatedly as "the wall looks broken" before this fix. */}
        <ambientLight intensity={theme.ambientIntensity * LIGHT_INTENSITY_SCALE} color={theme.ambientColor} />
        <directionalLight
          position={[8, 14, 6]}
          intensity={theme.sunIntensity * LIGHT_INTENSITY_SCALE}
          color={theme.sunColor}
        />
        <pointLight position={[0, 6, 0]} intensity={0.4 * LIGHT_INTENSITY_SCALE} color={theme.special} />

        <group ref={dungeonGroupRef}>
          <DungeonRenderer mapData={mapData} theme={theme} revealVersion={wallRevealVersion} />
        </group>
        <Player state={state} input={input} />
        {state.enemies.map((e) => (
          <Enemy key={e.id} state={state} enemyState={e} />
        ))}
        {state.boss && <Boss state={state} bossState={state.boss} />}
        <EntitySeparation state={state} />
        <BossGateDoor state={state} />
        <Hazards state={state} />
        <Interactables state={state} input={input} onIllusoryWallRevealed={() => setWallRevealVersion((v) => v + 1)} />
        <HearthGates state={state} input={input} onTravel={onAreaChange} />
        <HearthNPCs state={state} input={input} onTalk={setActiveNpc} />
        <FlaviannaEncounter state={state} input={input} onTalk={() => setActiveNpc("flavianna")} />
        {isMultiFloorArea(area) && <Flames state={state} input={input} onInteract={() => setFlameOpen(true)} />}
        {layer === "ground" && isMultiFloorArea(area) && isPortalEligibleFloor(floor) && (
          <PortalEntry state={state} input={input} onEnter={() => mapData.portalAnchor && onEnterPortal(mapData.portalAnchor)} />
        )}
        {layer === "bonus" && (
          <>
            <LayerFlame state={state} input={input} />
            <PortalReturn state={state} input={input} onReturn={onExitPortal} />
          </>
        )}
        <EndPortalWatcher state={state} onReachEnd={handleReachEnd} />
        <Projectiles state={state} />
        <LockOnMarker state={state} />
        <CameraRig state={state} dungeonGroup={dungeonGroupRef} look={input.look} />
      </Canvas>
      <HUD state={state} look={input.look} />
      <Minimap state={state} />
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
      {loreLines && <LoreOverlay lines={loreLines} onDone={handleLoreDone} />}
      <PauseMenu
        open={pauseOpen}
        onResume={() => setPauseOpen(false)}
        onReturnToTitle={() => {
          saveGame(state);
          onReturnToTitle();
        }}
      />
    </>
  );
}

export function GameScene({ onReturnToTitle }: { onReturnToTitle: () => void }) {
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
  // Seamless-portal system (design doc section 2) — "ground" is the normal
  // floor, "bonus" is the hidden labyrinth reached through it. Neither is
  // persisted in SaveData: quitting/reloading while inside a bonus layer
  // just drops the player back on the ground floor next session, same as
  // any other unsaved-position transition in this game.
  const [layer, setLayer] = useState<"ground" | "bonus">("ground");
  const [portalReturnAnchor, setPortalReturnAnchor] = useState<{ x: number; y: number } | null>(null);

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
    setLayer("ground"); // a portal anchor is only ever meaningful on the ground floor that spawned it
  };

  const handleFloorAdvance = (next: Floor) => {
    captureCarry();
    setFloor(next);
    setLayer("ground");
  };

  // TRAVEL — a one-way warp to a specific discovered flame's exact area AND
  // floor (unlike handleAreaChange, which always resets to floor 1).
  const handleWarp = (nextArea: Area, nextFloor: Floor) => {
    captureCarry();
    setArea(nextArea);
    setFloor(nextFloor);
    setLayer("ground");
  };

  const handleEnterPortal = (anchor: { x: number; y: number }) => {
    captureCarry();
    setPortalReturnAnchor(anchor);
    setLayer("bonus");
  };

  const handleExitPortal = () => {
    captureCarry();
    setLayer("ground");
  };

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", background: "#0a0a12" }}>
      <Floor1Gameplay
        key={`${area}-${floor}-${layer}`}
        area={area}
        floor={floor}
        layer={layer}
        portalReturnAnchor={portalReturnAnchor}
        initialSave={carrySaveRef.current}
        progress={progressRef.current}
        onStateReady={(state) => {
          liveStateRef.current = state;
        }}
        onAreaChange={handleAreaChange}
        onFloorAdvance={handleFloorAdvance}
        onWarpToFlame={handleWarp}
        onReturnToTitle={onReturnToTitle}
        onEnterPortal={handleEnterPortal}
        onExitPortal={handleExitPortal}
      />
    </div>
  );
}
