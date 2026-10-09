import { WINDOW_DEFAULT, WINDOW_MAX, WINDOW_MIN, layerOf, sizeOf, wallSizeOf } from './furniture-catalog';
import { STANDING_KINDS } from './library-types';
import type { Layout, Orientation, Placed, ShelfShape, SmallItem, StandingKind, VinylColor, WallShape } from './library-types';

export const ROWS = 18;
// Les lignes 0 à WALL_ROWS - 1 sont le mur, les suivantes le sol.
export const WALL_ROWS = 12;
export const CELL_W = 30;
export const HEIGHT = 510;
export const CELL_H = HEIGHT / ROWS;
// La pièce grandit et rétrécit par zones de 12 colonnes, de 24 à 96 colonnes.
export const SECTION = 12;
export const MIN_COLS = 24;
export const MAX_COLS = 96;
// Colonnes visibles d'un coup : l'orientation règle seulement cette fenêtre, le reste se fait défiler.
export const VISIBLE_COLS: Record<Orientation, number> = { landscape: 24, portrait: 16 };

export type Cell = { col: number; row: number };
export type Rect = { col: number; row: number; w: number; h: number };
export type PxRect = { x: number; y: number; w: number; h: number };

export type PlaceResult =
  | { ok: true }
  | { ok: false; reason: 'bounds' | 'floor' | 'taken' | 'wall'; cells: Cell[] };

type Standing = Extract<Placed, { kind: StandingKind }>;

export const isStanding = (p: Placed): p is Standing => (STANDING_KINDS as readonly string[]).includes(p.kind);

export function rectOf(p: Placed): Rect | null {
  if (isStanding(p)) {
    const { w, h } = sizeOf(p.kind);
    return { col: p.col, row: p.row, w, h };
  }
  if (p.kind === 'wall') {
    const { w, h } = wallSizeOf(p.shape);
    return { col: p.col, row: p.row, w, h };
  }
  if (p.kind === 'window') return { col: p.col, row: p.row, w: p.w, h: p.h };
  return null;
}

function cellsOf(rect: Rect): Cell[] {
  const cells: Cell[] = [];
  for (let row = rect.row; row < rect.row + rect.h; row++) {
    for (let col = rect.col; col < rect.col + rect.w; col++) cells.push({ col, row });
  }
  return cells;
}

const inRoomCell = (cols: number) => (c: Cell): boolean => c.col >= 0 && c.row >= 0 && c.col < cols && c.row < ROWS;

const layerOfPlaced = (p: Placed): 'floor' | 'rug' => (isStanding(p) ? layerOf(p.kind) : 'floor');

// Les cases occupées d'une couche (meubles debout et objets accrochés pour `floor`, tapis pour `rug`), sauf celles de `ignoreId`.
function takenKeys(layout: Layout, ignoreId?: string, layer: 'floor' | 'rug' = 'floor'): Set<string> {
  const taken = new Set<string>();
  for (const other of layout) {
    if (other.id === ignoreId || layerOfPlaced(other) !== layer) continue;
    const otherRect = rectOf(other);
    if (!otherRect) continue;
    for (const c of cellsOf(otherRect)) taken.add(`${c.col}-${c.row}`);
  }
  return taken;
}

export function canPlace(layout: Layout, cols: number, kind: StandingKind, col: number, row: number, ignoreId?: string): PlaceResult {
  const { w, h } = sizeOf(kind);
  const cells = cellsOf({ col, row, w, h });
  const inRoom = inRoomCell(cols);
  if (cells.some((c) => !inRoom(c))) return { ok: false, reason: 'bounds', cells: cells.filter(inRoom) };
  if (row + h - 1 < WALL_ROWS) return { ok: false, reason: 'floor', cells: cells.filter((c) => c.row === row + h - 1) };
  const layer = layerOf(kind);
  if (layer === 'rug' && row < WALL_ROWS) return { ok: false, reason: 'floor', cells: cells.filter((c) => c.row < WALL_ROWS) };
  const taken = takenKeys(layout, ignoreId, layer);
  const clash = cells.filter((c) => taken.has(`${c.col}-${c.row}`));
  return clash.length > 0 ? { ok: false, reason: 'taken', cells: clash } : { ok: true };
}

// Un objet accroché doit tenir entièrement sur le mur et sur des cases libres (derrière une étagère, c'est pris).
export function canHangRect(layout: Layout, cols: number, w: number, h: number, col: number, row: number, ignoreId?: string): PlaceResult {
  const cells = cellsOf({ col, row, w, h });
  const inRoom = inRoomCell(cols);
  if (cells.some((c) => !inRoom(c))) return { ok: false, reason: 'bounds', cells: cells.filter(inRoom) };
  if (row + h > WALL_ROWS) return { ok: false, reason: 'wall', cells: cells.filter((c) => c.row >= WALL_ROWS) };
  const taken = takenKeys(layout, ignoreId);
  const clash = cells.filter((c) => taken.has(`${c.col}-${c.row}`));
  return clash.length > 0 ? { ok: false, reason: 'taken', cells: clash } : { ok: true };
}

