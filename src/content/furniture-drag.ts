import { sizeOf } from '../core/library/furniture-catalog';
import type { Layout } from '../core/library/library-types';
import { CELL_H, CELL_W, canPlace, canPlaceComputer, isStanding, rectOf, type Cell, type Rect } from '../core/library/room-grid';

export type ClientRect = { left: number; top: number; width: number; height: number };

// Point de l'écran → case de la pièce (et position dans le repère du dessin). `viewBoxW/H` : taille du viewBox du SVG.
export function pointerToCell(rect: ClientRect, viewBoxW: number, viewBoxH: number, clientX: number, clientY: number): { col: number; row: number; x: number; y: number } {
  const x = ((clientX - rect.left) / rect.width) * viewBoxW;
  const y = ((clientY - rect.top) / rect.height) * viewBoxH;
  return { col: Math.floor(x / CELL_W), row: Math.floor(y / CELL_H), x, y };
}

// Le bureau dont une case contient (col, row), ou null.
export function deskAtCell(layout: Layout, col: number, row: number): string | null {
  for (const placed of layout) {
    if (placed.kind !== 'desk') continue;
    const r = rectOf(placed);
    if (r && col >= r.col && col < r.col + r.w && row >= r.row && row < r.row + r.h) return placed.id;
  }
  return null;
}

export type DropReason = 'bounds' | 'floor' | 'taken' | 'wall' | 'not-desk' | 'desk-busy';

export type DropTarget = {
  ok: boolean;
  reason?: DropReason;
  // Cases fautives (à faire clignoter en rouge au lâcher refusé).
  cells: Cell[];
  // Contour fantôme (vert si ok, rouge sinon) ; null quand rien ne peut être dessiné.
  ghost: Rect | null;
  // Meuble debout : case en haut à gauche d'arrivée.
  col?: number;
  top?: number;
  // Ordinateur : bureau d'arrivée.
  deskId?: string;
};

// Où atterrirait le meuble `id` si on le lâchait sur la case (col, row) ?
// Un meuble debout a cette case pour coin bas gauche ; un ordinateur vise le bureau qui la contient.
export function dropTargetFor(layout: Layout, cols: number, id: string, col: number, row: number): DropTarget {
  const item = layout.find((p) => p.id === id);
  if (!item) return { ok: false, cells: [], ghost: null };
  // Les objets accrochés ou rangés ne se déplacent pas encore ici (tâche 8).
  if (!isStanding(item) && item.kind !== 'computer') return { ok: false, cells: [], ghost: null };
  if (item.kind === 'computer') {
    const deskId = deskAtCell(layout, col, row);
    if (!deskId) return { ok: false, reason: 'not-desk', cells: [{ col, row }], ghost: { col, row, w: 1, h: 1 } };
    const desk = layout.find((p) => p.id === deskId);
    const ghost = desk ? rectOf(desk) : null;
    if (!canPlaceComputer(layout, deskId, id)) return { ok: false, reason: 'desk-busy', cells: [], ghost, deskId };
    return { ok: true, cells: [], ghost, deskId };
  }
  const { w, h } = sizeOf(item.kind);
  const top = row - h + 1;
  const ghost: Rect = { col, row: top, w, h };
  const check = canPlace(layout, cols, item.kind, col, top, id);
  if (check.ok) return { ok: true, cells: [], ghost, col, top };
  return { ok: false, reason: check.reason, cells: check.cells, ghost, col, top };
}
