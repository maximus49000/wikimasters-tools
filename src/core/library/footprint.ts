import type { Poi } from './furniture-catalog';
import { FURNITURE_MODELS } from './furniture-models';
import { CELL_H, CELL_W, frontFaceOf, poisOf3d, renderModel, type Rendered } from './furniture-render3d';
import type { StandingKind } from './library-types';
import type { Cell, PxRect, Rect } from './room-grid';

// Huit angles par pas de 45° : 0 face, 1 ¾ avant gauche, 2 profil gauche, 3 ¾ dos gauche, 4 dos, 5 ¾ dos droit, 6 profil droit, 7 ¾ avant droit.
export type Angle = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const isAngle = (v: unknown): v is Angle => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 7;
export const rotateAngle = (a: Angle, dir: 1 | -1): Angle => (((a + dir) % 8) + 8) % 8 as Angle;

// Rendu du modèle 3D tourné, mis en cache par (meuble, angle) : il est demandé à chaque rendu de la pièce et coûte jusqu'à ~2 ms.
const cache = new Map<string, Rendered>();
export function renderedOf(kind: StandingKind, angle: Angle): Rendered {
  const key = `${kind}:${angle}`;
  let r = cache.get(key);
  if (!r) {
    r = renderModel(FURNITURE_MODELS[kind], angle);
    cache.set(key, r);
  }
  return r;
}

// Rectangle de dessin (en cases) du meuble tourné : rectangle englobant de ses faces projetées.
export function drawSize(kind: StandingKind, angle: Angle): { w: number; h: number } {
  const r = renderedOf(kind, angle);
  return { w: r.cols, h: r.rows };
}

export function drawRect(kind: StandingKind, angle: Angle, col: number, row: number): Rect {
  return { col, row, ...drawSize(kind, angle) };
}

// Cases au sol relatives au coin haut-gauche : trace du pied tournée, cases couvertes à plus de 50 % (copies : le cache reste intact).
export const floorOffsets = (kind: StandingKind, angle: Angle): Cell[] => renderedOf(kind, angle).floor.map((c) => ({ ...c }));

export function floorCells(kind: StandingKind, angle: Angle, col: number, row: number): Cell[] {
  return floorOffsets(kind, angle).map((c) => ({ col: col + c.col, row: row + c.row }));
}

// Points d'intérêt (animaux) tirés du modèle et tournés avec lui, en cases du rectangle de l'angle.
const poiCache = new Map<string, Poi[]>();
export function poisAt(kind: StandingKind, angle: Angle): Poi[] {
  const key = `${kind}:${angle}`;
  let pois = poiCache.get(key);
  if (!pois) {
    pois = poisOf3d(FURNITURE_MODELS[kind], angle).map((p) => ({ type: p.type, dx: p.col, dy: p.row }));
    poiCache.set(key, pois);
  }
  return pois.map((p) => ({ ...p }));
}

// Marge du haut d'un dessin tourné (le dessus du meuble remonte vers le fond) ; même valeur que le projecteur.
export const FACE_MARGIN = 0.1;

// Face avant projetée du modèle (px du rectangle de dessin à l'échelle 1), null si cachée ; mise en cache par (meuble, angle) :
// elle est demandée à chaque rendu et à chaque mouvement du doigt (emplacements d'étagère).
const faceCache = new Map<string, PxRect | null>();
function modelFace(kind: StandingKind, angle: Angle): PxRect | null {
  const key = `${kind}:${angle}`;
  if (!faceCache.has(key)) faceCache.set(key, frontFaceOf(FURNITURE_MODELS[kind], angle));
  return faceCache.get(key)!;
}

// Face avant visible (où se dessinent les cartes rangées et l'écran), visible de face et de ¾ avant seulement ; null sinon.
// Avec le meuble : face projetée de son modèle, mise à l'échelle du rectangle. Sans (fenêtres) : toute la face à 0, 70 % à gauche à 1, à droite à 7.
export function frontFaceRect(angle: Angle, rect: PxRect, kind?: StandingKind): PxRect | null {
  if (kind) {
    const face = modelFace(kind, angle);
    if (!face) return null;
    const { w, h } = drawSize(kind, angle);
    const sx = rect.w / (w * CELL_W);
    const sy = rect.h / (h * CELL_H);
    return { x: rect.x + face.x * sx, y: rect.y + face.y * sy, w: face.w * sx, h: face.h * sy };
  }
  if (angle === 0) return rect;
  if (angle !== 1 && angle !== 7) return null;
  const top = rect.h * FACE_MARGIN;
  return { x: angle === 1 ? rect.x : rect.x + rect.w * 0.3, y: rect.y + top, w: rect.w * 0.7, h: rect.h - top };
}