export function canHang(layout: Layout, cols: number, shape: WallShape, col: number, row: number, ignoreId?: string): PlaceResult {
  const { w, h } = wallSizeOf(shape);
  return canHangRect(layout, cols, w, h, col, row, ignoreId);
}

export function hang(layout: Layout, cols: number, shape: WallShape, col: number, row: number, slug: string, id: string, color?: VinylColor): Layout | null {
  if (!canHang(layout, cols, shape, col, row).ok || placedSlugs(layout).has(slug)) return null;
  return [...layout, { id, kind: 'wall', shape, col, row, slug, ...(color ? { color } : {}) }];
}

export function moveHung(layout: Layout, cols: number, id: string, col: number, row: number): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'wall' || !canHang(layout, cols, item.shape, col, row, id).ok) return null;
  return layout.map((p) => (p.id === id ? { ...item, col, row } : p));
}

export function placeWindow(layout: Layout, cols: number, col: number, row: number, id: string): Layout | null {
  const { w, h } = WINDOW_DEFAULT;
  if (!canHangRect(layout, cols, w, h, col, row).ok) return null;
  return [...layout, { id, kind: 'window', col, row, w, h }];
}

export function moveWindow(layout: Layout, cols: number, id: string, col: number, row: number): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'window' || !canHangRect(layout, cols, item.w, item.h, col, row, id).ok) return null;
  return layout.map((p) => (p.id === id ? { ...item, col, row } : p));
}

// La fenêtre garde son coin haut-gauche ; la taille doit rester dans les bornes, sur le mur et sur des cases libres.
export function windowFit(layout: Layout, cols: number, id: string, w: number, h: number): PlaceResult {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'window') return { ok: false, reason: 'bounds', cells: [] };
  const inRange = Number.isInteger(w) && Number.isInteger(h) && w >= WINDOW_MIN.w && w <= WINDOW_MAX.w && h >= WINDOW_MIN.h && h <= WINDOW_MAX.h;
  if (!inRange) return { ok: false, reason: 'bounds', cells: [] };
  return canHangRect(layout, cols, w, h, item.col, item.row, id);
}

export function resizeWindow(layout: Layout, cols: number, id: string, w: number, h: number): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'window' || !windowFit(layout, cols, id, w, h).ok) return null;
  return layout.map((p) => (p.id === id ? { ...item, w, h } : p));
}

export function placeStanding(layout: Layout, cols: number, kind: StandingKind, col: number, row: number, id: string): Layout | null {
  if (!canPlace(layout, cols, kind, col, row).ok) return null;
  return [...layout, { id, kind, col, row }];
}

export function moveStanding(layout: Layout, cols: number, id: string, col: number, row: number): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!item || !isStanding(item)) return null;
  if (!canPlace(layout, cols, item.kind, col, row, id).ok) return null;
  return layout.map((p) => (p.id === id ? { ...item, col, row } : p));
}

// Un ordinateur se pose sur un bureau qui n'en porte pas déjà un (le sien, en cas de déplacement, ne compte pas).
export function canPlaceComputer(layout: Layout, deskId: string, ignoreId?: string): boolean {
  const desk = layout.find((p) => p.id === deskId);
  if (!desk || desk.kind !== 'desk') return false;
  if (layout.some((p) => p.kind === 'small' && p.hostId === deskId && COMPUTER_SLOTS.has(p.slot))) return false;
  return !layout.some((p) => p.kind === 'computer' && p.deskId === deskId && p.id !== ignoreId);
}

export function placeComputer(layout: Layout, deskId: string, id: string): Layout | null {
  if (!canPlaceComputer(layout, deskId)) return null;
  return [...layout, { id, kind: 'computer', deskId }];
}

export function moveComputer(layout: Layout, id: string, deskId: string): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'computer' || !canPlaceComputer(layout, deskId, id)) return null;
  return layout.map((p) => (p.id === id ? { ...item, deskId } : p));
}

// Retirer un bureau retire aussi l'ordinateur et les petits objets qui y sont posés ; retirer une étagère, les objets rangés et posés dessus.
export function removeFurniture(layout: Layout, id: string): Layout {
  return layout.filter(
    (p) => p.id !== id && !(p.kind === 'computer' && p.deskId === id) && !(p.kind === 'stored' && p.shelfId === id) && !(p.kind === 'small' && p.hostId === id),
  );
}

