import { WINDOW_DEFAULT, WINDOW_MAX, WINDOW_MIN, depthDefault, layerOf, underOf, wallSizeOf } from './furniture-catalog';
import { applyMatrix, drawRect, faceFrame, faceLevels, floorCells, invertMatrix, topPoint, type Angle, type FaceFrame, type Matrix } from './footprint';
import { MAX_PANEL_TEXT, PANEL_MAX, PANEL_MIN, decoDefaultSize, isPanel, type CityTime, type DecoKind, type NeonColor } from './deco';
import { STANDING_KINDS } from './library-types';
import { isOnBoard, type DecoPlaced, type Depth, type Layout, type Orientation, type Placed, type ShelfLevel, type ShelfShape, type SmallItem, type SmallOnBoard, type SmallOnTop, type StandDepth, type StandingKind, type StoredDisplay, type VinylColor, type WallShape } from './library-types';
import { HOST_TOP, computerTopRect, firstFreeTopSpot, topRectsOf, topsApart, type TopRect } from './surface';
import type { BoxFormat } from '../game/platform-boxes';
import { itemFootprintCm, storedModel } from './item-models';
import { FURNITURE_MODELS } from './furniture-models';
import { overhangOf, projectOf } from './furniture-render3d';

export const ROWS = 18;
// Les lignes 0 à WALL_ROWS - 1 sont le mur, les suivantes le sol.
export const WALL_ROWS = 12;
export const CELL_W = 30;
export const HEIGHT = 510;
export const CELL_H = HEIGHT / ROWS;
// La pièce grandit et rétrécit par zones de 12 colonnes, de 24 à 96 colonnes ; « Adapter à l'écran » lui donne une largeur quelconque.
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

export type Standing = Extract<Placed, { kind: StandingKind }>;

export const isStanding = (p: Placed): p is Standing => (STANDING_KINDS as readonly string[]).includes(p.kind);

// Angle d'un objet : celui d'un meuble debout, 0 pour le reste.
export const angleOf = (p: Placed): Angle => (isStanding(p) ? (p.angle ?? 0) : 0);

export function rectOf(p: Placed): Rect | null {
  if (isStanding(p)) {
    return drawRect(p.kind, angleOf(p), p.col, p.row);
  }
  if (p.kind === 'wall') {
    const { w, h } = wallSizeOf(p.shape);
    return { col: p.col, row: p.row, w, h };
  }
  if (p.kind === 'window') return { col: p.col, row: p.row, w: p.w, h: p.h };
  if (p.kind === 'deco') return { col: p.col, row: p.row, ...decoSizeOf(p) };
  return null;
}

function cellsOf(rect: Rect): Cell[] {
  const cells: Cell[] = [];
  for (let row = rect.row; row < rect.row + rect.h; row++) {
    for (let col = rect.col; col < rect.col + rect.w; col++) cells.push({ col, row });
  }
  return cells;
}

// Une case peut commencer à une demi-colonne (meuble centré dans un espace pair) : elle couvre alors deux moitiés de colonnes voisines.
const inRoomCell = (cols: number) => (c: Cell): boolean => c.col >= 0 && c.row >= 0 && c.col + 1 <= cols && c.row < ROWS;

// Colonne arrondie à la demi-case la plus proche (les positions enregistrées sont des multiples de 0,5).
export const snapHalf = (col: number): number => Math.round(col * 2) / 2;

// Cases occupées, comptées par demi-colonnes : deux objets décalés d'une demi-case se chevauchent sur la moitié commune.
class Taken {
  private keys = new Set<string>();
  private static halves = (c: Cell): [string, string] => [`${c.col * 2}-${c.row}`, `${c.col * 2 + 1}-${c.row}`];
  add(c: Cell): void {
    for (const k of Taken.halves(c)) this.keys.add(k);
  }
  has(c: Cell): boolean {
    return Taken.halves(c).some((k) => this.keys.has(k));
  }
}

const layerOfPlaced = (p: Placed): 'floor' | 'rug' => (isStanding(p) ? layerOf(p.kind) : 'floor');

// Niveau d'un objet : 0 pour le mur, le champ `depth` ou le défaut du type pour un meuble, celui du porteur pour un objet porté.
export function depthOf(layout: Layout, p: Placed): Depth {
  if (p.kind === 'window' || p.kind === 'wall' || p.kind === 'deco') return 0;
  if (isStanding(p)) return p.depth ?? depthDefault(p.kind);
  const hostId = p.kind === 'computer' ? p.deskId : p.kind === 'small' || p.kind === 'posed' ? p.hostId : p.shelfId;
  const host = layout.find((q) => q.id === hostId);
  return host && isStanding(host) ? depthOf(layout, host) : 1;
}

// Ligne juste sous les pieds d'un meuble debout : sous sa case au sol la plus basse. C'est le bas de son rectangle, sauf pour un
// meuble à socle (lampadaire arc) tourné, dont le dôme déborde devant le socle.
export function footBottom(p: Standing): number {
  return Math.max(...floorCells(p.kind, angleOf(p), p.col, p.row).map((c) => c.row)) + 1;
}

// Rangée du sol sous le surplomb d'un meuble à socle (sous le dôme du lampadaire arc), selon son angle ; null sans surplomb.
export function overhangRow(p: Standing): number | null {
  const m = FURNITURE_MODELS[p.kind];
  const over = overhangOf(m);
  if (!over) return null;
  const [, y] = projectOf(m, angleOf(p), [over.at[0], 0, over.at[1]]);
  return p.row + Math.max(0, Math.min(rectOf(p)!.h - 1, Math.floor(y / CELL_H)));
}

