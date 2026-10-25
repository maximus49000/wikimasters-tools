import type { Poi, PoiType } from './furniture-catalog';
import { FURNITURE_MODELS } from './furniture-models';
import { CELL_H, CELL_W, FACE_CAMERA, cameraKey, PX_PER_CM_X, PX_PER_CM_Y, faceQuadOf, floorTraceOf, frontFaceOf, levelsOf, localPointOf, occluderBoxesOf, perchOf, poisOf3d, projectOf, renderModel, type Camera, type LocalBox, type Rendered } from './furniture-render3d';
import type { StandingKind } from './library-types';
import type { Cell, PxRect, Rect } from './room-grid';

// Huit angles par pas de 45° : 0 face, 1 ¾ avant gauche, 2 profil gauche, 3 ¾ dos gauche, 4 dos, 5 ¾ dos droit, 6 profil droit, 7 ¾ avant droit.
export type Angle = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const isAngle = (v: unknown): v is Angle => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 7;
export const rotateAngle = (a: Angle, dir: 1 | -1): Angle => (((a + dir) % 8) + 8) % 8 as Angle;

// Rendu du modèle 3D tourné, mis en cache par (meuble, angle) : il est demandé à chaque rendu de la pièce et coûte jusqu'à ~2 ms.
const cache = new Map<string, Rendered>();
export function renderedOf(kind: StandingKind, angle: Angle, cam: Camera = FACE_CAMERA): Rendered {
  const key = `${kind}:${angle}${cameraKey(cam)}`;
  let r = cache.get(key);
  if (!r) {
    r = renderModel(FURNITURE_MODELS[kind], angle, cam);
    cache.set(key, r);
  }
  return r;
}

