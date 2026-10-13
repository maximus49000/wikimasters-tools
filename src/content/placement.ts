import type { CardChoice } from './CardPickerDialog';
import { deskAtCell, dropTargetFor, type DropTarget } from './furniture-drag';
import { SMALL_ITEM_OF, WINDOW_DEFAULT, isSmallKind, isStandingKind } from '../core/library/furniture-catalog';
import { nextFurnitureId } from '../core/library/library-book';
import type { FurnitureKind, Layout, Placed } from '../core/library/library-types';
import {
  CELL_H, CELL_W, ROWS, firstFreeSlot, hang, moveComputer, moveHung, moveSmall, moveStanding, moveStored, moveWindow, placeComputer, placeSmall,
  placeStanding, pxRect, rectOf, resizeWindow, setScreenCard, shelfSlots, shiftDepth, storeCard, stretchWindow, toggleLamp, type PxRect, type Rect,
} from '../core/library/room-grid';

// Id de l'objet neuf tant qu'il n'est pas enregistré (renommé au ✓).
export const DRAFT_ID = '__draft__';

// Ce qu'on place : une vignette du tiroir, une carte choisie, ou un objet déjà posé.
export type Subject = { type: 'new'; kind: FurnitureKind } | { type: 'card'; choice: CardChoice } | { type: 'move'; id: string };
// Retouches faites pendant le placement, rejouées après chaque déplacement du fantôme.
export type Edit = { type: 'depth'; delta: 1 | -1 } | { type: 'lamp' } | { type: 'size'; w: number; h: number } | { type: 'stretch'; axis: 'width' | 'height' };
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
};
export type PlacingView = { id: string; ok: boolean; ghost: Rect | null; ghostPx?: PxRect };

export const spotAt = (col: number, row: number): Spot => ({ col, row, x: col * CELL_W + CELL_W / 2, y: row * CELL_H + CELL_H / 2 });
const spotOfPx = (x: number, y: number): Spot => ({ col: Math.floor(x / CELL_W), row: Math.floor(y / CELL_H), x, y });

const isScreen = (s: Subject): boolean => s.type === 'card' && s.choice.target === 'screen';

function probeOf(subject: Subject): Placed | null {
  if (subject.type === 'move') return null;
  if (subject.type === 'card') {
    const c = subject.choice;
    if (c.target === 'wall') return { id: DRAFT_ID, kind: 'wall', shape: c.shape, col: 0, row: 0, slug: c.slug, ...(c.color ? { color: c.color } : {}) };
    if (c.target === 'shelf') return { id: DRAFT_ID, kind: 'stored', shape: c.shape, shelfId: '', slot: 0, slug: c.slug };
    return null;
  }
  const kind = subject.kind;
  if (kind === 'window') return { id: DRAFT_ID, kind: 'window', col: 0, row: 0, ...WINDOW_DEFAULT };
  if (kind === 'computer') return { id: DRAFT_ID, kind: 'computer', deskId: '' };
  if (isSmallKind(kind)) return { id: DRAFT_ID, kind: 'small', item: SMALL_ITEM_OF[kind], hostId: '', slot: 0 };
  if (isStandingKind(kind)) return { id: DRAFT_ID, kind, col: 0, row: 0 };
  return null;
}

const withProbe = (layout: Layout, probe: Placed | null): Layout => (!probe || layout.some((x) => x.id === probe.id) ? layout : [...layout, probe]);

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
  const base = p.base;
  const s = p.subject;
  if (s.type === 'move') {
    const item = base.find((x) => x.id === p.id);
    if (!item) return null;
    if (item.kind === 'computer') return t.deskId ? moveComputer(base, p.id, t.deskId) : null;
    if (item.kind === 'small') return t.hostId ? moveSmall(base, p.id, t.hostId) : null;
    if (item.kind === 'stored') return t.shelfId !== undefined && t.slot !== undefined ? moveStored(base, p.id, t.shelfId, t.slot) : null;
    if (t.col === undefined || t.top === undefined) return null;
    if (item.kind === 'window') return moveWindow(base, cols, p.id, t.col, t.top);
    if (item.kind === 'wall') return moveHung(base, cols, p.id, t.col, t.top);
    return moveStanding(base, cols, p.id, t.col, t.top);
  }
  if (s.type === 'card') {
    const c = s.choice;
    if (c.target === 'screen') return t.computerId ? setScreenCard(base, t.computerId, c.slug) : null;
    if (c.target === 'shelf') return t.shelfId !== undefined && t.slot !== undefined ? storeCard(base, t.shelfId, t.slot, c.shape, c.slug, DRAFT_ID) : null;
    return t.col !== undefined && t.top !== undefined ? hang(base, cols, c.shape, t.col, t.top, c.slug, DRAFT_ID, c.color) : null;
  }
  const kind = s.kind;
  // Fenêtre neuve : posée de force à la cible (validée avec sa taille courante), la taille est rejouée ensuite.
  if (kind === 'window') return t.col !== undefined && t.top !== undefined ? withItemAt(withProbe(base, p.probe), DRAFT_ID, t.col, t.top) : null;
  if (kind === 'computer') return t.deskId ? placeComputer(base, t.deskId, DRAFT_ID) : null;
  if (isSmallKind(kind)) return t.hostId ? placeSmall(base, t.hostId, SMALL_ITEM_OF[kind], DRAFT_ID) : null;
  if (isStandingKind(kind)) return t.col !== undefined && t.top !== undefined ? placeStanding(base, cols, kind, t.col, t.top, DRAFT_ID) : null;
  return null;
}

