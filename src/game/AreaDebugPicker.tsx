import { Area, AREA_CONFIGS } from "./utils/constants";

// Dev/testing control — no real Ashen Flame travel system exists yet
// (that's phase 9 of the 3D conversion plan), but every area's procedural
// generation needs exercising now, not just Area 1. Regenerates the whole
// floor (fresh MapData + fresh GameState) on change.
const AREAS = [Area.AREA_1, Area.AREA_2, Area.AREA_3, Area.AREA_4, Area.AREA_5];

export function AreaDebugPicker({ area, onChange }: { area: Area; onChange: (a: Area) => void }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        left: 20,
        display: "flex",
        gap: 6,
        fontFamily: "Georgia, serif",
        fontSize: 11,
        zIndex: 10,
      }}
    >
      {AREAS.map((a) => (
        <button
          key={a}
          onClick={() => onChange(a)}
          style={{
            padding: "4px 8px",
            borderRadius: 4,
            border: `1px solid ${a === area ? "#c9a84c" : "rgba(255,255,255,0.25)"}`,
            background: a === area ? "rgba(201,168,76,0.25)" : "rgba(0,0,0,0.4)",
            color: "#e8e0d4",
            cursor: "pointer",
          }}
          title={AREA_CONFIGS[a].name}
        >
          {AREA_CONFIGS[a].name}
        </button>
      ))}
    </div>
  );
}
