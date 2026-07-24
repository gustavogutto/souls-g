import { Area, AREA_CONFIGS } from "./constants";

// Per-area visual identity, keyed off AREA_CONFIGS[area].theme. Design doc
// section 2 names a distinct look per area (ice dungeon / mossy castle
// ruins / ember-obsidian / bone-violet / open-air sky / drowned shore /
// firelit hearth) — before this, DungeonRenderer used one hardcoded palette
// for every floor, which is why every area rendered identically.
export interface AreaTheme {
  background: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  ambientColor: string;
  ambientIntensity: number;
  sunColor: string;
  sunIntensity: number;
  floor: string;
  wall: string;
  start: string;
  special: string; // the "ice" tile type slot — repurposed per area (icy patch / tide pool / lava glow / ember glow)
  stairs: string;
  endPortal: string;
}

const THEMES: Record<string, AreaTheme> = {
  ice_dungeon: {
    background: "#0a141f", fogColor: "#0a141f", fogNear: 15, fogFar: 40,
    ambientColor: "#7ea8c9", ambientIntensity: 0.5, sunColor: "#cfe8ff", sunIntensity: 1.3,
    floor: "#1f3a4a", wall: "#3f6478", start: "#2f4f5c", special: "#3a5a6a", stairs: "#4a6a7a", endPortal: "#6a8aac",
  },
  castle_ruins: {
    background: "#0c140f", fogColor: "#0c140f", fogNear: 13, fogFar: 38,
    ambientColor: "#7fae8a", ambientIntensity: 0.45, sunColor: "#bcd9a8", sunIntensity: 1.1,
    floor: "#233524", wall: "#3c5240", start: "#31462f", special: "#2f5a52", stairs: "#4a4030", endPortal: "#5a7a5a",
  },
  molten_sanctum: {
    background: "#140a08", fogColor: "#140a08", fogNear: 10, fogFar: 30,
    ambientColor: "#e08a55", ambientIntensity: 0.4, sunColor: "#ff8844", sunIntensity: 1.4,
    floor: "#241210", wall: "#4a2418", start: "#3a2418", special: "#7a3018", stairs: "#5a2c14", endPortal: "#8a3a1a",
  },
  hollow_spire: {
    background: "#100c18", fogColor: "#100c18", fogNear: 15, fogFar: 42,
    ambientColor: "#a68acb", ambientIntensity: 0.42, sunColor: "#c9a8f0", sunIntensity: 1.15,
    floor: "#241f30", wall: "#4a3f5c", start: "#362c48", special: "#5a4a78", stairs: "#4a3a5a", endPortal: "#6a4a8a",
  },
  sundered_sky: {
    background: "#141c28", fogColor: "#141c28", fogNear: 20, fogFar: 60,
    ambientColor: "#a8c8e8", ambientIntensity: 0.55, sunColor: "#eaf4ff", sunIntensity: 1.5,
    floor: "#2a3a48", wall: "#4a5c6c", start: "#3a4a52", special: "#5a7a94", stairs: "#4a5868", endPortal: "#6a8ca8",
  },
  drowned_shore: {
    background: "#0e1416", fogColor: "#0e1416", fogNear: 12, fogFar: 34,
    ambientColor: "#7aa0a0", ambientIntensity: 0.45, sunColor: "#cfe4d8", sunIntensity: 1.2,
    floor: "#2a2620", wall: "#40382c", start: "#342e24", special: "#1f4a4a", stairs: "#4a3c28", endPortal: "#3a6a68",
  },
  ashen_hearth: {
    background: "#150e08", fogColor: "#150e08", fogNear: 18, fogFar: 50,
    ambientColor: "#e0a868", ambientIntensity: 0.5, sunColor: "#ffcf8a", sunIntensity: 1.1,
    floor: "#2a2018", wall: "#4a3624", start: "#3a2c1c", special: "#6a4020", stairs: "#4a3020", endPortal: "#5a3a20",
  },
};

const DEFAULT_THEME = THEMES.ice_dungeon;

export function getAreaTheme(area: Area): AreaTheme {
  const key = AREA_CONFIGS[area]?.theme;
  return (key && THEMES[key]) || DEFAULT_THEME;
}
