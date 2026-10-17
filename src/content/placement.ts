import type { CardChoice } from './CardPickerDialog';
import { deskAtCell, dropTargetFor, type DropTarget, type GhostPx } from './furniture-drag';
import { SMALL_ITEM_OF, WINDOW_DEFAULT, isDecoKind, isSmallKind, isStandingKind } from '../core/library/furniture-catalog';
import { decoDefaultSize, isPanel } from '../core/library/deco';
import { nextFurnitureId } from '../core/library/library-book';
import { applyMatrix, rotateAngle, type Angle } from '../core/library/footprint';
import type { FurnitureKind, Layout, Placed, ShelfLevel, StoredDisplay } from '../core/library/library-types';
import {
  CELL_H, CELL_W, ROWS, angleOf, isStanding, setAngle, firstFreeBoard, hang, moveComputer, moveHung, moveSmall, moveStanding, moveStored, placeComputer, placeSmall,
  placeStanding, pxRect, rectOf, resizeDeco, resizeWindow, setScreenCard, SHELF_GAP_CM, SHELF_INNER_CM, boardItems, boardUsedCm, displayOf, shelfBoardsOf, shelfLayoutOf, storeCard, stretchWindow, toggleLamp, type Cell, type PxRect, type Rect, type StoredLike,
} from '../core/library/room-grid';
import { forgetUnlinkOnMove } from '../core/library/shelf-link';

// Id de l'objet neuf tant qu'il n'est pas enregistré (renommé au ✓).
export const DRAFT_ID = '__draft__';

// Ce qu'on place : une vignette du tiroir, une carte choisie, ou un objet déjà posé.
export type Subject = { type: 'new'; kind: FurnitureKind } | { type: 'card'; choice: CardChoice } | { type: 'move'; id: string };
// Retouches faites pendant le placement, rejouées après chaque déplacement du fantôme.
export type Edit = { type: 'lamp' } | { type: 'size'; w: number; h: number } | { type: 'stretch'; axis: 'width' | 'height' };
// Point visé : case (col, row) et position dans le dessin (x, y).
export type Spot = { col: number; row: number; x: number; y: number };
export type Placement = {
  subject: Subject;
  id: string;
  // Disposition enregistrée au début du placement.
  base: Layout;
  // Forme de l'objet neuf, pour viser avant qu'il soit posé (null pour un déplacement ou une carte d'écran).
  probe: Placed | null;
  spot: Spot;
  target: DropTarget;
  edits: Edit[];
  // Ce qu'on dessine : la disposition avec l'objet à la position visée (de force si elle est refusée).
  draft: Layout;
  // Angle de l'objet (meubles debout) ; 0 pour ce qui ne tourne pas.
  angle: Angle;
  // Présentation choisie pendant le placement d'un objet rangé (de face / sur la tranche) ; absente : la sienne.
  display?: StoredDisplay;
};
export type PlacingView = { id: string; ok: boolean; ghost: Rect | null; ghostPx?: GhostPx; floor?: Cell[] };

export const spotAt = (col: number, row: number): Spot => ({ col, row, x: col * CELL_W + CELL_W / 2, y: row * CELL_H + CELL_H / 2 });
const spotOfPx = (x: number, y: number): Spot => ({ col: Math.floor(x / CELL_W), row: Math.floor(y / CELL_H), x, y });

const isScreen = (s: Subject): boolean => s.type === 'card' && s.choice.target === 'screen';

function probeOf(subject: Subject): Placed | null {
  if (subject.type === 'move') return null;
  if (subject.type === 'card') {
    const c = subject.choice;
    if (c.target === 'wall') return { id: DRAFT_ID, kind: 'wall', shape: c.shape, col: 0, row: 0, slug: c.slug, ...(c.color ? { color: c.color } : {}) };
    if (c.target === 'shelf') return { id: DRAFT_ID, kind: 'stored', shape: c.shape, shelfId: '', level: 0, order: 0, slug: c.slug };
    return null;
  }
  const kind = subject.kind;
  if (kind === 'window') return { id: DRAFT_ID, kind: 'window', col: 0, row: 0, ...WINDOW_DEFAULT };
  if (isDecoKind(kind)) return { id: DRAFT_ID, kind: 'deco', deco: kind, col: 0, row: 0, ...(isPanel(kind) ? decoDefaultSize(kind) : {}) };
  if (kind === 'computer') return { id: DRAFT_ID, kind: 'computer', deskId: '' };
  if (isSmallKind(kind)) return { id: DRAFT_ID, kind: 'small', item: SMALL_ITEM_OF[kind], hostId: '', x: 0, z: 0 };
  if (isStandingKind(kind)) return { id: DRAFT_ID, kind, col: 0, row: 0 };
  return null;
}

