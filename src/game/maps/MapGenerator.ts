import { Floor, Area, AREA_CONFIGS } from "../utils/constants";
import { SECRET_FIGHT_BY_AREA } from "../utils/secretFights";

// Ported from Hohenberg's client/src/game/maps/MapGenerator.ts. This is a
// trimmed core port: the room-placement/corridor-carving/floor-archetype/
// flood-tile algorithm and the "normal floor" spawn fields are ported
// near-verbatim (the algorithm has zero engine dependency — only the
// isometric-sprite rendering step doesn't carry over, and that's replaced by
// DungeonRenderer.tsx). Deliberately NOT yet ported (phase 7 of the 3D
// conversion plan): the 5 named secret/lever fights (vaultSpawn,
// towerKnightSpawn, shackledSentinelSpawn, undertowSpawn, voidboundSpawn,
// gargoyleWardenSpawn), illusoryWallSpawn, fallenAdventurerSpawn,
// merchantNpcSpawn, the seamless-portal prototype (portals/portalAnchor/
// layerFlameSpawn), and "The Ring" archetype's shortcut-gate loop corridor
// (the structural loop bypass corridor itself is also skipped for the same
// reason — it's a bonus route, not required for start->boss->end
// connectivity).

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
  // Hearth-only (see generateHearthMap): one gate per travel destination,
  // rendered/interacted by HearthGates.tsx. Undefined on every normal
  // procedurally-generated floor.
  areaGates?: { x: number; y: number; area: Area; label: string }[];
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

const FLOOR_SEQUENCE: Floor[] = [Floor.BASEMENT, Floor.GROUND, Floor.SECOND, Floor.THIRD, Floor.TOP];

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

function generateLabyrinth(
  width: number,
  height: number,
  archetype: FloorArchetype,
  area: Area
): { map: number[][]; rooms: Room[]; floodTiles: Map<string, 1 | 2>; sortedMain: Room[] } {
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

  const isDragonArena = area === Area.AREA_5;
  const bossW = isDragonArena ? 18 : 10;
  const bossH = isDragonArena ? 16 : 9;
  const bossX = width - bossW - 12;
  const bossY = 3;
  const bossRoom: Room = { x: bossX, y: bossY, w: bossW, h: bossH, tag: "boss", center: { x: bossX + Math.floor(bossW / 2), y: bossY + Math.floor(bossH / 2) } };
  carveRoom(bossRoom.x, bossRoom.y, bossRoom.w, bossRoom.h);
  rooms.push(bossRoom);

  const targetMainRooms = randInt(archetype.mainRoomCountRange[0], archetype.mainRoomCountRange[1]);
  for (let i = 0; i < targetMainRooms; i++) {
    const t = (i + 1) / (targetMainRooms + 1);
    const targetX = startRoom.center.x + (bossRoom.center.x - startRoom.center.x) * t;
    const targetY = startRoom.center.y + (bossRoom.center.y - startRoom.center.y) * t;
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

  const mainPath = rooms.filter((r) => r.tag === "start" || r.tag === "normal" || r.tag === "boss");
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
  carveCorridor(bossRoom.center.x, bossRoom.center.y, endRoom.center.x, endRoom.center.y);

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

  return { map, rooms, floodTiles, sortedMain };
}

function pickRoomAtPathFraction(sortedMain: Room[], fraction: number): Room {
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
      return candidate.tag === "boss" && i > 0 ? sortedMain[i] : candidate;
    }
  }
  const last = sortedMain[sortedMain.length - 1];
  return last.tag === "boss" && sortedMain.length > 1 ? sortedMain[sortedMain.length - 2] : last;
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

export function generateMap(floor: Floor, area: Area = Area.AREA_1): MapData {
  const areaConfig = AREA_CONFIGS[area];
  const width = areaConfig.mapSize;
  const height = areaConfig.mapSize;
  const archetype = archetypeForFloor(floor);
  const enemyTypes = areaConfig.enemyTypes;
  const bossType = areaConfig.bossType;

  const { map: rawMap, rooms, floodTiles, sortedMain } = generateLabyrinth(width, height, archetype, area);
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

  const floorIdx = FLOOR_SEQUENCE.indexOf(floor);
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

  const flameFraction = archetype.name === "Gauntlet" ? 0.9 : 0.4 + Math.random() * 0.2;
  const flameRoom = pickRoomAtPathFraction(sortedMain, flameFraction);
  const flameOffsets = [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, 1], [1, -1], [-1, -1], [3, 0], [0, 3]] as const;
  let ashenFlameSpawn = findFreeTileNear(flameRoom.center, flameOffsets, isFreeTile, markTileUsed);
  if (!ashenFlameSpawn) ashenFlameSpawn = findFreeTileNear(flameRoom.center, [[0, 0]] as const, isFreeTile, markTileUsed);
  if (!ashenFlameSpawn) ashenFlameSpawn = findFreeTileNear(startRoom.center, [[0, 0]] as const, isFreeTile, markTileUsed);

  // Secret lever fight (see utils/secretFights.ts) — one per area that has
  // one configured, tucked into a normal room along the main path rather
  // than a bespoke arena (same precedent as the boss/dragon rooms).
  let leverSpawn: { x: number; y: number } | undefined;
  if (SECRET_FIGHT_BY_AREA[area]) {
    const leverRoom = pickRoomAtPathFraction(sortedMain, 0.65 + Math.random() * 0.15);
    const leverOffsets = [[1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2], [0, 0]] as const;
    leverSpawn = findFreeTileNear(leverRoom.center, leverOffsets, isFreeTile, markTileUsed);
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
    ashenFlameSpawn, startFlameSpawn, propSpawns, leverSpawn,
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

  return {
    tiles, width: size, height: size, playerSpawn, startPoint: { ...playerSpawn },
    enemySpawns: [], chestSpawns: [], doorSpawns: [], propSpawns: [],
    areaGates,
  };
}
