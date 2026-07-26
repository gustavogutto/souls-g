// Game Constants
export const GAME_VERSION = "0.1.0-taskB";
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const MAP_COLS = 20;
export const MAP_ROWS = 20;

// Portrait canvas dimensions (9:16 ratio)
export const GAME_WIDTH = 390;
export const GAME_HEIGHT = 844;

// Tile shorthand
export const TILE_W = TILE_WIDTH;
export const TILE_H = TILE_HEIGHT;

// ============================================================
// KNIGHT PLAYER SPRITE — real 8-direction art replacing the
// procedural circle. Flip this to false to fall back to the
// circle instantly, no other code changes needed.
// ============================================================
export const USE_KNIGHT_SPRITE = true;

export type Dir8 = "S" | "SW" | "W" | "NW" | "N" | "NE" | "E" | "SE";
// Row order within each action block, matching knight_player_art's own
// sheet_legend.txt exactly.
export const DIR8_ORDER: Dir8[] = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"];

export const KNIGHT_CELL_SIZE = 64;

// action order + frame counts, straight from knight_player_art/sheet_legend.txt
export const KNIGHT_ACTIONS: { action: string; frames: number }[] = [
  { action: "idle", frames: 6 },
  { action: "walk", frames: 8 },
  { action: "light_attack", frames: 6 },
  { action: "heavy_attack", frames: 8 },
  { action: "shield_bash", frames: 6 },
  { action: "roll", frames: 6 },
  { action: "spell_cast", frames: 8 },
  { action: "flask", frames: 6 },
  { action: "hit", frames: 4 },
  { action: "death", frames: 8 },
];

// ============================================================
// ELDEN RING-STYLE 8-STAT ATTRIBUTE SYSTEM
// ============================================================

export interface PlayerStats {
  // 8 core attributes
  vigor: number;        // Max HP
  mind: number;         // Max FP (mana)
  endurance: number;    // Max Stamina + Equip Load
  strength: number;     // Physical damage (STR weapons), heavy shield/weapon requirement
  dexterity: number;    // Physical damage (DEX weapons), slightly speeds casting
  intelligence: number; // Sorcery/magic damage, INT spell requirement
  faith: number;        // Incantation/holy damage, FTH spell requirement
  arcane: number;       // Item discovery, status effect buildup (bleed, poison)

  // Meta
  level: number;
  souls: number; // Currency ("Echoes") — spent directly on stats at Martyna, no auto-leveling
}

export const BASE_STATS: PlayerStats = {
  vigor: 10,
  mind: 10,
  endurance: 10,
  strength: 10,
  dexterity: 10,
  intelligence: 10,
  faith: 10,
  arcane: 10,
  level: 1,
  souls: 0,
};

// ============================================================
// SOFT CAP SYSTEM
// Diminishing returns: strong up to 40, decent to 60, minimal past 60
// ============================================================

function softCapScale(stat: number, baseValue: number, perPointBelow40: number, perPoint40to60: number, perPointAbove60: number): number {
  let result = baseValue;
  const effective = stat - 10; // points invested above base 10

  if (effective <= 0) return result;

  const tier1 = Math.min(effective, 30); // 10-40 range (strong)
  const tier2 = Math.max(0, Math.min(effective - 30, 20)); // 40-60 range (decent)
  const tier3 = Math.max(0, effective - 50); // 60+ range (minimal)

  result += tier1 * perPointBelow40;
  result += tier2 * perPoint40to60;
  result += tier3 * perPointAbove60;

  return Math.floor(result);
}

// ============================================================
// DERIVED STATS FROM ATTRIBUTES
// ============================================================

// Vigor → Max HP
export function getMaxHP(vigor: number): number {
  return softCapScale(vigor, 400, 30, 15, 5);
}

// Mind → Max FP (Mana)
export function getMaxFP(mind: number): number {
  return softCapScale(mind, 80, 10, 5, 2);
}

// Endurance → Max Stamina
export function getMaxStamina(endurance: number): number {
  return softCapScale(endurance, 100, 6, 3, 1);
}

// Endurance → Equip Load
export function getEquipLoad(endurance: number): number {
  return softCapScale(endurance, 40, 3, 1.5, 0.5);
}

// Strength → Physical damage (STR scaling)
export function getStrDamage(strength: number): number {
  return softCapScale(strength, 40, 4, 2, 0.8);
}

