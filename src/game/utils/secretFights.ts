import { Area } from "./constants";

// The 5 optional lever-triggered fights from the source game (see items.ts's
// own comments on each reward pair, and enemyRoles.ts's per-role "secret
// fight" notes) — one per main area. Each grants a fixed legendary pair,
// never rolled into AREA_CONFIGS[...].chestItems. Bespoke arena terrain
// (the Undertow's floodwater, a hand-authored non-corridor layout, etc.) is
// deliberately out of scope here, same precedent as Area 5's Dragon arena:
// these fights play out in a normal procedurally-generated room.
export interface SecretFightConfig {
  name: string;
  // Spawn type id(s) — matching enemyRoles.ts's TYPE_ROLE table — for the
  // fight's starting roster. The Shackled Sentinel and Tower Knight
  // transform mid-fight (see GameState.ts's handleSpecialEnemyDeath) rather
  // than listing their later phases here.
  enemyTypes: string[];
  rewardItemIds: [string, string];
}

export const SECRET_FIGHT_BY_AREA: Partial<Record<Area, SecretFightConfig>> = {
  [Area.AREA_1]: {
    name: "The Shackled Sentinel",
    enemyTypes: ["enemy_shackled_sentinel"],
    rewardItemIds: ["sentinels_greataxe", "frostbound_amulet"],
  },
  [Area.AREA_2]: {
    name: "The Undertow",
    enemyTypes: ["enemy_undertow"],
    rewardItemIds: ["undertow_trident", "undertow_gauntlets"],
  },
  [Area.AREA_3]: {
    name: "The Tower Shield Knight",
    enemyTypes: ["enemy_tower_knight"],
    rewardItemIds: ["towerguard_blade", "towerguard_aegis"],
  },
  [Area.AREA_4]: {
    name: "The Voidbound Duelist",
    enemyTypes: ["enemy_voidbound_duelist"],
    rewardItemIds: ["voidbound_edge", "voidbound_signet"],
  },
  [Area.AREA_5]: {
    name: "The Gargoyle Warden",
    enemyTypes: ["enemy_gargoyle_warden"],
    rewardItemIds: ["wardens_talon", "wardens_seal"],
  },
};

// The Tower Shield Knight's death spawns these three adds in its place —
// clearing the fight means killing all three (see items.ts's own comment on
// towerguard_blade/towerguard_aegis).
export const TOWER_KNIGHT_SPLIT_TYPES = ["enemy_hollow_knight_split", "enemy_living_shield_split", "enemy_dancing_blade_split"];
