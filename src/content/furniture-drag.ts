import { sizeOf, wallSizeOf } from '../core/library/furniture-catalog';
import type { Layout } from '../core/library/library-types';
import { CELL_H, CELL_W, canHang, canPlace, canPlaceComputer, pxRect, rectOf, shelfSlots, slotAt, type Cell, type PxRect, type Rect } from '../core/library/room-grid';

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

export type DropReason = 'bounds' | 'floor' | 'taken' | 'wall' | 'not-desk' | 'desk-busy' | 'slot-busy' | 'not-slot';

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
  // Objet rangé : emplacement visé (le fantôme est alors en pixels).
  ghostPx?: PxRect;
  shelfId?: string;
  slot?: number;
};

// Où atterrirait le meuble `id` si on le lâchait sur la case (col, row) ?
// Un meuble debout ou un objet accroché a cette case pour coin bas gauche ; un ordinateur vise le bureau qui la contient ;
// un objet rangé vise l'emplacement d'étagère sous (x, y) (par défaut le coin de la case).
export function dropTargetFor(layout: Layout, cols: number, id: string, col: number, row: number, x: number = col * CELL_W, y: number = row * CELL_H): DropTarget {
  const item = layout.find((p) => p.id === id);
  if (!item) return { ok: false, cells: [], ghost: null };
  if (item.kind === 'stored') {
    const hit = slotAt(layout, x, y);
    if (!hit) return { ok: false, reason: 'not-slot', cells: [], ghost: null };
    const shelf = layout.find((p) => p.id === hit.shelfId);
    const shelfRect = shelf ? rectOf(shelf) : null;
    const ghostPx = shelfRect ? shelfSlots(pxRect(shelfRect))[hit.slot] : undefined;
    const busy = layout.some((p) => p.kind === 'stored' && p.id !== id && p.shelfId === hit.shelfId && p.slot === hit.slot);
    return { ok: !busy, ...(busy ? { reason: 'slot-busy' as const } : {}), cells: [], ghost: null, ghostPx, shelfId: hit.shelfId, slot: hit.slot };
  }
  if (item.kind === 'wall') {
    const { w, h } = wallSizeOf(item.shape);
    const top = row - h + 1;
    const ghost: Rect = { col, row: top, w, h };
    const check = canHang(layout, cols, item.shape, col, top, id);
    if (check.ok) return { ok: true, cells: [], ghost, col, top };
    return { ok: false, reason: check.reason, cells: check.cells, ghost, col, top };
  }
  if (item.kind === 'computer') {
    const deskId = deskAtCell(layout, col, row);
    if (!deskId) return { ok: false, reason: 'not-desk', cells: [{ col, row }], ghost: { col, row, w: 1, h: 1 } };
    const desk = layout.find((p) => p.id === deskId);
    const ghost = desk ? rectOf(desk) : null;
    if (!canPlaceComputer(layout, deskId, id)) return { ok: false, reason: 'desk-busy', cells: [], ghost, deskId };
    return { ok: true, cells: [], ghost, deskId };
  }
  // PROVISOIRE (tâche 5) : les petits objets n'ont pas encore de cible de dépôt.
  if (item.kind === 'small') return { ok: false, cells: [], ghost: null };
  const { w, h } = sizeOf(item.kind);
  const top = row - h + 1;
  const ghost: Rect = { col, row: top, w, h };
  const check = canPlace(layout, cols, item.kind, col, top, id);
  if (check.ok) return { ok: true, cells: [], ghost, col, top };
  return { ok: false, reason: check.reason, cells: check.cells, ghost, col, top };
}