// Rectangle de dessin (en cases) du meuble tourné : rectangle englobant de ses faces projetées.
export function drawSize(kind: StandingKind, angle: Angle, cam: Camera = FACE_CAMERA): { w: number; h: number } {
  const r = renderedOf(kind, angle, cam);
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

// Face avant projetée du modèle (px du rectangle de dessin à l'échelle 1), null si cachée ; mise en cache par (meuble, angle) :
// elle est demandée à chaque rendu et à chaque mouvement du doigt (emplacements d'étagère).
const faceCache = new Map<string, PxRect | null>();
function modelFace(kind: StandingKind, angle: Angle): PxRect | null {
  const key = `${kind}:${angle}`;
  if (!faceCache.has(key)) faceCache.set(key, frontFaceOf(FURNITURE_MODELS[kind], angle));
  return faceCache.get(key)!;
}

// Face avant visible (où se dessinent les cartes rangées et l'écran), visible de face et de ¾ avant seulement ; null sinon :
// face projetée du modèle du meuble, mise à l'échelle du rectangle.
export function frontFaceRect(angle: Angle, rect: PxRect, kind: StandingKind): PxRect | null {
  const face = modelFace(kind, angle);
  if (!face) return null;
  const { w, h } = drawSize(kind, angle);
  const sx = rect.w / (w * CELL_W);
  const sy = rect.h / (h * CELL_H);
  return { x: rect.x + face.x * sx, y: rect.y + face.y * sy, w: face.w * sx, h: face.h * sy };
}

// Point du dessus du meuble tourné (u le long de la largeur, v de l'avant vers l'arrière, fractions 0 à 1), en px du rectangle
// mis à l'échelle : là où se posent l'écran d'un bureau et les petits objets. Projection exacte du point (u·w, h, v·d) du modèle.
export function topPoint(kind: StandingKind, angle: Angle, rect: PxRect, u: number, v: number): [number, number] {
  const m = FURNITURE_MODELS[kind];
  const [x, y] = projectOf(m, angle, [u * m.w, m.h, v * m.d]);
  const { w, h } = drawSize(kind, angle);
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

// Repère de la face avant : rectangle local (0, 0, w, h) — la face vue de face, en px — envoyé sur la face projetée (quadrilatère en
// perspective) dans le rectangle `rect` ; null si la face est cachée. `quad` : ses 4 coins à l'écran (haut gauche, haut droit, bas droit,
// bas gauche) ; `hom` : l'homographie exacte (toucher, emplacements) ; `m` : la meilleure matrice SVG affine (a, b, c, d, e, f), aux moindres
// carrés sur les 4 coins (pose d'un dessin à plat : écart d'un px ou deux sur une grande face). Coins mis en cache par (meuble, angle).
export type Matrix = [number, number, number, number, number, number];
export type Homography = [number, number, number, number, number, number, number, number, number];
export type FaceFrame = { w: number; h: number; m: Matrix; quad: [number, number][]; hom: Homography };
const frameCache = new Map<string, ReturnType<typeof faceQuadOf>>();
export function faceFrame(kind: StandingKind, angle: Angle, rect: PxRect): FaceFrame | null {
  const key = `${kind}:${angle}`;
  if (!frameCache.has(key)) frameCache.set(key, faceQuadOf(FURNITURE_MODELS[kind], angle));
  const c = frameCache.get(key);
  if (!c) return null;
  const { w: cols, h: rows } = drawSize(kind, angle);
  const sx = rect.w / (cols * CELL_W);
  const sy = rect.h / (rows * CELL_H);
  const face = FURNITURE_MODELS[kind].face ?? { w: FURNITURE_MODELS[kind].w, h: FURNITURE_MODELS[kind].h };
  const w = face.w * PX_PER_CM_X * sx;
  const h = face.h * PX_PER_CM_Y * sy;
  const quad = c.map(([x, y]): [number, number] => [rect.x + x * sx, rect.y + y * sy]);
  const local: [number, number][] = [[0, 0], [w, 0], [w, h], [0, h]];
  return { w, h, m: bestAffine(local, quad), quad, hom: homographyOf(local, quad) };
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

// Point local (u, v) d'un repère affine → écran, et l'inverse (décalques, petites faces).
export const applyMatrix = (m: Matrix, u: number, v: number): [number, number] => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]];
export function invertMatrix(m: Matrix, x: number, y: number): [number, number] {
  const det = m[0] * m[3] - m[1] * m[2];
  const dx = x - m[4];
  const dy = y - m[5];
  return [(m[3] * dx - m[2] * dy) / det, (m[0] * dy - m[1] * dx) / det];
}

// Point local (u, v) de la face → écran par l'homographie exacte, et l'inverse.
export const applyFace = (f: FaceFrame, u: number, v: number): [number, number] => applyHomography(f.hom, u, v);
export const invertFace = (f: FaceFrame, x: number, y: number): [number, number] => applyHomography(invertHomography(f.hom), x, y);

export function applyHomography(H: Homography, u: number, v: number): [number, number] {
  const w = H[6] * u + H[7] * v + H[8];
  return [(H[0] * u + H[1] * v + H[2]) / w, (H[3] * u + H[4] * v + H[5]) / w];
}
// Inverse d'une homographie (matrice adjointe : l'échelle d'une homographie est libre).
export function invertHomography(H: Homography): Homography {
  const [a, b, c, d, e, f, g, h, i] = H;
  return [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d];
}

// Normalisation de Hartley : centre les points et ramène leur distance moyenne au centre à √2 (système bien conditionné).
function normalizer(pts: readonly [number, number][]): Homography {
  const [mx, my] = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  const d = pts.reduce((s, p) => s + Math.hypot(p[0] - mx, p[1] - my), 0) / pts.length || 1;
  const k = Math.SQRT2 / d;
  return [k, 0, -k * mx, 0, k, -k * my, 0, 0, 1];
}
function mul3(A: Homography, B: Homography): Homography {
  const out = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) out[r * 3 + c]! += A[r * 3 + k]! * B[k * 3 + c]!;
  return out as Homography;
}
// Résolution d'un système linéaire carré (Gauss, pivot partiel).
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    for (let r = c + 1; r < n; r++) {
      const k = M[r]![c]! / M[c]![c]!;
      for (let j = c; j <= n; j++) M[r]![j]! -= k * M[c]![j]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r]![n]!;
    for (let j = r + 1; j < n; j++) s -= M[r]![j]! * x[j]!;
    x[r] = s / M[r]![r]!;
  }
  return x;
}
// Homographie qui envoie 4 points `src` sur 4 points `dst` : méthode des 4 points (DLT normalisée, dernier terme 1 dans le repère normalisé).
export function homographyOf(src: readonly [number, number][], dst: readonly [number, number][]): Homography {
  const [Ts, Td] = [normalizer(src), normalizer(dst)];
  const ns = src.map(([u, v]) => applyHomography(Ts, u, v));
  const nd = dst.map(([x, y]) => applyHomography(Td, x, y));
  const A: number[][] = [];
  const b: number[] = [];
  ns.forEach(([u, v], i) => {
    const [x, y] = nd[i]!;
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  });
  const Hn = [...solve(A, b), 1] as Homography;
  return mul3(invertHomography(Td), mul3(Hn, Ts));
}
// Meilleure matrice affine (moindres carrés) qui envoie les points `src` sur `dst`.
function bestAffine(src: readonly [number, number][], dst: readonly [number, number][]): Matrix {
  const N: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const bx = [0, 0, 0];
  const by = [0, 0, 0];
  src.forEach(([u, v], i) => {
    const r = [u, v, 1];
    for (let a = 0; a < 3; a++) {
      for (let c = 0; c < 3; c++) N[a]![c]! += r[a]! * r[c]!;
      bx[a]! += r[a]! * dst[i]![0];
      by[a]! += r[a]! * dst[i]![1];
    }
  });
  const [a, c, e] = solve(N, bx);
  const [b, d, f] = solve(N, by);
  return [a!, b!, c!, d!, e!, f!];
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