// Fantôme refusé : un objet à case est dessiné là où on l'a mis ; un objet à porteur n'est pas dessiné (seule l'empreinte rouge l'est).
function force(p: Placement, t: DropTarget): Layout {
  const fresh = withProbe(p.base, p.probe);
  const item = fresh.find((x) => x.id === p.id);
  if (item && 'col' in item && t.col !== undefined && t.top !== undefined) return withItemAt(fresh, p.id, t.col, t.top);
  return p.base;
}

function applyEdit(layout: Layout, cols: number, id: string, e: Edit): Layout | null {
  if (!layout.some((x) => x.id === id)) return null;
  if (e.type === 'depth') return shiftDepth(layout, id, e.delta);
  if (e.type === 'lamp') {
    const next = toggleLamp(layout, id);
    return next === layout ? null : next;
  }
  if (e.type === 'size') return resizeWindow(layout, cols, id, e.w, e.h);
  const r = stretchWindow(layout, cols, id, e.axis);
  return r.ok ? r.layout : null;
}

const replay = (layout: Layout, cols: number, id: string, edits: Edit[]): Layout =>
  edits.reduce((l, e) => applyEdit(l, cols, id, e) ?? l, layout);

function settle(p: Placement, cols: number, spot: Spot): Placement {
  const target = aim(withProbe(p.draft, p.probe), cols, p, spot);
  const built = target.ok ? build(p, cols, target) : null;
  const shown = replay(built ?? force(p, target), cols, p.id, p.edits);
  return { ...p, spot, target: built ? target : { ...target, ok: false }, draft: shown };
}

// Où se trouve aujourd'hui un objet posé (pour partir de sa place).
function anchorOf(layout: Layout, id: string): Spot | null {
  const item = layout.find((x) => x.id === id);
  if (!item) return null;
  if (item.kind === 'stored') {
    const shelf = layout.find((x) => x.id === item.shelfId);
    const r = shelf ? rectOf(shelf) : null;
    const box = r ? shelfSlots(pxRect(r))[item.slot] : undefined;
    return box ? spotOfPx(box.x + box.w / 2, box.y + box.h / 2) : null;
  }
  const r = rectFor(layout, item);
  return r ? spotAt(r.col, r.row + r.h - 1) : null;
}

// Points à essayer, du plus proche au plus loin du centre ; les emplacements d'étagère en plus pour une carte rangée.
function candidates(layout: Layout, cols: number, subject: Subject, center: Spot): Spot[] {
  const spots: Spot[] = [];
  for (let col = 0; col < cols; col++) for (let row = 0; row < ROWS; row++) spots.push(spotAt(col, row));
  if (subject.type === 'card' && subject.choice.target === 'shelf') {
    for (const shelf of layout.filter((x) => x.kind === 'shelf')) {
      const r = rectOf(shelf);
      if (r) for (const b of shelfSlots(pxRect(r))) spots.push(spotOfPx(b.x + b.w / 2, b.y + b.h / 2));
    }
  }
  const d = (s: Spot): number => (s.x - center.x) ** 2 + (s.y - center.y) ** 2;
  return spots.sort((a, b) => d(a) - d(b));
}

export function startPlacement(layout: Layout, cols: number, subject: Subject, center: Spot): Placement {
  const p0: Placement = {
    subject,
    id: subject.type === 'move' ? subject.id : DRAFT_ID,
    base: layout,
    probe: probeOf(subject),
    spot: center,
    target: { ok: false, cells: [], ghost: null },
    edits: [],
    draft: layout,
  };
  if (subject.type === 'move') {
    const here = anchorOf(layout, subject.id);
    if (here) return settle(p0, cols, here);
  }
  const aimAt = withProbe(layout, p0.probe);
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
    const slot = firstFreeSlot(p.base, item.id);
    const box = slot === null ? undefined : shelfSlots(pxRect(r))[slot];
    if (box) return settle(p, cols, spotOfPx(box.x + box.w / 2, box.y + box.h / 2));
  }
  const px = pxRect(r);
  return settle(p, cols, { col: r.col, row: r.row + r.h - 1, x: px.x + px.w / 2, y: px.y + px.h / 2 });
}

export function editPlacement(p: Placement, cols: number, edit: Edit): Placement | null {
  const next = applyEdit(p.draft, cols, p.id, edit);
  if (!next) return null;
  return settle({ ...p, draft: next, edits: [...p.edits, edit] }, cols, p.spot);
}

// Disposition finale à enregistrer, l'id provisoire remplacé ; null si la cible est refusée.
export function commitPlacement(p: Placement): Layout | null {
  if (!p.target.ok) return null;
  if (!p.draft.some((x) => x.id === DRAFT_ID)) return p.draft;
  const id = nextFurnitureId(p.base);
  return p.draft.map((x) => (x.id === DRAFT_ID ? ({ ...x, id } as Placed) : x));
}

export const placingView = (p: Placement): PlacingView => ({
  id: isScreen(p.subject) ? (p.target.computerId ?? '') : p.id,
  ok: p.target.ok,
  ghost: p.target.ghost,
  ...(p.target.ghostPx ? { ghostPx: p.target.ghostPx } : {}),
});
