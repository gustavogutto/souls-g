import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MapData, TileData } from "./maps/MapGenerator";

// Renders a whole floor as (at most) 3 draw calls: one merged floor mesh, one
// merged wall mesh (vertex-colored per tile type instead of separate
// materials so merging stays possible), plus a handful of individual prop
// meshes (too few per floor — ~7 — to need InstancedMesh). Only boundary
// wall cells (adjacent to at least one floor cell) get real geometry; the
// vast majority of a generated grid is untouched interior "wall" and would
// otherwise be thousands of invisible boxes.

const WALL_HEIGHT = 3;

const TILE_COLORS: Record<TileData["type"], THREE.Color> = {
  floor: new THREE.Color("#2a2a38"),
  start: new THREE.Color("#3a4a3a"),
  ice: new THREE.Color("#3a5a6a"),
  stairs_down: new THREE.Color("#4a3a2a"),
  end_portal: new THREE.Color("#5a3a6a"),
  wall: new THREE.Color("#4a4a5c"),
};
const WALL_COLOR = TILE_COLORS.wall;

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

function buildDungeonGeometry(mapData: MapData) {
  const floorGeoms: THREE.BufferGeometry[] = [];
  const wallGeoms: THREE.BufferGeometry[] = [];
  const neighborOffsets: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (const tile of mapData.tiles) {
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
      applyVertexColor(geo, WALL_COLOR);
      wallGeoms.push(geo);
    } else {
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.rotateX(-Math.PI / 2);
      geo.translate(tile.x + 0.5, 0, tile.y + 0.5);
      applyVertexColor(geo, TILE_COLORS[tile.type] ?? TILE_COLORS.floor);
      floorGeoms.push(geo);
    }
  }

  const floorGeometry = floorGeoms.length > 0 ? mergeGeometries(floorGeoms, false) : new THREE.BufferGeometry();
  const wallGeometry = wallGeoms.length > 0 ? mergeGeometries(wallGeoms, false) : new THREE.BufferGeometry();
  for (const g of floorGeoms) g.dispose();
  for (const g of wallGeoms) g.dispose();
  return { floorGeometry, wallGeometry };
}

export function DungeonRenderer({ mapData }: { mapData: MapData }) {
  const { floorGeometry, wallGeometry } = useMemo(() => buildDungeonGeometry(mapData), [mapData]);

  useEffect(() => {
    return () => {
      floorGeometry.dispose();
      wallGeometry.dispose();
    };
  }, [floorGeometry, wallGeometry]);

  return (
    <group>
      <mesh geometry={floorGeometry} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.9} />
      </mesh>
      <mesh geometry={wallGeometry} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.8} />
      </mesh>
      {mapData.propSpawns.map((p, i) => (
        <mesh key={i} position={[p.x + 0.5, 0.5, p.y + 0.5]} castShadow>
          <boxGeometry args={[0.4, 1, 0.4]} />
          <meshStandardMaterial color="#5a4a3a" />
        </mesh>
      ))}
    </group>
  );
}