const withProbe = (layout: Layout, probe: Placed | null): Layout => (!probe || layout.some((x) => x.id === probe.id) ? layout : [...layout, probe]);

// L'objet rangé `id` sous la présentation `display` (sans effet si elle est absente).
const withDisplay = (layout: Layout, id: string, display: StoredDisplay | undefined): Layout =>
  display === undefined ? layout : layout.map((x) => (x.id === id && x.kind === 'stored' ? { ...x, display } : x));

// Pose de force (sans vérification) d'un objet à case : meuble debout, fenêtre, objet accroché.
function withItemAt(layout: Layout, id: string, col: number, top: number): Layout {
  return layout.map((x) => (x.id === id && 'col' in x ? ({ ...x, col, row: top } as Placed) : x));
}

// Le rectangle d'un objet, ou celui de son porteur (ordinateur, petit objet, carte rangée).
function rectFor(layout: Layout, item: Placed): Rect | null {
  const own = rectOf(item);
  if (own) return own;
  const hostId = item.kind === 'computer' ? item.deskId : item.kind === 'small' ? item.hostId : item.kind === 'stored' ? item.shelfId : null;
  const host = hostId ? layout.find((x) => x.id === hostId) : undefined;
  return host ? rectOf(host) : null;
}

// Carte d'écran : l'ordinateur posé sur le bureau qui contient la case.
function screenTarget(layout: Layout, spot: Spot): DropTarget {
  const deskId = deskAtCell(layout, spot.col, spot.row);
  const pc = deskId ? layout.find((x) => x.kind === 'computer' && x.deskId === deskId) : undefined;
  const desk = deskId ? layout.find((x) => x.id === deskId) : undefined;
  if (!pc || !desk) return { ok: false, reason: 'not-screen', cells: [{ col: spot.col, row: spot.row }], ghost: { col: spot.col, row: spot.row, w: 1, h: 1 } };
  return { ok: true, cells: [], ghost: rectOf(desk), computerId: pc.id };
}

function aim(layout: Layout, cols: number, p: Placement, spot: Spot): DropTarget {
  if (isScreen(p.subject)) return screenTarget(layout, spot);
  return dropTargetFor(layout, cols, p.id, spot.col, spot.row, spot.x, spot.y);
}

// Construit la disposition avec l'objet à la cible valide, par les fonctions de pose existantes ; null si elles refusent.
function build(p: Placement, cols: number, t: DropTarget): Layout | null {
  const base = withDisplay(p.base, p.id, p.display);
  const s = p.subject;
  if (s.type === 'move') {
    const item = base.find((x) => x.id === p.id);
    if (!item) return null;
    if (item.kind === 'computer') return t.deskId ? moveComputer(base, p.id, t.deskId) : null;
    if (item.kind === 'small') return t.hostId ? moveSmall(base, p.id, t.hostId) : null;
    if (item.kind === 'stored') return t.shelfId !== undefined && t.level !== undefined && t.order !== undefined ? moveStored(base, p.id, t.shelfId, t.level, t.order) : null;
    if (t.col === undefined || t.top === undefined) return null;
    // Fenêtre : la cible a été validée à sa taille courante (retouchée) ; elle est posée là, puis sa taille est rejouée.
    if (item.kind === 'window' || item.kind === 'deco') return withItemAt(base, p.id, t.col, t.top);
    if (item.kind === 'wall') return moveHung(base, cols, p.id, t.col, t.top);
    return moveStanding(base, cols, p.id, t.col, t.top, p.angle);
  }
  if (s.type === 'card') {
    const c = s.choice;
    if (c.target === 'screen') return t.computerId ? setScreenCard(base, t.computerId, c.slug) : null;
    if (c.target === 'shelf') return t.shelfId !== undefined && t.level !== undefined && t.order !== undefined ? storeCard(base, t.shelfId, t.level, t.order, c.shape, c.slug, DRAFT_ID, p.display) : null;
    return t.col !== undefined && t.top !== undefined ? hang(base, cols, c.shape, t.col, t.top, c.slug, DRAFT_ID, c.color) : null;
  }
  const kind = s.kind;
  // Fenêtre neuve : posée de force à la cible (validée avec sa taille courante), la taille est rejouée ensuite.
  if (kind === 'window') return t.col !== undefined && t.top !== undefined ? withItemAt(withProbe(base, p.probe), DRAFT_ID, t.col, t.top) : null;
  // Objet décoratif neuf (horloge, météomètre, panneau) : posé comme la fenêtre, sa taille est rejouée ensuite.
  if (isDecoKind(kind)) return t.col !== undefined && t.top !== undefined ? withItemAt(withProbe(base, p.probe), DRAFT_ID, t.col, t.top) : null;
  if (kind === 'computer') return t.deskId ? placeComputer(base, t.deskId, DRAFT_ID) : null;
  if (isSmallKind(kind)) return t.hostId ? placeSmall(base, t.hostId, SMALL_ITEM_OF[kind], DRAFT_ID) : null;
  if (isStandingKind(kind)) return t.col !== undefined && t.top !== undefined ? placeStanding(base, cols, kind, t.col, t.top, DRAFT_ID, p.angle) : null;
  return null;
}