type SmallPlaced = Extract<Placed, { kind: 'small' }>;

// Un bureau porte 4 petits objets, une étagère 3 (sur son dessus).
export const SURFACE_SLOTS = { desk: 4, shelf: 3 } as const;
type HostKind = keyof typeof SURFACE_SLOTS;
const isHost = (p: Placed): p is Placed & { kind: HostKind } => p.kind === 'desk' || p.kind === 'shelf';

// L'ordinateur d'un bureau couvre les deux emplacements du milieu.
const COMPUTER_SLOTS: ReadonlySet<number> = new Set([1, 2]);
const SMALL_H = 44;

function blockedSlots(layout: Layout, hostId: string): ReadonlySet<number> {
  return layout.some((p) => p.kind === 'computer' && p.deskId === hostId) ? COMPUTER_SLOTS : new Set<number>();
}

export function firstFreeSurfaceSlot(layout: Layout, hostId: string, ignoreId?: string): number | null {
  const host = layout.find((p) => p.id === hostId);
  if (!host || !isHost(host)) return null;
  const used = new Set(layout.filter((p): p is SmallPlaced => p.kind === 'small' && p.hostId === hostId && p.id !== ignoreId).map((p) => p.slot));
  const blocked = blockedSlots(layout, hostId);
  for (let i = 0; i < SURFACE_SLOTS[host.kind]; i++) if (!used.has(i) && !blocked.has(i)) return i;
  return null;
}

// Reste-t-il une place pour un petit objet sur un bureau ou une étagère quelconque ?
export const hasFreeHost = (layout: Layout): boolean => layout.some((p) => isHost(p) && firstFreeSurfaceSlot(layout, p.id) !== null);

export function placeSmall(layout: Layout, hostId: string, item: SmallItem, id: string): Layout | null {
  const slot = firstFreeSurfaceSlot(layout, hostId);
  if (slot === null) return null;
  return [...layout, { id, kind: 'small', item, hostId, slot }];
}

// Sur le même porteur, l'objet garde son emplacement ; sur un autre, il prend le premier libre.
export function moveSmall(layout: Layout, id: string, hostId: string): Layout | null {
  const small = layout.find((p) => p.id === id);
  if (!small || small.kind !== 'small') return null;
  const slot = small.hostId === hostId ? small.slot : firstFreeSurfaceSlot(layout, hostId, id);
  if (slot === null) return null;
  return layout.map((p) => (p.id === id ? { ...small, hostId, slot } : p));
}

export const isLamp = (p: Placed): boolean => p.kind === 'lamp' || (p.kind === 'small' && p.item === 'lamp');
export const isLit = (p: Placed): boolean => !isLamp(p) || (p as { lit?: boolean }).lit !== false;

// Allume ou éteint une lampe (debout ou posée) ; sans effet sur un autre meuble.
export function toggleLamp(layout: Layout, id: string): Layout {
  const target = layout.find((p) => p.id === id);
  if (!target || !isLamp(target)) return layout;
  return layout.map((p) => (p.id === id ? ({ ...p, lit: !isLit(p) } as Placed) : p));
}

// La boîte d'un emplacement de surface : le dessus du porteur, divisé en `slotCount` emplacements de 44 px de haut.
export function surfaceSlotRect(host: PxRect, slotCount: number, slot: number): PxRect {
  const w = host.w / slotCount;
  return { x: host.x + slot * w, y: host.y - SMALL_H + 2, w, h: SMALL_H };
}

// Ajouter une zone à gauche décale les colonnes de tous les meubles ; l'ordinateur suit son bureau.
export function shiftLayout(layout: Layout, delta: number): Layout {
  return layout.map((p) => (isStanding(p) ? { ...p, col: p.col + delta } : p.kind === 'wall' || p.kind === 'window' ? { ...p, col: p.col + delta } : p));
}

// La zone de 12 colonnes au bord est vide quand aucun meuble ne la touche (même à cheval sur sa frontière).
export function sectionIsEmpty(layout: Layout, cols: number, side: 'left' | 'right'): boolean {
  return layout.every((p) => {
    const rect = rectOf(p);
    if (!rect) return true;
    return side === 'left' ? rect.col >= SECTION : rect.col + rect.w <= cols - SECTION;
  });
}

export function pxRect(rect: Rect): PxRect {
  return { x: rect.col * CELL_W, y: rect.row * CELL_H, w: rect.w * CELL_W, h: rect.h * CELL_H };
}

const COMPUTER_W = 84;
const COMPUTER_H = 56;

