import { useEffect, useRef } from "react";
import type { GameState } from "./GameState";

// Runs its own rAF loop (outside the R3F canvas) reading directly from the
// shared mutable GameState — no React re-renders on every HP/stamina tick.
export function HUD({ state }: { state: GameState }) {
  const hpBarRef = useRef<HTMLDivElement>(null);
  const hpTextRef = useRef<HTMLDivElement>(null);
  const stamBarRef = useRef<HTMLDivElement>(null);
  const enemiesRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const deathRef = useRef<HTMLDivElement>(null);
  const shownTextIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    let raf: number;
    const tick = () => {
      const p = state.player;
      if (hpBarRef.current) hpBarRef.current.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
      if (hpTextRef.current) hpTextRef.current.textContent = `${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`;
      if (stamBarRef.current) stamBarRef.current.style.width = `${Math.max(0, (p.stamina / p.maxStamina) * 100)}%`;

      const alive = state.enemies.filter((e) => e.aiState !== "dead").length;
      if (enemiesRef.current) enemiesRef.current.textContent = `Enemies remaining: ${alive} / ${state.enemies.length}`;

      if (logRef.current) {
        const recent = state.floatingText.slice(-4);
        for (const t of recent) {
          if (shownTextIds.current.has(t.id)) continue;
          shownTextIds.current.add(t.id);
          const line = document.createElement("div");
          line.textContent = t.text;
          line.style.color = t.color;
          line.style.opacity = "1";
          line.style.transition = "opacity 1.2s ease-out";
          logRef.current.appendChild(line);
          requestAnimationFrame(() => {
            line.style.opacity = "0";
          });
          setTimeout(() => line.remove(), 1400);
          while (logRef.current.childNodes.length > 6) logRef.current.removeChild(logRef.current.firstChild!);
        }
      }

      if (deathRef.current) deathRef.current.style.display = p.dead ? "flex" : "none";

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", fontFamily: "Georgia, serif", color: "#e8e0d4" }}>
      <div style={{ position: "absolute", left: 20, bottom: 20, width: 260 }}>
        <div style={{ fontSize: 12, letterSpacing: 1, opacity: 0.8, marginBottom: 2 }}>VIGOR</div>
        <div style={{ height: 16, background: "#1a0a0a", border: "1px solid #661a1a" }}>
          <div ref={hpBarRef} style={{ height: "100%", background: "#cc3333", width: "100%" }} />
        </div>
        <div ref={hpTextRef} style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }} />
        <div style={{ height: 8, background: "#0a1a12", border: "1px solid #1a4a2e", marginTop: 6 }}>
          <div ref={stamBarRef} style={{ height: "100%", background: "#2e8b57", width: "100%" }} />
        </div>
      </div>

      <div ref={enemiesRef} style={{ position: "absolute", top: 20, right: 20, fontSize: 13, opacity: 0.85 }} />

      <div ref={logRef} style={{ position: "absolute", top: 20, left: 20, fontSize: 16, fontWeight: "bold", textShadow: "1px 1px 2px black" }} />

      <div style={{ position: "absolute", top: 56, left: "50%", transform: "translateX(-50%)", fontSize: 11, opacity: 0.55, textAlign: "center", lineHeight: 1.6 }}>
        WASD move · I light / J heavy / L bash · Space roll · F heal · Shift sprint
        <br />
        (or the on-screen joystick + ROLL / ATK (hold for heavy) / SHLD / HEAL buttons)
      </div>

      <div
        ref={deathRef}
        style={{
          display: "none",
          position: "absolute",
          inset: 0,
          background: "rgba(10,5,5,0.85)",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
        }}
      >
        <div style={{ fontSize: 42, color: "#cc3333", letterSpacing: 4 }}>YOU DIED</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 12 }}>Refresh to try again</div>
      </div>
    </div>
  );
}
