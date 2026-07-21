import { getMaxHP, getMaxFP, getMaxStamina, getStrDamage, getDexDamage, getSorceryDamage, getIncantDamage, ITEM_UPGRADE_BONUS_PER_LEVEL, type PlayerStats } from "./constants";
import { getItemDef, type ItemDef, type ItemSlot, type SpellDef } from "./items";

// Design doc Step 6 — Varn's reforge. A required (not defaulted) parameter
// on every function below, alongside `equipped`: a forgotten call site fails
// to compile instead of silently treating upgrades as a no-op.
export type ItemUpgrades = Partial<Record<string, number>>;

function getUpgradeMultiplier(itemId: string | undefined, upgrades: ItemUpgrades): number {
  if (!itemId) return 1;
  return 1 + (upgrades[itemId] ?? 0) * ITEM_UPGRADE_BONUS_PER_LEVEL;
}

// Design doc Step 3 — gear affects combat. Everything here is a pure
// function of (stats, equipped) — no state import — so runState.ts,
// GameScene.ts, and UIScene.ts can all call it without a circular import.

export type ScalingGrade = "S" | "A" | "B" | "C" | "D" | "E";

// S is full scaling, E is barely-there — same spirit as Elden Ring's letter grades.
export const GRADE_MULTIPLIER: Record<ScalingGrade, number> = {
  S: 1.0,
  A: 0.8,
  B: 0.6,
  C: 0.4,
  D: 0.25,
  E: 0.1,
};

export interface WeaponStats {
  baseDamage: number;
  strGrade: ScalingGrade;
  dexGrade: ScalingGrade;
}

// Percentage/flat modifiers contributed by armor, shields, rings, and
// amulets. Legendary items' "one unique named effect" is just an entry in
// here too — mechanically it's the same accumulation, only the tooltip
// calls it out separately (see ItemDef.legendaryEffectLabel).
export interface EquipModifiers {
  maxHpFlat: number;
  maxHpPct: number;
  staminaRegenPct: number;
  moveSpeedPct: number;
  flaskPotencyPct: number; // bonus % added on top of the flask's base heal fraction
  soulsGainedPct: number;
  damageReductionPct: number; // stacks additively across slots, capped below
  weaponDamageFlat: number; // only meaningful on a weapon item, not accumulated across slots
}

const EMPTY_MODIFIERS: EquipModifiers = {
  maxHpFlat: 0,
  maxHpPct: 0,
  staminaRegenPct: 0,
  moveSpeedPct: 0,
  flaskPotencyPct: 0,
  soulsGainedPct: 0,
  damageReductionPct: 0,
  weaponDamageFlat: 0,
};

// Total damage reduction is capped so stacking armor never trivializes combat.
const MAX_DAMAGE_REDUCTION_PCT = 0.6;

// Unarmed baseline — equipping nothing still lets you fight, just weakly.
const UNARMED_WEAPON: WeaponStats = { baseDamage: 4, strGrade: "E", dexGrade: "E" };

export function getEquipModifiers(equipped: Partial<Record<ItemSlot, string>>, upgrades: ItemUpgrades): EquipModifiers {
  const total = { ...EMPTY_MODIFIERS };
  for (const itemId of Object.values(equipped)) {
    if (!itemId) continue;
    const mods = getItemDef(itemId).mods;
    if (!mods) continue;
    const mult = getUpgradeMultiplier(itemId, upgrades);
    total.maxHpFlat += (mods.maxHpFlat ?? 0) * mult;
    total.maxHpPct += (mods.maxHpPct ?? 0) * mult;
    total.staminaRegenPct += (mods.staminaRegenPct ?? 0) * mult;
    total.moveSpeedPct += (mods.moveSpeedPct ?? 0) * mult;
    total.flaskPotencyPct += (mods.flaskPotencyPct ?? 0) * mult;
    total.soulsGainedPct += (mods.soulsGainedPct ?? 0) * mult;
    total.damageReductionPct += (mods.damageReductionPct ?? 0) * mult;
  }
  total.damageReductionPct = Math.min(total.damageReductionPct, MAX_DAMAGE_REDUCTION_PCT);
  return total;
}

