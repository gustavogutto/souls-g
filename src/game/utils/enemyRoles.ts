// Every enemy_* spawn id used by AREA_CONFIGS[...].enemyTypes (see constants.ts)
// maps to one of 5 role templates. Role drives silhouette, tint, and the
// idle->aggro->windup->strike->recover state machine timings in Enemy.ts.

export type EnemyRole =
  | "swarmer" | "soldier" | "brute" | "archer" | "wolf" | "ghost" | "toad"
  | "tide_reaver" | "cinder_wretch"
  | "tower_knight" | "hollow_knight" | "living_shield" | "dancing_blade"
  | "gargoyle" | "wyrmling" | "chasm_strider"
  | "shackled_sentinel" | "sentinel_unbound"
  | "undertow"
  | "voidbound_duelist"
  | "gargoyle_warden";

export interface RoleConfig {
  aggroRadius: number; // tiles — SWARMER largest, BRUTE smallest
  windupMs: number;
  strikeMs: number; // duration of the strike itself (lunge travel time / attack pose) before recover
  recoverMs: number;
  moveSpeed: number; // tiles/sec while chasing
  attackRange: number; // distance at which windup triggers
  aoeRadius?: number; // brute ground-slam radius, beyond attackRange
  textureKey: string;
  hpMultiplier: number;
  damageMultiplier: number; // relative to GameScene's per-area base damage (tuned as the SOLDIER baseline)
  // Which ActiveMove shape Enemy.pickMove() returns for this role. Undefined
  // = the generic single-target melee shape (soldier and every other
  // fall-through role share it). Data-driven specifically because the old
  // hand-maintained `this.role === "x" || this.role === "y"` OR-chain in
  // pickMove() already produced one real bug (tower_knight/living_shield
  // silently missing brute's AoE slam when Gargoyle's reskin was added) —
  // a new brute/swarmer/archer-tuned reskin now gets the right move shape
  // automatically instead of needing pickMove() edited too.
  moveShape?: "lunge" | "aoe" | "ranged" | "toad";
}

// Base tuning blocks for roles that get reused verbatim by later "reskin"
// roles (own texture/tint slot, identical numbers otherwise). Extracted so
// those reskins spread from here instead of duplicating number literals —
// a future rebalance of e.g. BRUTE_BASE now propagates to every reskin
// automatically instead of needing each one hand-edited too (the same
// "don't hand-maintain N copies of one thing" motivation as pickMove()'s
// moveShape field above).
const SWARMER_BASE: Omit<RoleConfig, "textureKey"> = { aggroRadius: 6, windupMs: 250, strikeMs: 180, recoverMs: 400, moveSpeed: 2.0, attackRange: 0.9, hpMultiplier: 0.6, damageMultiplier: 0.6, moveShape: "lunge" };
const SOLDIER_BASE: Omit<RoleConfig, "textureKey"> = { aggroRadius: 5, windupMs: 450, strikeMs: 120, recoverMs: 600, moveSpeed: 1.4, attackRange: 1.0, hpMultiplier: 1.0, damageMultiplier: 1.0 };
const BRUTE_BASE: Omit<RoleConfig, "textureKey"> = { aggroRadius: 4, windupMs: 800, strikeMs: 150, recoverMs: 900, moveSpeed: 1.0, attackRange: 1.2, aoeRadius: 1.8, hpMultiplier: 2.0, damageMultiplier: 1.6, moveShape: "aoe" };
const ARCHER_BASE: Omit<RoleConfig, "textureKey"> = { aggroRadius: 8, windupMs: 700, strikeMs: 150, recoverMs: 800, moveSpeed: 1.2, attackRange: 8, hpMultiplier: 0.5, damageMultiplier: 0.8, moveShape: "ranged" };

