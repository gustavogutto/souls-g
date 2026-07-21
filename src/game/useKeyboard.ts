import { useEffect, useRef } from "react";

export interface KeyboardState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  attack: boolean;
  roll: boolean;
  sprint: boolean;
}

const KEY_MAP: Record<string, keyof KeyboardState> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyJ: "attack",
  Space: "roll",
  KeyK: "roll",
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
};

// Plain mutable ref, read directly inside useFrame loops — no React state
// churn from held keys repainting every frame.
export function useKeyboard() {
  const keys = useRef<KeyboardState>({
    forward: false,
    back: false,
    left: false,
    right: false,
    attack: false,
    roll: false,
    sprint: false,
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const mapped = KEY_MAP[e.code];
      if (mapped) {
        keys.current[mapped] = true;
        if (mapped === "roll" || mapped === "attack") e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      const mapped = KEY_MAP[e.code];
      if (mapped) keys.current[mapped] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  return keys;
}
