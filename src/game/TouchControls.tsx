import { useRef, useState, useEffect } from "react";
import type { CSSProperties } from "react";
import type { GameInput } from "./input";
import type { GameState } from "./GameState";
import { ATK_HEAVY_HOLD_MS } from "./gameConstants";

// Mirrors Hohenberg's TouchControls.ts layout: a fixed joystick on the left,
// an action cluster on the right (ROLL/ATK/SHIELD/HEAL). Pointer events work
// for both touch and mouse, so this is testable on desktop too, not just
// hidden behind a touch-detection gate.

const JOYSTICK_RADIUS = 58;
const JOYSTICK_SPRINT_THRESHOLD = 1.35; // raw drag distance, as a multiple of the radius

function Joystick({ input }: { input: GameInput }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const activePointerId = useRef<number | null>(null);

  const updateKnob = (clientX: number, clientY: number) => {
    const base = baseRef.current!;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const rawDist = Math.hypot(dx, dy);
    const dist = Math.min(rawDist, JOYSTICK_RADIUS);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * dist;
    const ky = Math.sin(angle) * dist;
    if (knobRef.current) knobRef.current.style.transform = `translate(${kx}px, ${ky}px)`;
    input.joystick.current.x = kx / JOYSTICK_RADIUS;
    input.joystick.current.z = ky / JOYSTICK_RADIUS;
    input.joystick.current.sprinting = rawDist / JOYSTICK_RADIUS >= JOYSTICK_SPRINT_THRESHOLD;
  };

  const reset = () => {
    activePointerId.current = null;
    input.joystick.current.x = 0;
    input.joystick.current.z = 0;
    input.joystick.current.sprinting = false;
    if (knobRef.current) knobRef.current.style.transform = `translate(0px, 0px)`;
  };

  return (
    <div
      ref={baseRef}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        activePointerId.current = e.pointerId;
        updateKnob(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (activePointerId.current !== e.pointerId) return;
        updateKnob(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (activePointerId.current !== e.pointerId) return;
        reset();
      }}
      onPointerCancel={reset}
      style={{
        position: "absolute",
        left: 40,
        bottom: 40,
        width: JOYSTICK_RADIUS * 2,
        height: JOYSTICK_RADIUS * 2,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.12)",
        border: "1px solid rgba(255,255,255,0.25)",
        touchAction: "none",
        pointerEvents: "auto",
      }}
    >
      <div
        ref={knobRef}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 44,
          height: 44,
          marginLeft: -22,
          marginTop: -22,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.28)",
        }}
      />
    </div>
  );
}

function ActionButton({
  label,
  style,
  color,
  disabled,
  onTap,
  onHoldReached,
  holdMs,
}: {
  label: string;
  style: CSSProperties;
  color: string;
  disabled?: boolean;
  onTap: () => void;
  onHoldReached?: () => void;
  holdMs?: number;
}) {
  const holdFiredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancel = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = undefined;
  };

  return (
    <div
      onPointerDown={(e) => {
        if (disabled) return;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        holdFiredRef.current = false;
        if (onHoldReached && holdMs) {
          timerRef.current = setTimeout(() => {
            holdFiredRef.current = true;
            onHoldReached();
          }, holdMs);
        }
      }}
      onPointerUp={() => {
        if (disabled) return;
        if (!holdFiredRef.current) onTap();
        cancel();
      }}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      style={{
        position: "absolute",
        borderRadius: "50%",
        background: disabled ? "rgba(120,120,120,0.15)" : `${color}59`,
        border: `1px solid ${disabled ? "rgba(150,150,150,0.3)" : color}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        color: disabled ? "rgba(220,220,220,0.4)" : "#e8e0d4",
        fontFamily: "Georgia, serif",
        touchAction: "none",
        pointerEvents: "auto",
        userSelect: "none",
        ...style,
      }}
    >
      {label}
    </div>
  );
}

export function TouchControls({ input, state, onToggleInventory }: { input: GameInput; state: GameState; onToggleInventory: () => void }) {
  const [flaskCharges, setFlaskCharges] = useState(state.player.flaskCharges);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      setFlaskCharges(state.player.flaskCharges);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <Joystick input={input} />

      <ActionButton
        label="ROLL"
        color="#66cc66"
        style={{ left: 130, bottom: 220, width: 60, height: 60 }}
        onTap={() => (input.actions.current.roll = true)}
      />

      <ActionButton
        label="SHLD"
        color="#6699ff"
        style={{ right: 160, bottom: 210, width: 64, height: 64 }}
        onTap={() => (input.actions.current.shieldBash = true)}
      />

      <ActionButton
        label={flaskCharges > 0 ? `HEAL ${flaskCharges}` : "HEAL 0"}
        color="#2e8b57"
        disabled={flaskCharges <= 0}
        style={{ right: 40, bottom: 240, width: 56, height: 56 }}
        onTap={() => (input.actions.current.heal = true)}
      />

      <ActionButton
        label="ATK"
        color="#cc3333"
        style={{ right: 40, bottom: 40, width: 84, height: 84 }}
        holdMs={ATK_HEAVY_HOLD_MS}
        onTap={() => (input.actions.current.attackLight = true)}
        onHoldReached={() => (input.actions.current.attackHeavy = true)}
      />

      <ActionButton label="INV" color="#c9a84c" style={{ right: 20, top: 56, width: 44, height: 44 }} onTap={onToggleInventory} />
    </div>
  );
}