export function getEffectiveMaxHP(vigor: number, equipped: Partial<Record<ItemSlot, string>>, upgrades: ItemUpgrades): number {
  const mods = getEquipModifiers(equipped, upgrades);
  return Math.round(getMaxHP(vigor) * (1 + mods.maxHpPct) + mods.maxHpFlat);
}

export function getEffectiveStaminaRegenPerSec(baseRegen: number, equipped: Partial<Record<ItemSlot, string>>, upgrades: ItemUpgrades): number {
  return baseRegen * (1 + getEquipModifiers(equipped, upgrades).staminaRegenPct);
}

export function getEffectiveMoveSpeed(baseSpeed: number, equipped: Partial<Record<ItemSlot, string>>, upgrades: ItemUpgrades): number {
  return baseSpeed * (1 + getEquipModifiers(equipped, upgrades).moveSpeedPct);
}

// Design doc Step 4 replaced the cooldown-gated heal with flask charges, so
// "faster flask recovery" (Step 3's original framing for this modifier) now
// means each flask sip restores more HP instead of recharging faster.
export function getEffectiveHealFraction(baseFraction: number, equipped: Partial<Record<ItemSlot, string>>, upgrades: ItemUpgrades): number {
  return baseFraction * (1 + getEquipModifiers(equipped, upgrades).flaskPotencyPct);
}

export function applyDamageReduction(rawDamage: number, equipped: Partial<Record<ItemSlot, string>>, upgrades: ItemUpgrades): number {
  const pct = getEquipModifiers(equipped, upgrades).damageReductionPct;
  return Math.max(0, Math.round(rawDamage * (1 - pct)));
}

export function applySoulsGainModifier(amount: number, equipped: Partial<Record<ItemSlot, string>>, upgrades: ItemUpgrades): number {
  const pct = getEquipModifiers(equipped, upgrades).soulsGainedPct;
  return Math.round(amount * (1 + pct));
}

function equippedWeapon(equipped: Partial<Record<ItemSlot, string>>): WeaponStats {
  const weaponId = equipped.weapon;
  if (!weaponId) return UNARMED_WEAPON;
  return getItemDef(weaponId).weapon ?? UNARMED_WEAPON;
}

// Bonus flat damage some legendary weapons add on top of their grade scaling
// (e.g. Sovereign's Greatsword) — folded through the same mods bag as everything else.
function weaponDamageFlatBonus(equipped: Partial<Record<ItemSlot, string>>): number {
  const weaponId = equipped.weapon;
  if (!weaponId) return 0;
  return getItemDef(weaponId).mods?.weaponDamageFlat ?? 0;
}

export function computeWeaponDamage(stats: PlayerStats, equipped: Partial<Record<ItemSlot, string>>, upgrades: ItemUpgrades): number {
  const weapon = equippedWeapon(equipped);
  const mult = getUpgradeMultiplier(equipped.weapon, upgrades);
  const strPart = getStrDamage(stats.strength) * GRADE_MULTIPLIER[weapon.strGrade];
  const dexPart = getDexDamage(stats.dexterity) * GRADE_MULTIPLIER[weapon.dexGrade];
  return Math.round((weapon.baseDamage + strPart + dexPart + weaponDamageFlatBonus(equipped)) * mult);
}

// Step 7 brief — spell damage mirrors computeWeaponDamage's additive
// base+scaling shape exactly (base damage + school stat's soft-capped value
// * grade multiplier), so Faith/Arcane spells later just add a school
// branch here, not a new damage model. Arcane has no damage-scaling
// function yet (constants.ts only has getItemDiscovery/getStatusBuildup for
// it — Arcane spells will likely need a status-effect model instead of flat
// damage); falls back to getSorceryDamage until that's designed.
export function computeSpellDamage(stats: PlayerStats, spell: SpellDef, upgrades: ItemUpgrades, itemId: string): number {
  const schoolValue =
    spell.school === "faith" ? getIncantDamage(stats.faith) : getSorceryDamage(spell.school === "arcane" ? stats.arcane : stats.intelligence);
  const mult = getUpgradeMultiplier(itemId, upgrades);
  return Math.round((spell.baseDamage + schoolValue * GRADE_MULTIPLIER[spell.grade]) * mult);
}

