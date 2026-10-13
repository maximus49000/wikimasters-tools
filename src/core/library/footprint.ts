import { footOf, layerOf, poisOf, sizeOf, type Poi } from './furniture-catalog';
import type { StandingKind } from './library-types';
import type { Cell, PxRect, Rect } from './room-grid';

// Huit angles par pas de 45° : 0 face, 1 ¾ avant gauche, 2 profil gauche, 3 ¾ dos gauche, 4 dos, 5 ¾ dos droit, 6 profil droit, 7 ¾ avant droit.
export type Angle = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const isAngle = (v: unknown): v is Angle => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 7;
export const rotateAngle = (a: Angle, dir: 1 | -1): Angle => (((a + dir) % 8) + 8) % 8 as Angle;

const isSide = (a: Angle): boolean => a === 2 || a === 6;
const isDiagonal = (a: Angle): boolean => a % 2 === 1;
// L'escalier d'une diagonale descend vers la droite (1, 3) ou vers la gauche (5, 7).
const descendsRight = (a: Angle): boolean => a === 1 || a === 3;

// Rangées au sol de face : le pied (au moins une, au plus la hauteur) ; un tapis est entièrement au sol.
function footRows(kind: StandingKind): number {
  const { h } = sizeOf(kind);
  return layerOf(kind) === 'rug' ? h : Math.min(h, Math.max(1, footOf(kind)));
}

// De profil ou en diagonale, la largeur devient de la profondeur, comptée à moitié (perspective du sol).
const depthRows = (kind: StandingKind): number => Math.max(1, Math.ceil(sizeOf(kind).w / 2));

export function drawSize(kind: StandingKind, angle: Angle): { w: number; h: number } {
  const { w, h } = sizeOf(kind);
  if (!isSide(angle) && !isDiagonal(angle)) return { w, h };
  const foot = footRows(kind);
  const depth = depthRows(kind);
  const width = isSide(angle) ? foot : Math.ceil((w + foot) * 0.75);
  return { w: width, h: h - foot + depth };
}

export function drawRect(kind: StandingKind, angle: Angle, col: number, row: number): Rect {
  return { col, row, ...drawSize(kind, angle) };
}

export function floorOffsets(kind: StandingKind, angle: Angle): Cell[] {
  const { w: W, h: H } = drawSize(kind, angle);
  const cells: Cell[] = [];
  if (!isDiagonal(angle)) {
    const rows = isSide(angle) ? depthRows(kind) : footRows(kind);
    for (let row = H - rows; row < H; row++) for (let col = 0; col < W; col++) cells.push({ col, row });
    return cells;
  }
  const D = depthRows(kind);
  const T = Math.max(1, Math.min(W, Math.ceil(W / D) + 1));
  for (let r = 0; r < D; r++) {
    const start = D === 1 ? 0 : Math.round((r * (W - T)) / (D - 1));
    for (let c = start; c < start + T; c++) cells.push({ col: descendsRight(angle) ? c : W - 1 - c, row: H - D + r });
  }
  return cells;
}

export function floorCells(kind: StandingKind, angle: Angle, col: number, row: number): Cell[] {
  return floorOffsets(kind, angle).map((c) => ({ col: col + c.col, row: row + c.row }));
}

// Points d'intérêt (animaux) recalés dans le rectangle de l'angle : même distance au bas du meuble, colonne à la même proportion.
export function poisAt(kind: StandingKind, angle: Angle): Poi[] {
  const pois = poisOf(kind);
  if (angle === 0) return [...pois];
  const front = sizeOf(kind);
  const { w, h } = drawSize(kind, angle);
  const mirror = angle >= 4;
  return pois.map((p) => {
    const fromBottom = front.h - 1 - p.dy;
    const u = (mirror ? front.w - 1 - p.dx : p.dx) / Math.max(1, front.w);
    return { ...p, dx: Math.min(w - 1, Math.max(0, Math.floor(u * w))), dy: Math.min(h - 1, Math.max(0, h - 1 - fromBottom)) };
  });
}

// Marge du haut d'un dessin tourné (le dessus du meuble remonte vers le fond) ; même valeur que le projecteur.
export const FACE_MARGIN = 0.1;

// Face avant visible (où se dessinent les cartes rangées et l'écran) : toute la face à 0, 70 % à gauche à 1, à droite à 7 ; null sinon.
export function frontFaceRect(angle: Angle, rect: PxRect): PxRect | null {
  if (angle === 0) return rect;
  if (angle !== 1 && angle !== 7) return null;
  const top = rect.h * FACE_MARGIN;
  return { x: angle === 1 ? rect.x : rect.x + rect.w * 0.3, y: rect.y + top, w: rect.w * 0.7, h: rect.h - top };
}
