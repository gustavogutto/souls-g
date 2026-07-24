# Hohenberg 3D — Full Conversion Design Doc

This is the canonical design/build spec for the 3D remake of Hohenberg
(originally a 2D isometric Phaser game at `GAME MOBILE\echoes-hohenberg`).
It exists to replace any earlier, confused prompt for this project. Read
this instead of reconstructing scope from commit messages or guessing.

**Core rule: this is a PC game.** Not a mobile port, not a responsive
mobile-first build. Keyboard + mouse is the primary and only required
input method. No touch controls, no on-screen action buttons, no portrait
canvas, no PWA/"add to home screen" concerns, no letterboxing to a fixed
9:16 size. If any existing code in this repo (`TouchControls.tsx`) or any
future prompt assumes touch input, that assumption is wrong for this
project and should be removed or ignored — it was inherited by mistake
from the 2D game's mobile build, which this project is not.

**Core goal: keep everything.** Every system, mechanic, area, boss, item,
spell, and NPC that exists in the 2D game today should exist here too,
reworked for a real 3D presentation and PC input — not cut down, not
simplified into "a 3D tech demo of the basics." Where a 2D-specific
mechanic (e.g. isometric depth-sorting) has no 3D equivalent, it's called
out below with what replaces it. Where the 2D source has open gaps (no
Faith/Arcane spells, no true item-instance identity, etc.), those gaps
carry over as open ground here too, not as things to invent from scratch.

No emojis anywhere in code, UI, commits, or content — same hard rule as
the 2D project.

---

## 0. What's already built here vs. what this doc covers

This repo (`souls-g`, formerly `echoes-hohenberg-3d`) already has a real
three.js + React Three Fiber slice built in prior phases:

- Phase 1: procedural level generation, tile-grid collision, camera.
- Phase 2: full enemy move-shape AI (all 21 roles), projectile pool.
- Phases 3-4: save/load, equip-only inventory panel.
- Phase 5: area bosses (spawn/AI/gate/hazards/HUD), chests, the 5 secret
  lever-boss fights.
- Phase 9: Ashen Hearth hub, real inter-area travel, the Nameless Shore
  prologue.
- Also present: a `TouchControls.tsx` mobile input layer, copied from the
  2D game's control scheme — **this should be removed or left permanently
  dead code**, per the PC-only rule above.

Everything below is the full target scope this partial build should grow
into. Sections are written as "what the system is," not "what's missing,"
so this doc stays useful as new pieces land — treat it as the spec to
build toward and check off against, not a one-time prompt.

---

## 1. Camera, controls, and the 2D-to-3D translation

This is the single biggest design change. The 2D game is a fixed 64x32
isometric projection with no camera rotation, painter's-algorithm depth
sorting, and 8-directional facing snapped from tile-space input. None of
that exists in 3D. Replace it with:

- **Camera**: third-person, follows the player from behind/above at a
  fixed-ish pitch (souls-like framing — not a free-fly camera, not a
  top-down isometric-only lock). Mouse moves the camera around the
  player (orbit), right-stick equivalent if a gamepad is ever added.
  Optional: a camera-collision pass so it doesn't clip through dungeon
  walls (a real 3D-only problem the 2D game never had).
- **Movement**: WASD, camera-relative (not tile-relative) — pressing W
  always moves the player away from the camera, regardless of which way
  the player model is currently facing. This is the standard third-person
  action-RPG scheme and replaces the 2D game's tile-space `dx/dy` input.
- **Facing**: the player model faces its actual movement direction (or a
  soft-locked target when one is being fought), continuously, not snapped
  to 8 discrete directions — that snapping was a 2D isometric-art
  constraint (baked sprite rows) that doesn't apply once the character is
  a real 3D-animated model.
- **Aiming spells**: mouse-aimed in 3D (cursor projects onto the ground
  plane, or a reticle/soft-lock system), replacing the 2D game's
  "facing captured at release" mechanic. Keep the same underlying rule —
  facing/aim direction is locked in at cast *release*, not at the initial
  keypress — just compute it from the mouse/camera instead of tile input.