export const ROLE_CONFIG: Record<EnemyRole, RoleConfig> = {
  swarmer: { ...SWARMER_BASE, textureKey: "enemy-swarmer" },
  soldier: { ...SOLDIER_BASE, textureKey: "enemy-soldier" },
  brute: { ...BRUTE_BASE, textureKey: "enemy-brute" },
  // ARCHER — fragile ranged role (new). Its own Enemy.ts branch (role ===
  // "archer") owns aggro/movement/attack entirely and never falls through to
  // the shared melee dist<=attackRange trigger or moveSpeed-driven chase, so
  // attackRange here just documents "max firing range" (== aggroRadius) and
  // moveSpeed is vestigial (kept for RoleConfig shape consistency only).
  archer: { ...ARCHER_BASE, textureKey: "enemy-archer" },
  // WOLF — fast disengaging skirmisher (new). Like Archer, its own Enemy.ts
  // branch (role === "wolf") owns aggro/movement/attack via updateWolfAggro()
  // and never falls through to the shared dist<=attackRange trigger; strike
  // itself DOES reuse the shared updateStrike() unmodified (a wolf's lunge is
  // mechanically identical to a swarmer's), so attackRange here is the real
  // melee contact range (0.9), not vestigial the way Archer's is. Own
  // distinct tuning throughout (not a base-spread reskin).
  wolf: { aggroRadius: 7, windupMs: 300, strikeMs: 180, recoverMs: 350, moveSpeed: 2.4, attackRange: 0.9, textureKey: "enemy-wolf", hpMultiplier: 0.7, damageMultiplier: 0.7, moveShape: "lunge" },
  // GHOST — visual-only float variant (new). No new Enemy.ts state-machine
  // branches at all: falls through to the exact same default melee path
  // soldier/brute/swarmer already share (only syncSprites() special-cases
  // it, for the bob + no-shadow visual — see its own comment there).
  // Numeric tuning copied verbatim from soldier; this entry exists purely
  // to give the role its own texture/tint slot (both are role-keyed, not
  // type-keyed — see the Enemy constructor and GameScene.roleTints).
  ghost: { ...SOLDIER_BASE, textureKey: "enemy-ghost" },
  // TOAD — hop-then-lob poison mob (new). Its own Enemy.ts branch (role ===
  // "toad") owns aggro/movement/attack, same 3-touch-point shape as Archer/
  // Wolf. Deliberately no retreat/sidestep behavior (unlike Archer) — it's
  // vulnerable during the pause between hops, which is its real weakness;
  // the poison DOT is the actual threat, not the hop-lob's instant damage.
  toad: { aggroRadius: 6, windupMs: 500, strikeMs: 200, recoverMs: 700, moveSpeed: 1.0, attackRange: 5, textureKey: "enemy-toad", hpMultiplier: 0.6, damageMultiplier: 0.5, moveShape: "toad" },
  // TIDE REAVER — feature 3, Area 2. No new Enemy.ts state-machine branch
  // (falls through to the same default melee path soldier/brute/swarmer
  // share, same precedent as GHOST) — only Enemy.update()'s top (tide-level
  // visibility/active gate) and syncSprites() (hide/show) special-case it.
  // Numeric tuning copied verbatim from soldier.
  tide_reaver: { ...SOLDIER_BASE, textureKey: "enemy-tide-reaver" },
  // CINDER WRETCH — feature 3, Area 3. Also no new state-machine branch —
  // falls through to the shared melee path; its death-detonation is a
  // GameScene.applyDamageToEnemy() hook keyed off role, not an Enemy.ts
  // aggro/strike change. Weaker HP than soldier (it's meant to be baited
  // into dying near you, not tanked down), same damage tier for its own
  // hit — a real distinguishing hpMultiplier, so NOT a base-spread reskin
  // like tide_reaver/ghost/chasm_strider above/below.
  cinder_wretch: { aggroRadius: 5, windupMs: 450, strikeMs: 120, recoverMs: 600, moveSpeed: 1.3, attackRange: 1.0, textureKey: "enemy-cinder-wretch", hpMultiplier: 0.5, damageMultiplier: 1.0 },
  // Feature 4 — the secret Tower Shield Knight fight (Area 3). All 4 exist
  // purely to give each its own texture/tint slot (roles are texture-keyed,
  // not type-keyed) — same rationale as GHOST's own entry. No new Enemy.ts
  // state-machine branches: all 4 fall through to the shared melee path.
  // Numeric tuning copied verbatim from brute (knight, living shield) or
  // swarmer (hollow knight, dancing blade) — the knight's actual hp/damage
  // is overridden per-instance at spawn time in GameScene (see
  // spawnTowerKnightEncounter()), bypassing the normal per-area multiplier
  // formula so it can hit harder than a stock Area 3 brute.
  tower_knight: { ...BRUTE_BASE, textureKey: "enemy-tower-knight" },
  hollow_knight: { ...SWARMER_BASE, textureKey: "enemy-hollow-knight", moveShape: undefined },
  living_shield: { ...BRUTE_BASE, textureKey: "enemy-living-shield" },
  dancing_blade: { ...SWARMER_BASE, textureKey: "enemy-dancing-blade", moveShape: undefined },
  // Feature 5 — The Sundered Sky (Area 5). GARGOYLE reuses BRUTE tuning
  // (own entry purely for its texture/tint slot, same GHOST precedent) plus
  // a syncSprites()-only cosmetic: stone-grey tint while state === "idle",
  // reverting to baseTint the instant it aggroes — "looks like a decoration
  // until it isn't," no new state-machine branch, no collision/interaction
  // system needed (unlike a real breakable-prop disguise, which was
  // deferred in feature 3's PARKING_LOT notes).
  gargoyle: { ...BRUTE_BASE, textureKey: "enemy-gargoyle" },
  // WYRMLING reuses ARCHER's full ranged AI verbatim — Enemy.ts's role
  // checks were widened (role === "archer" || role === "wyrmling") at its 3
  // call sites rather than duplicating updateArcherAggro/Strike/pickMove's
  // logic. Own texture/tint slot plus a GHOST-style cosmetic hover bob in
  // syncSprites() for "flying" flavor (no real flight physics, matching the
  // Ghost precedent — see PARKING_LOT.md for why literal airborne-hittable
  // mechanics were scoped to the Dragon boss only, not regular mobs).
  wyrmling: { ...ARCHER_BASE, textureKey: "enemy-wyrmling" },
  // CHASM STRIDER — a plain SOLDIER reskin, no committed-leap mechanic
  // (that was tied to the catwalks-over-chasms map layout, which was
  // deferred — see PARKING_LOT.md; Area 5 reuses the standard procedural
  // generator, so there are no chasms to leap in the first place).
  chasm_strider: { ...SOLDIER_BASE, textureKey: "enemy-chasm-strider" },
  // Area 1 secret fight — The Shackled Sentinel, phase 1 (encased).
  // aggroRadius: 0 means Enemy.ts's own state machine (`dist > aggroRadius`
  // gate) can never leave "idle" — a free-hits opening phase using zero new
  // Enemy.ts code, just an existing gate repurposed for passivity. moveSpeed
  // 0 for the same reason (never reached). windup/strike/recover values are
  // dead weight (unreachable) but required for the RoleConfig shape.
  shackled_sentinel: { ...SOLDIER_BASE, aggroRadius: 0, moveSpeed: 0, textureKey: "enemy-shackled-sentinel", hpMultiplier: 1.0 },
  // Phase 2 (unbound) — the real fight once it shatters free. Shortest
  // windup/recover of any role in the game on purpose, to sell "this just
  // became a different, faster fight" the instant it breaks out.
  sentinel_unbound: { aggroRadius: 6, windupMs: 350, strikeMs: 150, recoverMs: 500, moveSpeed: 2.2, attackRange: 1.1, textureKey: "enemy-sentinel-unbound", hpMultiplier: 1.8, damageMultiplier: 1.5, moveShape: "lunge" },
  // Area 2 secret fight — The Undertow. Plain BRUTE tuning (own texture/
  // tint slot only, same GHOST-precedent reskin) — its identity comes from
  // the arena's floodwater terrain (see MapGenerator.ts's undertowSpawn
  // comment), not from bespoke combat tuning. Marked amphibious in
  // tide.ts so it gets TIDE_AMPHIBIOUS_BONUS on flooded tiles for free via
  // Enemy.ts's existing flood-speed branch.
  undertow: { ...BRUTE_BASE, textureKey: "enemy-undertow" },
  // Area 4 secret fight — The Voidbound Duelist. SOLDIER-tier pace
  // (readable windup, moderate speed) rather than BRUTE or SWARMER — a
  // 1v1 duel needs a rhythm the player can actually read and respond to,
  // since the fight's real challenge is the attack-variety mechanic in
  // GameScene.performMelee(), not raw aggression. Slightly bumped hp/damage
  // since it fights completely alone, no adds/terrain crutch to lean on.
  voidbound_duelist: { ...SOLDIER_BASE, textureKey: "enemy-voidbound-duelist", hpMultiplier: 1.3, damageMultiplier: 1.2 },
  // Area 5 secret fight — The Gargoyle Warden. Not spread from any base —
  // a genuinely bespoke combination the other roles don't have: the
  // shortest windup of any dangerous role in the game (280ms, only
  // SWARMER's 250ms is shorter, and swarmer is deliberately weak) paired
  // with very high damage and very low HP. The whole fight is a reflex
  // check on correctly timing the roll's i-frame window (its middle
  // third — see GameScene's ROLL_DURATION_MS/i-frame gate) rather than a
  // war of attrition; a long recoverMs rewards a correct dodge with a big
  // free punish window instead of adding a second mechanic on top.
  gargoyle_warden: { aggroRadius: 6, windupMs: 280, strikeMs: 150, recoverMs: 950, moveSpeed: 1.6, attackRange: 1.3, aoeRadius: 1.9, textureKey: "enemy-gargoyle-warden", hpMultiplier: 0.55, damageMultiplier: 2.8, moveShape: "aoe" },
};