// Première rangée au sol d'un meuble (le fond de son emprise).
export const floorTopRow = (p: Standing): number => Math.min(...floorCells(p.kind, angleOf(p), p.col, p.row).map((c) => c.row));

// Zone qui reçoit le toucher d'un meuble : tout son rectangle, sauf pour un meuble à socle (lampadaire arc), dont le rectangle est
// surtout du vide au-dessus des autres meubles : seulement les cases du socle (son dôme et son arc restent touchables là où ils sont peints).
export function hitRectOf(p: Standing): PxRect {
  const rect = rectOf(p)!;
  if (!FURNITURE_MODELS[p.kind].base) return pxRect(rect);
  const cells = floorCells(p.kind, angleOf(p), p.col, p.row);
  const [c0, c1] = [Math.min(...cells.map((c) => c.col)), Math.max(...cells.map((c) => c.col))];
  const [r0, r1] = [Math.min(...cells.map((c) => c.row)), Math.max(...cells.map((c) => c.row))];
  return pxRect({ col: c0, row: r0, w: c1 - c0 + 1, h: r1 - r0 + 1 });
}

// Meubles debout dans l'ordre de dessin : les pieds les plus hauts d'abord (le meuble dont les pieds sont le plus bas à l'écran passe
// devant), puis, pieds sur la même ligne, le niveau (fond, milieu, avant), puis l'ordre du plan.
export function byDrawOrder<T extends Standing>(layout: Layout, items: readonly T[]): T[] {
  return items
    .map((p, i) => ({ p, i, d: depthOf(layout, p), b: footBottom(p) }))
    .sort((a, b) => a.b - b.b || a.d - b.d || a.i - b.i)
    .map((e) => e.p);
}

// Les cases occupées d'une couche à un niveau (meubles debout et objets accrochés pour `floor`, tapis pour `rug`, qui ignorent le niveau), sauf celles de `ignoreId`.
function takenKeys(layout: Layout, ignoreId: string | undefined, layer: 'floor' | 'rug', depth: Depth): Taken {
  const taken = new Taken();
  for (const other of layout) {
    if (other.id === ignoreId || layerOfPlaced(other) !== layer) continue;
    if (layer === 'floor' && depthOf(layout, other) !== depth) continue;
    const otherRect = rectOf(other);
    if (!otherRect) continue;
    for (const c of cellsOf(otherRect)) taken.add(c);
  }
  return taken;
}

const clashAt = (layout: Layout, cells: Cell[], ignoreId: string | undefined, layer: 'floor' | 'rug', depth: Depth): Cell[] => {
  const taken = takenKeys(layout, ignoreId, layer, depth);
  return cells.filter((c) => taken.has(c));
};

// Deux meubles peuvent partager des cases au sol seulement si l'un est une chaise et l'autre un meuble creux (bureau, table basse, télescope).
const chairUnder = (a: StandingKind, b: StandingKind): boolean => (a === 'chair' && b !== 'chair' && underOf(b)) || (b === 'chair' && a !== 'chair' && underOf(a));

// Les cases au sol de ce meuble (à cet angle) déjà prises par un autre meuble debout (hors tapis), quel que soit son niveau :
// un meuble peut passer devant un autre (pieds plus bas), jamais au même endroit.
function footClash(layout: Layout, kind: StandingKind, col: number, row: number, ignoreId: string | undefined, angle: Angle): Cell[] {
  const taken = new Taken();
  for (const other of layout) {
    if (other.id === ignoreId || !isStanding(other) || layerOf(other.kind) !== 'floor' || chairUnder(kind, other.kind)) continue;
    for (const c of floorCells(other.kind, angleOf(other), other.col, other.row)) taken.add(c);
  }
  return floorCells(kind, angle, col, row).filter((c) => taken.has(c));
}

// Cases au sol des tapis (sauf `ignoreId`) : deux tapis ne se chevauchent pas.
function rugClash(layout: Layout, cells: Cell[], ignoreId: string | undefined): Cell[] {
  const taken = new Taken();
  for (const other of layout) {
    if (other.id === ignoreId || !isStanding(other) || layerOf(other.kind) !== 'rug') continue;
    for (const c of floorCells(other.kind, angleOf(other), other.col, other.row)) taken.add(c);
  }
  return cells.filter((c) => taken.has(c));
}

// Le niveau de ce meuble à cet endroit : `from` si son emprise au sol est libre (un tapis, lui, ne doit couvrir aucun autre tapis), null sinon.
export function freeDepth(layout: Layout, cols: number, kind: StandingKind, col: number, row: number, from: StandDepth, ignoreId?: string, angle: Angle = 0): StandDepth | null {
  if (layerOf(kind) === 'rug') return rugClash(layout, floorCells(kind, angle, col, row), ignoreId).length === 0 ? from : null;
  return footClash(layout, kind, col, row, ignoreId, angle).length === 0 ? from : null;
}

