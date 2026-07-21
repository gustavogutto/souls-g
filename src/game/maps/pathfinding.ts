import type { MapData } from "./MapGenerator";
import { isWallTile } from "./collision";

// Basic corner-aware enemy chase: a straight-line line-of-sight chase when
// clear, falling back to a BFS grid path when a wall is in the way. BFS over
// a single floor's tile grid (max 70x70) is cheap enough per call — callers
// should throttle repathing (e.g. every 400-600ms), not call this every frame.
export function findPath(mapData: MapData, start: { x: number; y: number }, goal: { x: number; y: number }): { x: number; y: number }[] | null {
  const w = mapData.width;
  const h = mapData.height;
  const sx = Math.floor(start.x);
  const sy = Math.floor(start.y);
  const gx = Math.floor(goal.x);
  const gy = Math.floor(goal.y);
  if (isWallTile(mapData, gx, gy) || isWallTile(mapData, sx, sy)) return null;

  const idx = (x: number, y: number) => y * w + x;
  const visited = new Uint8Array(w * h);
  const prev = new Int32Array(w * h).fill(-1);
  const startIdx = idx(sx, sy);
  const targetIdx = idx(gx, gy);
  const queue: number[] = [startIdx];
  visited[startIdx] = 1;
  let qi = 0;
  let found = startIdx === targetIdx;

  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (qi < queue.length && !found) {
    const cur = queue[qi++];
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = idx(nx, ny);
      if (visited[ni] || isWallTile(mapData, nx, ny)) continue;
      visited[ni] = 1;
      prev[ni] = cur;
      queue.push(ni);
      if (ni === targetIdx) {
        found = true;
        break;
      }
    }
  }
  if (!found) return null;

  const path: { x: number; y: number }[] = [];
  let cur = targetIdx;
  while (cur !== -1) {
    path.push({ x: (cur % w) + 0.5, y: Math.floor(cur / w) + 0.5 });
    cur = prev[cur];
  }
  path.reverse();
  return path;
}
