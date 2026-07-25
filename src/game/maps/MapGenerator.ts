import { Floor, Area, AREA_CONFIGS } from "../utils/constants";
import { SECRET_FIGHT_BY_AREA } from "../utils/secretFights";

// Ported from Hohenberg's client/src/game/maps/MapGenerator.ts. This is a
// trimmed core port: the room-placement/corridor-carving/floor-archetype/
// flood-tile algorithm and the "normal floor" spawn fields are ported
// near-verbatim (the algorithm has zero engine dependency — only the
// isometric-sprite rendering step doesn't carry over, and that's replaced by
// DungeonRenderer.tsx). The seamless-portal system (portals/portalAnchor/
// layerFlameSpawn/generatePortalLabyrinth) and its "echo boss" reward are
// now ported too. fallenAdventurerSpawn, merchantNpcSpawn (Flavianna), vaultSpawn
// (the Mystery Vault), illusoryWallSpawn, and "The Ring" archetype's
// shortcut-gate loop corridor are now ported; breakableSpawns (crates) is
// a new addition scattered on free tiles rather than the 2D source's
// hand-placed prologue coordinates, since this port's prologue is
// procedural rather than hand-authored.

export interface TileData {
  x: number;
  y: number;
  type: "floor" | "wall" | "ice" | "stairs_down" | "start" | "end_portal";
  floodHeight?: number;
}

export interface MapData {
  tiles: TileData[];
  width: number;
  height: number;
  playerSpawn: { x: number; y: number };
  enemySpawns: { x: number; y: number; type: string }[];
  chestSpawns: { x: number; y: number; itemId: string }[];
  doorSpawns: { x: number; y: number }[];
  bossSpawn?: { x: number; y: number; type: string };
  cellarStairs?: { x: number; y: number };
  endPoint?: { x: number; y: number };
  startPoint: { x: number; y: number };
  bossGateDoor?: { x: number; y: number };
  ashenFlameSpawn?: { x: number; y: number };
  startFlameSpawn?: { x: number; y: number };
  propSpawns: { x: number; y: number }[];
  // The area's secret lever fight, if AREA_CONFIGS[...] has one configured
  // (see utils/secretFights.ts) — a single tile, same "just a spot in a
  // normal procedurally-generated room" precedent as ashenFlameSpawn, not a
  // bespoke arena.
  leverSpawn?: { x: number; y: number };
  // A themed one-shot loot prop on a free floor tile — design doc section
  // 13's "fallen adventurer loot," pure environmental storytelling. One per
  // floor, any area (2D source precedent: not area/floor-restricted).
  fallenAdventurerSpawn?: { x: number; y: number; itemId: string; flavorText: string };
  // Design doc section 13: "currently prologue-only in the 2D source"
  // (scoped down from an original "one themed breakable prop per area"
  // plan) — melee range breaks them for a small souls reward, non-blocking,
  // never gates walkability. Only ever populated for Area.PROLOGUE here,
  // matching that precedent exactly.
  breakableSpawns?: { x: number; y: number }[];
  // Flavianna — a single one-time in-world encounter, Area 2 / floor index
  // 2 only (design doc: "found once in Area 2, floor 3"). Optional by
  // construction: an unlucky room roll with no dead-end rooms just means no
  // spawn that run, same absence precedent as ashenFlameSpawn/leverSpawn.
  merchantNpcSpawn?: { x: number; y: number };
  // Mystery Vault (design doc section 13) — a lever paired with a gamble
  // chest, outcome pre-rolled at generation time (not on pull) so a visual
  // tell can be shown before the player commits. Not guaranteed every
  // floor — needs a 4th dead-end room beyond the 3 the regular chest
  // scatter already claims, same acceptable-absence precedent as
  // merchantNpcSpawn/leverSpawn above.
  vaultSpawn?: { chestX: number; chestY: number; leverX: number; leverY: number; outcome: "jackpot" | "decent" | "cursed"; itemId: string };
  // Illusory wall (design doc section 13) — wallX/wallY and revealX/revealY
  // stay genuinely "wall" TileData exactly as generated (zero risk to
  // connectivity/pathing elsewhere); the reveal is a runtime-only override
  // once interacted with from fromX/fromY (see GameState.openIllusoryWall).
  // No telegraph at all — indistinguishable from any other wall until then.
  illusoryWallSpawn?: { wallX: number; wallY: number; fromX: number; fromY: number; revealX: number; revealY: number; itemId: string };
  // "The Ring" archetype's locked shortcut door (design doc section 13) —
  // blocks gateTiles until opened, and only openable by approaching from
  // openFromX/openFromY (the far side, reached via the normal path first).
  // Not guaranteed every "Ring" floor — see generateLabyrinth's own comment
  // on why a passing candidate isn't always found.
  shortcutDoorSpawn?: { gateTiles: { x: number; y: number }[]; openFromX: number; openFromY: number };
  // Seamless-portal system (design doc section 2) — where a bonus-labyrinth
  // portal ramp would sit on this (ground-layer) floor, computed
  // unconditionally on every generateMap() call (cheap, same precedent as
  // ashenFlameSpawn). It's the caller's job (GameScene) to decide whether
  // this floor is actually eligible to wire one up (floors 2-3 of every
  // area, never the floor right before a boss) — undefined if no free tile
  // was found near the chosen path-fraction room.
  portalAnchor?: { x: number; y: number };
  // Bonus-layer only (see generatePortalLabyrinth) — a dedicated checkpoint
  // at the layer's own landing tile. Deliberately not ashenFlameSpawn/
  // startFlameSpawn (those are the ground layer's own checkpoint/respawn
  // fields; reusing them here would repoint a respawn at the wrong layer).
  layerFlameSpawn?: { x: number; y: number };
  // Bonus-layer only — the return-to-ground portal, planted at the
  // labyrinth's own spawn point so leaving is always one interact away.
  portals?: { id: string; x: number; y: number; targetX: number; targetY: number; label: string }[];
  // Hearth-only (see generateHearthMap): one gate per travel destination,
  // rendered/interacted by HearthGates.tsx. Undefined on every normal
  // procedurally-generated floor.
  areaGates?: { x: number; y: number; area: Area; label: string }[];
  // Hearth-only: Martyna (leveling), Varn (shop), the personal item stash,
  // The Tide-Refused (dialogue-only wanderer), and Flavianna (spell shop,
  // once met via merchantNpcSpawn) — see HearthNPCs.tsx.
  npcs?: { id: "martyna" | "varn" | "stash" | "tide_refused" | "flavianna"; x: number; y: number }[];
}

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  tag: "start" | "normal" | "dead_end" | "boss" | "end" | "corridor";
  center: { x: number; y: number };
}