// Cinder Wretch-only tuning — its detonation radius/damage, centralized
// here alongside the other role-only tuning blocks above.
export const CINDER_WRETCH_DETONATE_RADIUS = 1.8;
export const CINDER_WRETCH_DETONATE_DAMAGE_MULT = 1.5; // relative to its own ROLE_CONFIG damageMultiplier, same base as its melee hit

// Archer-only tuning, centralized here rather than as magic numbers in
// Enemy.ts/GameScene.ts, mirroring how bossData.ts holds boss-only constants
// alongside the shared boss data.
export const ARCHER_RETREAT_TRIGGER_DIST = 3.0; // player closer than this -> retreat starts
export const ARCHER_RETREAT_RELEASE_DIST = 3.5; // player must be farther than this -> retreat ends (hysteresis)
export const ARCHER_RETREAT_SPEED = 1.2; // tiles/sec, also reused for sidestep motion
export const ARCHER_LOS_CHECK_INTERVAL_MS = 150;
export const ARCHER_SIDESTEP_COOLDOWN_MS = 1000;
export const ARCHER_SIDESTEP_MAX_TILES = 1;
export const ARCHER_FIRING_LINE_TOLERANCE = 0.45; // tiles, perpendicular distance counted as "an ally is blocking the shot"
export const ARCHER_PROJECTILE_SPEED = 5; // tiles/sec
export const ARCHER_PROJECTILE_MAX_RANGE = 12; // tiles — safety cap only; wall/player collision is the real despawn trigger

