import { useEffect, useState } from "react";
import { type GameState, restAtFlame, listDiscoveredFlames, flameKey } from "./GameState";
import { AREA_CONFIGS, Area, Floor } from "./utils/constants";
import { FLOOR_SEQUENCE } from "./maps/MapGenerator";

// The Ashen Flame's interact menu — REST (full heal, always available),
// TRAVEL (warp to any other discovered flame, shown once a second flame has
// been discovered), and ASHEN HEARTH (return to the hub — a paused round
// trip, unlike TRAVEL's one-way floor change). Design doc section 2.
export function FlamePanel({
  state,
  open,
  onClose,
  onWarp,
  onReturnHearth,
}: {
  state: GameState;
  open: boolean;
  onClose: () => void;
  onWarp: (area: Area, floor: Floor) => void;
  onReturnHearth: () => void;
}) {
  const [view, setView] = useState<"main" | "travel">("main");
  const [restedLabel, setRestedLabel] = useState("REST");

  useEffect(() => {
    state.paused = open;
    if (open && document.pointerLockElement) document.exitPointerLock();
    if (open) {
      markDiscovered(state);
      setView("main");
      setRestedLabel("REST");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, state]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const otherFlames = listDiscoveredFlames(state.progress)
    .filter((f) => !(f.area === state.area && f.floor === state.floor))
    .sort((a, b) => a.area - b.area || FLOOR_SEQUENCE.indexOf(a.floor) - FLOOR_SEQUENCE.indexOf(b.floor));

  const doRest = () => {
    restAtFlame(state);
    setRestedLabel("Restored");
  };

  return (
    <div
      style={{
        position: "absolute", inset: 0, background: "rgba(5,5,10,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "Georgia, serif", color: "#e8e0d4", zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{ width: 340, maxWidth: "92vw", background: "#12121c", border: "1px solid #3a3a4a", borderRadius: 8, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <div style={{ fontSize: 18, letterSpacing: 1, color: "#ff8c00" }}>THE ASHEN FLAME</div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>Esc to close</div>
        </div>

        {view === "main" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={doRest} style={btnStyle("#c9a84c")}>{restedLabel}</button>
            {otherFlames.length > 0 && (
              <button onClick={() => setView("travel")} style={btnStyle("#4fc3f7")}>TRAVEL</button>
            )}
            <button onClick={() => { onReturnHearth(); onClose(); }} style={btnStyle("#ff8c00")}>ASHEN HEARTH</button>
          </div>
        )}

        {view === "travel" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {otherFlames.map((f) => (
              <button
                key={flameKey(f.area, f.floor)}
                onClick={() => { onWarp(f.area, f.floor); onClose(); }}
                style={btnStyle("#4fc3f7")}
              >
                {AREA_CONFIGS[f.area].name} — Floor {FLOOR_SEQUENCE.indexOf(f.floor) + 1}
              </button>
            ))}
            <button onClick={() => setView("main")} style={btnStyle("#6b7b8f")}>BACK</button>
          </div>
        )}
      </div>
    </div>
  );
}

function markDiscovered(state: GameState) {
  state.progress.discoveredFlames[flameKey(state.area, state.floor)] = true;
}

function btnStyle(color: string): React.CSSProperties {
  return {
    fontSize: 13, padding: "10px 16px", borderRadius: 4, border: `1px solid ${color}`,
    background: `${color}22`, color: "#e8e0d4", cursor: "pointer",
  };
}