// Fantôme refusé : un objet à case est dessiné là où on l'a mis ; un objet à porteur n'est pas dessiné (seule l'empreinte rouge l'est).
function force(p: Placement, t: DropTarget): Layout {
  const fresh = withProbe(p.base, p.probe);
  const item = fresh.find((x) => x.id === p.id);
  if (item && 'col' in item && t.col !== undefined && t.top !== undefined) return setAngle(withItemAt(fresh, p.id, t.col, t.top), p.id, p.angle);
  // Objet rangé : à sa place, sous la présentation choisie (on voit qu'il déborde).
  return withDisplay(p.base, p.id, p.display);
}

function applyEdit(layout: Layout, cols: number, id: string, e: Edit): Layout | null {
  if (!layout.some((x) => x.id === id)) return null;
  if (e.type === 'lamp') {
    const next = toggleLamp(layout, id);
    return next === layout ? null : next;
  }
  if (e.type === 'size') return layout.find((x) => x.id === id)?.kind === 'deco' ? resizeDeco(layout, cols, id, e.w, e.h) : resizeWindow(layout, cols, id, e.w, e.h);
  const r = stretchWindow(layout, cols, id, e.axis);
  return r.ok ? r.layout : null;
}

const replay = (layout: Layout, cols: number, id: string, edits: Edit[]): Layout =>
  edits.reduce((l, e) => applyEdit(l, cols, id, e) ?? l, layout);

// Une nouvelle présentation qui élargit l'objet sur sa propre tablette (où il change toujours de rang librement) doit encore y tenir.
function widensTooMuch(p: Placement, built: Layout): boolean {
  const item = built.find((x) => x.id === p.id);
  if (p.display === undefined || item?.kind !== 'stored') return false;
  const used = boardUsedCm(boardItems(built, item.shelfId, item.level));
  return used > SHELF_INNER_CM + 1e-9 && used > boardUsedCm(boardItems(p.base, item.shelfId, item.level)) + 1e-9;
}

function settle(p: Placement, cols: number, spot: Spot): Placement {
  const aimAt = setAngle(withDisplay(withProbe(p.draft, p.probe), p.id, p.display), p.id, p.angle);
  let target = aim(aimAt, cols, p, spot);
  let built = target.ok ? build(p, cols, target) : null;
  if (built && widensTooMuch(p, built)) {
    built = null;
    target = { ...target, ok: false, reason: 'shelf-full' };
  }
  const shown = replay(built ?? force(p, target), cols, p.id, p.edits);
  return { ...p, spot, target: built ? target : { ...target, ok: false }, draft: shown };
}

// Où se trouve aujourd'hui un objet posé (pour partir de sa place).
function anchorOf(layout: Layout, id: string): Spot | null {
  const item = layout.find((x) => x.id === id);
  if (!item) return null;
  if (item.kind === 'stored') {
    const box = shelfLayoutOf(layout, item.shelfId).find((b) => b.id === id);
    return box ? spotOfPx(box.x + box.w / 2, box.y + box.h / 2) : null;
  }
  const r = rectFor(layout, item);
  return r ? spotAt(r.col, r.row + r.h - 1) : null;
}

