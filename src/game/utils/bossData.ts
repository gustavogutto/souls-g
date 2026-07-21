// Boss-specific presentation + attack data, keyed by AREA_CONFIGS[...].bossType.
// Bosses reuse Enemy.ts's idle->aggro->windup->strike->recover state machine
// (see enemyRoles.ts for the mob equivalent) but pick randomly between these
// two moves each time they windup, instead of always doing the same thing.

export interface BossVisual {
  textureKey: string;
  tint: number;
}

export const BOSS_VISUALS: Record<string, BossVisual> = {
  boss_forge: { textureKey: "boss-forge", tint: 0xd4a017 }, // Forge Guardian — bronze/molten gold
  boss_golem: { textureKey: "boss-golem", tint: 0x8a8f98 }, // Ruined Colossus — cracked slate grey
  boss_molten_archon: { textureKey: "boss-molten", tint: 0xff5522 }, // Molten Archon — ember red-orange
  boss_nameless_sovereign: { textureKey: "boss-sovereign", tint: 0x9955ee }, // The Nameless Sovereign — royal violet
  boss_tidewarden: { textureKey: "boss-tidewarden", tint: 0x4a7a8c }, // The Tidewarden — drowned steel-teal
  boss_dragon: { textureKey: "boss-dragon", tint: 0xcc2222 }, // The Hollow Wyrm (feature 5) — deep red, green poison-gland/black-joint accents baked into the texture itself
};

export function bossVisualForType(type: string): BossVisual {
  return BOSS_VISUALS[type] ?? { textureKey: "boss-forge", tint: 0xffd700 };
}

export interface BossMove {
  name: string;
  windupMs: number;
  strikeMs: number;
  range: number;
  aoe: boolean;
  damageMultiplier: number;
  // Session brief N6 — Tidewarden-only fields, optional/undefined for every
  // other boss's moves (Enemy.ts treats both as no-ops when absent).
  // Holds the telegraph at full white-hot for this long after windupMs
  // elapses, before the strike actually fires — punishes a panic-roll
  // thrown during the initial windup instead of the hold.
  holdMs?: number;
  // Bypasses the player's dodge-roll i-frames entirely (Enemy.lastStrikeUnblockable,
  // read by GameScene's damage-application check) — nothing else in the
  // game has an unblockable hit; this is what makes the grab a genuine
  // punish for facetanking/healing at melee range instead of just "another
  // attack you can roll through like always."
  unblockable?: boolean;
  // Existing boss moves are always self-centered (arc/slam); the grab
  // lunges to the player's position at windup-start, same shape as a mob's
  // SWARMER lunge.
  lunge?: boolean;
  // Area-boss kit expansion — routes the strike through Enemy's existing
  // updateArcherStrike()/spawnEnemyProjectile() path (built for the Archer/
  // Wyrmling mob roles) instead of updateStrike()'s instant melee-range
  // check. Undefined for every move that predates this, so nothing about
  // Tidewarden/Dragon/the original arc+slam pair changes.
  ranged?: boolean;
  // Area-boss kit expansion — flags an AoE slam whose impact point should
  // spawn a lingering damage-over-time patch via the existing
  // spawnEnemyGroundHazard() (built for the Dragon's poison breath), read
  // once per frame by GameScene off Enemy.lastStrikeLeavesHazard, mirroring
  // how lastStrikeUnblockable already works. Undefined everywhere else.
  leavesHazard?: boolean;
}

// Original shared 2-move pool. Kept as the ultimate fallback for any boss
// type not covered by bossMovesForType() below, but no longer used by any
// of the 4 shipped area-gate bosses (each got a real 3-move kit — see
// FORGE_MOVES/GOLEM_MOVES/ARCHON_MOVES/SOVEREIGN_MOVES).
export const BOSS_MOVES: BossMove[] = [
  { name: "arc", windupMs: 650, strikeMs: 150, range: 1.6, aoe: false, damageMultiplier: 1.0 },
  { name: "slam", windupMs: 950, strikeMs: 220, range: 2.2, aoe: true, damageMultiplier: 1.4 },
];

// Forge Guardian (Area 1) — the first boss in the game, so the simplest new
// kit: arc/slam unchanged in shape, slam now leaves a small ember patch
// (leavesHazard), plus one new lunge move teaching the "close-fast, punish
// the recover" read the harder bosses below build on.
export const FORGE_MOVES: BossMove[] = [
  { name: "arc", windupMs: 650, strikeMs: 150, range: 1.6, aoe: false, damageMultiplier: 1.0 },
  { name: "slam", windupMs: 950, strikeMs: 220, range: 2.2, aoe: true, damageMultiplier: 1.4, leavesHazard: true },
  { name: "bellows_charge", windupMs: 500, strikeMs: 300, range: 1.4, aoe: false, lunge: true, damageMultiplier: 1.1 },
];

// Ruined Colossus (Area 2) — heavier pacing than Forge (longer windups on
// both melee moves) plus a real thrown projectile (Rubble Throw, plain
// physical — no elemental tag, distinguishing it from Archon's Ember Fling).
export const GOLEM_MOVES: BossMove[] = [
  { name: "slate_arc", windupMs: 850, strikeMs: 180, range: 1.8, aoe: false, damageMultiplier: 1.0 },
  { name: "ground_pound", windupMs: 1100, strikeMs: 250, range: 2.6, aoe: true, damageMultiplier: 1.4 },
  { name: "rubble_throw", windupMs: 700, strikeMs: 200, range: 3, aoe: false, ranged: true, damageMultiplier: 1.1 },
];