export interface FloorArchetype {
  name: string;
  mainRoomCountRange: [number, number];
  mainRoomSizeRange: [number, number];
  deadEndCount: number;
  corridorWidth: 1 | 2 | 3;
  pathJitter: number;
  loopChance: number;
}

export const FLOOR_ARCHETYPES: FloorArchetype[] = [
  { name: "Threshold", mainRoomCountRange: [4, 5], mainRoomSizeRange: [5, 6], deadEndCount: 3, corridorWidth: 3, pathJitter: 3, loopChance: 0 },
  { name: "Warrens", mainRoomCountRange: [9, 11], mainRoomSizeRange: [3, 5], deadEndCount: 6, corridorWidth: 2, pathJitter: 13, loopChance: 0.2 },
  { name: "Galleries", mainRoomCountRange: [4, 5], mainRoomSizeRange: [8, 9], deadEndCount: 3, corridorWidth: 3, pathJitter: 6, loopChance: 0 },
  { name: "Ring", mainRoomCountRange: [6, 7], mainRoomSizeRange: [5, 6], deadEndCount: 3, corridorWidth: 3, pathJitter: 7, loopChance: 1 },
  { name: "Gauntlet", mainRoomCountRange: [3, 4], mainRoomSizeRange: [5, 6], deadEndCount: 2, corridorWidth: 3, pathJitter: 2, loopChance: 0 },
];

export const FLOOR_SEQUENCE: Floor[] = [Floor.BASEMENT, Floor.GROUND, Floor.SECOND, Floor.THIRD, Floor.TOP];

export function archetypeForFloor(floor: Floor): FloorArchetype {
  const idx = FLOOR_SEQUENCE.indexOf(floor);
  return FLOOR_ARCHETYPES[idx >= 0 ? idx : 0];
}

const ARCHER_TYPE_BY_AREA: Partial<Record<Area, string>> = {
  [Area.AREA_1]: "enemy_frost_archer",
  [Area.AREA_2]: "enemy_bone_archer",
  [Area.AREA_3]: "enemy_ember_archer",
  [Area.AREA_4]: "enemy_void_archer",
};
const ARCHER_MAX_PER_ROOM: Partial<Record<Area, number>> = {
  [Area.AREA_1]: 1,
  [Area.AREA_2]: 1,
  [Area.AREA_3]: 2,
  [Area.AREA_4]: 2,
};
const ARCHER_MIN_FLOOR_INDEX = 1;
const ARCHER_ROOM_CHANCE = 0.5;

const WOLF_TYPE_BY_AREA: Partial<Record<Area, string>> = {
  [Area.AREA_1]: "enemy_ice_wolf",
};
const WOLF_MAX_PER_ROOM = 2;
const WOLF_MIN_FLOOR_INDEX = 1;
const WOLF_ROOM_CHANCE = 0.5;

const TOAD_TYPE_BY_AREA: Partial<Record<Area, string>> = {
  [Area.AREA_2]: "enemy_bog_toad",
};
const TOAD_MAX_PER_ROOM = 1;
const TOAD_MIN_FLOOR_INDEX = 1;
const TOAD_ROOM_CHANCE = 0.35;

const TIDE_REAVER_TYPE_BY_AREA: Partial<Record<Area, string>> = {
  [Area.AREA_2]: "enemy_tide_reaver",
};
const TIDE_REAVER_MAX_PER_ROOM = 1;
const TIDE_REAVER_MIN_FLOOR_INDEX = 1;
const TIDE_REAVER_ROOM_CHANCE = 0.3;

const CINDER_WRETCH_TYPE_BY_AREA: Partial<Record<Area, string>> = {
  [Area.AREA_3]: "enemy_cinder_wretch",
};
const CINDER_WRETCH_MAX_PER_ROOM = 1;
const CINDER_WRETCH_MIN_FLOOR_INDEX = 1;
const CINDER_WRETCH_ROOM_CHANCE = 0.3;

function specialRoleBudget(numInRoom: number): number {
  return Math.min(2, numInRoom);
}

