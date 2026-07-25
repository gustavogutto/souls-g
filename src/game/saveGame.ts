import type { PlayerStats } from "./utils/constants";
import { Area, Floor } from "./utils/constants";
import type { ItemSlot } from "./utils/items";
import type { ItemUpgrades } from "./utils/equipment";
import { getEffectiveMaxHP } from "./utils/equipment";
import { getMaxStamina } from "./utils/constants";
import type { GameState, ProgressFlags } from "./GameState";

// Minimal single-slot save (phase 3 of the 3D conversion plan) — just the
// player's own progression (stats/gear/hp/flasks) plus which area/floor they
// were on. NOT yet saved: exact position, floor-content state (opened
// chests, dead enemies), since MapGenerator isn't seeded yet (generateMap()
// is unseeded Math.random(), same as the source game before its own
// mapSeed fix) — a reload always regenerates a fresh layout of the saved
// area+floor rather than resuming the exact same one. Full floor-state
// persistence is a separate, not-yet-built gap.
const SAVE_KEY = "echoes_hohenberg_3d_save_v1";
// v5 adds `progress.discoveredFlames`, `progress.flaviannaMet` — both live
// inside the already-saved `progress` object, so schemaVersion must bump
// whenever ProgressFlags itself grows a field an old save won't have, or
// Object.keys() on a missing field would throw for anyone loading an
// older save. v6 adds `fp`.
const SCHEMA_VERSION = 6;

export interface SaveData {
  schemaVersion: number;
  area: Area;
  floor: Floor;
  stats: PlayerStats;
  equipped: Partial<Record<ItemSlot, string>>;
  upgrades: ItemUpgrades;
  hp: number;
  fp: number;
  flaskCharges: number;
  progress: ProgressFlags;
  stash: string[];
}

// Shared by saveGame() (localStorage) and GameScene's in-memory carry-over
// between area/floor transitions within the same session (see its own
// carrySaveRef comment for why that second use exists).
export function toSaveData(state: GameState): SaveData {
  const p = state.player;
  return {
    schemaVersion: SCHEMA_VERSION,
    area: state.area,
    floor: state.floor,
    stats: p.stats,
    equipped: p.equipped,
    upgrades: p.upgrades,
    hp: p.hp,
    fp: p.fp,
    flaskCharges: p.flaskCharges,
    progress: state.progress,
    stash: p.stash,
  };
}

export function saveGame(state: GameState) {
  const data = toSaveData(state);
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
    // Floor is a string enum (no reverse mapping), unlike Area's numeric one
    // just above — `in` can't validate it the same way.
    if (!Object.values(Floor).includes(data.floor)) return null;
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
  p.fp = Math.min(data.fp, p.maxFp);
  p.flaskCharges = Math.min(data.flaskCharges, p.maxFlaskCharges);
  p.stash = [...data.stash];
}
