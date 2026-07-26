import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MapData, TileData } from "./maps/MapGenerator";
import type { AreaTheme } from "./utils/areaThemes";

// Renders a floor as a grid of spatial chunks (at most 2 draw calls per
// chunk: one merged floor mesh, one merged wall mesh, vertex-colored per
// tile type instead of separate materials so merging stays possible) plus a
// handful of individual prop meshes (too few per floor — ~7 — to need
// InstancedMesh). Only boundary wall cells (adjacent to at least one floor
// cell) get real geometry; the vast majority of a generated grid is
// untouched interior "wall" and would otherwise be thousands of invisible
// boxes.
//
// Chunking (added 2026-07-26) matters because three.js can only frustum-cull
// a mesh as a whole — a single merged mesh spanning an entire floor has one
// bounding sphere for the whole thing, so on the maps this session scaled up
// to (up to 315 units across) that sphere almost always intersects the
// camera frustum (the player is inside it), meaning the WHOLE floor's
// geometry got vertex-processed every frame regardless of how little of it
// was actually visible. Splitting into CHUNK_SIZE-tile chunks gives each
// piece its own small bounding volume, so three.js can actually skip the
// chunks nowhere near the camera.

// Must clear the orbit camera's own max height or its top face becomes
// visible at shallow pitch/max zoom-out (CameraRig: lookAt.y 1.3 + up to
// ~11.5 distance * sin(20° min pitch) ≈ 5.2 worst case) — 3 was already
// below that, which is why walls looked "see-through" from above.
const WALL_HEIGHT = 8;
const CHUNK_SIZE = 24; // tiles per chunk side

function tileColors(theme: AreaTheme): Record<TileData["type"], THREE.Color> {
  return {
    floor: new THREE.Color(theme.floor),
    start: new THREE.Color(theme.start),
    ice: new THREE.Color(theme.special),
    stairs_down: new THREE.Color(theme.stairs),
    end_portal: new THREE.Color(theme.endPortal),
    wall: new THREE.Color(theme.wall),
  };
}

function getTile(mapData: MapData, x: number, y: number): TileData | undefined {
  if (x < 0 || y < 0 || x >= mapData.width || y >= mapData.height) return undefined;
  return mapData.tiles[y * mapData.width + x];
}

function applyVertexColor(geometry: THREE.BufferGeometry, color: THREE.Color) {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

interface DungeonChunk {
  key: string;
  floorGeometry: THREE.BufferGeometry;
  wallGeometry: THREE.BufferGeometry;
}

function buildDungeonChunks(mapData: MapData, theme: AreaTheme): DungeonChunk[] {
  const colors = tileColors(theme);
  const wallColor = colors.wall;
  const neighborOffsets: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const chunkFloorGeoms = new Map<string, THREE.BufferGeometry[]>();
  const chunkWallGeoms = new Map<string, THREE.BufferGeometry[]>();

  const chunkKeyFor = (x: number, y: number) => `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;

  for (const tile of mapData.tiles) {
    const key = chunkKeyFor(tile.x, tile.y);
    if (tile.type === "wall") {
      let adjacentFloor = false;
      for (const [dx, dy] of neighborOffsets) {
        const nt = getTile(mapData, tile.x + dx, tile.y + dy);
        if (nt && nt.type !== "wall") {
          adjacentFloor = true;
          break;
        }
      }
      if (!adjacentFloor) continue;
      const geo = new THREE.BoxGeometry(1, WALL_HEIGHT, 1);
      geo.translate(tile.x + 0.5, WALL_HEIGHT / 2, tile.y + 0.5);
      applyVertexColor(geo, wallColor);
      let list = chunkWallGeoms.get(key);
      if (!list) chunkWallGeoms.set(key, (list = []));
      list.push(geo);
    } else {
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.rotateX(-Math.PI / 2);
      geo.translate(tile.x + 0.5, 0, tile.y + 0.5);
      applyVertexColor(geo, colors[tile.type] ?? colors.floor);
      let list = chunkFloorGeoms.get(key);
      if (!list) chunkFloorGeoms.set(key, (list = []));
      list.push(geo);
    }
  }

  const keys = new Set<string>([...chunkFloorGeoms.keys(), ...chunkWallGeoms.keys()]);
  const chunks: DungeonChunk[] = [];
  for (const key of keys) {
    const floorGeoms = chunkFloorGeoms.get(key) ?? [];
    const wallGeoms = chunkWallGeoms.get(key) ?? [];
    const floorGeometry = floorGeoms.length > 0 ? mergeGeometries(floorGeoms, false) : new THREE.BufferGeometry();
    const wallGeometry = wallGeoms.length > 0 ? mergeGeometries(wallGeoms, false) : new THREE.BufferGeometry();
    floorGeometry.computeBoundingSphere();
    wallGeometry.computeBoundingSphere();
    for (const g of floorGeoms) g.dispose();
    for (const g of wallGeoms) g.dispose();
    chunks.push({ key, floorGeometry, wallGeometry });
  }
  return chunks;
}

// `revealVersion` has no effect on the geometry-build function itself — it
// exists purely as a dependency to force this memo to rebuild when a tile's
// type is mutated in place at runtime (illusory walls), since neither
// `mapData` nor `theme` change identity when that happens. A reveal rebuilds
// every chunk rather than just the affected one — rare enough (one-shot,
// player-triggered) that it isn't worth tracking which chunk to target.
export function DungeonRenderer({ mapData, theme, revealVersion }: { mapData: MapData; theme: AreaTheme; revealVersion?: number }) {
  const chunks = useMemo(() => buildDungeonChunks(mapData, theme), [mapData, theme, revealVersion]);

  useEffect(() => {
    return () => {
      for (const c of chunks) {
        c.floorGeometry.dispose();
        c.wallGeometry.dispose();
      }
    };
  }, [chunks]);

  return (
    <group>
      {chunks.map((c) => (
        <group key={c.key}>
          <mesh geometry={c.floorGeometry}>
            <meshStandardMaterial vertexColors roughness={0.9} />
          </mesh>
          <mesh geometry={c.wallGeometry}>
            <meshStandardMaterial vertexColors roughness={0.8} />
          </mesh>
        </group>
      ))}
      {mapData.propSpawns.map((p, i) => (
        <mesh key={i} position={[p.x + 0.5, 0.5, p.y + 0.5]}>
          <boxGeometry args={[0.4, 1, 0.4]} />
          <meshStandardMaterial color="#5a4a3a" />
        </mesh>
      ))}
    </group>
  );
}
