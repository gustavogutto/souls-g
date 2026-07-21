import { useEffect, useRef } from "react";

// Two input sources feed the same game — keyboard (desktop) and a touch
// joystick + action buttons (mobile), mirroring Hohenberg's actual scheme
// (I/J/L/Space/F keys; fixed joystick + ROLL/ATK/SHIELD/HEAL buttons).
// Movement is analog (joystick) blended with digital (WASD), combat/roll/
// heal are one-shot "pulses" either source can raise, consumed once by
// Player's frame loop then cleared — this is what lets a keydown handler
// and a touch pointerdown handler both trigger the exact same action
// without the two input paths needing to know about each other.

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
}

export interface JoystickState {
  x: number; // -1..1, +right
  z: number; // -1..1, +back (matches Hohenberg's screen-space down = world +Z convention used throughout this port)
  sprinting: boolean;
}

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
};

export function useGameInput() {
  const axes = useRef<KeyboardAxes>({ forward: false, back: false, left: false, right: false, sprint: false });
  const actions = useRef<ActionPulses>({ attackLight: false, attackHeavy: false, shieldBash: false, roll: false, heal: false });
  const joystick = useRef<JoystickState>({ x: 0, z: 0, sprinting: false });

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
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  return { axes, actions, joystick };
}

export type GameInput = ReturnType<typeof useGameInput>;
