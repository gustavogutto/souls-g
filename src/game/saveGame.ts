import type { PlayerStats } from "./utils/constants";
import { Area } from "./utils/constants";
import type { ItemSlot } from "./utils/items";
import type { ItemUpgrades } from "./utils/equipment";
import { getEffectiveMaxHP } from "./utils/equipment";
import { getMaxStamina } from "./utils/constants";
import type { GameState } from "./GameState";

// Minimal single-slot save (phase 3 of the 3D conversion plan) — just the
// player's own progression (stats/gear/hp/flasks) plus which area they were
// in. NOT yet saved: exact position, floor-content state (opened chests,
// dead enemies), since MapGenerator isn't seeded yet (generateMap() is
// unseeded Math.random(), same as the source game before its own mapSeed
// fix) — a reload always regenerates a fresh layout of the saved area's
// first floor rather than resuming the exact same one. Full floor-state
// persistence is phase 10's job, once there's more than one floor per area
// to actually navigate between.
const SAVE_KEY = "echoes_hohenberg_3d_save_v1";
const SCHEMA_VERSION = 1;

export interface SaveData {
  schemaVersion: number;
  area: Area;
  stats: PlayerStats;
  equipped: Partial<Record<ItemSlot, string>>;
  upgrades: ItemUpgrades;
  hp: number;
  flaskCharges: number;
}

export function saveGame(state: GameState) {
  const p = state.player;
  const data: SaveData = {
    schemaVersion: SCHEMA_VERSION,
    area: state.area,
    stats: p.stats,
    equipped: p.equipped,
    upgrades: p.upgrades,
    hp: p.hp,
    flaskCharges: p.flaskCharges,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable (private browsing, quota) — never let a save
    // failure interrupt gameplay.
  }
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data.schemaVersion !== SCHEMA_VERSION) return null;
    if (!(data.area in Area)) return null;
    return data;
  } catch {
    return null;
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // no-op
  }
}

// Applies saved player data onto a freshly created GameState. Max HP/stamina
// are re-derived from stats+equipment rather than trusted from the save
// file, so a stat/gear formula change between sessions can't desync the caps.
export function applySaveData(state: GameState, data: SaveData) {
  const p = state.player;
  p.stats = { ...data.stats };
  p.equipped = { ...data.equipped };
  p.upgrades = { ...data.upgrades };
  // Inventory itself isn't saved yet (that's real loot-state persistence,
  // phase 10's job) — createPlayerState()'s temporary starter-item seed runs
  // before this does, so any of those starter ids the save says are now
  // equipped must be dropped from the carried list, or they'd show up
  // duplicated (both equipped AND still sitting in inventory).
  const equippedIds = new Set(Object.values(p.equipped));
  p.inventory = p.inventory.filter((id) => !equippedIds.has(id));
  p.maxHp = getEffectiveMaxHP(p.stats.vigor, p.equipped, p.upgrades);
  p.hp = Math.min(data.hp, p.maxHp);
  p.maxStamina = getMaxStamina(p.stats.endurance);
  p.flaskCharges = Math.min(data.flaskCharges, p.maxFlaskCharges);
}
