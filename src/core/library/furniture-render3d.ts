// src/core/library/furniture-render3d.ts
import type { Angle } from './footprint';
import type { PoiType } from './furniture-catalog';
import type { Palette } from './styles';

// Moteur 3D des meubles : modèle en cm (x largeur depuis la gauche vue de face, y hauteur depuis le sol, z profondeur depuis l'avant),
// vraie rotation de 45° en 45° autour de l'axe vertical, projection dans la perspective de la pièce (le fond est plus haut à l'écran).
export type Fill = keyof Palette;
export type Piece =
  | { shape: 'box'; x: number; y: number; z: number; w: number; h: number; d: number; fill: Fill }
  | { shape: 'cyl'; cx: number; cz: number; y: number; r: number; h: number; fill: Fill }
  | { shape: 'ball'; cx: number; cy: number; cz: number; rx: number; ry: number; rz: number; fill: Fill };
export type Poi3d = { type: PoiType; x: number; y: number; z: number };
// `face` : rectangle de la face avant (x, y depuis le sol, en cm) où se rangent les cartes et s'affiche l'écran.
export type Model = { w: number; d: number; h: number; pieces: Piece[]; pois?: Poi3d[]; face?: { x: number; y: number; w: number; h: number } };
export type Shape =
  | { kind: 'poly'; points: [number, number][]; fill: Fill; shade: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: Fill; shade: number };
export type Rendered = { shapes: Shape[]; cols: number; rows: number; floor: { col: number; row: number }[] };

const CELL_W = 30;
const CELL_H = 510 / 18;
// Une case = 21 cm (largeur et hauteur), une rangée de sol = 50 cm de profondeur.
export const PX_PER_CM_X = CELL_W / 21;
export const PX_PER_CM_Y = CELL_H / 21;
export const DEPTH_PX_PER_CM = CELL_H / 50;
const SHADE = { front: 1, side: 0.82, top: 1.12 } as const;
const CYL_SIDES = 12;

type V3 = { x: number; y: number; z: number };
type Frame = { cos: number; sin: number; cx: number; cz: number; minX: number; minZ: number };

// Rotation autour du centre de la base ; angle 1 = la face avant tourne vers la gauche.
function frameOf(model: Model, angle: Angle): Frame {
  const t = (angle * Math.PI) / 4;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const cx = model.w / 2;
  const cz = model.d / 2;
  const base: [number, number][] = [[0, 0], [model.w, 0], [model.w, model.d], [0, model.d]];
  const rot = base.map(([x, z]) => turn({ cos, sin, cx, cz }, x, z));
  return { cos, sin, cx, cz, minX: Math.min(...rot.map((p) => p[0])), minZ: Math.min(...rot.map((p) => p[1])) };
}
// (x, z) du modèle → (x', z') tournés, encore non décalés.
function turn(f: Pick<Frame, 'cos' | 'sin' | 'cx' | 'cz'>, x: number, z: number): [number, number] {
  const dx = x - f.cx;
  const dz = z - f.cz;
  return [f.cx + dx * f.cos + dz * f.sin, f.cz - dx * f.sin + dz * f.cos];
}
// Point du modèle → (x' depuis la gauche de la trace, z' depuis l'avant de la trace), en cm.
function local(f: Frame, p: V3): { x: number; y: number; z: number } {
  const [x, z] = turn(f, p.x, p.z);
  return { x: x - f.minX, y: p.y, z: z - f.minZ };
}

// Trace tournée de la base (polygone convexe en cm, repère local).
function footprint(model: Model, f: Frame): [number, number][] {
  return ([[0, 0], [model.w, 0], [model.w, model.d], [0, model.d]] as const).map(([x, z]) => {
    const p = local(f, { x, y: 0, z });
    return [p.x, p.z];
  });
}

// Aire d'un polygone convexe découpé par un rectangle (Sutherland–Hodgman).
function clippedArea(poly: [number, number][], x0: number, x1: number, z0: number, z1: number): number {
  const clip = (pts: [number, number][], inside: (p: [number, number]) => boolean, cut: (a: [number, number], b: [number, number]) => [number, number]) => {
    const out: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      if (inside(b)) {
        if (!inside(a)) out.push(cut(a, b));
        out.push(b);
      } else if (inside(a)) out.push(cut(a, b));
    }
    return out;
  };
  const atX = (x: number) => (a: [number, number], b: [number, number]): [number, number] => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
  const atZ = (z: number) => (a: [number, number], b: [number, number]): [number, number] => [a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]), z];
  let pts = poly;
  pts = clip(pts, (p) => p[0] >= x0, atX(x0));
  pts = clip(pts, (p) => p[0] <= x1, atX(x1));
  pts = clip(pts, (p) => p[1] >= z0, atZ(z0));
  pts = clip(pts, (p) => p[1] <= z1, atZ(z1));
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[(i + 1) % pts.length]!;
    area += ax * bz - bx * az;
  }
  return Math.abs(area) / 2;
}