export function canPlace(layout: Layout, cols: number, kind: StandingKind, col: number, row: number, ignoreId?: string, angle: Angle = 0): PlaceResult {
  const cells = cellsOf(drawRect(kind, angle, col, row));
  const floor = floorCells(kind, angle, col, row);
  const inRoom = inRoomCell(cols);
  if (cells.some((c) => !inRoom(c))) return { ok: false, reason: 'bounds', cells: cells.filter(inRoom) };
  // Un tapis ne se pose pas sur le mur ; un meuble debout doit seulement avoir sa rangée la plus basse au sol (le haut de son emprise peut rester devant le mur).
  if (layerOf(kind) === 'rug') {
    if (floor.some((c) => c.row < WALL_ROWS)) return { ok: false, reason: 'floor', cells: floor.filter((c) => c.row < WALL_ROWS) };
  } else {
    const lowest = Math.max(...floor.map((c) => c.row));
    if (lowest < WALL_ROWS) return { ok: false, reason: 'floor', cells: floor.filter((c) => c.row === lowest) };
  }
  if (freeDepth(layout, cols, kind, col, row, depthDefault(kind), ignoreId, angle) !== null) return { ok: true };
  const clash = layerOf(kind) === 'rug' ? rugClash(layout, floor, ignoreId) : footClash(layout, kind, col, row, ignoreId, angle);
  return { ok: false, reason: 'taken', cells: clash };
}

// Un objet accroché doit tenir entièrement sur le mur et sur des cases libres du niveau 0 (derrière une étagère, c'est permis).
export function canHangRect(layout: Layout, cols: number, w: number, h: number, col: number, row: number, ignoreId?: string): PlaceResult {
  const cells = cellsOf({ col, row, w, h });
  const inRoom = inRoomCell(cols);
  if (cells.some((c) => !inRoom(c))) return { ok: false, reason: 'bounds', cells: cells.filter(inRoom) };
  if (row + h > WALL_ROWS) return { ok: false, reason: 'wall', cells: cells.filter((c) => c.row >= WALL_ROWS) };
  const clash = clashAt(layout, cells, ignoreId, 'floor', 0);
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

type WindowItem = Extract<Placed, { kind: 'window' }>;

// Rangée de fenêtres accolées (bord à bord, ou à une colonne près, à des hauteurs qui se chevauchent) contenant `id`,
// de gauche à droite : une baie faite de plusieurs fenêtres s'étire d'un bloc.
export function windowRow(layout: Layout, id: string): WindowItem[] {
  const all = layout.filter((p): p is WindowItem => p.kind === 'window');
  const start = all.find((p) => p.id === id);
  if (!start) return [];
  const row = new Set<WindowItem>([start]);
  const touches = (a: WindowItem, b: WindowItem): boolean =>
    a.row < b.row + b.h && b.row < a.row + a.h && (Math.abs(a.col + a.w - b.col) <= 1 || Math.abs(b.col + b.w - a.col) <= 1);
  for (let grown = true; grown; ) {
    grown = false;
    for (const p of all) {
      if (row.has(p) || ![...row].some((q) => touches(p, q))) continue;
      row.add(p);
      grown = true;
    }
  }
  return [...row].sort((a, b) => a.col - b.col);
}

// Étire la fenêtre sur toute la largeur du mur ou toute sa hauteur (ligne 0, 12 lignes), en gardant l'autre dimension.
// En largeur, toute sa rangée de fenêtres accolées s'étale de la colonne 0 au bout de la pièce, chacune gardant sa part.
// Refusé (cases en cause) si un objet du mur est sur le chemin.
export type StretchResult = { ok: true; layout: Layout } | Extract<PlaceResult, { ok: false }>;
export function stretchWindow(layout: Layout, cols: number, id: string, axis: 'width' | 'height'): StretchResult {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'window') return { ok: false, reason: 'bounds', cells: [] };
  const group = axis === 'width' ? windowRow(layout, id) : [item];
  const left = Math.min(...group.map((p) => p.col));
  const span = Math.max(...group.map((p) => p.col + p.w)) - left;
  const target = Math.min(cols, WINDOW_MAX.w * group.length);
  const at = (x: number): number => Math.round(((x - left) * target) / span);
  const moved = group.map((p) => (axis === 'width' ? { ...p, col: at(p.col), w: at(p.col + p.w) - at(p.col) } : { ...p, row: 0, h: WALL_ROWS }));
  const ids = new Set(group.map((p) => p.id));
  let next: Layout = layout.filter((p) => !ids.has(p.id));
  for (const p of moved) {
    if (p.w < WINDOW_MIN.w || p.w > WINDOW_MAX.w) return { ok: false, reason: 'bounds', cells: [] };
    const check = canHangRect(next, cols, p.w, p.h, p.col, p.row);
    if (!check.ok) return check;
    next = [...next, p];
  }
  const byId = new Map(moved.map((p) => [p.id, p]));
  return { ok: true, layout: layout.map((p) => byId.get(p.id) ?? p) };
}

export function resizeWindow(layout: Layout, cols: number, id: string, w: number, h: number): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'window' || !windowFit(layout, cols, id, w, h).ok) return null;
  return layout.map((p) => (p.id === id ? { ...item, w, h } : p));
}

// Taille d'un objet décoratif : la sienne pour un panneau (sinon le défaut), fixe pour le reste.
export const decoSizeOf = (p: DecoPlaced): { w: number; h: number } =>
  isPanel(p.deco) && p.w !== undefined && p.h !== undefined ? { w: p.w, h: p.h } : decoDefaultSize(p.deco);

export function hangDeco(layout: Layout, cols: number, deco: DecoKind, col: number, row: number, id: string): Layout | null {
  const { w, h } = decoDefaultSize(deco);
  if (!canHangRect(layout, cols, w, h, col, row).ok) return null;
  return [...layout, { id, kind: 'deco', deco, col, row, ...(isPanel(deco) ? { w, h } : {}) }];
}

