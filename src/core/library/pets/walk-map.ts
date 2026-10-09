import { layerOf } from '../furniture-catalog';
import type { Layout, Pt, Segment, StandingKind } from '../library-types';
import { CELL_H, CELL_W, ROWS, WALL_ROWS, isStanding, rectOf, type Cell } from '../room-grid';

export const WALK_SPEED = 70; // px par seconde
// Un saut monte d'au plus MAX_RISE px et franchit au plus MAX_GAP px à l'horizontale.
export const MAX_RISE = 130;
export const MAX_GAP = 75;

// Le dessus d'un meuble où le chat peut se tenir : de x0 à x1, à la hauteur y.
export type Platform = { id: string; x0: number; x1: number; y: number; col: number; row: number; w: number; h: number };
// `blocked[row - WALL_ROWS][col]` : case du sol occupée par un meuble (les tapis ne bloquent pas).
export type WalkMap = { cols: number; blocked: boolean[][]; platforms: Platform[] };

// Hauteur du dessus, en fraction de la hauteur du meuble depuis son haut (l'assise du canapé est plus bas que son dossier).
const TOP_FRACTION: Partial<Record<StandingKind, number>> = { sofa: 0.45, armchair: 0.45, chair: 0.45, 'coffee-table': 0.3, desk: 0.05, shelf: 0.02 };

export function buildWalkMap(layout: Layout, cols: number): WalkMap {
  const blocked = Array.from({ length: ROWS - WALL_ROWS }, () => new Array<boolean>(cols).fill(false));
  const platforms: Platform[] = [];
  for (const p of layout) {
    if (!isStanding(p)) continue;
    const rect = rectOf(p);
    if (!rect) continue;
    if (layerOf(p.kind) === 'floor') {
      for (let r = Math.max(rect.row, WALL_ROWS); r < Math.min(rect.row + rect.h, ROWS); r++) {
        for (let c = Math.max(rect.col, 0); c < Math.min(rect.col + rect.w, cols); c++) blocked[r - WALL_ROWS]![c] = true;
      }
    }
    const top = TOP_FRACTION[p.kind];
    if (top !== undefined) {
      platforms.push({ id: p.id, x0: rect.col * CELL_W + 6, x1: (rect.col + rect.w) * CELL_W - 6, y: (rect.row + rect.h * top) * CELL_H, col: rect.col, row: rect.row, w: rect.w, h: rect.h });
    }
  }
  return { cols, blocked, platforms };
}

export const isFree = (map: WalkMap, col: number, row: number): boolean =>
  row >= WALL_ROWS && row < ROWS && col >= 0 && col < map.cols && !map.blocked[row - WALL_ROWS]![col];

// Les pieds au milieu de la case, 3 px au-dessus de son bord bas.
export const standPoint = (col: number, row: number): Pt => ({ x: (col + 0.5) * CELL_W, y: (row + 1) * CELL_H - 3 });
export const cellOf = (pt: Pt): Cell => ({ col: Math.floor(pt.x / CELL_W), row: Math.floor(pt.y / CELL_H) });

// La case libre du sol la plus proche d'un point (dans un rayon de 14 cases).
export function nearestFreeCell(map: WalkMap, pt: Pt, radius = 14): Cell | null {
  const here = cellOf(pt);
  let best: Cell | null = null;
  let bestDistance = Infinity;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const cell = { col: here.col + dc, row: here.row + dr };
      if (!isFree(map, cell.col, cell.row)) continue;
      const s = standPoint(cell.col, cell.row);
      const distance = Math.hypot(s.x - pt.x, s.y - pt.y);
      if (distance < bestDistance) {
        best = cell;
        bestDistance = distance;
      }
    }
  }
  return best;
}

const STEPS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Plus court chemin au sol (8 directions, sans couper un coin de meuble) ; null si l'une des cases est bloquée ou si rien ne relie.
export function groundPath(map: WalkMap, from: Cell, to: Cell): Cell[] | null {
  if (!isFree(map, from.col, from.row) || !isFree(map, to.col, to.row)) return null;
  const key = (c: Cell): number => c.row * map.cols + c.col;
  const prev = new Map<number, Cell | null>([[key(from), null]]);
  const queue: Cell[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    if (cur.col === to.col && cur.row === to.row) break;
    for (const [dc, dr] of STEPS) {
      const next = { col: cur.col + dc, row: cur.row + dr };
      if (!isFree(map, next.col, next.row) || prev.has(key(next))) continue;
      if (dc !== 0 && dr !== 0 && (!isFree(map, cur.col + dc, cur.row) || !isFree(map, cur.col, cur.row + dr))) continue;
      prev.set(key(next), cur);
      queue.push(next);
    }
  }
  if (!prev.has(key(to))) return null;
  const path: Cell[] = [];
  for (let c: Cell | null = to; c; c = prev.get(key(c)) ?? null) path.push(c);
  return path.reverse();
}

const walkMs = (a: Pt, b: Pt): number => Math.round((Math.hypot(b.x - a.x, b.y - a.y) / WALK_SPEED) * 1000);

// Des points successifs → des segments de marche sur le support `on` ; les points alignés fusionnent, les pas nuls disparaissent.
export function toSegments(pts: Pt[], on: string | null): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.5) continue;
    const last = out[out.length - 1];
    if (last) {
      const ux = last.to.x - last.from.x;
      const uy = last.to.y - last.from.y;
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const cross = ux * vy - uy * vx;
      const dot = ux * vx + uy * vy;
      if (Math.abs(cross) < 1e-3 * Math.hypot(ux, uy) * Math.hypot(vx, vy) && dot > 0) {
        last.to = b;
        last.ms = walkMs(last.from, b);
        continue;
      }
    }
    out.push({ kind: 'walk', from: a, to: b, ms: walkMs(a, b), fromOn: on, on });
  }
  return out;
}

// Marche au sol de `from` à `to`. Un point d'arrivée dans un meuble (panier, niche…) : on marche jusqu'à la case libre la plus proche, puis on y entre.
export function groundLeg(map: WalkMap, from: Pt, to: Pt): Segment[] | null {
  const a = cellOf(from);
  const b = cellOf(to);
  const start = isFree(map, a.col, a.row) ? a : nearestFreeCell(map, from);
  const goal = isFree(map, b.col, b.row) ? b : nearestFreeCell(map, to);
  if (!start || !goal) return null;
  const cells = groundPath(map, start, goal);
  if (!cells) return null;
  return toSegments([from, ...cells.slice(1).map((c) => standPoint(c.col, c.row)), to], null);
}