type Layout3d = { f: Frame; cols: number; rows: number; depthRows: number; toPx: (p: V3) => [number, number] };

// Taille du rectangle de dessin et passage d'un point du modèle aux px du rectangle (origine en haut à gauche).
function layoutOf(model: Model, angle: Angle): Layout3d {
  const f = frameOf(model, angle);
  const trace = footprint(model, f);
  const traceW = Math.max(...trace.map((p) => p[0]));
  const traceD = Math.max(...trace.map((p) => p[1]));
  const cols = Math.max(1, Math.ceil(traceW / 21 - 0.15));
  const depthRows = Math.max(1, Math.round(traceD / 50));
  const heightPx = model.h * PX_PER_CM_Y + traceD * DEPTH_PX_PER_CM;
  const rows = Math.max(depthRows, Math.round(heightPx / CELL_H));
  const bottom = rows * CELL_H;
  const offsetX = (cols * CELL_W - traceW * PX_PER_CM_X) / 2;
  const toPx = (p: V3): [number, number] => {
    const l = local(f, p);
    return [offsetX + l.x * PX_PER_CM_X, bottom - l.y * PX_PER_CM_Y - l.z * DEPTH_PX_PER_CM];
  };
  return { f, cols, rows, depthRows, toPx };
}

// Profondeur (z' tourné) d'un point : sert au tri du plus loin au plus proche.
const depthOf = (f: Frame, x: number, z: number): number => turn(f, x, z)[1];

type Face = { pts: V3[]; normal: V3; shade: number };

function boxFaces(p: Extract<Piece, { shape: 'box' }>): Face[] {
  const { x, y, z, w, h, d } = p;
  const v = (a: number, b: number, c: number): V3 => ({ x: a, y: b, z: c });
  return [
    { pts: [v(x, y, z), v(x + w, y, z), v(x + w, y + h, z), v(x, y + h, z)], normal: v(0, 0, -1), shade: SHADE.front },
    { pts: [v(x + w, y, z + d), v(x, y, z + d), v(x, y + h, z + d), v(x + w, y + h, z + d)], normal: v(0, 0, 1), shade: SHADE.front },
    { pts: [v(x, y, z + d), v(x, y, z), v(x, y + h, z), v(x, y + h, z + d)], normal: v(-1, 0, 0), shade: SHADE.side },
    { pts: [v(x + w, y, z), v(x + w, y, z + d), v(x + w, y + h, z + d), v(x + w, y + h, z)], normal: v(1, 0, 0), shade: SHADE.side },
    { pts: [v(x, y + h, z), v(x + w, y + h, z), v(x + w, y + h, z + d), v(x, y + h, z + d)], normal: v(0, 1, 0), shade: SHADE.top },
  ];
}

function cylFaces(p: Extract<Piece, { shape: 'cyl' }>): Face[] {
  const faces: Face[] = [];
  const ring = Array.from({ length: CYL_SIDES }, (_, i) => (i * 2 * Math.PI) / CYL_SIDES);
  for (let i = 0; i < CYL_SIDES; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % CYL_SIDES]!;
    const m = (a + b) / 2;
    const P = (t: number, yy: number): V3 => ({ x: p.cx + p.r * Math.cos(t), y: yy, z: p.cz + p.r * Math.sin(t) });
    faces.push({ pts: [P(a, p.y), P(b, p.y), P(b, p.y + p.h), P(a, p.y + p.h)], normal: { x: Math.cos(m), y: 0, z: Math.sin(m) }, shade: SHADE.side + (SHADE.front - SHADE.side) * Math.max(0, -Math.sin(m)) });
  }
  faces.push({ pts: ring.map((t) => ({ x: p.cx + p.r * Math.cos(t), y: p.y + p.h, z: p.cz + p.r * Math.sin(t) })), normal: { x: 0, y: 1, z: 0 }, shade: SHADE.top });
  return faces;
}