function edgeBiasedCoord(min: number, max: number): number {
  if (max <= min) return min;
  const span = Math.max(1, Math.floor((max - min) / 3));
  return Math.random() < 0.5 ? min + Math.floor(Math.random() * span) : max - Math.floor(Math.random() * span);
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Fallen Adventurer flavor lines — ported verbatim from the 2D source.
const FALLEN_ADVENTURER_FLAVOR = [
  "They made it further than most. Not far enough.",
  "Whatever they were running from, it caught up here.",
  "One hand still reaches toward the way out.",
  "No name left on them. The mountain took that too.",
];

function generateLabyrinth(
  width: number,
  height: number,
  archetype: FloorArchetype,
  area: Area,
  hasBoss: boolean
): {
  map: number[][];
  rooms: Room[];
  floodTiles: Map<string, 1 | 2>;
  sortedMain: Room[];
  shortcutGate?: { gateTiles: { x: number; y: number }[]; openFromX: number; openFromY: number };
} {
  const map: number[][] = [];
  for (let y = 0; y < height; y++) {
    map[y] = [];
    for (let x = 0; x < width; x++) map[y][x] = 1;
  }

  const rooms: Room[] = [];
  const floodTiles = new Map<string, 1 | 2>();
  const safeTiles = new Set<string>();

  function markFlood(x: number, y: number, floodTier: 0 | 1 | 2) {
    const key = `${x},${y}`;
    if (floodTier === 0) {
      safeTiles.add(key);
      floodTiles.delete(key);
    } else if (!safeTiles.has(key)) {
      floodTiles.set(key, floodTier);
    }
  }

  function carveRoom(rx: number, ry: number, rw: number, rh: number, floodTier: 0 | 1 | 2 = 0): boolean {
    if (rx < 1 || ry < 1 || rx + rw >= width - 1 || ry + rh >= height - 1) return false;
    for (const room of rooms) {
      if (rx < room.x + room.w + 2 && rx + rw + 2 > room.x && ry < room.y + room.h + 2 && ry + rh + 2 > room.y) return false;
    }
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        map[y][x] = 0;
        markFlood(x, y, floodTier);
      }
    }
    return true;
  }

  function carveCorridor(x1: number, y1: number, x2: number, y2: number, floodTier: 0 | 1 | 2 = 0, cWidth: number = archetype.corridorWidth) {
    const mark = (x: number, y: number) => markFlood(x, y, floodTier);
    const startX = Math.min(x1, x2);
    const endX = Math.max(x1, x2);
    for (let x = startX; x <= endX; x++) {
      for (let w = 0; w < cWidth; w++) {
        const y = y1 + w;
        if (y >= 0 && y < height && x >= 0 && x < width) {
          map[y][x] = 0;
          mark(x, y);
        }
      }
    }
    const startY = Math.min(y1, y2);
    const endY = Math.max(y1, y2);
    for (let y = startY; y <= endY; y++) {
      for (let w = 0; w < cWidth; w++) {
        const x = x2 + w;
        if (y >= 0 && y < height && x >= 0 && x < width) {
          map[y][x] = 0;
          mark(x, y);
        }
      }
    }
  }

  const startRoom: Room = { x: 2, y: height - 8, w: 5, h: 5, tag: "start", center: { x: 4, y: height - 6 } };
  carveRoom(startRoom.x, startRoom.y, startRoom.w, startRoom.h);
  rooms.push(startRoom);

  const endRoom: Room = { x: width - 8, y: 2, w: 5, h: 5, tag: "end", center: { x: width - 6, y: 4 } };
  carveRoom(endRoom.x, endRoom.y, endRoom.w, endRoom.h);
  rooms.push(endRoom);

  // Only the area's final floor gets a boss room — every other floor is a
  // plain crawl whose "end" room leads to the next floor instead. Rooms
  // still interpolate their placement toward whichever room ends the
  // critical path (the boss room when there is one, otherwise the end room
  // itself), so non-boss floors aren't just the boss-floor layout with a
  // hole in it.
  let bossRoom: Room | undefined;
  if (hasBoss) {
    const isDragonArena = area === Area.AREA_5;
    const bossW = isDragonArena ? 18 : 10;
    const bossH = isDragonArena ? 16 : 9;
    const bossX = width - bossW - 12;
    const bossY = 3;
    bossRoom = { x: bossX, y: bossY, w: bossW, h: bossH, tag: "boss", center: { x: bossX + Math.floor(bossW / 2), y: bossY + Math.floor(bossH / 2) } };
    carveRoom(bossRoom.x, bossRoom.y, bossRoom.w, bossRoom.h);
    rooms.push(bossRoom);
  }
  const pathEndAnchor = (bossRoom ?? endRoom).center;

  const targetMainRooms = randInt(archetype.mainRoomCountRange[0], archetype.mainRoomCountRange[1]);
  for (let i = 0; i < targetMainRooms; i++) {
    const t = (i + 1) / (targetMainRooms + 1);
    const targetX = startRoom.center.x + (pathEndAnchor.x - startRoom.center.x) * t;
    const targetY = startRoom.center.y + (pathEndAnchor.y - startRoom.center.y) * t;
    for (let attempt = 0; attempt < 40; attempt++) {
      const rw = randInt(archetype.mainRoomSizeRange[0], archetype.mainRoomSizeRange[1]);
      const rh = randInt(archetype.mainRoomSizeRange[0], archetype.mainRoomSizeRange[1]);
      const jitter = archetype.pathJitter;
      const rx = clamp(Math.round(targetX - rw / 2 + randInt(-jitter, jitter)), 2, width - rw - 3);
      const ry = clamp(Math.round(targetY - rh / 2 + randInt(-jitter, jitter)), 2, height - rh - 3);
      if (carveRoom(rx, ry, rw, rh)) {
        rooms.push({ x: rx, y: ry, w: rw, h: rh, tag: "normal", center: { x: Math.floor(rx + rw / 2), y: Math.floor(ry + rh / 2) } });
        break;
      }
    }
  }

  for (let i = 0; i < archetype.deadEndCount; i++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const rw = randInt(3, 4);
      const rh = randInt(3, 4);
      const rx = randInt(2, width - rw - 3);
      const ry = randInt(2, height - rh - 3);
      if (carveRoom(rx, ry, rw, rh, 1)) {
        rooms.push({ x: rx, y: ry, w: rw, h: rh, tag: "dead_end", center: { x: Math.floor(rx + rw / 2), y: Math.floor(ry + rh / 2) } });
        break;
      }
    }
  }

  const mainPath = rooms.filter((r) => r.tag === "start" || r.tag === "normal" || r.tag === "boss" || (!hasBoss && r.tag === "end"));
  const sortedMain = [rooms[0]];
  const remaining = mainPath.filter((r) => r.tag !== "start");
  while (remaining.length > 0) {
    const last = sortedMain[sortedMain.length - 1];
    let closest = 0;
    let closestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = Math.abs(remaining[i].center.x - last.center.x) + Math.abs(remaining[i].center.y - last.center.y);
      if (d < closestDist) {
        closestDist = d;
        closest = i;
      }
    }
    sortedMain.push(remaining[closest]);
    remaining.splice(closest, 1);
  }

  for (let i = 1; i < sortedMain.length; i++) {
    carveCorridor(sortedMain[i - 1].center.x, sortedMain[i - 1].center.y, sortedMain[i].center.x, sortedMain[i].center.y);
  }
  // When there's a boss, the end room sits beyond it (reached only once the
  // boss gate unlocks) — not part of sortedMain's own chain. When there's
  // no boss, the end room is already the last stop in sortedMain (see the
  // mainPath filter above), so it's already connected.
  if (bossRoom) carveCorridor(bossRoom.center.x, bossRoom.center.y, endRoom.center.x, endRoom.center.y);

  // "The Ring" archetype (design doc section 13) — one extra corridor
  // bypassing the sequential chain, turning it into an actual loop. The
  // loop's value is a same-visit backtrack, not a first-playthrough skip:
  // both endpoints are already main-path rooms visited in normal order, so
  // the shortcut only pays off after reaching `last` the normal way —
  // which is exactly what gating the open-prompt to the `last` side
  // enforces (see GameState.openShortcutDoor). Skipped when there aren't
  // at least 4 main-path rooms (nothing to bypass around).
  //
  // Connectivity is verified by an actual flood-fill with the candidate
  // gate tiles blocked, over the map as carved so far — a fixed-offset
  // guess isn't enough (it can land inside `first`/`last`'s own room
  // rectangles, or on the sequential corridor's shared initial leg, since
  // this generator never cross-checks corridors against each other
  // elsewhere either). No passing candidate leaves shortcutGate undefined,
  // same silent-absence precedent as every other optional spawn here.
  let shortcutGate: { gateTiles: { x: number; y: number }[]; openFromX: number; openFromY: number } | undefined;
  if (archetype.loopChance > 0 && Math.random() < archetype.loopChance && sortedMain.length >= 4) {
    const first = sortedMain[1];
    const last = sortedMain[sortedMain.length - 2];
    carveCorridor(first.center.x, first.center.y, last.center.x, last.center.y);

    const finalTarget = (bossRoom ?? sortedMain[sortedMain.length - 1]).center;
    const cWidth = archetype.corridorWidth;
    const dir = Math.sign(last.center.x - first.center.x) || 1;
    const inRoomX = (x: number, room: Room) => x >= room.x && x < room.x + room.w;
    const staysConnected = (blocked: Set<string>): boolean => {
      const seen = new Set<string>();
      const stack: { x: number; y: number }[] = [startRoom.center];
      while (stack.length) {
        const p = stack.pop()!;
        const key = `${p.x},${p.y}`;
        if (seen.has(key)) continue;
        if (p.x < 0 || p.y < 0 || p.x >= width || p.y >= height) continue;
        if (map[p.y][p.x] === 1) continue;
        if (blocked.has(key)) continue;
        seen.add(key);
        stack.push({ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 });
      }
      return seen.has(`${finalTarget.x},${finalTarget.y}`);
    };
    for (let x = first.center.x + dir; x !== last.center.x; x += dir) {
      const openX = x + dir;
      if (openX === last.center.x) break;
      if (inRoomX(x, first) || inRoomX(x, last) || inRoomX(openX, first) || inRoomX(openX, last)) continue;
      const candidateTiles: { x: number; y: number }[] = [];
      for (let w = 0; w < cWidth; w++) candidateTiles.push({ x, y: first.center.y + w });
      // Real bug caught by this port's own verification sweep (not present
      // in the 2D source's own account, but the same class of issue it
      // warned about): a candidate row can run off the map edge or land on
      // a cell the horizontal-leg carve never actually reached, leaving a
      // "gate tile" that was never real floor. Blocking an already-wall
      // tile is a no-op for staysConnected below, so it'd pass trivially
      // without ever gating the real corridor — verify every candidate
      // tile is genuinely already-carved floor before it's even considered.
      const allCarved = candidateTiles.every((t) => t.y >= 0 && t.y < height && map[t.y][t.x] === 0);
      if (!allCarved) continue;
      const blocked = new Set(candidateTiles.map((t) => `${t.x},${t.y}`));
      if (staysConnected(blocked)) {
        shortcutGate = { gateTiles: candidateTiles, openFromX: openX, openFromY: first.center.y };
        break;
      }
    }
  }

  const deadEnds = rooms.filter((r) => r.tag === "dead_end");
  for (const de of deadEnds) {
    let nearest = sortedMain[0];
    let nearDist = Infinity;
    for (const mr of sortedMain) {
      const d = Math.abs(mr.center.x - de.center.x) + Math.abs(mr.center.y - de.center.y);
      if (d < nearDist) {
        nearDist = d;
        nearest = mr;
      }
    }
    carveCorridor(de.center.x, de.center.y, nearest.center.x, nearest.center.y, 2);
  }

  return { map, rooms, floodTiles, sortedMain, shortcutGate };
}

