import type { CSSProperties } from "react";

// Design doc section 15 — the title screen. No settings screen yet (no
// settings exist in this port to configure), so just CONTINUE (when any
// slot has a save) and START.
export function TitleScreen({ canContinue, onContinue, onStart }: { canContinue: boolean; onContinue: () => void; onStart: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "#05050a",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        fontFamily: "Georgia, serif", color: "#e8e0d4", gap: 14,
      }}
    >
      <h1 style={{ fontSize: 40, letterSpacing: 3, color: "#c9a84c", margin: 0 }}>HOHENBERG</h1>
      <p style={{ fontSize: 14, color: "#6b7b8f", margin: "0 0 30px" }}>Echoes of the Old Continent</p>

      {canContinue && (
        <button onClick={onContinue} style={menuButtonStyle}>
          CONTINUE
        </button>
      )}
      <button onClick={onStart} style={menuButtonStyle}>
        START
      </button>

      <div style={{ position: "absolute", right: 10, bottom: 8, fontSize: 9, color: "#3a3a4a" }}>souls-g</div>
    </div>
  );
}

const menuButtonStyle: CSSProperties = {
  fontFamily: "Georgia, serif",
  fontSize: 18,
  letterSpacing: 1,
  color: "#e8e0d4",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "6px 0",
};