// Wolf-only tuning, same centralization rationale as the ARCHER_* block above.
export const WOLF_CIRCLE_ENTER_DIST = 2.5; // closer than this while approaching -> stop closing, start circling
export const WOLF_CIRCLE_RADIUS_MIN = 1.5; // tiles, rolled fresh each circling bout
export const WOLF_CIRCLE_RADIUS_MAX = 2.0;
export const WOLF_COMMIT_MIN_MS = 1000; // circling commitment timer range, no pack bonus
export const WOLF_COMMIT_MAX_MS = 2000;
export const WOLF_COMMIT_MIN_MS_PACK = 600; // tighter range once the pack bonus is active
export const WOLF_COMMIT_MAX_MS_PACK = 1200;
export const WOLF_DIRECT_APPROACH_WINDUP_DIST = 1.5; // orbit-blocked fallback: windup as soon as this close instead of waiting on the timer
export const WOLF_RECOVER_HOP_DIST = 1.2; // tiles, hopped directly away from the player during recover
export const WOLF_PACK_SPEED_MULT = 1.2; // +20% move speed while at least one other wolf is engaged

// Toad-only tuning, same centralization rationale as ARCHER_*/WOLF_* above.
// Small, restrained numbers by design (user-requested constraint: "not
// jumping too high," a heavy shuffle-hop, not a bouncy cartoon leap).
export const TOAD_HOP_DIST = 1.5; // tiles covered per hop
export const TOAD_HOP_DURATION_MS = 350; // time spent mid-air per hop
export const TOAD_HOP_PAUSE_MS = 550; // rest between hops — its vulnerable window
export const TOAD_LOB_ARC_HEIGHT = 10; // px, purely visual (see GameScene.updateEnemyProjectiles)
// Visual-only vertical leap on the toad's own body during a hop (the tile
// x/y motion itself is a flat lerp, unchanged) — the shadow stays on the
// ground while the body rises above it, the clearest "this is a jump, not
// a walk" cue available. Kept modest relative to the 20px-tall enemy-toad
// texture, not a cartoonish bounce.
export const TOAD_LEAP_HEIGHT = 9;