function pickRoomAtPathFraction(sortedMain: Room[], fraction: number): Room {
  // Never land exactly on the room that ends the critical path (the boss
  // room when one exists, otherwise the end room that now terminates
  // sortedMain on boss-less floors — see generateLabyrinth's hasBoss param).
  const isTerminal = (r: Room) => r.tag === "boss" || r.tag === "end";
  const segLengths: number[] = [];
  let total = 0;
  for (let i = 1; i < sortedMain.length; i++) {
    const d = Math.abs(sortedMain[i].center.x - sortedMain[i - 1].center.x) + Math.abs(sortedMain[i].center.y - sortedMain[i - 1].center.y);
    segLengths.push(d);
    total += d;
  }
  if (total === 0) return sortedMain[0];
  const target = total * fraction;
  let cumulative = 0;
  for (let i = 0; i < segLengths.length; i++) {
    cumulative += segLengths[i];
    if (cumulative >= target) {
      const candidate = sortedMain[i + 1];
      return isTerminal(candidate) && i > 0 ? sortedMain[i] : candidate;
    }
  }
  const last = sortedMain[sortedMain.length - 1];
  return isTerminal(last) && sortedMain.length > 1 ? sortedMain[sortedMain.length - 2] : last;
}

function findFreeTileNear(
  anchor: { x: number; y: number },
  offsets: readonly (readonly [number, number])[],
  isFree: (x: number, y: number) => boolean,
  markUsed: (x: number, y: number) => void
): { x: number; y: number } | undefined {
  for (const [ox, oy] of offsets) {
    const nx = anchor.x + ox;
    const ny = anchor.y + oy;
    if (!isFree(nx, ny)) continue;
    markUsed(nx, ny);
    return { x: nx, y: ny };
  }
  return undefined;
}

