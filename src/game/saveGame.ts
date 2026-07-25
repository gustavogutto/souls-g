import type { PlayerStats } from "./utils/constants";
import { Area, Floor, AREA_CONFIGS } from "./utils/constants";
import type { ItemSlot } from "./utils/items";
import type { ItemUpgrades } from "./utils/equipment";
import { getEffectiveMaxHP } from "./utils/equipment";
import { getMaxStamina } from "./utils/constants";
import type { GameState, ProgressFlags } from "./GameState";

// 3 named save slots (design doc section 14) — just the player's own
// progression (stats/gear/hp/flasks) plus which area/floor they were on.
// NOT yet saved: exact position, floor-content state (opened chests, dead
// enemies), since MapGenerator isn't seeded yet (generateMap() is unseeded
// Math.random(), same as the source game before its own mapSeed fix) — a
// reload always regenerates a fresh layout of the saved area+floor rather
// than resuming the exact same one. Full floor-state persistence is a
// separate, not-yet-built gap.
export const SAVE_SLOT_COUNT = 3;
const SAVE_KEY_PREFIX = "echoes_hohenberg_3d_save_slot_";
const LAST_ACTIVE_SLOT_KEY = "echoes_hohenberg_3d_last_active_slot";
// v5 adds `progress.discoveredFlames`, `progress.flaviannaMet` — both live
// inside the already-saved `progress` object, so schemaVersion must bump
// whenever ProgressFlags itself grows a field an old save won't have, or
// Object.keys() on a missing field would throw for anyone loading an
// older save. v6 adds `fp`. v7 adds `progress.introLoreShown`/
// `progress.floorLoreShown`. v8 moves to per-slot storage keys and adds
// `lastPlayedAt`.
const SCHEMA_VERSION = 8;

function slotKey(slot: number): string {
  return `${SAVE_KEY_PREFIX}${slot}`;
}

// In-memory only, set by the slot picker before GameScene ever mounts —
// every saveGame()/loadGame() call site stays zero-argument (bar the
// picker's own summary reads) and just targets whichever slot is active.
let activeSlot = 0;

export function setActiveSlot(slot: number) {
  activeSlot = slot;
  try {
    localStorage.setItem(LAST_ACTIVE_SLOT_KEY, String(slot));
  } catch {
    // Storage unavailable — the picker just won't remember a default highlight.
  }
}

export function getActiveSlot(): number {
  return activeSlot;
}

// Read by the slot picker to decide which row to default-highlight on open.
export function getLastActiveSlot(): number {
  try {
    const raw = localStorage.getItem(LAST_ACTIVE_SLOT_KEY);
    const n = raw !== null ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n >= 0 && n < SAVE_SLOT_COUNT ? n : 0;
  } catch {
    return 0;
  }
}

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
  lastPlayedAt: number;
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
    lastPlayedAt: Date.now(),
  };
}

export function saveGame(state: GameState) {
  const data = toSaveData(state);
  try {
    localStorage.setItem(slotKey(activeSlot), JSON.stringify(data));
  } catch {
    // localStorage unavailable (private browsing, quota) — never let a save
    // failure interrupt gameplay.
  }
}

export function loadGame(slot: number = activeSlot): SaveData | null {
  try {
    const raw = localStorage.getItem(slotKey(slot));
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

export function hasAnySave(): boolean {
  for (let i = 0; i < SAVE_SLOT_COUNT; i++) {
    if (loadGame(i)) return true;
  }
  return false;
}

export function deleteSlot(slot: number) {
  try {
    localStorage.removeItem(slotKey(slot));
  } catch {
    // no-op
  }
}

export interface SlotSummary {
  level: number;
  areaName: string;
  floor: Floor;
  souls: number;
  lastPlayedAt: number;
}

// Reads just enough of a slot's save for the picker's per-row display —
// null ("Empty") if the slot has nothing or fails to parse.
export function readSlotSummary(slot: number): SlotSummary | null {
  const data = loadGame(slot);
  if (!data) return null;
  return {
    level: data.stats.level,
    areaName: AREA_CONFIGS[data.area]?.name ?? "?",
    floor: data.floor,
    souls: data.stats.souls,
    lastPlayedAt: data.lastPlayedAt ?? 0,
  };
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