// L'ordinateur est centré sur le plateau du bureau, son pied appuyé dessus.
export function computerRect(desk: PxRect): PxRect {
  return { x: desk.x + desk.w / 2 - COMPUTER_W / 2, y: desk.y - COMPUTER_H + 4, w: COMPUTER_W, h: COMPUTER_H };
}

const SHELF_MARGIN = 6;
const SHELF_LEVELS = 3;
const SHELF_PER_LEVEL = 5;

// Les 15 emplacements d'une étagère, du haut vers le bas puis de gauche à droite.
export function shelfSlots(shelf: PxRect): PxRect[] {
  const levelH = (shelf.h - 2 * SHELF_MARGIN) / SHELF_LEVELS;
  const slotW = (shelf.w - 2 * SHELF_MARGIN) / SHELF_PER_LEVEL;
  const slots: PxRect[] = [];
  for (let i = 0; i < SHELF_LEVELS; i++) {
    for (let j = 0; j < SHELF_PER_LEVEL; j++) {
      slots.push({ x: shelf.x + SHELF_MARGIN + j * slotW + 2, y: shelf.y + SHELF_MARGIN + i * levelH + 4, w: slotW - 4, h: levelH - 8 });
    }
  }
  return slots;
}

export const SHELF_SLOTS = 15;

// Slugs déjà posés dans la pièce (accrochés, rangés ou à l'écran) : une carte n'y figure qu'une fois.
export function placedSlugs(layout: Layout): Set<string> {
  const slugs = new Set<string>();
  for (const p of layout) {
    if ((p.kind === 'wall' || p.kind === 'stored' || p.kind === 'computer') && p.slug) slugs.add(p.slug);
  }
  return slugs;
}

// Emplacement d'étagère sous le point (x, y) du dessin, en pixels.
export function slotAt(layout: Layout, x: number, y: number): { shelfId: string; slot: number } | null {
  for (const p of layout) {
    if (p.kind !== 'shelf') continue;
    const rect = rectOf(p);
    if (!rect) continue;
    const i = shelfSlots(pxRect(rect)).findIndex((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
    if (i >= 0) return { shelfId: p.id, slot: i };
  }
  return null;
}

export function firstFreeSlot(layout: Layout, shelfId: string): number | null {
  const used = new Set(layout.filter((p) => p.kind === 'stored' && p.shelfId === shelfId).map((p) => (p as Extract<Placed, { kind: 'stored' }>).slot));
  for (let i = 0; i < SHELF_SLOTS; i++) if (!used.has(i)) return i;
  return null;
}

export function storeCard(layout: Layout, shelfId: string, slot: number, shape: ShelfShape, slug: string, id: string): Layout | null {
  const shelf = layout.find((p) => p.id === shelfId);
  if (!shelf || shelf.kind !== 'shelf' || !Number.isInteger(slot) || slot < 0 || slot >= SHELF_SLOTS) return null;
  if (layout.some((p) => p.kind === 'stored' && p.shelfId === shelfId && p.slot === slot)) return null;
  if (placedSlugs(layout).has(slug)) return null;
  return [...layout, { id, kind: 'stored', shape, shelfId, slot, slug }];
}

// Déplace un objet rangé vers un autre emplacement (le sien est permis, un emplacement pris par un autre non).
export function moveStored(layout: Layout, id: string, shelfId: string, slot: number): Layout | null {
  const item = layout.find((p) => p.id === id);
  const shelf = layout.find((p) => p.id === shelfId);
  if (!item || item.kind !== 'stored' || !shelf || shelf.kind !== 'shelf') return null;
  if (!Number.isInteger(slot) || slot < 0 || slot >= SHELF_SLOTS) return null;
  if (layout.some((p) => p.kind === 'stored' && p.id !== id && p.shelfId === shelfId && p.slot === slot)) return null;
  return layout.map((p) => (p.id === id ? { ...item, shelfId, slot } : p));
}

export function setScreenCard(layout: Layout, computerId: string, slug: string | null): Layout | null {
  const pc = layout.find((p) => p.id === computerId);
  if (!pc || pc.kind !== 'computer') return null;
  if (slug !== null && pc.slug !== slug && placedSlugs(layout).has(slug)) return null;
  return layout.map((p) => {
    if (p.id !== computerId || p.kind !== 'computer') return p;
    return slug === null ? { id: p.id, kind: 'computer', deskId: p.deskId } : { ...p, slug };
  });
}

// Ranger : retire un objet accroché ou rangé ; sur l'ordinateur, vide seulement l'écran.
export function unplaceCard(layout: Layout, id: string): Layout {
  const item = layout.find((p) => p.id === id);
  if (item?.kind === 'computer') return setScreenCard(layout, id, null) ?? layout;
  if (item?.kind === 'wall' || item?.kind === 'stored') return layout.filter((p) => p.id !== id);
  return layout;
}
