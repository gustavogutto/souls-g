import { useState, type MouseEvent } from "react";
import { SAVE_SLOT_COUNT, readSlotSummary, deleteSlot, type SlotSummary } from "./game/saveGame";
import { FLOOR_SEQUENCE } from "./game/maps/MapGenerator";

// Design doc section 14/15 — 3 named save slots, shared between CONTINUE
// (pick an occupied slot to resume) and START (pick any slot; an occupied
// one asks to confirm overwrite first). Ported in spirit from the 2D
// source's SlotPickerScene, trimmed to this port's simpler save shape (no
// playtime tracking, no slot renaming — both real gaps, not attempted here).
export function SlotPicker({
  mode,
  onPick,
  onBack,
}: {
  mode: "continue" | "start";
  onPick: (slot: number) => void;
  onBack: () => void;
}) {
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  const handleClick = (slot: number, summary: SlotSummary | null) => {
    if (mode === "continue") {
      if (!summary) return;
      onPick(slot);
      return;
    }
    if (summary && !window.confirm("Overwrite this journey? This cannot be undone.")) return;
    if (summary) deleteSlot(slot);
    onPick(slot);
  };

  const handleDelete = (e: MouseEvent, slot: number) => {
    e.stopPropagation();
    if (!window.confirm("Delete this save? This cannot be undone.")) return;
    deleteSlot(slot);
    refresh();
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "#05050a",
        display: "flex", flexDirection: "column", alignItems: "center",
        fontFamily: "Georgia, serif", color: "#e8e0d4", padding: "40px 20px",
      }}
    >
      <h2 style={{ fontSize: 20, letterSpacing: 2, color: "#c9a84c", marginBottom: 30 }}>
        {mode === "continue" ? "CONTINUE" : "START"}
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 480 }}>
        {Array.from({ length: SAVE_SLOT_COUNT }).map((_, i) => {
          const summary = readSlotSummary(i);
          const disabled = mode === "continue" && !summary;
          return (
            <div
              key={i}
              onClick={() => handleClick(i, summary)}
              style={{
                position: "relative", border: `1px solid ${summary ? "#c9a84c" : "#3a3a4a"}`, borderRadius: 6,
                padding: "14px 18px", cursor: disabled ? "default" : "pointer",
                background: "rgba(26,26,46,0.9)", opacity: disabled ? 0.5 : 1,
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.7, marginBottom: 6 }}>SLOT {i + 1}</div>
              {summary ? (
                <>
                  <div style={{ fontSize: 13 }}>
                    Lv {summary.level} &middot; {summary.areaName} &mdash; Floor {FLOOR_SEQUENCE.indexOf(summary.floor) + 1}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>Souls {summary.souls.toLocaleString()}</div>
                  <div style={{ fontSize: 10, opacity: 0.5, marginTop: 4 }}>
                    {summary.lastPlayedAt ? new Date(summary.lastPlayedAt).toLocaleString() : ""}
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, i)}
                    style={{
                      position: "absolute", top: 10, right: 10, fontSize: 10, padding: "3px 8px",
                      borderRadius: 3, border: "1px solid #ff6666", background: "rgba(42,20,20,0.9)", color: "#ff6666", cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </>
              ) : (
                <div style={{ fontSize: 13, opacity: 0.6 }}>Empty</div>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={onBack}
        style={{
          marginTop: 30, fontFamily: "Georgia, serif", fontSize: 13, padding: "8px 20px",
          borderRadius: 4, border: "1px solid #6b7b8f", background: "transparent", color: "#e8e0d4", cursor: "pointer",
        }}
      >
        BACK
      </button>
    </div>
  );
}