export function moveDeco(layout: Layout, cols: number, id: string, col: number, row: number): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'deco') return null;
  const { w, h } = decoSizeOf(item);
  if (!canHangRect(layout, cols, w, h, col, row, id).ok) return null;
  return layout.map((p) => (p.id === id ? { ...item, col, row } : p));
}

// Un panneau garde son coin haut-gauche ; sa taille reste dans les bornes, sur le mur et sur des cases libres. Les autres objets ont une taille fixe.
export function decoFit(layout: Layout, cols: number, id: string, w: number, h: number): PlaceResult {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'deco' || !isPanel(item.deco)) return { ok: false, reason: 'bounds', cells: [] };
  const inRange = Number.isInteger(w) && Number.isInteger(h) && w >= PANEL_MIN.w && w <= PANEL_MAX.w && h >= PANEL_MIN.h && h <= PANEL_MAX.h;
  if (!inRange) return { ok: false, reason: 'bounds', cells: [] };
  return canHangRect(layout, cols, w, h, item.col, item.row, id);
}

export function resizeDeco(layout: Layout, cols: number, id: string, w: number, h: number): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'deco' || !decoFit(layout, cols, id, w, h).ok) return null;
  return layout.map((p) => (p.id === id ? { ...item, w, h } : p));
}

// Ville (null la retire : heure de la scène), texte (coupé à 140 caractères) ou couleur du néon d'un objet décoratif ou d'un petit objet horloge.
export function setDecoSettings(layout: Layout, id: string, patch: { city?: CityTime | null; text?: string; neon?: NeonColor }): Layout {
  return layout.map((p) => {
    if (p.id !== id || (p.kind !== 'deco' && p.kind !== 'small')) return p;
    let next: Placed = p;
    if (patch.city !== undefined) {
      const { city: _, ...rest } = next as DecoPlaced;
      next = (patch.city ? { ...rest, city: patch.city } : rest) as Placed;
    }
    if (p.kind === 'deco' && patch.text !== undefined) next = { ...(next as DecoPlaced), text: patch.text.slice(0, MAX_PANEL_TEXT) };
    if (p.kind === 'deco' && patch.neon !== undefined) next = { ...(next as DecoPlaced), neon: patch.neon };
    return next;
  });
}

// Écrit `depth` seulement s'il diffère du défaut du type (et le retire sinon).
function withDepth(item: Standing, depth: StandDepth): Standing {
  const { depth: _, ...rest } = item;
  return depth === depthDefault(item.kind) ? rest : { ...rest, depth };
}

// Écrit `angle` seulement s'il diffère de 0 (et le retire sinon).
function withAngle(item: Standing, angle: Angle): Standing {
  const { angle: _, ...rest } = item;
  return angle === 0 ? rest : { ...rest, angle };
}

export function placeStanding(layout: Layout, cols: number, kind: StandingKind, col: number, row: number, id: string, angle: Angle = 0): Layout | null {
  if (!canPlace(layout, cols, kind, col, row, undefined, angle).ok) return null;
  const d = freeDepth(layout, cols, kind, col, row, depthDefault(kind), undefined, angle);
  if (d === null) return null;
  return [...layout, withAngle(withDepth({ id, kind, col, row }, d), angle)];
}

export function moveStanding(layout: Layout, cols: number, id: string, col: number, row: number, angle?: Angle): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!item || !isStanding(item)) return null;
  const a = angle ?? angleOf(item);
  if (!canPlace(layout, cols, item.kind, col, row, id, a).ok) return null;
  const d = freeDepth(layout, cols, item.kind, col, row, depthOf(layout, item) as StandDepth, id, a);
  if (d === null) return null;
  return layout.map((p) => (p.id === id ? withAngle(withDepth({ ...item, col, row }, d), a) : p));
}

// Tourne un meuble debout sans vérifier la place (le placement vérifie ensuite).
export function setAngle(layout: Layout, id: string, angle: Angle): Layout {
  return layout.map((p) => (p.id === id && isStanding(p) ? withAngle(p, angle) : p));
}

// Avancer (+1) descend un meuble debout (hors tapis) d'une ligne vers le bas de l'écran, Reculer (-1) le remonte d'une ligne :
// mêmes règles qu'un déplacement (dans la pièce, pieds sur le sol, emprise au sol libre).
export function shiftRow(layout: Layout, cols: number, id: string, delta: 1 | -1): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!item || !isStanding(item) || layerOf(item.kind) === 'rug') return null;
  return moveStanding(layout, cols, id, item.col, item.row + delta);
}

export const canShiftRow = (layout: Layout, cols: number, id: string, delta: 1 | -1): boolean => shiftRow(layout, cols, id, delta) !== null;