// For the Inventory tooltip — describes an item's mechanical effect in plain
// text, independent of whether it's currently equipped. upgradeLevel is
// cosmetic-only here (an extra summary line), so it's fine to default.
export function describeItemStats(def: ItemDef, upgradeLevel = 0): string[] {
  const lines: string[] = [];
  if (def.weapon) {
    lines.push(`Damage ${def.weapon.baseDamage} (STR ${def.weapon.strGrade} / DEX ${def.weapon.dexGrade})`);
  }
  if (def.spell) {
    const s = def.spell;
    const castLabel =
      s.castType === "ground_aoe" ? "Ground burst" :
      s.castType === "ground_hazard" ? "Lingering cloud" :
      s.castType === "buff_rune" ? "Rune" :
      s.castType === "beam" ? "Beam" : "Projectile";
    lines.push(`${castLabel} — ${s.fpCost} FP — ${(s.castTimeMs / 1000).toFixed(1)}s cast`);
    lines.push(`Power ${s.baseDamage} (${s.school.toUpperCase()} ${s.grade}) — requires ${s.school === "faith" ? "FTH" : s.school === "arcane" ? "ARC" : "INT"} ${s.intRequirement}`);
  }
  const m = def.mods;
  if (m) {
    if (m.damageReductionPct) lines.push(`Damage Reduction +${Math.round(m.damageReductionPct * 100)}%`);
    if (m.maxHpFlat) lines.push(`Max HP +${m.maxHpFlat}`);
    if (m.maxHpPct) lines.push(`Max HP +${Math.round(m.maxHpPct * 100)}%`);
    if (m.staminaRegenPct) lines.push(`Stamina Regen +${Math.round(m.staminaRegenPct * 100)}%`);
    if (m.moveSpeedPct) lines.push(`Move Speed +${Math.round(m.moveSpeedPct * 100)}%`);
    if (m.flaskPotencyPct) lines.push(`Flask Potency +${Math.round(m.flaskPotencyPct * 100)}%`);
    if (m.soulsGainedPct) lines.push(`Souls Gained +${Math.round(m.soulsGainedPct * 100)}%`);
    if (m.weaponDamageFlat) lines.push(`Bonus Damage +${m.weaponDamageFlat}`);
  }
  if (upgradeLevel > 0) {
    lines.push(`Upgrade +${upgradeLevel} (+${upgradeLevel * Math.round(ITEM_UPGRADE_BONUS_PER_LEVEL * 100)}% to all stats above)`);
  }
  return lines;
}

// Inventory overhaul — Zone 4's before/after equip preview. Local mirror of
// runState's EquipSlot union (ItemSlot | "ring2") rather than an import, to
// preserve this file's existing no-state-import invariant (see file header).
export type PreviewSlot = ItemSlot | "ring2";

// Returns a hypothetical equipped map with one slot changed, without
// touching the real one — itemId null clears the slot (unequip preview),
// a value occupies it (equip preview, replacing whatever was there).
export function computeCandidateEquipped(
  current: Partial<Record<PreviewSlot, string>>,
  slot: PreviewSlot,
  itemId: string | null,
): Partial<Record<PreviewSlot, string>> {
  const next = { ...current };
  if (itemId === null) delete next[slot];
  else next[slot] = itemId;
  return next;
}

export interface StatSnapshot {
  atkPwr: number;
  dmgRedPct: number;
  maxHp: number;
  maxFp: number;
  maxStamina: number;
}

// One snapshot of every stat Zone 4 displays, computed through the exact
// same functions the game uses for real combat math — current and
// candidate snapshots are diffed line-by-line to render the preview.
export function computeStatSnapshot(
  stats: PlayerStats,
  equipped: Partial<Record<PreviewSlot, string>>,
  upgrades: ItemUpgrades,
): StatSnapshot {
  return {
    atkPwr: computeWeaponDamage(stats, equipped, upgrades),
    dmgRedPct: getEquipModifiers(equipped, upgrades).damageReductionPct,
    maxHp: getEffectiveMaxHP(stats.vigor, equipped, upgrades),
    maxFp: getMaxFP(stats.mind),
    maxStamina: getMaxStamina(stats.endurance),
  };
}
