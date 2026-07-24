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
  cast: boolean; // dedicated cast key, design doc section 1's "Q/R" suggestion
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
}

const YAW_SENSITIVITY = 0.0025;
const PITCH_SENSITIVITY = 0.0022;
const MIN_PITCH = (20 * Math.PI) / 180;
const MAX_PITCH = (65 * Math.PI) / 180;
const INITIAL_PITCH = Math.atan2(10, 9); // matches the old fixed (0, 10, 9) camera offset

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
const KEY_ACTION_MAP: Record<string, keyof ActionPulses> = {
  KeyI: "attackLight",
  KeyJ: "attackHeavy",
  KeyL: "shieldBash",
  Space: "roll",
  KeyF: "heal",
  KeyE: "interact",
  KeyQ: "cast",
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function useGameInput() {
  const axes = useRef<KeyboardAxes>({ forward: false, back: false, left: false, right: false, sprint: false });
  const actions = useRef<ActionPulses>({ attackLight: false, attackHeavy: false, shieldBash: false, roll: false, heal: false, interact: false, cast: false });
  const look = useRef<LookState>({ yaw: 0, pitch: INITIAL_PITCH, locked: false });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const axis = KEY_AXIS_MAP[e.code];
      if (axis) axes.current[axis] = true;
      const action = KEY_ACTION_MAP[e.code];
      if (action) {
        actions.current[action] = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      const axis = KEY_AXIS_MAP[e.code];
      if (axis) axes.current[axis] = false;
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
    const onLockChange = () => {
      look.current.locked = document.pointerLockElement != null;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("click", onClick);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, []);

  return { axes, actions, look };
}

export type GameInput = ReturnType<typeof useGameInput>;
