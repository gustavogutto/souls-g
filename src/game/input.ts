import { useEffect, useRef } from "react";

// PC-only: keyboard axes for movement, mirroring Hohenberg's original key
// choices (I/J/L/Space/F) per the 3D design doc's keybind table. Combat/
// roll/heal/interact are one-shot "pulses" raised on keydown and consumed
// once by Player's frame loop then cleared.

export interface KeyboardAxes {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
}

export interface ActionPulses {
  attackLight: boolean;
  attackHeavy: boolean;
  shieldBash: boolean;
  roll: boolean;
  heal: boolean;
  interact: boolean; // chests + secret-fight levers — no Hohenberg precedent (this port's own addition)
  cast: boolean; // right mouse button (see onMouseDown below)
  lockOn: boolean; // middle-click toggle, this port's own addition (see GameState.toggleLockOn)
}

// Continuous (not pulsed) state — block is a held stance, not a one-shot
// action, so it can't live in ActionPulses' consume-once model. Driven by
// Q (see the keydown/keyup handlers below), not a mouse button.
export interface HeldState {
  block: boolean;
}

// Souls-like third-person orbit: yaw is free (mouse X), pitch is clamped to
// a narrow band so the camera can't flip into a free-fly top-down/underneath
// view — see design doc section 1's "fixed-ish pitch" framing. Both Player
// (to build a camera-relative movement basis) and CameraRig (to place the
// camera itself) read this same ref, so there's exactly one source of truth
// for "which way is the camera looking" per frame.
export interface LookState {
  yaw: number;
  pitch: number;
  locked: boolean; // pointer-lock engaged — mouse-look does nothing until the player clicks once (browser API requirement)
  zoomOffset: number; // scroll-wheel add-on to CameraRig's DESIRED_DISTANCE, clamped there
}

const YAW_SENSITIVITY = 0.0025;
const PITCH_SENSITIVITY = 0.0022;
const MIN_PITCH = (20 * Math.PI) / 180;
const MAX_PITCH = (65 * Math.PI) / 180;
const INITIAL_PITCH = Math.atan2(10, 9); // matches the old fixed (0, 10, 9) camera offset
const ZOOM_SENSITIVITY = 0.0035;
const MIN_ZOOM_OFFSET = -3.5; // closer than default
const MAX_ZOOM_OFFSET = 6; // further than default

const KEY_AXIS_MAP: Record<string, keyof KeyboardAxes> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
};

// Matches Hohenberg's real keybinds exactly: I light, J heavy, L bash, F heal.
// Cast moved to RMB and block moved to Q (user swap request 2026-07-26) — Q
// is a held key with its own tap/hold split (see the down/up handlers
// below), so it's deliberately not in this one-shot pulse map. L still
// fires shieldBash directly too; Q's quick-tap bash is additive, not a
// replacement for it.
const KEY_ACTION_MAP: Record<string, keyof ActionPulses> = {
  KeyI: "attackLight",
  KeyJ: "attackHeavy",
  KeyL: "shieldBash",
  Space: "roll",
  KeyF: "heal",
  KeyE: "interact",
};

// Below this duration, a Q press is treated as a bash tap instead of a
// block hold — mirrors the classic Souls "hold to block, tap to bash"
// single-button shield control.
const BASH_TAP_MS = 220;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function useGameInput() {
  const axes = useRef<KeyboardAxes>({ forward: false, back: false, left: false, right: false, sprint: false });
  const actions = useRef<ActionPulses>({ attackLight: false, attackHeavy: false, shieldBash: false, roll: false, heal: false, interact: false, cast: false, lockOn: false });
  const look = useRef<LookState>({ yaw: 0, pitch: INITIAL_PITCH, locked: false, zoomOffset: 0 });
  const held = useRef<HeldState>({ block: false });
  const qPressStart = useRef<number | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const axis = KEY_AXIS_MAP[e.code];
      if (axis) axes.current[axis] = true;
      const action = KEY_ACTION_MAP[e.code];
      if (action) {
        actions.current[action] = true;
        e.preventDefault();
      }
      if (e.code === "KeyQ" && qPressStart.current === null) {
        held.current.block = true;
        qPressStart.current = performance.now();
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      const axis = KEY_AXIS_MAP[e.code];
      if (axis) axes.current[axis] = false;
      if (e.code === "KeyQ" && qPressStart.current !== null) {
        held.current.block = false;
        if (performance.now() - qPressStart.current < BASH_TAP_MS) actions.current.shieldBash = true;
        qPressStart.current = null;
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!look.current.locked) return;
      look.current.yaw -= e.movementX * YAW_SENSITIVITY;
      look.current.pitch = clamp(look.current.pitch + e.movementY * PITCH_SENSITIVITY, MIN_PITCH, MAX_PITCH);
    };
    const onClick = (e: MouseEvent) => {
      // Scoped to the canvas itself — a bare `window` click listener would
      // also fire (and grab the mouse) when clicking Martyna/Varn/inventory
      // buttons or the debug area picker, which is broken UX for a modal
      // that needs a free, visible cursor.
      if (document.pointerLockElement == null && e.target instanceof HTMLCanvasElement) {
        document.body.requestPointerLock();
      }
    };
    // Left click = attack, right click = cast — only once the pointer is
    // actually locked, so the very first click (which just engages pointer
    // lock via onClick above) doesn't also throw a punch, and so UI buttons
    // (inventory, NPC panels) underneath an unlocked cursor never trigger
    // combat. Block moved to Q (see the keydown/keyup handlers above).
    const onMouseDown = (e: MouseEvent) => {
      if (!look.current.locked) return;
      if (e.button === 0) actions.current.attackLight = true;
      else if (e.button === 1) {
        actions.current.lockOn = true;
        e.preventDefault(); // middle-click otherwise triggers Chrome's autoscroll cursor
      } else if (e.button === 2) actions.current.cast = true;
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    // Scroll to zoom the third-person camera in/out (user request — a fixed
    // distance never suited every fight/corridor). Gated on pointer lock
    // like the other game-only inputs, both so menus keep their own scroll
    // untouched and so it can't fire before the player's ever clicked in.
    const onWheel = (e: WheelEvent) => {
      if (!look.current.locked) return;
      e.preventDefault();
      look.current.zoomOffset = clamp(look.current.zoomOffset + e.deltaY * ZOOM_SENSITIVITY, MIN_ZOOM_OFFSET, MAX_ZOOM_OFFSET);
    };
    const onLockChange = () => {
      look.current.locked = document.pointerLockElement != null;
      // Losing pointer lock (Escape, alt-tab) mid-hold must not leave the
      // player stuck permanently blocking with no way to release the key.
      if (!look.current.locked) held.current.block = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("click", onClick);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("click", onClick);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("wheel", onWheel);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, []);

  return { axes, actions, look, held };
}

export type GameInput = ReturnType<typeof useGameInput>;
