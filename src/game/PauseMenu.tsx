// Design doc section 15 — the in-run system menu. Trimmed from the 2D
// source's PauseScene: RESUME + RETURN TO TITLE only (no PROGRESS/SETTINGS
// rows — no minimap or settings exist yet in this port to back them).
export function PauseMenu({ open, onResume, onReturnToTitle }: { open: boolean; onResume: () => void; onReturnToTitle: () => void }) {
  if (!open) return null;

  const handleReturnToTitle = () => {
    if (window.confirm("Progress is saved. Return to title?")) onReturnToTitle();
  };

  return (
    <div
      style={{
        position: "absolute", inset: 0, background: "rgba(5,5,10,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "Georgia, serif", color: "#e8e0d4", zIndex: 70,
      }}
      onClick={onResume}
    >
      <div
        style={{ width: 280, background: "#0a0a12", border: "1px solid #5a5a6a", borderRadius: 8, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 12 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, letterSpacing: 2, color: "#c9a84c", textAlign: "center", marginBottom: 8 }}>SYSTEM</div>
        <button onClick={onResume} style={rowStyle("#c9a84c")}>RESUME</button>
        <button onClick={handleReturnToTitle} style={rowStyle("#ff6666")}>RETURN TO TITLE</button>
      </div>
    </div>
  );
}

function rowStyle(color: string) {
  return {
    fontFamily: "Georgia, serif",
    fontSize: 13,
    padding: "10px 0",
    borderRadius: 4,
    border: `1px solid ${color}`,
    background: `${color}22`,
    color: "#e8e0d4",
    cursor: "pointer",
  } as const;
}