- **Dodge roll**: still 8-ish directions is fine, but drive it from the
  camera-relative movement input at the moment of the press, same as
  movement. Keep the exact numbers from the 2D game (400ms duration, 2.0
  tile-equivalent distance, i-frames only in the middle third, 28 stamina,
  x1.5 cost while in Area 2 floodwater) — only the direction math changes.
- **No fixed-size canvas / letterboxing**: the 2D game hand-placed every
  UI element against a fixed 390x844 canvas with `Scale.FIT`. In 3D this
  is a real responsive window — HUD elements should anchor to
  screen edges/corners and scale with resolution, not assume a fixed
  pixel canvas.
- **Depth sorting**: the 2D game's `depthForTile()` painter's algorithm is
  irrelevant — real 3D depth (z-buffer) replaces it entirely. No
  conversion needed, just don't carry the concept over.

**Keybind mapping (PC defaults, keep bindable/rebindable if that's ever
built)** — carry the 2D game's key choices forward where there's no
reason to change them, since players may know them from the 2D game:

| Action | 2D key | 3D (PC) |
|---|---|---|
| Light attack | I | Left mouse button (or keep I) |
| Heavy attack | J | Right mouse button (or keep J) |
| Shield bash | L | keep L, or a modifier+click |
| Dodge roll | Space / K | Space |
| Cast spell | K | a dedicated cast key (e.g. Q/R) + mouse aim |
| Interact | E | E |
| Heal (Hearthwater) | F | F |
| Heal (Emberdraught) | G / hold F | G |
| Equipment | C | C or Tab |
| Map | M / Tab | M |
| Pause/System | Esc | Esc |

Mouse-look should not be bound to any of the above — it's the camera,
always free, separate from action inputs.

---

## 2. World structure

Same overall shape as the 2D game, rendered as real 3D spaces instead of
an isometric tile grid:

- **The Ashen Hearth** — walkable hub (not a static tap-menu), no combat.
  Already present in this repo (Phase 9). Houses Martyna (leveling),
  Varn (shop), Flavianna (spell shop, gated behind meeting her in Area 2
  first), a personal item stash, and a lightweight third NPC ("The
  Tide-Refused," a dialogue-only wanderer). NPCs are staged in visibility:
  Martyna is present the moment the prologue ends; Varn + the stash unlock
  after Area 1's boss; the wanderer unlocks after Area 2's boss.
- **The prologue, "The Nameless Shore"** — handcrafted (not procedural), a
  linear sequence of teaching beats: first forced attack, first chest
  (grants the starting weapon), a roll-teaching ambush, an optional side
  chamber that auto-grants the whole flask system on approach, a
  water-gap puzzle solved by casting the starting spell across a gap to
  light a far-side brazier, a multi-enemy approach, then the Tidewarden
  boss gate. In 3D this is real handcrafted geometry, not a fixed
  24x170 corridor — same beats, real 3D level design. Dying to the
  Tidewarden (the common outcome) leads to a mini-Hearth (flame + Martyna
  only); beating it (rare) leads to a small bonus reward room first. Both
  converge at the Hearth; leaving it for the first time ever drops the
  player into Area 1, floor 1.
- **4 real areas x 5 floors each**, no expansion beyond area 5 unless the
  user asks again (see table below) — each floor uses one of 5 named
  layout archetypes (Threshold/Warrens/Galleries/Ring/Gauntlet, floor N
  always uses archetype N) that should still govern real 3D level
  generation: room count/size, corridor width, how tightly the critical
  path hugs a straight start-to-boss line, and whether a structural loop
  exists (Ring always has one). Gauntlet (floor 5, right before the boss)
  escalates enemy density toward the end.
- **Area 5, "The Sundered Sky"** — the one deliberate area-count
  expansion beyond the original "4 areas, no expansion" rule (the user
  explicitly approved breaking that rule once). Open catwalks/broken
  bridges over chasms, not a tight corridor labyrinth — built around
  flying enemies specifically. In 3D, this is the area where real
  verticality/open-air level design matters most; lean into it.
- **The "undertombs" cellar** — one optional side room per floor of every
  real area, a single tougher elite guarding one chest. Fully
  reversible round trip.
- **Seamless portal/layer exploration** — a real, shipped 2D-game system
  worth preserving conceptually: certain floors (roughly floor index 2-3
  of every area, never the floor right before a boss) have a hidden
  connection to a bonus full-size labyrinth themed to that same area,
  reached by walking into a ramp/marker rather than a menu transition,
  with a **hard camera-cut but no loading-screen feel** — movement never
  stops, no fade. In 3D this could be a real teleport-with-continuous-
  motion (same trick, adapted) or, if the engine allows it cheaply, an
  actual streamed area transition — either way, preserve the design
  intent: it should feel like walking into a genuinely different part of
  a connected world, not a menu. These bonus labyrinths have real loot
  (chests, one rare gamble vault, an illusory wall, fallen-adventurer
  loot), a real area-correct mob roster, a checkpoint flame at their own
  landing point, and — per a later 2D-game pass — an "echo" boss (same
  stats/moves as that area's real boss, reduced narrative weight, reward
  is auto-discovering that floor's own mid-route checkpoint flame instead
  of area-progression flags).
- **Checkpoint flames** ("Ashen Flames") — one per floor, roughly
  40-60% along the critical path (or right before the boss gate on
  Gauntlet floors). Interacting the first time marks it discovered;
  discovering a second flame unlocks fast travel between any discovered
  flame from any flame's own menu (REST / travel / return to Hearth).
  Warping is one-way and rebuilds the destination floor.

| # | Area | Theme | Boss | Boss HP/Dmg (2D baseline) | Enemy HP x / Dmg x |
|---|------|-------|------|-------------|----------------|
| 1 | The Frozen Depths | ice dungeon | Forge Guardian | 300 / 25 | 1.0x / 1.0x |
| 2 | The Sunken Courtyard | mossy castle ruins, tide mechanic | Ruined Colossus | 600 / 40 | 1.8x / 1.5x |
| 3 | The Molten Sanctum | ember/obsidian | Molten Archon | 800 / 50 | 2.5x / 2.0x |
| 4 | The Hollow Spire | bone/violet | The Nameless Sovereign | 1200 / 55 | 2.8x / 2.2x |
| 5 | The Sundered Sky | open-air, flight-themed | The Hollow Wyrm (Dragon) | — | — |

Numbers above are the 2D game's tuning baseline — reasonable starting
point for 3D, not gospel; combat will feel different with real 3D
positioning and should be retuned by feel once playable.

---

## 3. Player stats and progression

Keep the 8-attribute sheet exactly as-is — it **is** the class/build
system for this game, never reduce it:

`VIG / MND / END / STR / DEX / INT / FTH / ARC`, base 10 each at level 1.
Derived stats use a soft-cap curve: strong gains 10-40, half as strong
40-60, minimal beyond 60.

| Stat | Governs |
|---|---|
| Vigor | Max HP (400 at base 10) |
| Mind | Max FP/mana (80 at base 10) |
| Endurance | Max Stamina (100) and Equip Load (40) |
| Strength | STR-scaling weapon damage |
| Dexterity | DEX-scaling weapon damage, +cast speed (max +30%), +attack speed (max +50%) |
| Intelligence | Sorcery damage |
| Faith | Incantation damage — **no Faith spells exist yet, open extension point, same as 2D** |
| Arcane | Item discovery %, status-buildup multiplier — **partially unused in 2D too, same gap carries over** |

- Souls-only currency, no auto-level. Cost per level:
  `500 x 1.15^(level-1)`, spent at Martyna in the Hearth, one stat point
  at a time, with a live before/after stat preview.
- Weapon/spell scaling grades: `S=1.0, A=0.8, B=0.6, C=0.4, D=0.25, E=0.1`
  multiplied onto the soft-capped stat, added to base damage.

---

## 4. Combat

- **Movement speed**: 3.2 units/sec base equivalent, modified by gear
  `moveSpeedPct`, reduced (~x0.4) while a spell cast is winding up.
- **Melee — 3 actions**, all stamina-gated:

  | Action | Dmg x | Stamina | Cooldown | Extra |
  |---|---|---|---|---|
  | Light | 1.0x | 12 | 400ms | — |
  | Heavy | 1.8x | 26 | 900ms | — |
  | Shield Bash | 0.3x | 20 | 650ms | knockback, stuns target 1200ms |

  Unarmed still works (weak baseline, E/E grades) — never require a
  weapon to be functional.
- **Dodge roll**: 400ms, i-frames only in the middle third (33%-67%),
  28 stamina (x1.5 in Area 2 floodwater). See section 1 for the 3D
  direction-input change.
- **Spellcasting**: real windup (40% move speed, blocks melee/heal),
  facing/aim locked at release not at keypress. Rolling always cancels a
  cast; FP refunds only if canceled in the first 40% of cast time.
  Projectiles are pooled, not allocated per shot.
- **Damage reduction**: additive across all equipped armor/shield/ring
  slots, hard-capped at 60% total.
- **Souls economy**: 12/kill, 150/boss (450 for the prologue's
  Tidewarden), 60/floor-clear.
- **Death economy**: dying drops a single recoverable soul marker at the
  death location on that exact floor. A second death before reclaiming
  the first overwrites it — no stacking, no bonfire-run escalation
  beyond that.

---

## 5. Spells (Intelligence school — the only school with real content)

Faith and Arcane schools are explicit unbuilt extension points in the 2D
game (the damage-scaling formulas exist, no spells use them) — same gap
here, don't invent Faith/Arcane spells unless asked.

| Spell | Source | FP | Cast time | Grade | Damage | Type | Special |
|---|---|---|---|---|---|---|---|
| Ashmote | starting spell, every new game | 7 | 350ms | B | 8 | homing bolt (90 deg/sec turn, 6-unit cone) | never drops as loot, guaranteed mage fallback |
| Hearthlance | rare drop | 18 | 700ms | S | 38 | piercing projectile | continues through a kill |
| Gravewake | rare drop | 15 | 600ms | B | 14 | ground AoE, radius 2 | staggers non-boss enemies 800ms, interrupts their windup |
| Stonefall | Flavianna shop | — | — | — | — | lobbed homing shard cluster | highest stagger value in the game |
| Moonfrost Lance | Flavianna shop | — | — | — | — | slow heavy bolt | stacks a chill debuff (see status effects) |
| Rotbloom | Flavianna shop | — | — | — | — | thrown vial | blooms into a lingering poison cloud on impact |
| Terra Sigil | Flavianna shop | — | — | — | — | buff rune, dropped underfoot | the game's first support/buff spell — boosts own spell damage while standing in it |
| Comet's End | Flavianna shop, legendary/capstone | — | 1800ms | — | — | continuous channeled beam | heavy FP drain, movement cancels the cast (true stationary channel, no hold-to-channel input needed) |

Flavianna is found once in Area 2, floor 3, then becomes available at the
Hearth — same discovery-then-hub-unlock pattern as Varn.

---

## 6. Status effects

A real, if still small, system in the 2D game — preserve it exactly:

- **Poison** and **Burn**: DoT effects, per-type tuning (damage/sec,
  duration, tick interval). Applied by specific enemy/spell sources
  (Ember Archer's shots burn, the Toad/Rotbloom poison). A full-HP
  poisoned player can still drink a cure-only heal purely to cure.
  God Mode (dev tool) blocks ticks; dodge-roll i-frames deliberately do
  NOT block an already-applied DoT.
- **Chill**: a stacking slow debuff (Moonfrost Lance, Area 1's Frostbite
  Stalker) — multiple stacks compound the slow up to a cap.
- These are the only three status effects that exist. No bleed, no
  actual stagger-meter system beyond specific moves that hard-stagger on
  hit (Gravewake, Stonefall).

---

## 7. Enemies

Every named enemy maps onto one of a small number of shared role
templates plus a couple of fully bespoke roles — preserve this structure
(shared AI state machine, role-tuned numbers, distinct
silhouette/model per named enemy) rather than writing one-off AI per
enemy:

**Core 3 roles** (idle -> aggro -> windup -> strike -> recover state
machine, shared): Swarmer (fast, low HP, lunges to the player's position
at windup-start), Soldier (baseline, self-centered arc), Brute (slow,
tanky, self-centered AoE slam with screen-shake-equivalent feedback).
Pack behavior: separation steering so groups don't stack.

**Bespoke roles** (their own AI branches, not reskins): Archer (4 area
variants — frost/bone/ember/void — real retreat/sidestep/line-of-sight
AI, ranged), Wolf (Area 1 only, circling movement), Toad (Area 2 only,
hop-in-bursts-then-rest-vulnerable, poison lob), Ghost (Area 4, purely
visual float/bob, otherwise plays the Soldier role verbatim).

**Named enemies per area** (each a reskin of one of the above roles with
its own model/tint, not new AI) include, non-exhaustively: Frostbite
Stalker (Area 1, ranged, applies chill), Tide Reaver (Area 2, invisible/
inert except at high tide), Cinder Wretch (Area 3, suicide-detonates a
fire AoE on death), Sovereign's Ward (Area 4, if built — reflects
projectiles unless flanked, flagged as a real new mechanic in the 2D
source, may still be unbuilt there too — check before assuming it
exists), Gargoyle/Wyrmling/Chasm-Strider (Area 5's flight-themed roster —
Gargoyle perches as an inert stone-prop until aggro'd, then hovers and
dive-bombs, landing grounded/vulnerable afterward; Wyrmling is untouchable
while airborne, a real flight/landing-vulnerability state unique to
Area 5).

**Area 5's flying-enemy rule is a real mechanic, not flavor**: flying
enemies are untouchable by melee while airborne — the player must wait
for a landing window or use a spell. This is the one area where
spellcasting is specifically the stronger tool, by design.

---

## 8. Bosses

- **4 area-gate bosses** (Forge Guardian/Ruined Colossus/Molten Archon/
  The Nameless Sovereign): each has its own distinct 3-move kit (a mix of
  melee arc, self-centered AoE slam that can leave a lingering hazard
  patch, a lunge, or a thrown projectile depending on the boss — see the
  2D source's `bossData.ts`/`FORGE_MOVES` etc. for exact per-boss move
  lists if rebuilding this from scratch). The Nameless Sovereign has an
  unblockable teleport-lunge that bypasses dodge-roll i-frames entirely.
- **The Tidewarden** (prologue tutorial boss): the one boss with real
  bespoke design beyond the shared system — sweep, a slam with a held
  telegraph (punishes a panic-dodge), and an unblockable grab triggered
  contextually (hugging its legs / healing nearby).
- **The Hollow Wyrm** (Area 5 dragon, final boss): poison + fire damage,
  a real flight-phase mechanic — at fixed HP thresholds it becomes
  genuinely untargetable, flies to a new position with a telegraphed
  strafing pass, then lands and resumes melee/ground-hazard-breath
  combat. This needs its own distinct 3D model and real flight movement,
  not a ground-boss with a "flies" flag bolted on. Color identity: red
  (fire), green (poison), black (contrast/shadow).
- **Every boss shares an entrance/death presentation beat**: spawns
  inert/hidden until the player is close, then a reveal beat + a named
  health bar; on death, a brief hit-stop, a death animation, a souls
  reward, and a name banner before the way forward opens.
- **5 secret lever-gated bosses**, one per area (including Area 5),
  each reached via a hidden lever in a dead-end room and each designed
  to test a specific player skill rather than being a reskin of the same
  gimmick:
  - **The Shackled Sentinel** (Area 1) — tests reading a threat: spawns
    completely passive/hittable-but-inert, then at 25% HP lost becomes a
    faster "unbound" phase 2 with a fresh HP pool. A bait-and-switch.
  - **The Undertow** (Area 2) — tests positioning against the real Area 2
    tide clock (not a bespoke timer) — most of the arena is real
    floodwater, a few tiles are permanently dry safe footing.
  - **The Voidbound Duelist** (Area 4) — tests attack variety: landing
    the same melee attack type twice in a row halves that hit's damage
    and triggers an unavoidable counter. Spells bypass this rule.
  - **The Gargoyle Warden** (Area 5) — tests dodge-roll i-frame timing:
    very short windup, very high damage, very low HP, long recovery — a
    correctly-timed dodge opens a huge punish window.
  - A 5th, Area 3-specific fight — the **Tower Shield Knight**: blocks
    frontal hits unless flanked, and at ~50% HP splits into 3
    simultaneous enemies (a disarmed fast husk, a tanky self-slamming
    shield, a fast spinning blade) that must all be killed.
  - Each grants a unique named weapon+armor pair with one signature
    effect, matching the game's "legendary items get one named effect"
    convention.
- **Portal-layer "echo" bosses**: every seamless bonus labyrinth (see
  section 2) has its own boss, using that area's real boss stats/moves
  verbatim but presented as a lesser echo (name suffixed, e.g. "Forge
  Guardian (Echo)") — defeating one does not flip area-progression
  flags, it auto-discovers that floor's own mid-route checkpoint flame
  instead. Important design constraint carried from the 2D source:
  killing an echo boss must never be allowed to trigger the same
  area-cleared/gate-unlock logic as the real boss — keep those two code
  paths genuinely separate, not gated by a shared conditional, or a
  player can sequence-break by finding the echo before the real fight.

---

## 9. Items and equipment

- **11 equip slots**: weapon, shield, head, chest, hands, legs, feet,
  ring x2 (two independent slots), amulet, spell.
- Roughly 40+ hand-authored items across 5 rarity tiers (common /
  uncommon / rare / epic / legendary), spread across all 11 slots for
  every area (hands and amulet slots were a late addition in the 2D
  game — make sure both have a real per-area drop ladder, not just
  secret-boss-exclusive rewards).
- Every area-4-tier (legendary) item has one unique named effect,
  cosmetically highlighted, mechanically just an extra modifier.
- **Weapons**: base damage + STR-grade + DEX-grade.
- **Armor/shields/rings/amulets**: flat modifier bag — damage reduction %
  (60% cap across everything combined), max HP flat/%, stamina regen %,
  move speed %, flask potency %, souls-gained %, weapon-damage-flat
  (weapon items only). Purely additive.
- **No true item-instance identity** in the 2D source (inventory is a
  flat list of item ids, not individually-rolled instances) — same
  simplification is fine to carry forward unless the user asks for real
  itemization (random rolls, per-instance upgrade levels) as a deliberate
  upgrade over the 2D game.
- **Flasks**: a shared allocatable charge pool (cap 12 total) split
  between Hearthwater (heals 40% max HP/charge) and Emberdraught
  (restores 40% max FP/charge), freely reallocated at any checkpoint
  flame. Palemoss is a separate, weaker (20%), finite fallback
  consumable.

---

## 10. NPCs and shops

- **Martyna** — leveling (Hearth).
- **Varn** — UPGRADE (per-item-id global level, max +3, +10%/level, costs
  a duplicate + souls) / SELL (rarity-tier flat price) / BUY (flask
  shards always; full equippable gear once that area's boss is dead, 4x
  markup over sell price, no restock timer — no dark-pattern retention
  mechanics anywhere in this game, that's a hard rule).
- **Flavianna** — spell shop (learn/buy), found in Area 2 floor 3, then
  available at the Hearth.
- **The Tide-Refused** — dialogue-only wanderer NPC at the Hearth, no
  mechanical function, pure lore/flavor.
- A personal item **stash** at the Hearth (deposit/withdraw, no combat
  relevance).

---

## 11. Narrative

- A one-time opening crawl on first ever playthrough (deep lore only —
  the Order, the flood, the Sovereign's unnaming — not the personal
  "you wash up, meet Martyna" beat).
- One lore beat per floor-clear (not floor-entry — a reward/reflection
  feel, not a preview), spread across each area's 5 floors.
- Both are one-time-only per save and should never re-trigger on a
  revisit (e.g. looping back through an earlier area later in the run).

---

## 12. Area 2's tide mechanic

A real-time rise/fall cycle (roughly 90s up, 90s down) that floods
non-critical tiles/spaces: floodHeight 1 slows movement and increases
dodge-roll stamina cost (~x1.5), floodHeight 2 becomes fully impassable
at high tide and only ever applies to dead-end side paths, never the
critical path — the route from start to boss to exit must be
**structurally guaranteed** to never seal shut, at any tide level, by
construction (not just by tuning). This was a real bug class in the 2D
game's map generator (safe tiles getting silently overwritten by later
carve steps) — if rebuilding the generator, explicitly protect
known-safe/critical-path tiles from ever being marked floodable,
regardless of what carves through them later.

---

## 13. Secondary secrets / environmental content

- **Mystery Vault**: a lever-gated gamble chest, pre-rolled at floor
  generation into Jackpot / Decent / Cursed outcomes, with a subtle
  (not blatant) visual tell before pulling.
- **Illusory walls**: a wall segment indistinguishable from a normal one
  that hides a passage, found only by interacting with it directly — no
  telegraph at all, a more paranoid flavor of secret than the vault.
- **Fallen adventurer loot**: a dead-body prop with one guaranteed item
  and a line of flavor text — pure environmental storytelling.
- **Breakable crates**: currently prologue-only in the 2D source (scoped
  down from an original "one themed breakable prop per area" plan) —
  melee range breaks them for a small souls reward, non-blocking, never
  gates walkability.
- **A locked shortcut door** (Area 4's "Ring" archetype loop): opens only
  from the far side, a same-visit backtrack convenience, not a
  first-playthrough skip.

---

## 14. Save system

3 named save slots, versioned, autosaves on floor transition / boss kill
/ checkpoint-flame rest / level-up / equip change / app backgrounding.
No cloud sync assumed unless the user asks for one — local persistence
(browser storage or equivalent) is sufficient, matching the 2D game.

---

## 15. UI/HUD (PC conventions, not touch)

Recreate the same information density as the 2D HUD, laid out for mouse +
keyboard and a real variable resolution, not touch buttons or a fixed
canvas:

- HP / FP / Stamina bars with a "ghost" trailing-drain effect on HP,
  flask charge pips, equipped-spell name+cost, a keyboard-hint line.
- A minimap (explored-only fog-of-war reveal, off-screen landmark
  markers clamped to the frame edge as directional arrows) and a larger
  expandable full map.
- A boss health bar that only appears once a boss's entrance beat
  completes.
- Area 2's tide countdown badge (direction + time remaining), shown only
  in that area.
- Equipment screen: paper-doll silhouette + slot boxes, filterable item
  grid, equip/unequip/set-spell/use actions, live before/after stat
  preview on hover/select (mouse-driven, not tap-driven).
- Pause/System menu, level-up screen (Martyna), shop screens (Varn/
  Flavianna), death screen, title/slot-picker/settings screens.
- Every overlay should cleanly pause the 3D scene underneath and hand off
  correctly if the player switches directly between two overlays — same
  reliability requirement as the 2D game's modal system, mechanism will
  necessarily be different in a 3D engine.

---

## 16. Explicit non-goals for this project

- No touch controls, no on-screen action buttons, no swipe gestures.
- No PWA manifest / homescreen-install / mobile-safe-area handling.
- No fixed-aspect-ratio letterboxed canvas — real responsive 3D viewport.
- No dark-pattern retention mechanics (energy timers, forced waits,
  restock timers designed to pressure repeat visits) — same hard rule
  carried over from the 2D game.
- Don't invent Faith or Arcane spells, true per-instance item rolls, or
  additional status effects beyond poison/burn/chill unless the user
  asks — these are known, deliberate open extension points in the source
  game, not oversights to "complete" unprompted.

---

## 17. If continuing an AI-assisted build session on this repo

- Verify actual current state against this doc before assuming a system
  exists or doesn't — this doc describes the target, not a guaranteed
  current snapshot of `souls-g`. Check the real source (`src/game/`) and
  `git log` first.
- The 2D source project (`GAME MOBILE\echoes-hohenberg`) is the source of
  truth for exact numbers, item lists, and boss move data if anything
  above needs a precise value — read the real `.ts` files there
  (`constants.ts`, `items.ts`, `bossData.ts`, `enemyRoles.ts`,
  `MapGenerator.ts`) rather than re-deriving numbers from memory.
- This is a PC game. If a future prompt, spec, or piece of inherited code
  assumes touch/mobile, that's the confused artifact this doc was written
  to replace — trust this doc over it.