export function generateMap(floor: Floor, area: Area = Area.AREA_1, forceBoss = false): MapData {
  const areaConfig = AREA_CONFIGS[area];
  const width = areaConfig.mapSize;
  const height = areaConfig.mapSize;
  const archetype = archetypeForFloor(floor);
  const enemyTypes = areaConfig.enemyTypes;
  const bossType = areaConfig.bossType;
  const floorIdx = FLOOR_SEQUENCE.indexOf(floor);
  // The prologue is a single self-contained floor (its own boss, the
  // Tidewarden, regardless of which Floor enum value it's generated with) —
  // every other area is the real "5 floors, boss only on the last" shape.
  // forceBoss (only ever passed by generatePortalLabyrinth) overrides this
  // for the bonus layer's own "echo boss" room — without it, GROUND/SECOND
  // (the only portal-eligible floors) never carve a boss room at all, so
  // mapData.bossSpawn would always come back undefined.
  const isFinalFloor = area === Area.PROLOGUE || floorIdx === FLOOR_SEQUENCE.length - 1;

  const { map: rawMap, rooms, floodTiles, sortedMain, shortcutGate } = generateLabyrinth(width, height, archetype, area, isFinalFloor || forceBoss);
  const tideArea = area === Area.AREA_2;
  const tiles: TileData[] = [];
  const floorTiles: { x: number; y: number }[] = [];

  const startRoom = rooms.find((r) => r.tag === "start")!;
  const endRoom = rooms.find((r) => r.tag === "end")!;
  const bossRoom = rooms.find((r) => r.tag === "boss");

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rawMap[y][x] === 0) {
        const inStart = x >= startRoom.x && x < startRoom.x + startRoom.w && y >= startRoom.y && y < startRoom.y + startRoom.h;
        const isEndCenter = x === endRoom.center.x && y === endRoom.center.y;
        let tileType: TileData["type"] = "floor";
        if (inStart) tileType = "start";
        else if (isEndCenter) tileType = "end_portal";
        else if (Math.random() < 0.08) tileType = "ice";
        const tile: TileData = { x, y, type: tileType };
        if (tideArea) tile.floodHeight = floodTiles.get(`${x},${y}`) ?? 0;
        tiles.push(tile);
        floorTiles.push({ x, y });
      } else {
        tiles.push({ x, y, type: "wall" });
      }
    }
  }

  const playerSpawn = { x: startRoom.center.x, y: startRoom.center.y };
  const startPoint = { ...playerSpawn };
  const endPoint = { x: endRoom.center.x, y: endRoom.center.y };

  const enemySpawns: { x: number; y: number; type: string }[] = [];
  const normalRooms = rooms.filter((r) => r.tag === "normal" || r.tag === "dead_end");
  const mainRoomsOnly = rooms.filter((r) => r.tag === "normal");

  const archerType = ARCHER_TYPE_BY_AREA[area];
  const archerCap = ARCHER_MAX_PER_ROOM[area] ?? 0;
  const archersEligibleThisFloor = !!archerType && archerCap > 0 && floorIdx >= ARCHER_MIN_FLOOR_INDEX;
  const wolfType = WOLF_TYPE_BY_AREA[area];
  const wolvesEligibleThisFloor = !!wolfType && floorIdx >= WOLF_MIN_FLOOR_INDEX;
  const toadType = TOAD_TYPE_BY_AREA[area];
  const toadsEligibleThisFloor = !!toadType && floorIdx >= TOAD_MIN_FLOOR_INDEX;
  const tideReaverType = TIDE_REAVER_TYPE_BY_AREA[area];
  const tideReaversEligibleThisFloor = !!tideReaverType && floorIdx >= TIDE_REAVER_MIN_FLOOR_INDEX;
  const cinderWretchType = CINDER_WRETCH_TYPE_BY_AREA[area];
  const cinderWretchesEligibleThisFloor = !!cinderWretchType && floorIdx >= CINDER_WRETCH_MIN_FLOOR_INDEX;

  for (const room of normalRooms) {
    let numInRoom = room.tag === "dead_end" ? 2 : 3;
    if (archetype.name === "Gauntlet" && room.tag === "normal" && mainRoomsOnly.length > 1) {
      const progress = mainRoomsOnly.indexOf(room) / (mainRoomsOnly.length - 1);
      numInRoom = 2 + Math.round(progress * 3);
    }

    const specialBudget = specialRoleBudget(numInRoom);
    let specialPlaced = 0;

    let wolvesToPlace = 0;
    if (wolvesEligibleThisFloor && Math.random() < WOLF_ROOM_CHANCE) {
      const roomWolfCap = Math.min(WOLF_MAX_PER_ROOM, specialBudget - specialPlaced, numInRoom);
      wolvesToPlace = roomWolfCap >= 2 ? 2 : roomWolfCap >= 1 ? 1 : 0;
    }
    specialPlaced += wolvesToPlace;

    let archersToPlace = 0;
    if (room.tag === "normal" && archersEligibleThisFloor && Math.random() < ARCHER_ROOM_CHANCE) {
      archersToPlace = Math.min(archerCap, specialBudget - specialPlaced, numInRoom - wolvesToPlace);
    }

    let wolvesPlaced = 0;
    let archersPlaced = 0;
    for (let i = 0; i < numInRoom; i++) {
      const placeWolf = wolvesPlaced < wolvesToPlace;
      const placeArcher = !placeWolf && archersPlaced < archersToPlace;
      const ex = placeArcher ? edgeBiasedCoord(room.x + 1, room.x + room.w - 2) : room.x + 1 + Math.floor(Math.random() * (room.w - 2));
      const ey = placeArcher ? edgeBiasedCoord(room.y + 1, room.y + room.h - 2) : room.y + 1 + Math.floor(Math.random() * (room.h - 2));
      if (rawMap[ey]?.[ex] === 0) {
        if (placeWolf) wolvesPlaced++;
        else if (placeArcher) archersPlaced++;
        enemySpawns.push({ x: ex, y: ey, type: placeWolf ? wolfType! : placeArcher ? archerType! : enemyTypes[Math.floor(Math.random() * enemyTypes.length)] });
      }
    }

    if (room.tag === "normal" && toadsEligibleThisFloor && Math.random() < TOAD_ROOM_CHANCE) {
      for (let i = 0; i < TOAD_MAX_PER_ROOM; i++) {
        const tx = room.x + 1 + Math.floor(Math.random() * (room.w - 2));
        const ty = room.y + 1 + Math.floor(Math.random() * (room.h - 2));
        if (rawMap[ty]?.[tx] === 0) enemySpawns.push({ x: tx, y: ty, type: toadType! });
      }
    }
    if (room.tag === "normal" && tideReaversEligibleThisFloor && Math.random() < TIDE_REAVER_ROOM_CHANCE) {
      for (let i = 0; i < TIDE_REAVER_MAX_PER_ROOM; i++) {
        const tx = room.x + 1 + Math.floor(Math.random() * (room.w - 2));
        const ty = room.y + 1 + Math.floor(Math.random() * (room.h - 2));
        if (rawMap[ty]?.[tx] === 0) enemySpawns.push({ x: tx, y: ty, type: tideReaverType! });
      }
    }
    if (room.tag === "normal" && cinderWretchesEligibleThisFloor && Math.random() < CINDER_WRETCH_ROOM_CHANCE) {
      for (let i = 0; i < CINDER_WRETCH_MAX_PER_ROOM; i++) {
        const tx = room.x + 1 + Math.floor(Math.random() * (room.w - 2));
        const ty = room.y + 1 + Math.floor(Math.random() * (room.h - 2));
        if (rawMap[ty]?.[tx] === 0) enemySpawns.push({ x: tx, y: ty, type: cinderWretchType! });
      }
    }
  }

  for (let i = 0; i < 6; i++) {
    const tile = floorTiles[Math.floor(Math.random() * floorTiles.length)];
    const dist = Math.abs(tile.x - playerSpawn.x) + Math.abs(tile.y - playerSpawn.y);
    if (dist > 8) enemySpawns.push({ x: tile.x, y: tile.y, type: enemyTypes[Math.floor(Math.random() * enemyTypes.length)] });
  }

  let bossSpawn: { x: number; y: number; type: string } | undefined;
  if (bossType && bossRoom) bossSpawn = { x: bossRoom.center.x, y: bossRoom.center.y, type: bossType };

  let bossGateDoor: { x: number; y: number } | undefined;
  if (bossRoom && endRoom) {
    const gateX = Math.floor((bossRoom.center.x + endRoom.center.x) / 2);
    const gateY = Math.floor((bossRoom.center.y + endRoom.center.y) / 2);
    let bestGate = { x: gateX, y: gateY };
    let bestDist = Infinity;
    for (const ft of floorTiles) {
      const d = Math.abs(ft.x - gateX) + Math.abs(ft.y - gateY);
      if (d < bestDist) {
        bestDist = d;
        bestGate = ft;
      }
    }
    bossGateDoor = bestGate;
  }

  const nearTiles = floorTiles.filter((t) => {
    const d = Math.abs(t.x - playerSpawn.x) + Math.abs(t.y - playerSpawn.y);
    return d > 3 && d < 10;
  });
  const stairsTile = nearTiles.length > 0 ? nearTiles[Math.floor(Math.random() * nearTiles.length)] : floorTiles[Math.floor(floorTiles.length / 3)];
  const cellarStairs = { x: stairsTile.x, y: stairsTile.y };
  const stairsIdx = tiles.findIndex((t) => t.x === stairsTile.x && t.y === stairsTile.y);
  if (stairsIdx >= 0) tiles[stairsIdx].type = "stairs_down";

  const chestItemIds = [...areaConfig.chestItems];
  for (let i = chestItemIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chestItemIds[i], chestItemIds[j]] = [chestItemIds[j], chestItemIds[i]];
  }
  let chestItemIdx = 0;
  const getNextChestItem = (): string => {
    const item = chestItemIds[chestItemIdx % chestItemIds.length];
    chestItemIdx++;
    return item;
  };

  const chestSpawns: { x: number; y: number; itemId: string }[] = [];
  const usedTiles = new Set<string>();
  usedTiles.add(`${playerSpawn.x},${playerSpawn.y}`);
  const isFreeTile = (x: number, y: number) => !usedTiles.has(`${x},${y}`) && rawMap[y]?.[x] === 0;
  const markTileUsed = (x: number, y: number) => usedTiles.add(`${x},${y}`);

  if (shortcutGate) {
    for (const t of shortcutGate.gateTiles) usedTiles.add(`${t.x},${t.y}`);
    usedTiles.add(`${shortcutGate.openFromX},${shortcutGate.openFromY}`);
  }

  const startFlameOffsets = [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const;
  const startFlameSpawn = findFreeTileNear(playerSpawn, startFlameOffsets, isFreeTile, markTileUsed);

  const deadEndRooms = rooms.filter((r) => r.tag === "dead_end");
  for (let i = 0; i < Math.min(3, deadEndRooms.length); i++) {
    const de = deadEndRooms[i];
    const cx = de.x + Math.floor(de.w / 2);
    const cy = de.y + Math.floor(de.h / 2);
    const key = `${cx},${cy}`;
    if (!usedTiles.has(key) && rawMap[cy]?.[cx] === 0) {
      usedTiles.add(key);
      chestSpawns.push({ x: cx, y: cy, itemId: getNextChestItem() });
    }
  }

  // Mystery Vault — a lever paired with a gamble chest, one dead-end room
  // beyond the 3 already claimed by the regular chest scatter above.
  // Outcome is rolled here (not on pull) so a visual tell can be shown
  // before the player commits — never re-rolled at interact time.
  let vaultSpawn: MapData["vaultSpawn"];
  if (deadEndRooms.length > 3) {
    const room = deadEndRooms[3];
    const vaultOffsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]] as const;
    const leverPos = findFreeTileNear(room.center, vaultOffsets, isFreeTile, markTileUsed);
    const chestPos = leverPos && findFreeTileNear(room.center, vaultOffsets, isFreeTile, markTileUsed);
    if (leverPos && chestPos) {
      const roll = Math.random();
      const outcome: "jackpot" | "decent" | "cursed" = roll < 0.15 ? "jackpot" : roll < 0.7 ? "decent" : "cursed";
      vaultSpawn = { chestX: chestPos.x, chestY: chestPos.y, leverX: leverPos.x, leverY: leverPos.y, outcome, itemId: getNextChestItem() };
    }
  }

  // Illusory wall — finds a wall tile directly adjacent to an existing
  // floor tile whose OTHER neighbor (continuing the same direction, 2
  // tiles from the floor tile) is also genuinely wall in the raw grid —
  // that far tile becomes a hidden 1-tile alcove. Deliberately does not
  // touch `tiles`/rawMap here; both stay real "wall" TileData exactly as
  // generated, so there's zero risk to connectivity/pathing invariants.
  let illusoryWallSpawn: MapData["illusoryWallSpawn"];
  {
    const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const candidates = [...floorTiles].sort(() => Math.random() - 0.5).slice(0, 200);
    outerIllusory: for (const tile of candidates) {
      for (const [dx, dy] of dirs) {
        const wx = tile.x + dx;
        const wy = tile.y + dy;
        const rx = tile.x + dx * 2;
        const ry = tile.y + dy * 2;
        if (rx < 1 || rx >= width - 1 || ry < 1 || ry >= height - 1) continue;
        if (rawMap[wy]?.[wx] !== 1 || rawMap[ry]?.[rx] !== 1) continue;
        const wallKey = `${wx},${wy}`;
        const revealKey = `${rx},${ry}`;
        if (usedTiles.has(wallKey) || usedTiles.has(revealKey)) continue;
        usedTiles.add(wallKey);
        usedTiles.add(revealKey);
        illusoryWallSpawn = { wallX: wx, wallY: wy, fromX: tile.x, fromY: tile.y, revealX: rx, revealY: ry, itemId: getNextChestItem() };
        break outerIllusory;
      }
    }
  }

  const normalRoomsForChests = rooms.filter((r) => r.tag === "normal");
  const targetChests = areaConfig.numChests || 6;
  for (let i = chestSpawns.length; i < targetChests; i++) {
    const room = normalRoomsForChests[i % normalRoomsForChests.length];
    if (!room) break;
    for (let attempt = 0; attempt < 20; attempt++) {
      const cx = room.x + 1 + Math.floor(Math.random() * (room.w - 2));
      const cy = room.y + 1 + Math.floor(Math.random() * (room.h - 2));
      const key = `${cx},${cy}`;
      if (!usedTiles.has(key) && rawMap[cy]?.[cx] === 0) {
        usedTiles.add(key);
        chestSpawns.push({ x: cx, y: cy, itemId: getNextChestItem() });
        break;
      }
    }
  }

  // Fallen adventurer loot — a themed one-shot prop on any free floor tile,
  // same shape as the propSpawns scatter below.
  let fallenAdventurerSpawn: MapData["fallenAdventurerSpawn"];
  for (let attempt = 0; attempt < 30; attempt++) {
    const tile = floorTiles[Math.floor(Math.random() * floorTiles.length)];
    const key = `${tile.x},${tile.y}`;
    if (usedTiles.has(key)) continue;
    usedTiles.add(key);
    fallenAdventurerSpawn = {
      x: tile.x,
      y: tile.y,
      itemId: getNextChestItem(),
      flavorText: FALLEN_ADVENTURER_FLAVOR[Math.floor(Math.random() * FALLEN_ADVENTURER_FLAVOR.length)],
    };
    break;
  }

  // Breakable crates — prologue-only (design doc section 13's scoped-down
  // precedent), scattered on free floor tiles rather than the 2D source's
  // hand-placed corridor coordinates, since this port's prologue is
  // procedural rather than hand-authored.
  let breakableSpawns: { x: number; y: number }[] | undefined;
  if (area === Area.PROLOGUE) {
    breakableSpawns = [];
    for (let attempt = 0; attempt < 40 && breakableSpawns.length < 6; attempt++) {
      const tile = floorTiles[Math.floor(Math.random() * floorTiles.length)];
      const key = `${tile.x},${tile.y}`;
      if (usedTiles.has(key)) continue;
      usedTiles.add(key);
      breakableSpawns.push({ x: tile.x, y: tile.y });
    }
  }

  const flameFraction = archetype.name === "Gauntlet" ? 0.9 : 0.4 + Math.random() * 0.2;
  const flameRoom = pickRoomAtPathFraction(sortedMain, flameFraction);
  const flameOffsets = [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, 1], [1, -1], [-1, -1], [3, 0], [0, 3]] as const;
  let ashenFlameSpawn = findFreeTileNear(flameRoom.center, flameOffsets, isFreeTile, markTileUsed);
  if (!ashenFlameSpawn) ashenFlameSpawn = findFreeTileNear(flameRoom.center, [[0, 0]] as const, isFreeTile, markTileUsed);
  if (!ashenFlameSpawn) ashenFlameSpawn = findFreeTileNear(startRoom.center, [[0, 0]] as const, isFreeTile, markTileUsed);

  // Seamless-portal system — portalAnchor, a separate Math.random() roll
  // from flameFraction above so the portal and the mid-floor flame don't
  // systematically land in the same room. Computed unconditionally; see
  // MapData's own comment on why eligibility is the caller's job.
  const portalFraction = 0.4 + Math.random() * 0.35;
  const portalRoom = pickRoomAtPathFraction(sortedMain, portalFraction);
  const portalAnchor = findFreeTileNear(portalRoom.center, flameOffsets, isFreeTile, markTileUsed);

  // Secret lever fight (see utils/secretFights.ts) — one per area that has
  // one configured, not one per floor, so it's pinned to a single floor
  // index (the "Galleries" middle floor) rather than generated on every
  // floor generateMap() is ever called for.
  let leverSpawn: { x: number; y: number } | undefined;
  if (SECRET_FIGHT_BY_AREA[area] && floorIdx === 2) {
    const leverRoom = pickRoomAtPathFraction(sortedMain, 0.65 + Math.random() * 0.15);
    const leverOffsets = [[1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2], [0, 0]] as const;
    leverSpawn = findFreeTileNear(leverRoom.center, leverOffsets, isFreeTile, markTileUsed);
  }

  // Flavianna — see MapData.merchantNpcSpawn's comment. Placed in a
  // dead-end room center (reversed order, same as the 2D source) so she
  // doesn't sit directly on the critical path.
  let merchantNpcSpawn: { x: number; y: number } | undefined;
  if (area === Area.AREA_2 && floorIdx === 2) {
    const merchantOffsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]] as const;
    for (const room of [...deadEndRooms].reverse()) {
      const found = findFreeTileNear(room.center, merchantOffsets, isFreeTile, markTileUsed);
      if (found) {
        merchantNpcSpawn = found;
        break;
      }
    }
  }

  const doorSpawns: { x: number; y: number }[] = [];
  for (const tile of floorTiles) {
    if (doorSpawns.length >= (areaConfig.numDoors || 4)) break;
    const { x, y } = tile;
    const key = `${x},${y}`;
    if (usedTiles.has(key)) continue;
    if (x === playerSpawn.x && y === playerSpawn.y) continue;
    const wallN = rawMap[y - 1]?.[x] === 1;
    const wallS = rawMap[y + 1]?.[x] === 1;
    const wallE = rawMap[y]?.[x + 1] === 1;
    const wallW = rawMap[y]?.[x - 1] === 1;
    const isCorridorNS = wallE && wallW && !wallN && !wallS;
    const isCorridorEW = wallN && wallS && !wallE && !wallW;
    if (isCorridorNS || isCorridorEW) {
      const dist = Math.abs(x - playerSpawn.x) + Math.abs(y - playerSpawn.y);
      if (dist > 4) {
        usedTiles.add(key);
        doorSpawns.push({ x, y });
      }
    }
  }

  const propSpawns: { x: number; y: number }[] = [];
  const targetProps = 7;
  for (let attempt = 0; attempt < targetProps * 15 && propSpawns.length < targetProps; attempt++) {
    const tile = floorTiles[Math.floor(Math.random() * floorTiles.length)];
    const key = `${tile.x},${tile.y}`;
    if (usedTiles.has(key)) continue;
    usedTiles.add(key);
    propSpawns.push({ x: tile.x, y: tile.y });
  }

  return {
    tiles, width, height, playerSpawn, enemySpawns, chestSpawns, doorSpawns,
    bossSpawn, cellarStairs, endPoint, startPoint, bossGateDoor,
    ashenFlameSpawn, startFlameSpawn, propSpawns, leverSpawn, merchantNpcSpawn,
    fallenAdventurerSpawn, breakableSpawns, vaultSpawn, illusoryWallSpawn, shortcutDoorSpawn: shortcutGate, portalAnchor,
  };
}

