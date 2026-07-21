import type { MapData } from "./MapGenerator";

// Collision stays in tile-grid space (not derived from the 3D mesh) — cheap,
// correct, and independent of how DungeonRenderer merges geometry. Tile
// (x,y) occupies the unit cell [x, x+1) x [y, y+1); an entity's continuous
// position sits in that same coordinate space (spawn points are offset by
// +0.5 to center them in their tile).

export function isWallTile(mapData: MapData, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= mapData.width || ty >= mapData.height) return true;
  const tile = mapData.tiles[ty * mapData.width + tx];
  return !tile || tile.type === "wall";
}

// Resolves a circle (radius r, centered at pos) against every overlapping
// wall cell by pushing it out along the shortest escape vector. Mutates pos.
export function resolveCollision(mapData: MapData, pos: { x: number; z: number }, radius: number) {
  for (let pass = 0; pass < 2; pass++) {
    const minTx = Math.floor(pos.x - radius);
    const maxTx = Math.floor(pos.x + radius);
    const minTy = Math.floor(pos.z - radius);
    const maxTy = Math.floor(pos.z + radius);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (!isWallTile(mapData, tx, ty)) continue;
        const closestX = Math.max(tx, Math.min(pos.x, tx + 1));
        const closestZ = Math.max(ty, Math.min(pos.z, ty + 1));
        const dx = pos.x - closestX;
        const dz = pos.z - closestZ;
        const distSq = dx * dx + dz * dz;
        if (distSq < radius * radius) {
          const dist = Math.sqrt(distSq) || 0.0001;
          const overlap = radius - dist;
          pos.x += (dx / dist) * overlap;
          pos.z += (dz / dist) * overlap;
        }
      }
    }
  }
}