// Dexterity → Physical damage (DEX scaling)
export function getDexDamage(dexterity: number): number {
  return softCapScale(dexterity, 35, 3.5, 1.8, 0.7);
}

// Dexterity → Cast speed multiplier
export function getCastSpeed(dexterity: number): number {
  return 1.0 + Math.min((dexterity - 10) * 0.005, 0.3); // max 30% faster
}

// Intelligence → Sorcery damage
export function getSorceryDamage(intelligence: number): number {
  return softCapScale(intelligence, 30, 5, 2.5, 1);
}

// Faith → Incantation damage
export function getIncantDamage(faith: number): number {
  return softCapScale(faith, 30, 5, 2.5, 1);
}

// Arcane → Item discovery bonus (%)
export function getItemDiscovery(arcane: number): number {
  return 100 + softCapScale(arcane, 0, 3, 1.5, 0.5);
}

// Arcane → Status effect buildup multiplier
export function getStatusBuildup(arcane: number): number {
  return 1.0 + (arcane - 10) * 0.02;
}

// Attack speed from dexterity
export function getAttackSpeed(dexterity: number): number {
  return 1.0 + Math.min((dexterity - 10) * 0.015, 0.5); // max 50% faster
}

// Backward compat aliases
export function getMaxMana(mind: number): number {
  return getMaxFP(mind);
}

export function getSoulsForLevel(level: number): number {
  return Math.floor(500 * Math.pow(1.15, level - 1));
}

// Design doc Step 6 — Varn's reforge. Global per-item-id level (not
// per-instance — the flat inventory: string[] model has no instance
// identity), capped low since it's a flat %-of-everything multiplier.
export const ITEM_UPGRADE_MAX_LEVEL = 3;
export const ITEM_UPGRADE_BONUS_PER_LEVEL = 0.1;

export function getSoulsForItemUpgrade(nextLevel: number): number {
  return Math.floor(300 * Math.pow(1.6, nextLevel - 1));
}

export function getSoulsForFlaskShard(currentMaxCharges: number): number {
  return 200 + currentMaxCharges * 150;
}

// ============================================================
// STAT METADATA (for UI display)
// ============================================================

export interface StatMeta {
  key: keyof PlayerStats;
  name: string;
  shortName: string;
  description: string;
  color: string;
}

export const STAT_METADATA: StatMeta[] = [
  { key: "vigor", name: "Vigor", shortName: "VIG", description: "Increases max HP", color: "#cc3333" },
  { key: "mind", name: "Mind", shortName: "MND", description: "Increases max FP (mana)", color: "#4169e1" },
  { key: "endurance", name: "Endurance", shortName: "END", description: "Increases Stamina + Equip Load", color: "#2e8b57" },
  { key: "strength", name: "Strength", shortName: "STR", description: "STR weapon damage, heavy gear", color: "#cc6600" },
  { key: "dexterity", name: "Dexterity", shortName: "DEX", description: "DEX weapon damage, cast speed", color: "#cccc33" },
  { key: "intelligence", name: "Intelligence", shortName: "INT", description: "Sorcery damage, INT spells", color: "#6699ff" },
  { key: "faith", name: "Faith", shortName: "FTH", description: "Incantation damage, FTH spells", color: "#ffcc00" },
  { key: "arcane", name: "Arcane", shortName: "ARC", description: "Item discovery, status buildup", color: "#aa44cc" },
];

// Stats with no wired-up gameplay effect yet — LevelUpScene and the
// Inventory DETAILS sheet both need this to render "no effect yet" instead
// of a derived value, so it lives here rather than duplicated in each scene.
export const NO_EFFECT_STATS: (keyof PlayerStats)[] = ["faith", "arcane"];

// Session brief N4 — the fallback consumable's heal fraction, and the base
// stamina regen rate GameScene/InventoryScene both need (moved here from
// GameScene.ts so InventoryScene's USE action and DETAILS sheet can read
// them without importing a scene file).
export const PALEMOSS_HEAL_FRACTION = 0.2; // weaker fallback, per the lore bible's "weaker, slower heal"
export const STAMINA_REGEN_PER_SEC = 18;

// ============================================================
// COLORS — dark atmospheric palette
// ============================================================

