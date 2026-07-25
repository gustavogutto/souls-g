import { useEffect, useRef } from "react";
import type { GameState } from "./GameState";
import type { LookState } from "./input";
import { Area } from "./utils/constants";
import { FLOOR_SEQUENCE } from "./maps/MapGenerator";

// Runs its own rAF loop (outside the R3F canvas) reading directly from the
// shared mutable GameState — no React re-renders on every HP/stamina tick.
export function HUD({ state, look }: { state: GameState; look: React.MutableRefObject<LookState> }) {
  // area/floor never change without a full remount (see GameScene.tsx's
  // key={`${area}-${floor}`}), so this is safe to compute once rather than
  // re-derive every rAF tick like the rest of this component's live stats.
  const isMultiFloorArea = state.area !== Area.HEARTH && state.area !== Area.PROLOGUE;
  const floorLabel = isMultiFloorArea ? `Floor ${FLOOR_SEQUENCE.indexOf(state.floor) + 1} / ${FLOOR_SEQUENCE.length}` : null;
  const hpBarRef = useRef<HTMLDivElement>(null);
  const hpTextRef = useRef<HTMLDivElement>(null);
  const stamBarRef = useRef<HTMLDivElement>(null);
  const fpBarRef = useRef<HTMLDivElement>(null);
  const enemiesRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const deathRef = useRef<HTMLDivElement>(null);
  const bossPanelRef = useRef<HTMLDivElement>(null);
  const bossNameRef = useRef<HTMLDivElement>(null);
  const bossBarRef = useRef<HTMLDivElement>(null);
  const shownTextIds = useRef<Set<number>>(new Set());
  const lookHintRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      const p = state.player;
      if (hpBarRef.current) hpBarRef.current.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
      if (hpTextRef.current) hpTextRef.current.textContent = `${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`;
      if (stamBarRef.current) stamBarRef.current.style.width = `${Math.max(0, (p.stamina / p.maxStamina) * 100)}%`;
      if (fpBarRef.current) fpBarRef.current.style.width = `${Math.max(0, (p.fp / p.maxFp) * 100)}%`;

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

      const boss = state.boss;
      if (bossPanelRef.current) {
        bossPanelRef.current.style.display = boss && boss.aiState !== "dead" && boss.aiState !== "idle" ? "block" : "none";
        if (boss) {
          if (bossNameRef.current) bossNameRef.current.textContent = boss.name;
          if (bossBarRef.current) bossBarRef.current.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
        }
      }

      if (lookHintRef.current) lookHintRef.current.style.display = look.current.locked ? "none" : "block";
      if (reticleRef.current) {
        reticleRef.current.style.display = look.current.locked ? "block" : "none";
        reticleRef.current.style.background = p.casting ? "#8ec4ff" : "rgba(232,224,212,0.7)";
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state, look]);

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
        <div style={{ height: 8, background: "#0a0f1a", border: "1px solid #1a3a5a", marginTop: 4 }}>
          <div ref={fpBarRef} style={{ height: "100%", background: "#3a7bd5", width: "100%" }} />
        </div>
      </div>

      <div style={{ position: "absolute", top: 20, right: 20, fontSize: 13, opacity: 0.85, textAlign: "right" }}>
        {floorLabel && <div style={{ opacity: 0.7, marginBottom: 2 }}>{floorLabel}</div>}
        <div ref={enemiesRef} />
      </div>

      <div
        ref={bossPanelRef}
        style={{ display: "none", position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)", width: 340, textAlign: "center" }}
      >
        <div ref={bossNameRef} style={{ fontSize: 14, letterSpacing: 2, marginBottom: 4, textShadow: "1px 1px 2px black" }} />
        <div style={{ height: 12, background: "#1a0a0a", border: "1px solid #661a1a" }}>
          <div ref={bossBarRef} style={{ height: "100%", background: "#a8283c", width: "100%", transition: "width 0.15s ease-out" }} />
        </div>
      </div>

      <div ref={logRef} style={{ position: "absolute", top: 20, left: 20, fontSize: 16, fontWeight: "bold", textShadow: "1px 1px 2px black" }} />

      <div style={{ position: "absolute", top: 56, left: "50%", transform: "translateX(-50%)", fontSize: 11, opacity: 0.55, textAlign: "center", lineHeight: 1.6 }}>
        WASD move · LMB attack · RMB block · Middle-click lock-on · J heavy / L bash · Q cast · Space roll · F heal · E interact · C inventory · Shift sprint
      </div>

      <div
        ref={lookHintRef}
        style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          fontSize: 13, opacity: 0.65, textAlign: "center", background: "rgba(5,5,10,0.5)", padding: "8px 16px", borderRadius: 4,
        }}
      >
        Click to enable mouse look
      </div>

      <div
        ref={reticleRef}
        style={{
          display: "none",
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: 5, height: 5, borderRadius: "50%", background: "rgba(232,224,212,0.7)",
        }}
      />

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