// Normale tournée : visible si elle regarde le spectateur (z' < 0) ou vers le haut.
function visible(f: Frame, n: V3): boolean {
  if (n.y > 0) return true;
  const z = -n.x * f.sin + n.z * f.cos;
  return z < -1e-6;
}

export function renderModel(model: Model, angle: Angle): Rendered {
  const L = layoutOf(model, angle);
  const { f } = L;
  // Pièces du plus loin au plus proche (centre de la base tourné), puis de bas en haut.
  const center = (p: Piece): [number, number, number] =>
    p.shape === 'box' ? [p.x + p.w / 2, p.y, p.z + p.d / 2] : p.shape === 'cyl' ? [p.cx, p.y, p.cz] : [p.cx, p.cy - p.ry, p.cz];
  const order = [...model.pieces].sort((a, b) => {
    const [ax, ay, az] = center(a);
    const [bx, by, bz] = center(b);
    return depthOf(f, bx, bz) - depthOf(f, ax, az) || ay - by;
  });
  const shapes: Shape[] = [];
  for (const p of order) {
    if (p.shape === 'ball') {
      const [cx, cy] = L.toPx({ x: p.cx, y: p.cy, z: p.cz });
      const rx = Math.hypot(p.rx * f.cos, p.rz * f.sin) * PX_PER_CM_X;
      shapes.push({ kind: 'ellipse', cx, cy, rx, ry: p.ry * PX_PER_CM_Y, fill: p.fill, shade: SHADE.front });
      continue;
    }
    const faces = (p.shape === 'box' ? boxFaces(p) : cylFaces(p)).filter((fc) => visible(f, fc.normal));
    // Le dessus en dernier (il recouvre le haut des côtés), sinon les faces du fond d'abord.
    faces.sort((a, b) => (a.normal.y - b.normal.y) || 0);
    for (const fc of faces) shapes.push({ kind: 'poly', points: fc.pts.map((pt) => L.toPx(pt)), fill: p.fill, shade: fc.shade });
  }
  return { shapes, cols: L.cols, rows: L.rows, floor: floorOf(model, L) };
}

// Cases au sol : couvertes à plus de 50 % par la trace tournée ; au moins la plus couverte.
function floorOf(model: Model, L: Layout3d): { col: number; row: number }[] {
  const trace = footprint(model, L.f);
  const traceW = Math.max(...trace.map((p) => p[0]));
  const shiftX = (L.cols * 21 - traceW) / 2;
  const cells: { col: number; row: number; cover: number }[] = [];
  for (let c = 0; c < L.cols; c++) {
    for (let k = 0; k < L.depthRows; k++) {
      const area = clippedArea(trace, c * 21 - shiftX, (c + 1) * 21 - shiftX, k * 50, (k + 1) * 50);
      cells.push({ col: c, row: L.rows - 1 - k, cover: area / (21 * 50) });
    }
  }
  const full = cells.filter((c) => c.cover > 0.5);
  const picked = full.length > 0 ? full : [cells.reduce((a, b) => (b.cover > a.cover ? b : a))];
  return picked.map(({ col, row }) => ({ col, row })).sort((a, b) => a.row - b.row || a.col - b.col);
}

export function poisOf3d(model: Model, angle: Angle): { type: PoiType; col: number; row: number }[] {
  const L = layoutOf(model, angle);
  return (model.pois ?? []).map((p) => {
    const [x, y] = L.toPx(p);
    return { type: p.type, col: Math.min(L.cols - 1, Math.max(0, Math.floor(x / CELL_W))), row: Math.min(L.rows - 1, Math.max(0, Math.floor(y / CELL_H))) };
  });
}

// Face avant projetée (rectangle englobant, px dans le rectangle de dessin) ; null si on ne la voit pas (profil, dos).
export function frontFaceOf(model: Model, angle: Angle): { x: number; y: number; w: number; h: number } | null {
  if (angle !== 0 && angle !== 1 && angle !== 7) return null;
  const face = model.face ?? { x: 0, y: 0, w: model.w, h: model.h };
  const L = layoutOf(model, angle);
  const pts = [[face.x, face.y], [face.x + face.w, face.y], [face.x + face.w, face.y + face.h], [face.x, face.y + face.h]].map(([x, y]) => L.toPx({ x: x!, y: y!, z: 0 }));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