export const COLORS = {
  ice: 0x4fc3f7,
  blood: 0xff3333,
  gold: 0xffd700,
  bone: 0xe8e0d4,
  iron: 0x6b7b8f,
  dark: 0x1a1a2e,
  frost: 0xb3e5fc,
  fire: 0xff8c00,
  health: 0xcc3333,
  stamina: 0x2e8b57,
  mana: 0x4169e1,
  healthDark: 0x661a1a,
  staminaDark: 0x1a4a2e,
  manaDark: 0x1a2a6a,
  uiFrame: 0x3a3a4a,
  uiFrameLight: 0x5a5a6a,
  uiBackground: 0x0a0a12,
  uiGold: 0xc9a84c,
};

// Floor definitions
export enum Floor {
  BASEMENT = "basement",     // The Ice Prison
  GROUND = "ground",         // The Frozen Armory
  SECOND = "second",         // Wind-Carved Passages
  THIRD = "third",           // The Forge of Storms (Boss 1)
  TOP = "top",               // Cloud-Rider's Aerie (Boss 2)
}

// Area progression system
export enum Area {
  AREA_1 = 1,  // Frozen Castle Dungeon
  AREA_2 = 2,  // Ruined Swamp Fortress
  AREA_3 = 3,  // The Molten Sanctum
  AREA_4 = 4,  // The Hollow Spire
  HEARTH = 0,  // The Ashen Hearth (hub)
  // Feature 5 of the content-expansion plan — deliberately breaks the
  // previously-locked "4 areas, no expansion" rule (user's explicit,
  // confirmed choice, not an oversight). The final area/boss.
  AREA_5 = 5,  // The Sundered Sky
  // Session brief N6 — The Nameless Shore, the Tidewarden's prologue.
  // bossData.ts/enemyRoles.ts/items.ts already carried the full design
  // (moves, Husk/Warden roles, chest loot); this just gives it a real,
  // reachable area slot (see Boss.tsx's old "not reachable from any
  // current AREA_CONFIGS entry" comment).
  PROLOGUE = 6,
}

export interface AreaConfig {
  name: string;
  theme: string;
  enemyHPMultiplier: number;
  enemyDamageMultiplier: number;
  bossType: string;
  bossHP: number;
  bossDamage: number;
  bossName: string;
  mapSize: number;
  numRooms: number;
  numChests: number;
  numDoors: number;
  enemyTypes: string[];
  chestItems: string[];
}