// Points à essayer, du plus proche au plus loin du centre ; pour une carte rangée, en plus, le bout libre de chaque tablette.
function candidates(layout: Layout, cols: number, subject: Subject, center: Spot): Spot[] {
  const spots: Spot[] = [];
  for (let col = 0; col < cols; col++) for (let row = 0; row < ROWS; row++) spots.push(spotAt(col, row));
  if (subject.type === 'card' && subject.choice.target === 'shelf') {
    for (const shelf of layout.filter((x) => x.kind === 'shelf')) {
      for (const b of shelfBoardsOf(shelf)) spots.push(freeEndOf(layout, shelf.id, b.level) ?? spotOfPx(b.x + b.w / 2, b.y + b.h / 2));
    }
  }
  const d = (s: Spot): number => (s.x - center.x) ** 2 + (s.y - center.y) ** 2;
  return spots.sort((a, b) => d(a) - d(b));
}

// Point juste après le dernier objet d'une tablette (là où un objet de plus irait), au milieu de sa hauteur ; null si la face est cachée.
function freeEndOf(layout: Layout, shelfId: string, level: ShelfLevel): Spot | null {
  const shelf = layout.find((x) => x.id === shelfId);
  const board = shelf ? shelfBoardsOf(shelf).find((b) => b.level === level) : undefined;
  if (!board) return null;
  const items = shelfLayoutOf(layout, shelfId).filter((b) => b.level === level);
  const last = items[items.length - 1];
  // Repère de la face : un demi-centimètre après l'écart qui suit le dernier objet (ou après le bord gauche), à mi-hauteur de la tablette.
  const cm = (last ? last.x0Cm + last.wCm + SHELF_GAP_CM : 0) + 0.5;
  const u = cm * (board.local.w / SHELF_INNER_CM);
  const v = board.local.y + board.local.h / 2;
  const [x, y] = applyMatrix(board.m, u, v);
  return spotOfPx(x, y);
}

export function startPlacement(layout: Layout, cols: number, subject: Subject, center: Spot): Placement {
  const moved = subject.type === 'move' ? layout.find((x) => x.id === subject.id) : undefined;
  const p0: Placement = {
    subject,
    id: subject.type === 'move' ? subject.id : DRAFT_ID,
    base: layout,
    probe: probeOf(subject),
    spot: center,
    target: { ok: false, cells: [], ghost: null },
    edits: [],
    draft: layout,
    angle: moved ? angleOf(moved) : 0,
  };
  if (subject.type === 'move') {
    const here = anchorOf(layout, subject.id);
    if (here) return settle(p0, cols, here);
  }
  const aimAt = setAngle(withProbe(layout, p0.probe), p0.id, p0.angle);
  for (const spot of candidates(layout, cols, subject, center)) {
    if (!aim(aimAt, cols, p0, spot).ok) continue;
    const s = settle(p0, cols, spot);
    if (s.target.ok) return s;
  }
  return settle(p0, cols, center);
}

export const movePlacement = (p: Placement, cols: number, spot: Spot): Placement => settle(p, cols, spot);

// Toucher un meuble pendant le placement : le fantôme vise ce meuble (porteur, étagère, ordinateur) ou sa case du bas à gauche.
export function moveToItem(p: Placement, cols: number, itemId: string): Placement {
  const item = p.base.find((x) => x.id === itemId);
  if (!item) return p;
  const r = rectFor(p.base, item);
  if (!r) return p;
  const wantsSlot = (p.subject.type === 'card' && p.subject.choice.target === 'shelf') || p.base.find((x) => x.id === p.id)?.kind === 'stored';
  if (wantsSlot && item.kind === 'shelf') {
    // La première tablette où l'objet tient, à la suite de ses objets.
    const moving = p.base.find((x) => x.id === p.id);
    const probe: StoredLike | null = p.subject.type === 'card' && p.subject.choice.target === 'shelf' ? { shape: p.subject.choice.shape } : moving?.kind === 'stored' ? moving : null;
    // Sondée sous la présentation choisie pendant le placement (couverture ou tranche), pas celle d'origine.
    const free = probe ? firstFreeBoard(p.base, item.id, { ...probe, display: p.display ?? probe.display }) : null;
    const spot = free ? freeEndOf(p.base, item.id, free.level) : null;
    if (spot) return settle(p, cols, spot);
  }
  const px = pxRect(r);
  return settle(p, cols, { col: r.col, row: r.row + r.h - 1, x: px.x + px.w / 2, y: px.y + px.h / 2 });
}