// Molten Archon (Area 3) — faster/more aggressive pacing than Golem,
// eruption_slam leaves a bigger/hotter patch than Forge's, Ember Fling is
// a thrown projectile tagged "burn" (see PROJECTILE_EFFECT_BY_TYPE in
// statusEffects.ts).
export const ARCHON_MOVES: BossMove[] = [
  { name: "magma_arc", windupMs: 600, strikeMs: 150, range: 1.6, aoe: false, damageMultiplier: 1.0 },
  { name: "eruption_slam", windupMs: 900, strikeMs: 220, range: 2.2, aoe: true, damageMultiplier: 1.4, leavesHazard: true },
  { name: "ember_fling", windupMs: 650, strikeMs: 180, range: 3, aoe: false, ranged: true, damageMultiplier: 1.0 },
];

// The Nameless Sovereign (Area 4) — last main-gate boss before Area 5's
// Dragon. arc/slam-equivalents unchanged in shape; Warp Strike is a
// short-windup unblockable lunge, identical shape to the Tidewarden's grab
// (bypasses dodge-roll i-frames via the existing lastStrikeUnblockable
// plumbing). Mixed into the plain random pool rather than conditionally
// triggered — see bossData.ts/Enemy.ts history: a Tidewarden-style
// "prefer this move at range" trigger can't work here because the aggro-
// state gate already requires the boss to be within BOSS_COMBAT.attackRange
// before any windup starts, so "player at range" is never true at pick-time.
export const SOVEREIGN_MOVES: BossMove[] = [
  { name: "regal_arc", windupMs: 600, strikeMs: 150, range: 1.6, aoe: false, damageMultiplier: 1.0 },
  { name: "shockwave_slam", windupMs: 950, strikeMs: 220, range: 2.4, aoe: true, damageMultiplier: 1.4 },
  { name: "warp_strike", windupMs: 350, strikeMs: 180, range: 1.2, aoe: false, lunge: true, unblockable: true, damageMultiplier: 1.0 },
];

// Session brief N6 — The Tidewarden, the prologue's tutorial boss, gets its
// own genuinely distinct 3-move kit instead of sharing BOSS_MOVES (see
// bossMovesForType below). Tuning (first pass, flag as a balance knob):
// level-1 max HP is 400, so a 200 base damage x these multipliers lands
// every hit in the brief's "50-60% of level-1 HP" band (sweep 200=50%,
// slam 230=57.5%, grab 200=50%, the last carrying its real threat from
// being unblockable rather than raw numbers). HP (1000) targets "90+
// seconds of sustained aggression" for a fresh level-1 melee run with an
// untiered starting weapon (~8 base damage).
export const TIDEWARDEN_BASE_HP = 1000;
export const TIDEWARDEN_BASE_DAMAGE = 200;
// Grab triggers instead of the normal random arc/slam pick whenever the
// player is this close (Enemy.pickMove reads this directly — "hugs its
// legs") or healed within TIDEWARDEN_HEAL_PUNISH_WINDOW_MS ("heals in
// range" — pickMove is only ever called from windup entry, which itself
// already requires the player be within BOSS_COMBAT.attackRange, so no
// separate range check is needed for the heal half of the trigger).
export const TIDEWARDEN_GRAB_TRIGGER_RANGE = 1.3;
export const TIDEWARDEN_HEAL_PUNISH_WINDOW_MS = 2500;

export const BOSS_TIDEWARDEN_MOVES: BossMove[] = [
  { name: "sweep", windupMs: 800, strikeMs: 220, range: 2.4, aoe: false, damageMultiplier: 1.0 },
  { name: "slam", windupMs: 600, holdMs: 400, strikeMs: 220, range: 2.0, aoe: true, damageMultiplier: 1.15 },
  { name: "grab", windupMs: 300, strikeMs: 180, range: 1.1, aoe: false, lunge: true, unblockable: true, damageMultiplier: 1.0 },
];

// The Hollow Wyrm (feature 5) — ground-phase kit: bite/tail-sweep/wing-
// buffet. The poison breath (lingering ground-DoT patch) and the flight
// phase are NOT BossMoves — they're scripted separately in GameScene (see
// updateDragonBreath()/triggerDragonFlightPhase()) since BossMove's shape
// only covers instant melee-style hits via the shared updateStrike() path,
// not a hazard-zone or a scripted non-attacking flight sequence.
export const BOSS_DRAGON_MOVES: BossMove[] = [
  { name: "bite", windupMs: 600, strikeMs: 150, range: 1.8, aoe: false, damageMultiplier: 1.1 },
  { name: "tail_sweep", windupMs: 750, strikeMs: 200, range: 2.6, aoe: false, damageMultiplier: 1.0 },
  { name: "wing_buffet", windupMs: 900, strikeMs: 220, range: 2.4, aoe: true, damageMultiplier: 1.3 },
];

export function bossMovesForType(type: string): BossMove[] {
  if (type === "boss_tidewarden") return BOSS_TIDEWARDEN_MOVES;
  if (type === "boss_dragon") return BOSS_DRAGON_MOVES;
  if (type === "boss_forge") return FORGE_MOVES;
  if (type === "boss_golem") return GOLEM_MOVES;
  if (type === "boss_molten_archon") return ARCHON_MOVES;
  if (type === "boss_nameless_sovereign") return SOVEREIGN_MOVES;
  return BOSS_MOVES;
}

export const BOSS_COMBAT = {
  aggroRadius: 6,
  attackRange: 1.6, // matches the "arc" move's range — the general engage threshold
  recoverMs: 800,
  moveSpeed: 1.3,
};