const TYPE_ROLE: Record<string, EnemyRole> = {
  // Area 1 — The Frozen Depths
  enemy_stalker: "swarmer",
  enemy_hound: "soldier",
  enemy_sentinel: "brute",
  enemy_frost_archer: "archer",
  enemy_ice_wolf: "wolf",
  // Area 2 — The Sunken Courtyard
  enemy_skeleton: "swarmer",
  enemy_undead_knight: "soldier",
  enemy_golem: "brute",
  enemy_bone_archer: "archer",
  enemy_bog_toad: "toad",
  enemy_tide_reaver: "tide_reaver",
  // Area 3 — The Molten Sanctum
  enemy_fire_elemental: "swarmer",
  enemy_ash_wraith: "soldier",
  enemy_lava_golem: "brute",
  enemy_ember_archer: "archer",
  enemy_cinder_wretch: "cinder_wretch",
  // Feature 4 — the secret Tower Shield Knight fight (Area 3).
  enemy_tower_knight: "tower_knight",
  enemy_hollow_knight_split: "hollow_knight",
  enemy_living_shield_split: "living_shield",
  enemy_dancing_blade_split: "dancing_blade",
  // Area 5 — The Sundered Sky (feature 5).
  enemy_gargoyle: "gargoyle",
  enemy_wyrmling: "wyrmling",
  enemy_chasm_strider: "chasm_strider",
  // Area 4 — The Hollow Spire
  enemy_storm_wraith: "swarmer",
  enemy_spire_knight: "soldier",
  enemy_void_weaver: "brute",
  enemy_void_archer: "archer",
  enemy_hollow_ghost: "ghost",
  // Design doc Step 8 — the cellar's "one elite enemy," reusing BRUTE's
  // tuning wholesale rather than a bespoke kit (GameScene.spawnEnemies()
  // applies an extra HP/damage multiplier + tint on top when in the cellar).
  enemy_elite_ward: "brute",
  // Session brief N6 — The Nameless Shore prologue. Husk reuses SWARMER
  // wholesale (weakest-tier role, matching its "teaches basic attack" job —
  // ROLE_CONFIG has no per-type speed override, so its brief-described
  // "slow shambling" doesn't literally apply to its moveSpeed; flagged in
  // PARKING_LOT.md rather than building bespoke tuning for one enemy).
  // Warden reuses SOLDIER wholesale (the "respect" mid-tier enemy).
  enemy_drowned_husk: "swarmer",
  enemy_drowned_warden: "soldier",
  // Area 1 — The Shackled Sentinel secret fight (its own two-phase kit).
  enemy_shackled_sentinel: "shackled_sentinel",
  enemy_sentinel_unbound: "sentinel_unbound",
  // Area 2 — The Undertow secret fight.
  enemy_undertow: "undertow",
  // Area 4 — The Voidbound Duelist secret fight.
  enemy_voidbound_duelist: "voidbound_duelist",
  // Area 5 — The Gargoyle Warden secret fight.
  enemy_gargoyle_warden: "gargoyle_warden",
};

export function roleForType(type: string): EnemyRole {
  return TYPE_ROLE[type] ?? "soldier";
}