// Avancer (+1) / Reculer (-1) : le fantôme descend ou remonte d'une ligne ; null si la ligne visée est refusée.
export function nudgePlacement(p: Placement, cols: number, delta: 1 | -1): Placement | null {
  const next = settle(p, cols, { ...p.spot, row: p.spot.row + delta, y: p.spot.y + delta * CELL_H });
  return next.target.ok ? next : null;
}

// ◀ (−1) / ▶ (+1) : le fantôme glisse d'une demi-colonne ; refusé, il reste dessiné en rouge (comme pendant un glissé).
// null pour un objet sans case (ordinateur, petit objet, carte rangée ou d'écran) : il suit son porteur.
export const canSlide = (p: Placement): boolean => p.target.col !== undefined && !isScreen(p.subject);

export function slidePlacement(p: Placement, cols: number, dir: 1 | -1): Placement | null {
  if (!canSlide(p)) return null;
  const col = p.spot.col + dir / 2;
  return settle(p, cols, { ...p.spot, col, x: p.spot.x + (dir * CELL_W) / 2 });
}

// Seuls les meubles debout tournent (pas les fenêtres, cartes, ordinateurs ni petits objets).
export function canRotate(p: Placement): boolean {
  const item = withProbe(p.draft, p.probe).find((x) => x.id === p.id);
  return item !== undefined && isStanding(item);
}

// ⟲ (+1) / ⟳ (−1) : l'objet tourne sur place ; s'il ne tient pas à cet angle, il est dessiné tourné et refusé.
export function rotatePlacement(p: Placement, cols: number, dir: 1 | -1): Placement | null {
  if (!canRotate(p)) return null;
  const angle = rotateAngle(p.angle, dir);
  return settle({ ...p, angle, draft: setAngle(p.draft, p.id, angle) }, cols, p.spot);
}

// Couverture ↔ tranche pendant le placement d'un objet rangé (déplacé ou carte neuve) : le fantôme est recalculé à la même visée ;
// refusé (« Plus de place sur cette tablette. ») s'il ne tient plus. Rien n'est enregistré avant ✓.
export function displayPlacement(p: Placement, cols: number, display: StoredDisplay): Placement {
  // Visée : le centre de l'objet à sa place, sous sa nouvelle présentation (il garde sa tablette et son rang).
  const item = p.draft.find((x) => x.id === p.id);
  const box = item?.kind === 'stored' ? shelfLayoutOf(withDisplay(p.draft, p.id, display), item.shelfId).find((b) => b.id === p.id) : undefined;
  return settle({ ...p, display }, cols, box ? spotOfPx(box.x + box.w / 2, box.y + box.h / 2) : p.spot);
}

// Présentation montrée pendant le placement d'un objet rangé ; null pour un autre objet.
export function displayOfPlacement(p: Placement): StoredDisplay | null {
  if (p.subject.type === 'card') return p.subject.choice.target === 'shelf' ? (p.display ?? displayOf({ shape: p.subject.choice.shape })) : null;
  const item = p.base.find((x) => x.id === p.id);
  return item?.kind === 'stored' ? (p.display ?? displayOf(item)) : null;
}

export function editPlacement(p: Placement, cols: number, edit: Edit): Placement | null {
  const next = applyEdit(p.draft, cols, p.id, edit);
  if (!next) return null;
  return settle({ ...p, draft: next, edits: [...p.edits, edit] }, cols, p.spot);
}

// Disposition finale à enregistrer, l'id provisoire remplacé ; null si la cible est refusée.
// Bibliothèque déplacée ou tournée : son refus de lien (⛓) est oublié.
export function commitPlacement(p: Placement): Layout | null {
  if (!p.target.ok) return null;
  if (p.subject.type === 'move') return forgetUnlinkOnMove(p.base, p.draft, p.id);
  if (!p.draft.some((x) => x.id === DRAFT_ID)) return p.draft;
  const id = nextFurnitureId(p.base);
  return p.draft.map((x) => (x.id === DRAFT_ID ? ({ ...x, id } as Placed) : x));
}

export const placingView = (p: Placement): PlacingView => ({
  id: isScreen(p.subject) ? (p.target.computerId ?? '') : p.id,
  ok: p.target.ok,
  ghost: p.target.ghost,
  ...(p.target.ghostPx ? { ghostPx: p.target.ghostPx } : {}),
  ...(p.target.floor ? { floor: p.target.floor } : {}),
});