export const AREA_CONFIGS: Record<Area, AreaConfig> = {
  [Area.AREA_1]: {
    name: "The Frozen Depths",
    theme: "ice_dungeon",
    enemyHPMultiplier: 1.0,
    enemyDamageMultiplier: 1.0,
    bossType: "boss_forge",
    bossHP: 300,
    bossDamage: 25,
    bossName: "FORGE GUARDIAN",
    mapSize: 200,
    numRooms: 5,
    numChests: 10,
    numDoors: 5,
    enemyTypes: ["enemy_stalker", "enemy_hound", "enemy_sentinel"],
    chestItems: ["iron_sword", "knight_shield", "healing_flask", "chainmail_armor", "fallen_knight_helm", "fallen_knight_boots", "leather_pants", "wanderers_ring", "worn_gloves", "travelers_pendant", "stamina_tonic", "golden_runes", "palemoss"],
  },
  [Area.AREA_2]: {
    name: "The Sunken Courtyard",
    theme: "castle_ruins",
    enemyHPMultiplier: 1.8,
    enemyDamageMultiplier: 1.5,
    bossType: "boss_golem",
    bossHP: 600,
    bossDamage: 40,
    bossName: "RUINED COLOSSUS",
    mapSize: 235,
    numRooms: 7,
    numChests: 10,
    numDoors: 4,
    enemyTypes: ["enemy_skeleton", "enemy_undead_knight", "enemy_golem"],
    chestItems: ["great_sword", "tower_shield", "greater_flask", "plate_armor", "fallen_knight_chestplate", "fallen_knight_greaves", "ashen_claymore", "knights_boots", "ring_of_fortitude", "siege_gauntlets", "drowned_amulet", "crimson_elixir", "ancient_runes", "stat_shard", "hearthlance", "gravewake"],
  },
  [Area.AREA_3]: {
    name: "The Molten Sanctum",
    theme: "molten_sanctum",
    enemyHPMultiplier: 2.5,
    enemyDamageMultiplier: 2.0,
    bossType: "boss_molten_archon",
    bossHP: 800,
    bossDamage: 50,
    bossName: "MOLTEN ARCHON",
    mapSize: 270,
    numRooms: 8,
    numChests: 9,
    numDoors: 5,
    enemyTypes: ["enemy_fire_elemental", "enemy_lava_golem", "enemy_ash_wraith"],
    chestItems: ["infernal_blade", "obsidian_shield", "ember_armor", "grand_flask", "lava_ring", "infernal_runes", "molten_crown", "cindergrip_gauntlets", "embound_talisman", "hearthlance", "gravewake"],
  },
  [Area.AREA_4]: {
    name: "The Hollow Spire",
    theme: "hollow_spire",
    enemyHPMultiplier: 2.8,
    enemyDamageMultiplier: 2.2,
    bossType: "boss_nameless_sovereign",
    bossHP: 1200,
    bossDamage: 55,
    bossName: "THE NAMELESS SOVEREIGN",
    mapSize: 290,
    numRooms: 9,
    numChests: 10,
    numDoors: 6,
    enemyTypes: ["enemy_storm_wraith", "enemy_spire_knight", "enemy_void_weaver", "enemy_hollow_ghost"],
    chestItems: ["stormforged_helm", "spire_guard_chestplate", "voidweave_pants", "stormwalker_boots", "thunder_ring", "sovereigns_greatsword", "stormwoven_gauntlets", "spire_wardens_pendant", "greater_flask", "crimson_elixir", "greater_stamina_tonic", "ancient_runes", "stat_shard", "hearthlance", "gravewake"],
  },
  [Area.HEARTH]: {
    name: "The Ashen Hearth",
    theme: "ashen_hearth",
    enemyHPMultiplier: 0,
    enemyDamageMultiplier: 0,
    bossType: "",
    bossHP: 0,
    bossDamage: 0,
    bossName: "",
    mapSize: 20,
    numRooms: 1,
    numChests: 0,
    numDoors: 0,
    enemyTypes: [],
    chestItems: [],
  },
  // Feature 5 of the content-expansion plan — the final area/boss. Reuses
  // the standard procedural generateMap()/FLOOR_ARCHETYPES layout system,
  // not a bespoke catwalks-over-chasms map (see PARKING_LOT.md — a hand-
  // authored non-corridor layout is comparable in scope to the prologue's
  // own hand-authored map and was deferred). Tuned above Area 4 on every
  // axis as the true finale.
  [Area.AREA_5]: {
    name: "The Sundered Sky",
    theme: "sundered_sky",
    enemyHPMultiplier: 3.2,
    enemyDamageMultiplier: 2.5,
    bossType: "boss_dragon",
    bossHP: 2200,
    bossDamage: 65,
    bossName: "THE HOLLOW WYRM",
    mapSize: 315,
    numRooms: 9,
    numChests: 10,
    numDoors: 6,
    enemyTypes: ["enemy_gargoyle", "enemy_wyrmling", "enemy_chasm_strider"],
    chestItems: ["skyguard_greatsword", "wyrmscale_plate", "hollowed_talon_ring", "wyrmclaw_gauntlets", "sundered_sigil", "greater_flask", "grand_flask", "crimson_elixir", "greater_stamina_tonic", "ancient_runes", "stat_shard", "hearthlance", "gravewake"],
  },
  // The Nameless Shore — session brief N6 prologue. Tuned well below Area 1
  // on size/roster (short, two enemy types) but the Tidewarden itself hits
  // hard (bossData.ts's own tuning notes: ~50-60% of level-1 HP per hit) —
  // teaches respect for boss mechanics without a long dungeon crawl first.
  [Area.PROLOGUE]: {
    name: "The Nameless Shore",
    theme: "drowned_shore",
    enemyHPMultiplier: 0.7,
    enemyDamageMultiplier: 0.7,
    bossType: "boss_tidewarden",
    bossHP: 1000, // matches bossData.ts's TIDEWARDEN_BASE_HP
    bossDamage: 200, // matches bossData.ts's TIDEWARDEN_BASE_DAMAGE
    bossName: "THE TIDEWARDEN",
    mapSize: 135,
    numRooms: 3,
    numChests: 4,
    numDoors: 2,
    enemyTypes: ["enemy_drowned_husk", "enemy_drowned_warden"],
    chestItems: ["tideworn_blade", "wreckboard", "wardenband", "wardensteel_sword", "wardens_aegis", "wardensteel_scrap"],
  },
};
