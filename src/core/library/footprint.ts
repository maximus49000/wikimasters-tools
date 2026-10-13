import type { Poi, PoiType } from './furniture-catalog';
import { FURNITURE_MODELS } from './furniture-models';
import { CELL_H, CELL_W, PX_PER_CM_X, PX_PER_CM_Y, faceCornersOf, floorTraceOf, frontFaceOf, levelsOf, localPointOf, occluderBoxesOf, perchOf, poisOf3d, projectOf, renderModel, topCornersOf, type LocalBox, type Rendered } from './furniture-render3d';
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

// Point du dessus du meuble tourné (u le long de la largeur, v de l'avant vers l'arrière, fractions 0 à 1), en px du rectangle
// mis à l'échelle : là où se posent l'écran d'un bureau et les petits objets. Coins mis en cache par (meuble, angle).
const topCache = new Map<string, ReturnType<typeof topCornersOf>>();
export function topPoint(kind: StandingKind, angle: Angle, rect: PxRect, u: number, v: number): [number, number] {
  const key = `${kind}:${angle}`;
  let c = topCache.get(key);
  if (!c) {
    c = topCornersOf(FURNITURE_MODELS[kind], angle);
    topCache.set(key, c);
  }
  const [fl, fr, bl] = c;
  const { w, h } = drawSize(kind, angle);
  const x = fl[0] + u * (fr[0] - fl[0]) + v * (bl[0] - fl[0]);
  const y = fl[1] + u * (fr[1] - fl[1]) + v * (bl[1] - fl[1]);
  return [rect.x + (x * rect.w) / (w * CELL_W), rect.y + (y * rect.h) / (h * CELL_H)];
}

// Trace au sol du meuble tourné (polygone de sa base), en px du rectangle mis à l'échelle ; mise en cache par (meuble, angle).
const traceCache = new Map<string, [number, number][]>();
export function groundTrace(kind: StandingKind, angle: Angle, rect: PxRect): [number, number][] {
  const key = `${kind}:${angle}`;
  let t = traceCache.get(key);
  if (!t) {
    t = floorTraceOf(FURNITURE_MODELS[kind], angle);
    traceCache.set(key, t);
  }
  const { w, h } = drawSize(kind, angle);
  return t.map(([x, y]) => [rect.x + (x * rect.w) / (w * CELL_W), rect.y + (y * rect.h) / (h * CELL_H)]);
}

// Repère de la face avant : rectangle local (0, 0, w, h) — la face vue de face, en px — et matrice SVG (a, b, c, d, e, f) qui l'envoie
// sur la face projetée (parallélogramme en ¾) dans le rectangle `rect` ; null si la face est cachée. Mis en cache par (meuble, angle).
export type Matrix = [number, number, number, number, number, number];
export type FaceFrame = { w: number; h: number; m: Matrix };
const frameCache = new Map<string, ReturnType<typeof faceCornersOf>>();
export function faceFrame(kind: StandingKind, angle: Angle, rect: PxRect): FaceFrame | null {
  const key = `${kind}:${angle}`;
  if (!frameCache.has(key)) frameCache.set(key, faceCornersOf(FURNITURE_MODELS[kind], angle));
  const c = frameCache.get(key);
  if (!c) return null;
  const { w: cols, h: rows } = drawSize(kind, angle);
  const sx = rect.w / (cols * CELL_W);
  const sy = rect.h / (rows * CELL_H);
  const face = FURNITURE_MODELS[kind].face ?? { w: FURNITURE_MODELS[kind].w, h: FURNITURE_MODELS[kind].h };
  const w = face.w * PX_PER_CM_X * sx;
  const h = face.h * PX_PER_CM_Y * sy;
  const at = ([x, y]: [number, number]): [number, number] => [rect.x + x * sx, rect.y + y * sy];
  const [tl, tr, bl] = [at(c.tl), at(c.tr), at(c.bl)];
  return { w, h, m: [(tr[0] - tl[0]) / w, (tr[1] - tl[1]) / w, (bl[0] - tl[0]) / h, (bl[1] - tl[1]) / h, tl[0], tl[1]] };
}

