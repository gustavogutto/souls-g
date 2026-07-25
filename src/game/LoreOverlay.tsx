import { useState } from "react";

// Design doc section 11 — the opening crawl (multi-line) and per-floor-
// clear lore beats (single line) share this same click-to-advance overlay.
export function LoreOverlay({ lines, onDone }: { lines: string[]; onDone: () => void }) {
  const [i, setI] = useState(0);

  const advance = () => {
    if (i + 1 >= lines.length) onDone();
    else setI((v) => v + 1);
  };

  return (
    <div
      onClick={advance}
      style={{
        position: "absolute", inset: 0, background: "rgba(5,5,10,0.92)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 60, cursor: "pointer", fontFamily: "Georgia, serif", color: "#e8e0d4", padding: 40,
      }}
    >
      <div style={{ maxWidth: 640, textAlign: "center" }}>
        <p style={{ fontSize: 16, lineHeight: 1.8, fontStyle: "italic" }}>{lines[i]}</p>
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 24 }}>Click to continue</div>
      </div>
    </div>
  );
}
