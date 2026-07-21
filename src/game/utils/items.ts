// Item metadata for every id that appears in AREA_CONFIGS[...].chestItems (see constants.ts).
// Chests only ever hand out an itemId string — this table is what turns that id into
// something a UI (or gameplay stats, per design doc Step 3) can use.

import type { EquipModifiers, WeaponStats, ScalingGrade } from "./equipment";

export type ItemSlot = "weapon" | "shield" | "head" | "chest" | "hands" | "legs" | "feet" | "ring" | "amulet" | "consumable" | "material" | "spell";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

// Step 7 brief — Intelligence is the only school built; Faith/Arcane are
// content-only extension points (new ItemDB entries with a different
// `school`), not new code, per the brief's explicit framing.
export type SpellSchool = "intelligence" | "faith" | "arcane";
// Flavianna's shop (feature 2 of the content-expansion plan) added
// ground_hazard/buff_rune/beam alongside the original Step 7 pair.
export type SpellCastType = "projectile" | "ground_aoe" | "ground_hazard" | "buff_rune" | "beam";

export interface SpellDef {
  school: SpellSchool;
  castType: SpellCastType;
  fpCost: number;
  castTimeMs: number;
  intRequirement: number;
  baseDamage: number;
  grade: ScalingGrade;
  // projectile: max travel distance in tiles. ground_aoe/ground_hazard:
  // distance in front of the caster to the burst/cloud's center. beam:
  // max line length in tiles.
  range: number;
  speed?: number; // projectile only, tiles/sec
  // projectile only — weak cone-limited steering toward the nearest enemy
  // within its detection cone (Ashmote).
  homingDegPerSec?: number;
  // projectile only — continues past an enemy it kills instead of stopping
  // (Hearthlance).
  pierceOnKill?: boolean;
  aoeRadius?: number; // ground_aoe/ground_hazard only
  // ground_aoe/projectile only — non-boss enemies hit are staggered
  // (interrupts their windup) for this long; bosses take damage but only
  // flinch, no stagger. Gravewake (ground_aoe) and Stonefall (projectile,
  // on a non-killing hit) are the only two spells that set this.
  staggerMs?: number;
  color: string;
  // projectile only — stacks of the new chill slow debuff applied to a
  // non-killing hit (Moonfrost Lance). See utils/statusEffects.ts.
  chillStacks?: number;
  // ground_hazard only — total lifetime of the lingering zone, and how
  // often it rechecks/damages enemies standing inside it (Rotbloom).
  hazardDurationMs?: number;
  hazardTickIntervalMs?: number;
  // buff_rune only — radius the player must stand inside for the bonus,
  // how long the dropped rune persists, and the spell-damage multiplier
  // applied to the caster's next casts while standing in it (Terra Sigil).
  runeRadius?: number;
  runeDurationMs?: number;
  spellDamageBonusPct?: number;
}

export interface ItemDef {
  name: string;
  slot: ItemSlot;
  rarity: Rarity;
  description: string;
  weapon?: WeaponStats;
  mods?: Partial<EquipModifiers>;
  spell?: SpellDef;
  // Set on legendary items only — the Inventory tooltip calls this out as a
  // distinct highlighted line, even though mechanically it's just more mods.
  legendaryEffectLabel?: string;
  // Design doc Step 4 — picking this up in a chest grants +1 max flask
  // charge instead of going to inventory (see GameScene.tryOpenChest).
  isFlaskShard?: boolean;
  // Step 7 brief — Ashmote is start-owned and guaranteed; it must never be
  // sold off or dropped, or a player could lock themselves out of the
  // tutorial-tier casting fallback entirely.
  nonSellable?: boolean;
}

export const RARITY_COLOR: Record<Rarity, number> = {
  common: 0x9d9d9d,
  uncommon: 0x4caf50,
  rare: 0x4fc3f7,
  epic: 0xaa44cc,
  legendary: 0xffd700,
};

// Design doc Step 6 — Varn's sell price, by rarity tier since no item has
// its own price field.
export const RARITY_SELL_VALUE: Record<Rarity, number> = {
  common: 15,
  uncommon: 35,
  rare: 75,
  epic: 150,
  legendary: 300,
};