// Niveaux de rangement de la face (entre les tablettes du modèle), fractions de la hauteur depuis le haut.
const levelCache = new Map<StandingKind, [number, number][]>();
export function faceLevels(kind: StandingKind): [number, number][] {
  let l = levelCache.get(kind);
  if (!l) {
    l = levelsOf(FURNITURE_MODELS[kind]);
    levelCache.set(kind, l);
  }
  return l;
}

// Point local (u, v) de la face → écran, et l'inverse.
export const applyMatrix = (m: Matrix, u: number, v: number): [number, number] => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]];
export function invertMatrix(m: Matrix, x: number, y: number): [number, number] {
  const det = m[0] * m[3] - m[1] * m[2];
  const dx = x - m[4];
  const dy = y - m[5];
  return [(m[3] * dx - m[2] * dy) / det, (m[0] * dy - m[1] * dx) / det];
}

// Mise en cache par (meuble, angle) d'une valeur tirée du modèle tourné.
function cached<T>(store: Map<string, T>, kind: StandingKind, angle: Angle, make: () => T): T {
  const key = `${kind}:${angle}`;
  if (!store.has(key)) store.set(key, make());
  return store.get(key)!;
}
// Échelle du rectangle `rect` par rapport au dessin du modèle (1 dans la pièce).
function scaleOf(kind: StandingKind, angle: Angle, rect: PxRect): { sx: number; sy: number } {
  const { w, h } = drawSize(kind, angle);
  return { sx: rect.w / (w * CELL_W), sy: rect.h / (h * CELL_H) };
}

// Point d'intérêt exact (px) du premier point du type donné, ou null : là où l'animal se tient précisément (cachette sous le canapé).
const poiPxCache = new Map<string, Map<PoiType, [number, number]>>();
export function poiPoint(kind: StandingKind, angle: Angle, rect: PxRect, type: PoiType): { x: number; y: number } | null {
  const pts = cached(poiPxCache, kind, angle, () => {
    const m = new Map<PoiType, [number, number]>();
    for (const p of FURNITURE_MODELS[kind].pois ?? []) if (!m.has(p.type)) m.set(p.type, projectOf(FURNITURE_MODELS[kind], angle, [p.x, p.y, p.z]));
    return m;
  });
  const q = pts.get(type);
  if (!q) return null;
  const { sx, sy } = scaleOf(kind, angle, rect);
  return { x: rect.x + q[0] * sx, y: rect.y + q[1] * sy };
}

// Dessus praticable du meuble tourné (corde horizontale par son centre, px du rectangle mis à l'échelle), sa hauteur (cm)
// et la profondeur de son centre (cm depuis l'avant) ; null sans dessus.
export type PerchPx = { x0: number; x1: number; y: number; height: number; depth: number };
const perchCache = new Map<string, ReturnType<typeof perchOf>>();
export function perchAt(kind: StandingKind, angle: Angle, rect: PxRect): PerchPx | null {
  const p = cached(perchCache, kind, angle, () => perchOf(FURNITURE_MODELS[kind], angle));
  if (!p) return null;
  const { sx, sy } = scaleOf(kind, angle, rect);
  return { x0: rect.x + p.x0 * sx, x1: rect.x + p.x1 * sx, y: rect.y + p.y * sy, height: p.height, depth: p.depth };
}

// Occulteurs du meuble tourné (boîtes en cm du repère « lumière » : x depuis le bord gauche du rectangle, z hauteur, d profondeur depuis l'avant).
const occCache = new Map<string, LocalBox[]>();
export const occludersAt = (kind: StandingKind, angle: Angle): readonly LocalBox[] => cached(occCache, kind, angle, () => occluderBoxesOf(FURNITURE_MODELS[kind], angle));

// Point du modèle dans le repère « lumière » (cm) ; mis en cache par (meuble, angle, point).
const localCache = new Map<string, { x: number; y: number; z: number }>();
export function localPointAt(kind: StandingKind, angle: Angle, p: [number, number, number]): { x: number; y: number; z: number } {
  const key = `${kind}:${angle}:${p.join(',')}`;
  let q = localCache.get(key);
  if (!q) {
    q = localPointOf(FURNITURE_MODELS[kind], angle, p);
    localCache.set(key, q);
  }
  return q;
}
