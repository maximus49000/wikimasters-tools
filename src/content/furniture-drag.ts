import { wallSizeOf } from '../core/library/furniture-catalog';
import { drawSize, floorCells } from '../core/library/footprint';
import type { Layout } from '../core/library/library-types';
import { angleOf, shelfSlotsOf, CELL_H, CELL_W, canHang, canHangRect, canPlace, byDrawOrder, canPlaceComputer, firstFreeSurfaceSlot, pxRect, rectOf, slotAt, surfaceSlotRect, type Cell, type PxRect, type Rect, type Standing } from '../core/library/room-grid';

export type ClientRect = { left: number; top: number; width: number; height: number };

// Point de l'écran → case de la pièce (et position dans le repère du dessin). `viewBoxW/H` : taille du viewBox du SVG.
export function pointerToCell(rect: ClientRect, viewBoxW: number, viewBoxH: number, clientX: number, clientY: number): { col: number; row: number; x: number; y: number } {
  const x = ((clientX - rect.left) / rect.width) * viewBoxW;
  const y = ((clientY - rect.top) / rect.height) * viewBoxH;
  return { col: Math.floor(x / CELL_W), row: Math.floor(y / CELL_H), x, y };
}

// Les bureaux (et les étagères si `shelves`), du plus en avant au plus en arrière : sur des cases partagées par
// plusieurs niveaux, le lâcher vise celui qu'on voit devant.
const hostsFrontFirst = (layout: Layout, shelves: boolean): Standing[] =>
  byDrawOrder(layout, layout.filter((p): p is Standing => p.kind === 'desk' || (shelves && p.kind === 'shelf'))).reverse();

// Le bureau le plus en avant dont une case contient (col, row), ou null.
export function deskAtCell(layout: Layout, col: number, row: number): string | null {
  for (const placed of hostsFrontFirst(layout, false)) {
    const r = rectOf(placed);
    if (r && col >= r.col && col < r.col + r.w && row >= r.row && row < r.row + r.h) return placed.id;
  }
  return null;
}

// Le bureau ou l'étagère le plus en avant dont une case contient (col, row), ou null : ils portent les petits objets.
export function hostAtCell(layout: Layout, col: number, row: number): string | null {
  for (const placed of hostsFrontFirst(layout, true)) {
    const r = rectOf(placed);
    if (r && col >= r.col && col < r.col + r.w && row >= r.row && row < r.row + r.h) return placed.id;
  }
  return null;
}

// Le bureau ou l'étagère dont la bande des petits objets (44 px au-dessus du dessus, comme `surfaceSlotRect`) contient le point (x, y).
export function hostAtSurface(layout: Layout, x: number, y: number): string | null {
  for (const placed of hostsFrontFirst(layout, true)) {
    const r = rectOf(placed);
    if (!r) continue;
    const strip = surfaceSlotRect(pxRect(r), 1, 0);
    if (x >= strip.x && x < strip.x + strip.w && y >= strip.y && y < strip.y + strip.h) return placed.id;
  }
  return null;
}

export type DropReason = 'bounds' | 'floor' | 'taken' | 'wall' | 'not-desk' | 'desk-busy' | 'desk-middle' | 'slot-busy' | 'not-slot' | 'host-busy' | 'not-host' | 'not-screen';

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
  // Meuble debout : ses cases au sol à l'arrivée (escalier compris en diagonale).
  floor?: Cell[];
  // Ordinateur : bureau d'arrivée.
  deskId?: string;
  // Petit objet : porteur d'arrivée.
  hostId?: string;
  // Carte d'écran : ordinateur visé.
  computerId?: string;
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
    const ghostPx = shelf ? shelfSlotsOf(shelf)[hit.slot] : undefined;
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
  if (item.kind === 'window') {
    const top = row - item.h + 1;
    const ghost: Rect = { col, row: top, w: item.w, h: item.h };
    const check = canHangRect(layout, cols, item.w, item.h, col, top, id);
    if (check.ok) return { ok: true, cells: [], ghost, col, top };
    return { ok: false, reason: check.reason, cells: check.cells, ghost, col, top };
  }
  if (item.kind === 'computer') {
    const deskId = deskAtCell(layout, col, row);
    if (!deskId) return { ok: false, reason: 'not-desk', cells: [{ col, row }], ghost: { col, row, w: 1, h: 1 } };
    const desk = layout.find((p) => p.id === deskId);
    const ghost = desk ? rectOf(desk) : null;
    if (!canPlaceComputer(layout, deskId, id)) {
      // Un autre ordinateur occupe déjà le bureau, ou des petits objets en occupent le milieu.
      const hasComputer = layout.some((p) => p.kind === 'computer' && p.deskId === deskId && p.id !== id);
      return { ok: false, reason: hasComputer ? 'desk-busy' : 'desk-middle', cells: [], ghost, deskId };
    }
    return { ok: true, cells: [], ghost, deskId };
  }
  if (item.kind === 'small') {
    const hostId = hostAtCell(layout, col, row) ?? hostAtSurface(layout, x, y);
    if (!hostId) return { ok: false, reason: 'not-host', cells: [{ col, row }], ghost: { col, row, w: 1, h: 1 } };
    const host = layout.find((p) => p.id === hostId);
    const ghost = host ? rectOf(host) : null;
    const room = hostId === item.hostId || firstFreeSurfaceSlot(layout, hostId, id) !== null;
    return room ? { ok: true, cells: [], ghost, hostId } : { ok: false, reason: 'host-busy', cells: [], ghost, hostId };
  }
  const angle = angleOf(item);
  const { w, h } = drawSize(item.kind, angle);
  const top = row - h + 1;
  const ghost: Rect = { col, row: top, w, h };
  const floor = floorCells(item.kind, angle, col, top);
  const check = canPlace(layout, cols, item.kind, col, top, id, angle);
  if (check.ok) return { ok: true, cells: [], ghost, floor, col, top };
  return { ok: false, reason: check.reason, cells: check.cells, ghost, floor, col, top };
}