// Un ordinateur se pose sur un bureau qui n'en porte pas déjà un (le sien, en cas de déplacement, ne compte pas).
export function canPlaceComputer(layout: Layout, deskId: string, ignoreId?: string): boolean {
  const desk = layout.find((p) => p.id === deskId);
  if (!desk || desk.kind !== 'desk') return false;
  // L'écran ne se pose pas sur un petit objet ou une carte du plateau (empreintes en cm ; un autre écran est refusé juste après).
  const screen = computerTopRect();
  if (!topRectsOf(layout.filter((p) => p.kind !== 'computer'), deskId, ignoreId).every((r) => topsApart(r, screen))) return false;
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

// Retirer un bureau retire aussi l'ordinateur, les petits objets et les cartes qui y sont posés ; retirer une étagère, les objets rangés et posés dessus.
export function removeFurniture(layout: Layout, id: string): Layout {
  return layout.filter(
    (p) => p.id !== id && !(p.kind === 'computer' && p.deskId === id) && !(p.kind === 'stored' && p.shelfId === id) && !((p.kind === 'small' || p.kind === 'posed') && p.hostId === id),
  );
}

// Porteurs de petits objets : le plateau d'un bureau, le dessus d'une étagère (positions en cm, surface.ts).
export type HostKind = 'desk' | 'shelf';
const isHost = (p: Placed): p is Placed & { kind: HostKind } => p.kind === 'desk' || p.kind === 'shelf';
// Hauteur (px) au-dessus du plateau projeté où viser un petit objet : son corps dépasse du dessus.
const SMALL_H = 44;

// La chaîne hi-fi ne se pose que sur un bureau ; les autres petits objets sur un bureau ou une étagère.
export const canHostSmall = (hostKind: HostKind, item: SmallItem): boolean => item !== 'hifi' || hostKind === 'desk';

// Reste-t-il une place pour un petit objet sur un bureau ou une étagère quelconque ? (place d'un réveil, le plus petit objet d'un emplacement)
export const hasFreeHost = (layout: Layout): boolean => layout.some((p) => isHost(p) && firstFreeTopSpot(layout, p.id, { item: 'alarm' }) !== null);

export function placeSmall(layout: Layout, hostId: string, item: SmallItem, id: string): Layout | null {
  const spot = firstFreeTopSpot(layout, hostId, { item });
  if (!spot) return null;
  return [...layout, { id, kind: 'small', item, hostId, ...spot }];
}

// Sur le même plateau, l'objet garde sa place (x/z) ; sur un autre (ou depuis une tablette), il prend la première place libre du plateau.
export function moveSmall(layout: Layout, id: string, hostId: string): Layout | null {
  const small = layout.find((p) => p.id === id);
  if (!small || small.kind !== 'small') return null;
  const spot = !isOnBoard(small) && small.hostId === hostId ? { x: small.x, z: small.z } : firstFreeTopSpot(layout, hostId, { item: small.item }, id);
  if (!spot) return null;
  const moved: SmallOnTop = { id, kind: 'small', item: small.item, hostId, ...(small.lit !== undefined && { lit: small.lit }), ...(small.city && { city: small.city }), ...spot };
  const next = layout.map((p) => (p.id === id ? moved : p));
  return isOnBoard(small) ? compactShelves(next) : next;
}

// Lampe : tout meuble debout dont le modèle a un point de lumière (lampadaire, lanterne, lampadaire arc), ou une petite lampe posée.
export const isLamp = (p: Placed): boolean => (isStanding(p) && FURNITURE_MODELS[p.kind].glow !== undefined) || (p.kind === 'small' && p.item === 'lamp');
export const isLit = (p: Placed): boolean => !isLamp(p) || (p as { lit?: boolean }).lit !== false;

// Allume ou éteint une lampe (debout ou posée) ; sans effet sur un autre meuble.
export function toggleLamp(layout: Layout, id: string): Layout {
  const target = layout.find((p) => p.id === id);
  if (!target || !isLamp(target)) return layout;
  return layout.map((p) => (p.id === id ? ({ ...p, lit: !isLit(p) } as Placed) : p));
}

// Rectangle (px de la pièce) d'une empreinte `r` du plateau (cm) projetée sur le dessus de son porteur tourné, prolongé vers le haut de la
// hauteur d'un petit objet (son corps dépasse du dessus) : visée du glissé d'un petit objet (r = tout le plateau).
export function topRectOn(host: PxRect, kind: HostKind, angle: Angle, r: TopRect): PxRect {
  const top = HOST_TOP[kind];
  const pts = [r.x, r.x + r.w].flatMap((x) => [r.z, r.z + r.d].map((z) => topPoint(kind, angle, host, x / top.w, z / top.d)));
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  return { x: x0, y: y0 - SMALL_H + 2, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 + SMALL_H - 2 };
}

// Ajouter une zone à gauche décale les colonnes de tous les meubles ; l'ordinateur suit son bureau.
export function shiftLayout(layout: Layout, delta: number): Layout {
  return layout.map((p) => (isStanding(p) ? { ...p, col: p.col + delta } : p.kind === 'wall' || p.kind === 'window' || p.kind === 'deco' ? { ...p, col: p.col + delta } : p));
}

// La zone de 12 colonnes au bord est vide quand aucun meuble ne la touche (même à cheval sur sa frontière).
export function sectionIsEmpty(layout: Layout, cols: number, side: 'left' | 'right'): boolean {
  return layout.every((p) => {
    const rect = rectOf(p);
    if (!rect) return true;
    return side === 'left' ? rect.col >= SECTION : rect.col + rect.w <= cols - SECTION;
  });
}

// Aucun meuble ne dépasse la colonne `cols` : la pièce peut être réduite à cette largeur par la droite.
export function fitsWithin(layout: Layout, cols: number): boolean {
  return layout.every((p) => {
    const rect = rectOf(p);
    return !rect || rect.col + rect.w <= cols;
  });
}

// Colonnes qui remplissent exactement un écran de `width` × `height` à la hauteur de la pièce, dans les bornes de largeur.
export function screenCols(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return MIN_COLS;
  return Math.min(MAX_COLS, Math.max(MIN_COLS, Math.round((width / height) * (HEIGHT / CELL_W))));
}

export function pxRect(rect: Rect): PxRect {
  return { x: rect.col * CELL_W, y: rect.row * CELL_H, w: rect.w * CELL_W, h: rect.h * CELL_H };
}

// Slugs déjà posés dans la pièce (accrochés, rangés ou à l'écran) : une carte n'y figure qu'une fois.
export function placedSlugs(layout: Layout): Set<string> {
  const slugs = new Set<string>();
  for (const p of layout) {
    if ((p.kind === 'wall' || p.kind === 'stored' || p.kind === 'computer' || p.kind === 'posed') && p.slug) slugs.add(p.slug);
  }
  return slugs;
}

// Rangement adaptatif des étagères : chaque tablette (largeur utile = largeur de la face du modèle, 74 cm) se remplit de gauche à droite
// selon la largeur réelle de chaque objet (de face : sa largeur ; sur la tranche : son épaisseur), avec 1 cm d'écart ENTRE deux objets
// (aucune marge au bord : 5 CD de face = 5 × 14 + 4 = 74 cm).
// Un objet est enregistré par sa tablette (`level`, 0 = haut) et son rang (`order`) ; sa position se déduit des objets qui le précèdent.
export const SHELF_INNER_CM = FURNITURE_MODELS.shelf.face!.w;
export const SHELF_GAP_CM = 1;
export const SHELF_LEVELS: readonly ShelfLevel[] = [0, 1, 2];
export const SHELF_FULL_MESSAGE = 'Plus de place sur cette tablette.';
// Hauteur de la face de l'étagère (cm) : de la face locale (px) aux cm, verticalement.
const SHELF_FACE_H_CM = FURNITURE_MODELS.shelf.face!.h;

export type Stored = Extract<Placed, { kind: 'stored' }>;
// Ce qu'il faut savoir d'un objet pour le ranger : sa forme et sa présentation (et son id s'il est déjà rangé, pour l'écarter du calcul).
export type StoredLike = { id?: string; shape: ShelfShape; display?: StoredDisplay; box?: BoxFormat };

export const isShelfLevel = (v: unknown): v is ShelfLevel => v === 0 || v === 1 || v === 2;
// Présentation effective : celle choisie, sinon le défaut du type (livre sur la tranche, CD/DVD/jeu de face).
export const displayOf = (p: StoredLike): StoredDisplay => p.display ?? (p.shape === 'book' ? 'spine' : 'cover');
export const storedWidthCm = (p: StoredLike): number => itemFootprintCm(p.shape, displayOf(p), p.box);

// Objets d'une tablette, de gauche à droite (rang) ; `ignoreId` : l'objet qu'on déplace.
export function boardItems(layout: Layout, shelfId: string, level: ShelfLevel, ignoreId?: string): Stored[] {
  return layout.filter((p): p is Stored => p.kind === 'stored' && p.shelfId === shelfId && p.level === level && p.id !== ignoreId).sort((a, b) => a.order - b.order);
}
// Largeur occupée (cm) : Σ largeurs + un écart entre deux objets voisins (n − 1 écarts).
export const boardUsedCm = (items: readonly StoredLike[]): number =>
  items.reduce((sum, p) => sum + storedWidthCm(p), 0) + Math.max(0, items.length - 1) * SHELF_GAP_CM;
// `item` tient-il à la suite de `others` (un écart de plus s'il n'est pas seul) ?
const fits = (others: readonly StoredLike[], item: StoredLike): boolean =>
  boardUsedCm(others) + (others.length > 0 ? SHELF_GAP_CM : 0) + storedWidthCm(item) <= SHELF_INNER_CM + 1e-9;

// Une tablette sur la face projetée : `local` dans le repère de la face (vue de face, px ; du haut du niveau au dessus de sa planche),
// `m` la matrice vers l'écran, `quad` ses 4 coins à l'écran (parallélogramme en ¾) ; x, y, w, h : son rectangle englobant.
export type ShelfBoard = PxRect & { level: ShelfLevel; local: PxRect; m: Matrix; quad: [number, number][] };
// Un objet rangé à sa place : même repère, avec sa position en cm sur la face (x0Cm depuis le bord gauche de la face) et sa largeur.
export type ShelfItemBox = ShelfBoard & { id: string; order: number; x0Cm: number; wCm: number };

function onScreen(m: Matrix, local: PxRect): PxRect & { quad: [number, number][] } {
  const quad = ([[local.x, local.y], [local.x + local.w, local.y], [local.x + local.w, local.y + local.h], [local.x, local.y + local.h]] as const).map(([u, v]) => applyMatrix(m, u, v));
  const xs = quad.map((q) => q[0]);
  const ys = quad.map((q) => q[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), quad };
}
// Les 3 tablettes d'une face (entre les planches du modèle), du haut vers le bas.
export function shelfBoardsIn(frame: FaceFrame): ShelfBoard[] {
  return faceLevels('shelf').slice(0, SHELF_LEVELS.length).map(([top, bottom], i) => {
    const local = { x: 0, y: top * frame.h, w: frame.w, h: (bottom - top) * frame.h };
    return { level: i as ShelfLevel, local, m: frame.m, ...onScreen(frame.m, local) };
  });
}
function frameOfShelf(shelf: Placed): FaceFrame | null {
  const r = rectOf(shelf);
  return r && shelf.kind === 'shelf' ? faceFrame('shelf', angleOf(shelf), pxRect(r)) : null;
}
// Tablettes d'une étagère sur sa face projetée ; de profil ou de dos, aucune (face cachée : on n'y range pas d'objet invisible).
export function shelfBoardsOf(shelf: Placed): ShelfBoard[] {
  const frame = frameOfShelf(shelf);
  return frame ? shelfBoardsIn(frame) : [];
}

// Place de chaque objet rangé de l'étagère `shelfId` sur la face `frame` (pièce ou zoom : mêmes positions en cm, à l'échelle de la face),
// sur le plan de la face (z = 0) : les objets dessinés se tiennent 2 cm en retrait (carried-items, FRONT_CM ; écart volontaire) :
// posé sur sa tablette, à sa largeur et sa hauteur réelles, le premier contre le bord gauche. Une tablette convertie qui déborde garde ses objets (au-delà de la face).
export function shelfLayoutIn(frame: FaceFrame, layout: Layout, shelfId: string): ShelfItemBox[] {
  const sx = frame.w / SHELF_INNER_CM;
  const sy = frame.h / SHELF_FACE_H_CM;
  return shelfBoardsIn(frame).flatMap((board) => {
    let x0 = 0;
    return boardItems(layout, shelfId, board.level).map((p, order) => {
      const wCm = storedWidthCm(p);
      const h = Math.min(storedModel(p.shape, p.box).h * sy, board.local.h);
      const local = { x: x0 * sx, y: board.local.y + board.local.h - h, w: wCm * sx, h };
      const box: ShelfItemBox = { id: p.id, level: board.level, order, x0Cm: x0, wCm, local, m: frame.m, ...onScreen(frame.m, local) };
      x0 += wCm + SHELF_GAP_CM;
      return box;
    });
  });
}
export function shelfLayoutOf(layout: Layout, shelfId: string): ShelfItemBox[] {
  const shelf = layout.find((p) => p.id === shelfId);
  const frame = shelf ? frameOfShelf(shelf) : null;
  return frame ? shelfLayoutIn(frame, layout, shelfId) : [];
}

// Espace libre de chaque tablette (repère de la face), dessiné en pointillés en Aménager ; une tablette pleine n'en a pas.
export function shelfFreeIn(frame: FaceFrame, layout: Layout, shelfId: string): { level: ShelfLevel; local: PxRect }[] {
  const sx = frame.w / SHELF_INNER_CM;
  return shelfBoardsIn(frame).flatMap((board) => {
    const items = boardItems(layout, shelfId, board.level);
    const used = boardUsedCm(items);
    const free = SHELF_INNER_CM - used;
    // Moins d'1 cm utile (écart compris après le dernier objet) : rien à montrer.
    if (free - (items.length > 0 ? SHELF_GAP_CM : 0) < 1) return [];
    const inset = Math.min(4, board.local.h / 4);
    return [{ level: board.level, local: { x: used * sx, y: board.local.y + inset, w: free * sx, h: board.local.h - inset } }];
  });
}

// La tablette sous le point (x, y) du dessin, sur l'étagère la plus en avant (deux étagères peuvent se superposer) ;
// `xCm` : position du point sur la largeur de la face, en cm depuis son bord gauche.
export function boardAt(layout: Layout, x: number, y: number): { shelfId: string; level: ShelfLevel; xCm: number } | null {
  const shelves = layout.filter((p): p is Standing => p.kind === 'shelf');
  for (const p of byDrawOrder(layout, shelves).reverse()) {
    const frame = frameOfShelf(p);
    if (!frame) continue;
    const [u, v] = invertMatrix(frame.m, x, y);
    if (u < 0 || u >= frame.w) continue;
    const board = shelfBoardsIn(frame).find((b) => v >= b.local.y && v < b.local.y + b.local.h);
    if (board) return { shelfId: p.id, level: board.level, xCm: (u / frame.w) * SHELF_INNER_CM };
  }
  return null;
}

export type ShelfDrop = { ok: true; order: number } | { ok: false; reason: 'shelf-full' | 'not-shelf'; message: string };

// Lâcher `item` sur la tablette `level` de l'étagère `shelfId`, au point `xCm` de la face : rang d'insertion (avant le premier objet dont
// le centre est à droite du point), ou refus si la place manque. Un objet déjà sur cette tablette peut toujours y changer de rang
// (une tablette convertie qui déborde reste utilisable).
export function dropOnShelf(layout: Layout, shelfId: string, level: ShelfLevel, xCm: number, item: StoredLike): ShelfDrop {
  const shelf = layout.find((p) => p.id === shelfId);
  if (!shelf || shelf.kind !== 'shelf' || !isShelfLevel(level)) return { ok: false, reason: 'not-shelf', message: 'Déposez l’objet sur une tablette de l’étagère.' };
  const others = boardItems(layout, shelfId, level, item.id);
  const self = item.id === undefined ? undefined : layout.find((p) => p.id === item.id);
  const already = self?.kind === 'stored' && self.shelfId === shelfId && self.level === level;
  if (!already && !fits(others, item)) return { ok: false, reason: 'shelf-full', message: SHELF_FULL_MESSAGE };
  // Les centres sont lus aux places qu'on voit : un objet déjà sur cette tablette y garde la sienne pendant qu'on le vise
  // (sinon le simple fait de le saisir le ferait passer après un voisin plus étroit).
  let x0 = 0;
  let order = 0;
  for (const p of already ? boardItems(layout, shelfId, level) : others) {
    const w = storedWidthCm(p);
    if (p.id !== item.id && x0 + w / 2 > xCm) break;
    x0 += w + SHELF_GAP_CM;
    if (p.id !== item.id) order++;
  }
  return { ok: true, order };
}

// Première tablette (du haut) où `item` tient, à la suite de ses objets ; null si l'étagère est pleine pour lui.
export function firstFreeBoard(layout: Layout, shelfId: string, item: StoredLike): { level: ShelfLevel; order: number } | null {
  for (const level of SHELF_LEVELS) {
    const others = boardItems(layout, shelfId, level, item.id);
    if (fits(others, item)) return { level, order: others.length };
  }
  return null;
}

// Rangs recompactés 0..n−1 sur chaque tablette (rang actuel, puis ordre du plan), sans rien retirer : objets rangés et petits objets de
// tablette partagent les rangs.
const onBoard = (p: Placed): Stored | SmallOnBoard | null => (p.kind === 'stored' || (p.kind === 'small' && isOnBoard(p)) ? p : null);
export function compactShelves(layout: Layout): Layout {
  const boards = new Map<string, (Stored | SmallOnBoard)[]>();
  for (const p of layout) {
    const item = onBoard(p);
    if (!item) continue;
    const key = `${item.kind === 'stored' ? item.shelfId : item.hostId}:${item.level}`;
    boards.set(key, [...(boards.get(key) ?? []), item]);
  }
  const orders = new Map<string, number>();
  for (const items of boards.values()) [...items].sort((a, b) => a.order - b.order).forEach((p, i) => orders.set(p.id, i));
  return layout.map((p) => {
    const item = onBoard(p);
    return item && orders.get(item.id) !== item.order ? { ...item, order: orders.get(item.id)! } : p;
  });
}

// Insère `item` au rang `order` (borné à la fin) de sa tablette : les suivants se décalent d'un rang ; l'ancienne tablette se recompacte.
function insertStored(layout: Layout, item: Stored, order: number): Layout {
  const rest = layout.filter((p) => p.id !== item.id);
  const others = boardItems(rest, item.shelfId, item.level);
  const at = Math.max(0, Math.min(Math.floor(order), others.length));
  const ranks = new Map<string, number>(others.map((p, i) => [p.id, i < at ? i : i + 1]));
  const placed = rest.map((p) => (ranks.has(p.id) ? { ...(p as Stored), order: ranks.get(p.id)! } : p));
  // L'objet garde sa position dans le plan quand il est déjà rangé (ordre de dessin stable), sinon il s'ajoute à la fin.
  const index = layout.findIndex((p) => p.id === item.id);
  const moved = { ...item, order: at };
  return compactShelves(index < 0 ? [...placed, moved] : [...placed.slice(0, index), moved, ...placed.slice(index)]);
}

// Range une carte sur la tablette `level` au rang `order` ; refusée si l'étagère est inconnue, la carte déjà posée ou la place insuffisante.
// `display` absent : défaut du type.
export function storeCard(layout: Layout, shelfId: string, level: ShelfLevel, order: number, shape: ShelfShape, slug: string, id: string, display?: StoredDisplay): Layout | null {
  const shelf = layout.find((p) => p.id === shelfId);
  if (!shelf || shelf.kind !== 'shelf' || !isShelfLevel(level) || !Number.isFinite(order)) return null;
  if (placedSlugs(layout).has(slug)) return null;
  const item: Stored = { id, kind: 'stored', shape, shelfId, level, order: 0, ...(display && { display }), slug };
  if (!fits(boardItems(layout, shelfId, level), item)) return null;
  return insertStored(layout, item, order);
}

// Format de boîte d'un jeu rangé (et couleur propre du boîtier de la console) : ne déplace rien, même si la tablette déborde ensuite
// (une tablette qui déborde garde ses objets). Sans effet sur un objet inconnu ou qui n'est pas un jeu.
export function setStoredBox(layout: Layout, id: string, box: BoxFormat, caseColor?: string): Layout {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'stored' || item.shape !== 'game') return layout;
  return layout.map((p) => {
    if (p.id !== id || p.kind !== 'stored') return p;
    const { caseColor: _old, ...rest } = p;
    return { ...rest, box, ...(caseColor && { caseColor }) };
  });
}

