import { useEffect, useRef } from "react";
import type { GameState } from "./GameState";
import { Area } from "./utils/constants";

// Design doc section 15 — corner minimap: explored-only fog-of-war reveal,
// off-screen landmark markers clamped to the frame edge as directional
// arrows. Ported in spirit from the 2D source's minimapRender.ts (same
// edge-clamp math), trimmed to a plain HTML canvas since this port has no
// Phaser Graphics layer. No expandable full-map view yet (M key) — a real,
// separate gap, not attempted here.
const SIZE = 140;
const TILE_PX = 4;
const EXPLORE_RADIUS = 8;

export function Minimap({ state }: { state: GameState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const exploredRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    exploredRef.current = new Uint8Array(state.mapData.width * state.mapData.height);
  }, [state.mapData]);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      const canvas = canvasRef.current;
      const explored = exploredRef.current;
      if (canvas && explored) draw(canvas, state, explored);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  if (state.area === Area.HEARTH) return null; // static hand-authored hub, no fog-of-war worth tracking

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      style={{
        position: "absolute", top: 70, right: 20, borderRadius: 4,
        border: "1px solid #5a5a6a", pointerEvents: "none",
      }}
    />
  );
}

function draw(canvas: HTMLCanvasElement, state: GameState, explored: Uint8Array) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { mapData, player } = state;
  const w = mapData.width;
  const h = mapData.height;
  const px = player.position.x;
  const py = player.position.z;

  // Explored-only reveal — a tile counts as explored once it's fallen
  // within this radius of the player. Bounded window so cost tracks how
  // much of the floor is currently near the player, not floor size.
  const tx0 = Math.max(0, Math.floor(px - EXPLORE_RADIUS));
  const tx1 = Math.min(w - 1, Math.ceil(px + EXPLORE_RADIUS));
  const ty0 = Math.max(0, Math.floor(py - EXPLORE_RADIUS));
  const ty1 = Math.min(h - 1, Math.ceil(py + EXPLORE_RADIUS));
  for (let ty = ty0; ty <= ty1; ty++) {
    const rowBase = ty * w;
    for (let tx = tx0; tx <= tx1; tx++) {
      if (explored[rowBase + tx]) continue;
      if (Math.hypot(tx - px, ty - py) <= EXPLORE_RADIUS) explored[rowBase + tx] = 1;
    }
  }

  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = "rgba(5,5,10,0.55)";
  ctx.fillRect(0, 0, SIZE, SIZE);

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const halfTilesX = Math.ceil(SIZE / TILE_PX / 2) + 1;
  const halfTilesY = halfTilesX;
  const cxTile = Math.round(px);
  const cyTile = Math.round(py);

  ctx.fillStyle = "#b8b0a0";
  for (let dy = -halfTilesY; dy <= halfTilesY; dy++) {
    const ty = cyTile + dy;
    if (ty < 0 || ty >= h) continue;
    const rowBase = ty * w;
    for (let dx = -halfTilesX; dx <= halfTilesX; dx++) {
      const tx = cxTile + dx;
      if (tx < 0 || tx >= w) continue;
      const tile = mapData.tiles[rowBase + tx];
      if (!tile || tile.type === "wall") continue;
      if (!explored[rowBase + tx]) continue;
      const sx = cx + (tx - px) * TILE_PX;
      const sy = cy + (ty - py) * TILE_PX;
      ctx.fillRect(sx - TILE_PX / 2, sy - TILE_PX / 2, TILE_PX, TILE_PX);
    }
  }

  const halfW = SIZE / 2 - 4;
  const halfH = halfW;
  if (mapData.endPoint) drawMarker(ctx, mapData.endPoint.x, mapData.endPoint.y, px, py, cx, cy, halfW, halfH, "#ffd700");
  if (mapData.bossGateDoor && state.gateLocked) drawMarker(ctx, mapData.bossGateDoor.x, mapData.bossGateDoor.y, px, py, cx, cy, halfW, halfH, "#cc3333");
  if (mapData.ashenFlameSpawn) drawMarker(ctx, mapData.ashenFlameSpawn.x, mapData.ashenFlameSpawn.y, px, py, cx, cy, halfW, halfH, "#ff8c00");
  if (mapData.startFlameSpawn) drawMarker(ctx, mapData.startFlameSpawn.x, mapData.startFlameSpawn.y, px, py, cx, cy, halfW, halfH, "#ff8c00");

  // Player — a plain dot, always centered (no facing wedge: this port's
  // camera orbits freely rather than staying screen-aligned with world
  // north, so a rotating wedge here has no stable "up" to read against).
  ctx.fillStyle = "#8ec4ff";
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  px: number,
  py: number,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  color: string
) {
  const dx = (gx - px) * TILE_PX;
  const dy = (gy - py) * TILE_PX;
  ctx.fillStyle = color;
  if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, 3, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // Scale (dx,dy) down along its own ray until it first touches whichever
  // wall (vertical or horizontal) it would hit first — the general
  // rectangle-edge clamp, not just the square case.
  const scale = Math.min(dx !== 0 ? halfW / Math.abs(dx) : Infinity, dy !== 0 ? halfH / Math.abs(dy) : Infinity);
  const clampedX = cx + dx * scale;
  const clampedY = cy + dy * scale;
  const angle = Math.atan2(dy, dx) + Math.PI / 2;
  ctx.save();
  ctx.translate(clampedX, clampedY);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(3, 3);
  ctx.lineTo(-3, 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