// Varn's price for gear he stocks (see VarnScene.stockedGearIds) — a flat
// 4x markup over RARITY_SELL_VALUE, so selling a piece then buying it back
// is never break-even. Kept as a simple rarity lookup, same shape as
// RARITY_SELL_VALUE, rather than a formula — nothing here needs to scale
// with anything but rarity.
export const RARITY_BUY_VALUE: Record<Rarity, number> = {
  common: 60,
  uncommon: 140,
  rare: 300,
  epic: 600,
  legendary: 1200,
};

export const SLOT_LABEL: Record<ItemSlot, string> = {
  weapon: "Weapon",
  shield: "Shield",
  head: "Head",
  chest: "Chest",
  hands: "Hands",
  legs: "Legs",
  feet: "Feet",
  ring: "Ring",
  amulet: "Amulet",
  consumable: "Consumable",
  material: "Material",
  spell: "Spell",
};

export const ITEM_DB: Record<string, ItemDef> = {
  // Area 1 — The Frozen Depths
  iron_sword: {
    name: "Iron Sword", slot: "weapon", rarity: "common", description: "A well-worn blade, standard fortress issue.",
    weapon: { baseDamage: 8, strGrade: "D", dexGrade: "D" },
  },
  knight_shield: {
    name: "Knight Shield", slot: "shield", rarity: "common", description: "Dented but dependable.",
    mods: { damageReductionPct: 0.03 },
  },
  healing_flask: {
    name: "Flask Shard", slot: "consumable", rarity: "common", description: "A fragment of grace. Strengthens your flask, granting one more charge.",
    isFlaskShard: true,
  },
  chainmail_armor: {
    name: "Chainmail Armor", slot: "chest", rarity: "common", description: "Interlocked rings turn glancing blows.",
    mods: { damageReductionPct: 0.02 },
  },
  fallen_knight_helm: {
    name: "Fallen Knight Helm", slot: "head", rarity: "uncommon", description: "Taken from a knight who didn't make it out.",
    mods: { damageReductionPct: 0.035 },
  },
  fallen_knight_boots: {
    name: "Fallen Knight Boots", slot: "feet", rarity: "uncommon", description: "Sabatons scarred by ice and stone.",
    mods: { damageReductionPct: 0.035 },
  },
  leather_pants: {
    name: "Leather Pants", slot: "legs", rarity: "common", description: "Simple, flexible, unremarkable.",
    mods: { damageReductionPct: 0.02 },
  },
  wanderers_ring: {
    name: "Wanderer's Ring", slot: "ring", rarity: "uncommon", description: "Warm to the touch despite the cold.",
    mods: { maxHpPct: 0.05 },
  },
  stamina_tonic: { name: "Stamina Tonic", slot: "consumable", rarity: "common", description: "A bitter draught that steadies the legs." },
  // Session brief N4 — the Hearthwater fallback, consumed automatically
  // (GameScene.drinkHearthwater) when Hearthwater charges are 0. Flavor
  // line is the lore bible's own sample anchor for this exact item, reused
  // verbatim rather than paraphrased.
  palemoss: {
    name: "Palemoss", slot: "consumable", rarity: "common",
    description: "It grows where the drowned lie thickest. Nobody picks it twice without wondering why.",
  },
  golden_runes: { name: "Golden Runes", slot: "material", rarity: "uncommon", description: "Etched fragments humming with old magic." },

  // User feedback pass — every other slot already has a full common-through-
  // legendary ladder per area; "hands" and "amulet" only ever had the
  // secret-fight-exclusive legendary pair above (frostbound_amulet), never
  // anything in the actual chestItems loot pools. One of each per area,
  // rarity-tiered to match that area's own existing spread, added to
  // AREA_CONFIGS[...].chestItems in constants.ts alongside this.
  worn_gloves: {
    name: "Worn Gloves", slot: "hands", rarity: "common", description: "Cracked leather, still holding together.",
    mods: { staminaRegenPct: 0.03 },
  },
  travelers_pendant: {
    name: "Traveler's Pendant", slot: "amulet", rarity: "uncommon", description: "Carried a long way by someone who didn't make it the rest of it.",
    mods: { maxHpPct: 0.04 },
  },

  // The Shackled Sentinel — Area 1's secret lever fight (see
  // GameScene.grantShackledSentinelReward()). A fixed legendary pair, not
  // rolled loot, so it's excluded from AREA_CONFIGS[AREA_1].chestItems the
  // same way the Tower Knight's towerguard_blade/towerguard_aegis are
  // excluded from AREA_3's — it's a secret optional fight's guaranteed
  // reward, not a random chest drop. frostbound_amulet is also this game's
  // first ever "amulet"-slot item — the paper-doll UI already had the slot
  // wired up, nothing had ever filled it until now.
  sentinels_greataxe: {
    name: "Sentinel's Greataxe", slot: "weapon", rarity: "legendary",
    description: "It swung once, then never had to swing again.",
    weapon: { baseDamage: 26, strGrade: "A", dexGrade: "E" },
    mods: { weaponDamageFlat: 5 },
    legendaryEffectLabel: "Shattering Blow — +5 Bonus Damage",
  },
  frostbound_amulet: {
    name: "Frostbound Amulet", slot: "amulet", rarity: "legendary",
    description: "Something in it is still waiting to break free.",
    mods: { damageReductionPct: 0.07, staminaRegenPct: 0.15 },
    legendaryEffectLabel: "Unshattered — +15% Stamina Regen",
  },

  // Area 2 — The Sunken Courtyard
  great_sword: {
    name: "Great Sword", slot: "weapon", rarity: "uncommon", description: "Heavy enough to need both hands.",
    weapon: { baseDamage: 16, strGrade: "B", dexGrade: "E" },
  },
  tower_shield: {
    name: "Tower Shield", slot: "shield", rarity: "uncommon", description: "Built to stop a charge outright.",
    mods: { damageReductionPct: 0.06 },
  },
  greater_flask: {
    name: "Greater Flask Shard", slot: "consumable", rarity: "uncommon", description: "A denser fragment of grace. Strengthens your flask further.",
    isFlaskShard: true,
  },
  plate_armor: {
    name: "Plate Armor", slot: "chest", rarity: "rare", description: "Full plate, forged for siege warfare.",
    mods: { damageReductionPct: 0.05 },
  },
  fallen_knight_chestplate: {
    name: "Fallen Knight Chestplate", slot: "chest", rarity: "uncommon", description: "Its former owner fell defending this courtyard.",
    mods: { damageReductionPct: 0.035 },
  },
  fallen_knight_greaves: {
    name: "Fallen Knight Greaves", slot: "legs", rarity: "uncommon", description: "Matching leg armor, still serviceable.",
    mods: { damageReductionPct: 0.035 },
  },
  ashen_claymore: {
    name: "Ashen Claymore", slot: "weapon", rarity: "rare", description: "Blackened steel that never quite cools.",
    weapon: { baseDamage: 26, strGrade: "A", dexGrade: "E" },
  },
  knights_boots: {
    name: "Knight's Boots", slot: "feet", rarity: "uncommon", description: "Standard-issue, reinforced at the heel.",
    mods: { damageReductionPct: 0.035 },
  },
  ring_of_fortitude: {
    name: "Ring of Fortitude", slot: "ring", rarity: "rare", description: "Steadies the wearer's resolve.",
    mods: { maxHpPct: 0.1 },
  },
  crimson_elixir: { name: "Crimson Elixir", slot: "consumable", rarity: "rare", description: "Thick, dark, and unsettlingly warm." },
  ancient_runes: { name: "Ancient Runes", slot: "material", rarity: "rare", description: "Older than the fortress itself." },
  stat_shard: { name: "Stat Shard", slot: "material", rarity: "rare", description: "A crystallized fragment of raw potential." },

  // User feedback pass — see Area 1's own note on worn_gloves/
  // travelers_pendant for why these exist now.
  siege_gauntlets: {
    name: "Siege Gauntlets", slot: "hands", rarity: "uncommon", description: "Built for gripping a ram, not a sword. Works fine either way.",
    mods: { damageReductionPct: 0.03 },
  },
  drowned_amulet: {
    name: "Drowned Amulet", slot: "amulet", rarity: "rare", description: "Still faintly cold, no matter how far from the water it travels.",
    mods: { maxHpPct: 0.06, staminaRegenPct: 0.05 },
  },

  // The Undertow — Area 2's secret lever fight (see
  // GameScene.grantUndertowReward()). Fixed legendary pair, excluded from
  // AREA_CONFIGS[AREA_2].chestItems for the same reason as the other secret
  // fights' rewards. undertow_gauntlets is this game's first ever
  // "hands"-slot item — same previously-empty-paper-doll-slot situation as
  // frostbound_amulet was for "amulet".
  undertow_trident: {
    name: "Undertow Trident", slot: "weapon", rarity: "legendary",
    description: "Pulled you under once. You kept the trident instead.",
    weapon: { baseDamage: 24, strGrade: "B", dexGrade: "B" },
    mods: { weaponDamageFlat: 5 },
    legendaryEffectLabel: "Riptide — +5 Bonus Damage",
  },
  undertow_gauntlets: {
    name: "Undertow Gauntlets", slot: "hands", rarity: "legendary",
    description: "Still faintly waterlogged, no matter how long they dry.",
    mods: { staminaRegenPct: 0.1, moveSpeedPct: 0.04 },
    legendaryEffectLabel: "Undertow's Grip — +4% Move Speed",
  },

  // Area 3 — The Molten Sanctum
  infernal_blade: {
    name: "Infernal Blade", slot: "weapon", rarity: "epic", description: "Wreathed in heat that never fades.",
    weapon: { baseDamage: 38, strGrade: "A", dexGrade: "C" },
  },
  obsidian_shield: {
    name: "Obsidian Shield", slot: "shield", rarity: "epic", description: "Cooled from molten rock, sharp at the edges.",
    mods: { damageReductionPct: 0.1 },
  },
  ember_armor: {
    name: "Ember Armor", slot: "chest", rarity: "epic", description: "Plates that glow faintly under stress.",
    mods: { damageReductionPct: 0.07 },
  },
  grand_flask: {
    name: "Grand Flask Shard", slot: "consumable", rarity: "epic", description: "A brilliant fragment of grace. Strengthens your flask to its fullest.",
    isFlaskShard: true,
  },
  lava_ring: {
    name: "Lava Ring", slot: "ring", rarity: "epic", description: "Molten light pulses beneath its surface.",
    mods: { flaskPotencyPct: 0.2 },
  },
  infernal_runes: { name: "Infernal Runes", slot: "material", rarity: "epic", description: "Warm to hold, dangerous to misuse." },
  molten_crown: {
    name: "Molten Crown", slot: "head", rarity: "epic", description: "Once worn by something that ruled the Sanctum.",
    mods: { damageReductionPct: 0.06, maxHpPct: 0.03 },
  },

  // User feedback pass — see Area 1's own note.
  cindergrip_gauntlets: {
    name: "Cindergrip Gauntlets", slot: "hands", rarity: "epic", description: "The heat stopped bothering you a while ago.",
    mods: { staminaRegenPct: 0.08, damageReductionPct: 0.03 },
  },
  embound_talisman: {
    name: "Embound Talisman", slot: "amulet", rarity: "epic", description: "Warm enough to mistake for alive.",
    mods: { flaskPotencyPct: 0.12, maxHpPct: 0.04 },
  },

  // Area 4 — The Hollow Spire
  stormforged_helm: {
    name: "Stormforged Helm", slot: "head", rarity: "legendary", description: "Struck by lightning during its forging, deliberately.",
    mods: { damageReductionPct: 0.09, maxHpPct: 0.08 },
    legendaryEffectLabel: "Storm-Warded — +8% Max HP",
  },
  spire_guard_chestplate: {
    name: "Spire Guard Chestplate", slot: "chest", rarity: "legendary", description: "Worn by the Spire's last honor guard.",
    mods: { damageReductionPct: 0.14 },
    legendaryEffectLabel: "Unyielding Guard — extra damage reduction",
  },
  voidweave_pants: {
    name: "Voidweave Pants", slot: "legs", rarity: "legendary", description: "Woven from something that isn't quite cloth.",
    mods: { damageReductionPct: 0.09, staminaRegenPct: 0.15 },
    legendaryEffectLabel: "Silent Step — +15% Stamina Regen",
  },
  stormwalker_boots: {
    name: "Stormwalker Boots", slot: "feet", rarity: "legendary", description: "Each step crackles faintly with static.",
    mods: { damageReductionPct: 0.09, moveSpeedPct: 0.1 },
    legendaryEffectLabel: "Storm-Swift — +10% Move Speed",
  },
  thunder_ring: {
    name: "Thunder Ring", slot: "ring", rarity: "legendary", description: "A held breath before the strike.",
    mods: { soulsGainedPct: 0.1, staminaRegenPct: 0.1 },
    legendaryEffectLabel: "Storm's Fury — +10% Souls Gained, +10% Stamina Regen",
  },
  sovereigns_greatsword: {
    name: "Sovereign's Greatsword", slot: "weapon", rarity: "legendary", description: "Carried by the Nameless Sovereign itself.",
    weapon: { baseDamage: 55, strGrade: "S", dexGrade: "D" },
    mods: { weaponDamageFlat: 15 },
    legendaryEffectLabel: "Sovereign's Edge — +15 Bonus Damage",
  },
  greater_stamina_tonic: { name: "Greater Stamina Tonic", slot: "consumable", rarity: "rare", description: "A stronger tonic for the fortress's upper reaches." },

  // User feedback pass — see Area 1's own note.
  stormwoven_gauntlets: {
    name: "Stormwoven Gauntlets", slot: "hands", rarity: "legendary", description: "Never quite stop crackling, even at rest.",
    mods: { staminaRegenPct: 0.12, moveSpeedPct: 0.05 },
    legendaryEffectLabel: "Storm-Fed — +5% Move Speed",
  },
  spire_wardens_pendant: {
    name: "Spire Warden's Pendant", slot: "amulet", rarity: "legendary", description: "Watched the Spire fall. Kept watching anyway.",
    mods: { maxHpPct: 0.08, soulsGainedPct: 0.1 },
    legendaryEffectLabel: "Undying Watch — +10% Souls Gained",
  },

  // The Nameless Shore — session brief N6 prologue.
  tideworn_blade: {
    name: "Tideworn Blade", slot: "weapon", rarity: "common", description: "The sea got to it first. It still remembers the shape of a hand.",
    weapon: { baseDamage: 8, strGrade: "D", dexGrade: "D" },
  },
  wreckboard: {
    name: "Wreckboard", slot: "shield", rarity: "common", description: "Someone's door. Someone's raft. Someone's shield. In that order.",
    mods: { damageReductionPct: 0.03 },
  },
  // The brief's "+1 total flask charge" is granted once, directly, at
  // pickup (GameScene's Tidewarden victory grant calls addFlaskShard()) —
  // matching every other permanent-cap-increase source in this game (flask
  // shards, Varn's shop), rather than a live equip modifier that would need
  // the whole N4 allocation system to gracefully handle being un-equipped.
  wardenband: {
    name: "Wardenband", slot: "ring", rarity: "uncommon", description: "Taken from a warden that drowned at its post. The tide does not forgive desertion.",
  },
  wardensteel_sword: {
    name: "Wardensteel Sword", slot: "weapon", rarity: "uncommon", description: "A matched pair with the Aegis — a visible head start on the gear ladder.",
    weapon: { baseDamage: 18, strGrade: "C", dexGrade: "D" },
  },
  wardens_aegis: {
    name: "Warden's Aegis", slot: "shield", rarity: "uncommon", description: "A matched pair with the Sword — a visible head start on the gear ladder.",
    mods: { damageReductionPct: 0.06 },
  },
  // No function until the blacksmith's upgrade system grows to consume
  // material items beyond duplicates — flagged in PARKING_LOT.md.
  wardensteel_scrap: {
    name: "Wardensteel Scrap", slot: "material", rarity: "uncommon", description: "Varn would call this steel worth working.",
  },

  // Spells — Step 7 brief (Intelligence school). Ashmote is start-owned and
  // deliberately absent from every area's chestItems below — see
  // runState.resetRun()/applySaveData() for how it's granted and equipped.
  ashmote: {
    name: "Ashmote", slot: "spell", rarity: "common",
    description: "A fleck of the Hearth's memory. Small things are not forgotten more easily — only more often.",
    nonSellable: true,
    spell: { school: "intelligence", castType: "projectile", fpCost: 7, castTimeMs: 350, intRequirement: 10, baseDamage: 8, grade: "B", range: 8, speed: 10, homingDegPerSec: 90, color: "#ffd76a" },
  },
  hearthlance: {
    name: "Hearthlance", slot: "spell", rarity: "rare",
    description: "The Hearth remembers being a pillar of fire. Briefly, so can you.",
    spell: { school: "intelligence", castType: "projectile", fpCost: 18, castTimeMs: 700, intRequirement: 16, baseDamage: 38, grade: "S", range: 9, speed: 13, pierceOnKill: true, color: "#ff8c3a" },
  },
  gravewake: {
    name: "Gravewake", slot: "spell", rarity: "rare",
    description: "The drowned rubble remembers being a wall. It rises to object.",
    spell: { school: "intelligence", castType: "ground_aoe", fpCost: 15, castTimeMs: 600, intRequirement: 14, baseDamage: 14, grade: "B", range: 3, aoeRadius: 2, staggerMs: 800, color: "#8fae6a" },
  },

  // Spells — Flavianna's shop, feature 2 of the content-expansion plan.
  // Found once in the Sunken Courtyard (Area 2, floor 3), then bought at
  // the Ashen Hearth afterward. All Intelligence school, matching Step 7's
  // "keep Faith/Arcane parked" decision.
  stonefall: {
    name: "Stonefall", slot: "spell", rarity: "rare",
    description: "A cluster of falling stone, aimed by memory of falling. It doesn't care what it staggers on the way down.",
    spell: { school: "intelligence", castType: "projectile", fpCost: 16, castTimeMs: 650, intRequirement: 15, baseDamage: 20, grade: "B", range: 8, speed: 9, homingDegPerSec: 70, staggerMs: 1100, color: "#a89a7a" },
  },
  moonfrost_lance: {
    name: "Moonfrost Lance", slot: "spell", rarity: "rare",
    description: "Cold enough to argue with fire. It never asks nicely.",
    spell: { school: "intelligence", castType: "projectile", fpCost: 17, castTimeMs: 750, intRequirement: 16, baseDamage: 30, grade: "A", range: 9, speed: 7, chillStacks: 1, color: "#8fd6ff" },
  },
  rotbloom: {
    name: "Rotbloom", slot: "spell", rarity: "rare",
    description: "A vial of something that used to be alive. It blooms wrong, and it blooms slow.",
    spell: { school: "intelligence", castType: "ground_hazard", fpCost: 16, castTimeMs: 600, intRequirement: 15, baseDamage: 10, grade: "B", range: 4, aoeRadius: 2.5, hazardDurationMs: 5000, hazardTickIntervalMs: 1000, color: "#7fdb5a" },
  },
  terra_sigil: {
    name: "Terra Sigil", slot: "spell", rarity: "rare",
    description: "A rune drawn from standing still. The ground remembers being solid; ask it to remember harder.",
    spell: { school: "intelligence", castType: "buff_rune", fpCost: 20, castTimeMs: 500, intRequirement: 15, baseDamage: 0, grade: "D", range: 0, runeRadius: 2.5, runeDurationMs: 12000, spellDamageBonusPct: 0.25, color: "#ffd76a" },
  },
  comets_end: {
    name: "Comet's End", slot: "spell", rarity: "legendary",
    description: "The Hearth's last, longest breath. Stand still and let it finish the thought.",
    spell: { school: "intelligence", castType: "beam", fpCost: 30, castTimeMs: 1800, intRequirement: 22, baseDamage: 70, grade: "S", range: 10, color: "#ffb347" },
  },

  // Secret Tower Shield Knight fight (Area 3, feature 4 of the content-
  // expansion plan) — a fixed legendary sword+shield pair, not a rolled
  // reward, granted once when all 3 of the knight's split forms are dead.
  // Tuned a step above Area 3's own epic ceiling (infernal_blade/
  // obsidian_shield) since it's a secret optional fight, not a guaranteed
  // area-clear drop.
  towerguard_blade: {
    name: "Towerguard Blade", slot: "weapon", rarity: "legendary",
    description: "It never learned to fall. Neither, it insists, will you.",
    weapon: { baseDamage: 42, strGrade: "S", dexGrade: "D" },
    mods: { weaponDamageFlat: 8 },
    legendaryEffectLabel: "Knight's Resolve — +8 Bonus Damage",
  },
  towerguard_aegis: {
    name: "Towerguard Aegis", slot: "shield", rarity: "legendary",
    description: "Even split three ways, it never once stopped guarding.",
    mods: { damageReductionPct: 0.12, maxHpPct: 0.05 },
    legendaryEffectLabel: "Unbroken Ward — +5% Max HP",
  },

  // The Voidbound Duelist — Area 4's secret lever fight (see
  // GameScene.grantVoidboundReward()). Same fixed-legendary-pair, excluded-
  // from-chestItems shape as the other secret fights' rewards above.
  voidbound_edge: {
    name: "Voidbound Edge", slot: "weapon", rarity: "legendary",
    description: "It never swings the same way twice. Neither should you.",
    weapon: { baseDamage: 30, strGrade: "B", dexGrade: "B" },
    mods: { weaponDamageFlat: 6 },
    legendaryEffectLabel: "Unread — +6 Bonus Damage",
  },
  voidbound_signet: {
    name: "Voidbound Signet", slot: "ring", rarity: "legendary",
    description: "A held breath, worn as jewelry.",
    mods: { staminaRegenPct: 0.12, damageReductionPct: 0.05 },
    legendaryEffectLabel: "Patient Guard — +12% Stamina Regen",
  },

  // Area 5 — The Sundered Sky (feature 5). Tuned as the true endgame
  // ceiling, above every Area 4 legendary.
  skyguard_greatsword: {
    name: "Skyguard Greatsword", slot: "weapon", rarity: "legendary",
    description: "Forged for something that no longer needed to stand on the ground to fight.",
    weapon: { baseDamage: 60, strGrade: "S", dexGrade: "D" },
    mods: { weaponDamageFlat: 18 },
    legendaryEffectLabel: "Wyrmsbane — +18 Bonus Damage",
  },
  wyrmscale_plate: {
    name: "Wyrmscale Plate", slot: "chest", rarity: "legendary",
    description: "Scaled like something that used to fly. It still remembers the wind.",
    mods: { damageReductionPct: 0.16, moveSpeedPct: 0.05 },
    legendaryEffectLabel: "Windborne Scale — +5% Move Speed",
  },
  hollowed_talon_ring: {
    name: "Hollowed Talon Ring", slot: "ring", rarity: "legendary",
    description: "Closed around nothing, permanently. It was already too late.",
    mods: { soulsGainedPct: 0.15, maxHpPct: 0.08 },
    legendaryEffectLabel: "Last Grasp — +15% Souls Gained, +8% Max HP",
  },

  // User feedback pass — see Area 1's own note. Endgame tier, matching this
  // area's own "above every Area 4 legendary" convention.
  wyrmclaw_gauntlets: {
    name: "Wyrmclaw Gauntlets", slot: "hands", rarity: "legendary",
    description: "Shaped for a grip no human hand ever had. Works anyway.",
    mods: { staminaRegenPct: 0.15, damageReductionPct: 0.06 },
    legendaryEffectLabel: "Talon-Grip — +15% Stamina Regen",
  },
  sundered_sigil: {
    name: "Sundered Sigil", slot: "amulet", rarity: "legendary",
    description: "The last whole thing to fall from the sky.",
    mods: { maxHpPct: 0.1, soulsGainedPct: 0.15 },
    legendaryEffectLabel: "Sky's Ransom — +15% Souls Gained",
  },

  // The Gargoyle Warden — Area 5's secret lever fight, the last of the four
  // (see GameScene.grantGargoyleWardenReward()). Same fixed-legendary-pair,
  // excluded-from-chestItems shape as the other three.
  wardens_talon: {
    name: "Warden's Talon", slot: "weapon", rarity: "legendary",
    description: "It only needed to land once. You need to learn that too.",
    weapon: { baseDamage: 40, strGrade: "S", dexGrade: "C" },
    mods: { weaponDamageFlat: 10 },
    legendaryEffectLabel: "One Strike — +10 Bonus Damage",
  },
  wardens_seal: {
    name: "Warden's Seal", slot: "amulet", rarity: "legendary",
    description: "Proof you were paying attention, for once.",
    mods: { staminaRegenPct: 0.1, damageReductionPct: 0.06 },
    legendaryEffectLabel: "Watchful — +10% Stamina Regen",
  },
};

export function getItemDef(itemId: string): ItemDef {
  return (
    ITEM_DB[itemId] ?? {
      name: itemId.replace(/_/g, " "),
      slot: "material",
      rarity: "common",
      description: "An unidentified relic.",
    }
  );
}
