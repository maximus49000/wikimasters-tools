import { wallSizeOf } from '../core/library/furniture-catalog';
import { drawSize, floorCells } from '../core/library/footprint';
import type { Layout, ShelfLevel } from '../core/library/library-types';
import { angleOf, boardAt, boardItems, CELL_H, CELL_W, canHang, canHangRect, canPlace, byDrawOrder, canPlaceComputer, decoSizeOf, dropOnShelf, firstFreeSurfaceSlot, moveStored, pxRect, rectOf, shelfLayoutOf, SURFACE_SLOTS, surfaceSlotRectOn, type Cell, type PxRect, type Rect, type Standing } from '../core/library/room-grid';

export type ClientRect = { left: number; top: number; width: number; height: number };

// Point de l'écran → case de la pièce (et position dans le repère du dessin). `viewBoxW/H` : taille du viewBox du SVG.
// La colonne suit le doigt par demi-cases (pour centrer un objet dans un espace pair) ; la ligne reste entière.
export function pointerToCell(rect: ClientRect, viewBoxW: number, viewBoxH: number, clientX: number, clientY: number): { col: number; row: number; x: number; y: number } {
  const x = ((clientX - rect.left) / rect.width) * viewBoxW;
  const y = ((clientY - rect.top) / rect.height) * viewBoxH;
  return { col: Math.floor((2 * x) / CELL_W) / 2, row: Math.floor(y / CELL_H), x, y };
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

// Le bureau ou l'étagère dont un emplacement de petit objet (posé sur le dessus projeté, à tout angle, comme `surfaceSlotRectOn`)
// contient le point (x, y).
export function hostAtSurface(layout: Layout, x: number, y: number): string | null {
  for (const placed of hostsFrontFirst(layout, true)) {
    const r = rectOf(placed);
    if (!r || (placed.kind !== 'desk' && placed.kind !== 'shelf')) continue;
    const draw = pxRect(r);
    for (let i = 0; i < SURFACE_SLOTS[placed.kind]; i++) {
      const s = surfaceSlotRectOn(draw, placed.kind, angleOf(placed), i);
      if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) return placed.id;
    }
  }
  return null;
}

// Place qu'aurait l'objet rangé `id` à ce rang de la tablette (rectangle englobant à l'écran et parallélogramme de sa face) ; si la place manque,
// posé de force à ce rang (au bout de la tablette pour un refus), quitte à déborder.
function ghostOf(layout: Layout, id: string, shelfId: string, level: ShelfLevel, order: number): GhostPx | undefined {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'stored') return undefined;
  const moved = moveStored(layout, id, shelfId, level, order) ?? [...layout.filter((p) => p.id !== id), { ...item, shelfId, level, order }];
  const box = shelfLayoutOf(moved, shelfId).find((b) => b.id === id);
  return box && { x: box.x, y: box.y, w: box.w, h: box.h, quad: box.quad };
}

// Fantôme d'un objet rangé à l'écran : rectangle englobant, et les 4 coins de sa face (parallélogramme en ¾).
export type GhostPx = PxRect & { quad?: [number, number][] };

export type DropReason = 'bounds' | 'floor' | 'taken' | 'wall' | 'not-desk' | 'desk-busy' | 'desk-middle' | 'not-slot' | 'shelf-full' | 'host-busy' | 'not-host' | 'not-screen';

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
  // Objet rangé : tablette et rang visés (le fantôme, en pixels, est sa place une fois rangé à ce rang).
  ghostPx?: GhostPx;
  shelfId?: string;
  level?: ShelfLevel;
  order?: number;
};

// Où atterrirait le meuble `id` si on le lâchait sur la case (col, row) ?
// Un meuble debout ou un objet accroché a cette case pour coin bas gauche ; un ordinateur vise le bureau qui la contient ;
// un objet rangé vise la tablette sous (x, y) (par défaut le coin de la case), au rang du point.
export function dropTargetFor(layout: Layout, cols: number, id: string, col: number, row: number, x: number = col * CELL_W, y: number = row * CELL_H): DropTarget {
  const item = layout.find((p) => p.id === id);
  if (!item) return { ok: false, cells: [], ghost: null };
  if (item.kind === 'stored') {
    const hit = boardAt(layout, x, y);
    if (!hit) return { ok: false, reason: 'not-slot', cells: [], ghost: null };
    const drop = dropOnShelf(layout, hit.shelfId, hit.level, hit.xCm, item);
    const where = { shelfId: hit.shelfId, level: hit.level };
    if (!drop.ok) {
      // Tablette pleine : l'empreinte rouge est l'objet posé au bout de la tablette (il déborde).
      return { ok: false, reason: drop.reason === 'shelf-full' ? 'shelf-full' : 'not-slot', cells: [], ghost: null, ghostPx: ghostOf(layout, id, hit.shelfId, hit.level, boardItems(layout, hit.shelfId, hit.level, id).length), ...where };
    }
    return { ok: true, cells: [], ghost: null, ghostPx: ghostOf(layout, id, hit.shelfId, hit.level, drop.order), ...where, order: drop.order };
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
  if (item.kind === 'deco') {
    const { w, h } = decoSizeOf(item);
    const top = row - h + 1;
    const ghost: Rect = { col, row: top, w, h };
    const check = canHangRect(layout, cols, w, h, col, top, id);
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
