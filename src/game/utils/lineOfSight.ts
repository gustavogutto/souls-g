// Archer role support — line-of-sight and ally-blocking checks. Both are
// pure tile/point-space geometry with no Phaser dependency, matching the
// rest of utils/ (equipment.ts, tide.ts, etc.).

// Integer Bresenham tile walk from (x0,y0) to (x1,y1), checking every tile
// strictly after the start point (never the archer's own tile) against
// isWall, including the destination tile itself (harmless — the player is
// never standing on a wall). Only wall tiles block; enemies never do, per
// the Archer brief.
export function hasLineOfSight(x0: number, y0: number, x1: number, y1: number, isWall: (tx: number, ty: number) => boolean): boolean {
  let gx = Math.round(x0);
  let gy = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);

  const dx = Math.abs(tx - gx);
  const dy = -Math.abs(ty - gy);
  const sx = gx < tx ? 1 : -1;
  const sy = gy < ty ? 1 : -1;
  let err = dx + dy;

  while (gx !== tx || gy !== ty) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      gx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      gy += sy;
    }
    if (isWall(gx, gy)) return false;
  }
  return true;
}

// Perpendicular distance from point (px,py) to the segment (ax,ay)-(bx,by),
// used to test "is another enemy standing between the archer and the
// player." t is clamped to (0.1, 0.9) rather than [0,1] so a point sitting
// right on top of either endpoint (the archer's own tile or the player's
// tile) never counts as a blocker.
export function isBlockingFiringLine(px: number, py: number, ax: number, ay: number, bx: number, by: number, tolerance: number): boolean {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 0.0001) return false;
  const t = ((px - ax) * abx + (py - ay) * aby) / lenSq;
  if (t <= 0.1 || t >= 0.9) return false;
  const closestX = ax + t * abx;
  const closestY = ay + t * aby;
  return Math.hypot(px - closestX, py - closestY) <= tolerance;
}