// Déplace un objet rangé vers une tablette (la sienne ou une autre, sur cette étagère ou une autre) au rang `order`.
// Refusé si la place manque (jamais dans sa propre tablette).
export function moveStored(layout: Layout, id: string, shelfId: string, level: ShelfLevel, order: number): Layout | null {
  const item = layout.find((p) => p.id === id);
  const shelf = layout.find((p) => p.id === shelfId);
  if (!item || item.kind !== 'stored' || !shelf || shelf.kind !== 'shelf' || !isShelfLevel(level) || !Number.isFinite(order)) return null;
  const same = item.shelfId === shelfId && item.level === level;
  if (!same && !fits(boardItems(layout, shelfId, level, id), item)) return null;
  return insertStored(layout, { ...item, shelfId, level }, order);
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

// Ranger : retire un objet accroché ou rangé (les suivants de sa tablette se recompactent) ; sur l'ordinateur, vide seulement l'écran.
export function unplaceCard(layout: Layout, id: string): Layout {
  const item = layout.find((p) => p.id === id);
  if (item?.kind === 'computer') return setScreenCard(layout, id, null) ?? layout;
  if (item?.kind === 'stored') return compactShelves(layout.filter((p) => p.id !== id));
  if (item?.kind === 'wall' || item?.kind === 'posed') return layout.filter((p) => p.id !== id);
  return layout;
}