export function generateCellarMap(area: Area): MapData {
  const size = 9;
  const tiles: TileData[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const isWall = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      tiles.push({ x, y, type: isWall ? "wall" : "floor" });
    }
  }
  const center = Math.floor(size / 2);
  const playerSpawn = { x: center, y: size - 2 };
  const areaConfig = AREA_CONFIGS[area];
  const chestItemId = areaConfig.chestItems[Math.floor(Math.random() * areaConfig.chestItems.length)];
  return {
    tiles, width: size, height: size, playerSpawn, startPoint: { ...playerSpawn },
    enemySpawns: [{ x: center, y: center, type: "enemy_elite_ward" }],
    chestSpawns: [{ x: center, y: 2, itemId: chestItemId }],
    doorSpawns: [], propSpawns: [],
  };
}

// Bonus-layer content for the seamless-portal system (design doc section
// 2) — deliberately just generateMap()'s own output with everything
// progression-critical or layer-specific stripped back out. A full real
// floor size + a real mob roster + a genuinely fresh random layout all
// come for free from generateMap() itself (unseeded Math.random(), size
// pulled straight from AREA_CONFIGS[area].mapSize) — no separate generator
// needed. Loot (chestSpawns/vaultSpawn/illusoryWallSpawn/
// fallenAdventurerSpawn) passes through safely since GameState's own
// per-visit tracking (openedChests/vaultOpened/etc.) lives on a fresh
// GameState built for this layer, never shared with the ground floor's.
// bossSpawn ALSO passes through (the "echo boss" — generateMap() always
// carves a real boss room regardless of caller) with no bossGateDoor/
// endPoint, so the room is simply walkable, no gate to unlock. Stripped:
// merchantNpcSpawn (hard-locked to a specific area+floor-index combo this
// bonus call has no special awareness of), and ashenFlameSpawn/
// startFlameSpawn (the *ground* layer's own checkpoint/respawn fields —
// reusing them here would repoint a respawn at the wrong layer; see
// MapData.layerFlameSpawn for the bonus layer's own dedicated one).
export function generatePortalLabyrinth(floor: Floor, area: Area, returnTargetX: number, returnTargetY: number): MapData {
  // forceBoss=true — GROUND/SECOND (the only portal-eligible floors, see
  // GameScene's isPortalEligibleFloor) are never the area's real final
  // floor, so generateMap() alone would never carve a boss room here.
  const generated = generateMap(floor, area, true);

  // generateMap() always drops an "end_portal"-typed tile at its endRoom's
  // center regardless of forceBoss (real floor-advance is gated on
  // MapData.endPoint being set, not on this tile type — see Player.tsx —
  // and that field is deliberately never copied into this function's
  // return below). Left as-is it'd just be a cosmetically-orphaned portal
  // tile with no function sitting in the bonus layer, so it's flattened
  // back to plain floor here.
  const tiles = generated.tiles.map((t) => (t.type === "end_portal" ? { ...t, type: "floor" as const } : t));

  const wallKeys = new Set(tiles.filter((t) => t.type === "wall").map((t) => `${t.x},${t.y}`));
  const layerFlameOffsets = [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const;
  const isFreeLayerTile = (x: number, y: number) => x >= 0 && y >= 0 && x < generated.width && y < generated.height && !wallKeys.has(`${x},${y}`);
  const layerFlameSpawn = findFreeTileNear(generated.playerSpawn, layerFlameOffsets, isFreeLayerTile, (x, y) => wallKeys.add(`${x},${y}`));

  return {
    tiles,
    width: generated.width,
    height: generated.height,
    playerSpawn: generated.playerSpawn,
    startPoint: generated.startPoint,
    enemySpawns: generated.enemySpawns,
    chestSpawns: generated.chestSpawns,
    doorSpawns: generated.doorSpawns,
    propSpawns: generated.propSpawns,
    vaultSpawn: generated.vaultSpawn,
    illusoryWallSpawn: generated.illusoryWallSpawn,
    fallenAdventurerSpawn: generated.fallenAdventurerSpawn,
    layerFlameSpawn,
    // The echo boss — the exact room/type generateMap() already carved for
    // this area's real boss, reused verbatim. No bossGateDoor/endPoint
    // means the room is simply walkable from the start; GameState.ts's
    // boss-death handling checks state.isBonusLayer to keep this from ever
    // triggering the real area-cleared/gate-unlock logic.
    bossSpawn: generated.bossSpawn,
    portals: [{ id: "portal-return", x: generated.playerSpawn.x, y: generated.playerSpawn.y, targetX: returnTargetX, targetY: returnTargetY, label: "Return" }],
  };
}

const HEARTH_SIZE = 21;
// One gate per travel destination, evenly spaced along the far wall — a
// flat hand-authored room (same "not procedural" precedent as
// generateCellarMap above) rather than running the labyrinth generator with
// an empty AREA_CONFIGS[HEARTH].enemyTypes, which would place undefined-type
// enemy spawns (the generator always carves normal/dead-end rooms per the
// floor archetype regardless of area, with no way to ask for zero).
const HEARTH_GATES: { x: number; area: Area; label: string }[] = [
  { x: 3, area: Area.PROLOGUE, label: "The Nameless Shore" },
  { x: 6, area: Area.AREA_1, label: "The Frozen Depths" },
  { x: 9, area: Area.AREA_2, label: "The Sunken Courtyard" },
  { x: 12, area: Area.AREA_3, label: "The Molten Sanctum" },
  { x: 15, area: Area.AREA_4, label: "The Hollow Spire" },
  { x: 18, area: Area.AREA_5, label: "The Sundered Sky" },
];

// The Ashen Hearth — phase 9's real travel hub. No enemies, no chests, no
// boss; just a bounded room with a gate per area. Player spawns at the south
// wall facing the row of gates along the north wall.
export function generateHearthMap(): MapData {
  const size = HEARTH_SIZE;
  const tiles: TileData[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const isWall = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      tiles.push({ x, y, type: isWall ? "wall" : "floor" });
    }
  }
  const playerSpawn = { x: Math.floor(size / 2), y: size - 4 };
  const areaGates = HEARTH_GATES.map((g) => ({ x: g.x, y: 3, area: g.area, label: g.label }));
  // Flanking the spawn, between it and the gates — the first thing a new
  // arrival sees, matching the design doc's "Martyna greets the player,
  // Varn is at the anvil" first-visit framing. The stash sits right behind
  // spawn (a chest, not a person); The Tide-Refused sits apart near spawn,
  // an outsider rather than a third Order member (per the 2D source's own
  // framing — "the Order dwindled to two"). Flavianna sits further in,
  // between the NPC row and the travel gates, once met in the field.
  const npcs: { id: "martyna" | "varn" | "stash" | "tide_refused" | "flavianna"; x: number; y: number }[] = [
    { id: "martyna", x: Math.floor(size / 2) - 4, y: size - 8 },
    { id: "varn", x: Math.floor(size / 2) + 4, y: size - 8 },
    { id: "stash", x: Math.floor(size / 2), y: size - 6 },
    { id: "tide_refused", x: 3, y: size - 4 },
    { id: "flavianna", x: Math.floor(size / 2), y: size - 11 },
  ];

  return {
    tiles, width: size, height: size, playerSpawn, startPoint: { ...playerSpawn },
    enemySpawns: [], chestSpawns: [], doorSpawns: [], propSpawns: [],
    areaGates, npcs,
  };
}
