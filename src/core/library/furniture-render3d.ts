// src/core/library/furniture-render3d.ts
import type { Angle } from './footprint';
import type { PoiType } from './furniture-catalog';
import type { Palette } from './styles';

// Moteur 3D des meubles : modèle en cm (x largeur depuis la gauche vue de face, y hauteur depuis le sol, z profondeur depuis l'avant),
// vraie rotation de 45° en 45° autour de l'axe vertical, projection dans la perspective de la pièce (le fond est plus haut à l'écran).
export type Fill = keyof Palette;
export type V3t = [number, number, number];
// Feuille : nervure en courbe de Bézier (base → contrôle → pointe), largeur maximale `w` (cm). `form` : 'lance' pointue (défaut),
// 'heart' large en cœur avec trois paires de fentes (monstera), 'paddle' en palette à bout arrondi (oiseau de paradis).
export type LeafForm = 'lance' | 'heart' | 'paddle';
export type Leaf = { base: V3t; ctrl: V3t; tip: V3t; w: number; fill?: Fill; form?: LeafForm };
// Arc de méridien autour d'un globe : longitude `lon`, de la latitude `from` à `to` (au-delà de ±90 il passe de l'autre côté du pôle), rayon `r`, largeur `w` (cm).
export type GlobeRing = { lon: number; from: number; to: number; r: number; w: number; fill: Fill };
// `tone` : teinte propre de la pièce (multiplie l'ombrage) ; `layer` : une pièce de couche supérieure passe après les pièces qu'elle chevauche ;
// `color` : couleur propre #RRGGBB qui remplace celle de la palette (boîtier de CD, dos d'un livre) ; `tag` : étiquette recopiée sur ses formes (abat-jour à allumer).
type Common = { fill: Fill; tone?: number; layer?: number; color?: string; tag?: string };
// Décalque : face d'une boîte décorée par le dessin (image de la carte sur la couverture, titre sur la tranche, écran), repérée par sa clé.
export type BoxFace = 'front' | 'back' | 'left' | 'right' | 'top';
export type Decal = { face: BoxFace; key: string };
export type Piece = Common & (
  | { shape: 'box'; x: number; y: number; z: number; w: number; h: number; d: number; decals?: Decal[] }
  // `r2` : rayon du haut (pot évasé) ; par défaut égal à `r`.
  | { shape: 'cyl'; cx: number; cz: number; y: number; r: number; h: number; r2?: number }
  // Globe : `tilt` incline l'axe des pôles vers la droite (degrés) ; `marks` (continents) en (latitude, longitude) degrés, longitude 0 = face avant ;
  // `lines` : parallèles (lat) et méridiens (lon) tracés sur la face visible, couleur `lineFill` ; `rings` : arcs de méridien autour de la sphère.
  | { shape: 'ball'; cx: number; cy: number; cz: number; rx: number; ry: number; rz: number; tilt?: number; marks?: { fill: Fill; pts: [number, number][] }[]; lines?: { lat?: number; lon?: number }[]; lineFill?: Fill; rings?: GlobeRing[] }
  // Tige : cylindre entre deux points quelconques (pieds inclinés, bras, cadran, axe).
  | { shape: 'rod'; a: V3t; b: V3t; r: number }
  // Prisme : profil (x, y) extrudé le long de z, ou profil (z, y) extrudé le long de x, de `from` à `to` (toit à deux pans, engrenage).
  | { shape: 'prism'; axis: 'x' | 'z'; profile: [number, number][]; from: number; to: number }
  // Feuillage : feuilles pointues (couleur `fill` par défaut).
  | { shape: 'foliage'; leaves: Leaf[] }
);
export type Poi3d = { type: PoiType; x: number; y: number; z: number };
// `face` : rectangle de la face avant (x, y depuis le sol, en cm) où se rangent les cartes et s'affiche l'écran.
// `round` : base ronde (lampadaire) : la trace au sol est l'ellipse inscrite dans w × d, la largeur dessinée ne change pas avec l'angle.
// `perch` : dessus praticable par un chat (assise, plateau, haut de l'étagère) : rectangle x/z en cm à la hauteur y (dessus d'une vraie pièce).
// `glow` : point d'où part la lumière d'une lampe (dans l'abat-jour), en cm.
export type Perch = { x: number; z: number; w: number; d: number; y: number };
// `base` : socle (cm, repère du modèle) quand seul lui touche le sol (lampadaire arc) : il donne les cases au sol et l'ombre au sol ;
// le rectangle de dessin reste celui de la boîte entière.
export type Model = { w: number; d: number; h: number; pieces: Piece[]; pois?: Poi3d[]; face?: { x: number; y: number; w: number; h: number }; round?: boolean; perch?: Perch; glow?: V3t; base?: { x: number; z: number; w: number; d: number; round?: boolean } };
// Face décorée projetée : coins haut gauche, haut droit, bas gauche (vue de face depuis l'extérieur de la face, haut en haut), taille en cm (largeur, hauteur).
// La projection étant affine, ces trois points donnent la matrice qui pose un dessin à plat sur la face.
export type DecalPx = { key: string; tl: [number, number]; tr: [number, number]; bl: [number, number]; w: number; h: number };
type ShapeCommon = { fill: Fill; shade: number; color?: string; tag?: string };
export type Shape = ShapeCommon & (
  // `ink` : 'none' = aplat sans trait (ombre nette), 'only' = trait seul repassé par-dessus.
  | { kind: 'poly'; points: [number, number][]; ink?: 'none' | 'only'; decal?: DecalPx }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  // Trait fin (parallèles du globe, nervures des feuilles) : couleur de `fill`, sans contour.
  | { kind: 'line'; points: [number, number][] }
);
export type Rendered = { shapes: Shape[]; cols: number; rows: number; floor: { col: number; row: number }[] };

export const CELL_W = 30;
export const CELL_H = 510 / 18;
// Une case = 21 cm (largeur et hauteur), une rangée de sol = 50 cm de profondeur.
export const PX_PER_CM_X = CELL_W / 21;
export const PX_PER_CM_Y = CELL_H / 21;
export const DEPTH_PX_PER_CM = CELL_H / 50;
const SHADE = { front: 1, side: 0.82, top: 1.12 } as const;
const ROUND_STEPS = 24;
const TINY_PX = 4; // en dessous, un corps rond se dessine d'une seule ellipse
const SHADOW_SPAN = (50 * Math.PI) / 180; // ombre nette des corps ronds : de la silhouette droite jusqu'à 50° vers le spectateur
const BALL_SHIFT = [0.28, 0.22] as const; // croissant d'ombre des boules : décalage de la partie éclairée (fractions des rayons) vers le haut à gauche
const LEAF_STEPS = 10;
const LEAF_TWIST = (40 * Math.PI) / 180;

type V3 = { x: number; y: number; z: number };
type Frame = { cos: number; sin: number; cx: number; cz: number; minX: number; minZ: number };

// Rotation autour du centre de la base ; angle 1 = la face avant tourne vers la gauche.
function frameOf(model: Model, angle: Angle): Frame {
  const t = (angle * Math.PI) / 4;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const cx = model.w / 2;
  const cz = model.d / 2;
  const rot = baseOf(model).map(([x, z]) => turn({ cos, sin, cx, cz }, x, z));
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

// Base du meuble (polygone convexe en cm, repère du modèle) : rectangle w × d, ou ellipse inscrite à 16 côtés (invariante par 45°) pour un modèle rond.
function baseOf(model: Model): [number, number][] {
  if (!model.round) return [[0, 0], [model.w, 0], [model.w, model.d], [0, model.d]];
  return Array.from({ length: 16 }, (_, i): [number, number] => {
    const a = ((i + 0.5) * Math.PI) / 8;
    return [model.w / 2 + (model.w / 2) * Math.cos(a) / Math.cos(Math.PI / 16), model.d / 2 + (model.d / 2) * Math.sin(a) / Math.cos(Math.PI / 16)];
  });
}

// Ce qui touche le sol : le socle s'il est déclaré (rectangle ou ellipse inscrite à 16 côtés), sinon la base entière.
function footOf(model: Model): [number, number][] {
  const b = model.base;
  if (!b) return baseOf(model);
  if (!b.round) return [[b.x, b.z], [b.x + b.w, b.z], [b.x + b.w, b.z + b.d], [b.x, b.z + b.d]];
  return Array.from({ length: 16 }, (_, i): [number, number] => {
    const a = ((i + 0.5) * Math.PI) / 8;
    return [b.x + b.w / 2 + (b.w / 2) * Math.cos(a) / Math.cos(Math.PI / 16), b.z + b.d / 2 + (b.d / 2) * Math.sin(a) / Math.cos(Math.PI / 16)];
  });
}

// Trace tournée d'un polygone de base (cm, repère local) : la base entière par défaut.
function footprint(model: Model, f: Frame, poly: [number, number][] = baseOf(model)): [number, number][] {
  return poly.map(([x, z]) => {
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
  const cols = Math.max(1, Math.round(traceW / 21)); // le dessin est centré, un débord d'une demi-case au plus est toléré
  const depthRows = Math.max(1, Math.round(traceD / 50));
  const heightPx = model.h * PX_PER_CM_Y + traceD * DEPTH_PX_PER_CM;
  const rows = Math.max(depthRows, Math.ceil(heightPx / CELL_H - 0.05)); // jamais le haut coupé
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

type Face = { pts: V3[]; normal: V3 };
// Face de boîte nommée, avec son repère de décalque : haut gauche, haut droit, bas gauche vus depuis l'extérieur, et sa taille (cm).
type NamedFace = Face & { name: BoxFace; frame: [V3, V3, V3]; size: [number, number] };

function boxFaces(p: Extract<Piece, { shape: 'box' }>): NamedFace[] {
  const { x, y, z, w, h, d } = p;
  const v = (a: number, b: number, c: number): V3 => ({ x: a, y: b, z: c });
  const [X, Y, Z] = [x + w, y + h, z + d];
  return [
    { name: 'front', pts: [v(x, y, z), v(X, y, z), v(X, Y, z), v(x, Y, z)], normal: v(0, 0, -1), frame: [v(x, Y, z), v(X, Y, z), v(x, y, z)], size: [w, h] },
    { name: 'back', pts: [v(X, y, Z), v(x, y, Z), v(x, Y, Z), v(X, Y, Z)], normal: v(0, 0, 1), frame: [v(X, Y, Z), v(x, Y, Z), v(X, y, Z)], size: [w, h] },
    { name: 'left', pts: [v(x, y, Z), v(x, y, z), v(x, Y, z), v(x, Y, Z)], normal: v(-1, 0, 0), frame: [v(x, Y, Z), v(x, Y, z), v(x, y, Z)], size: [d, h] },
    { name: 'right', pts: [v(X, y, z), v(X, y, Z), v(X, Y, Z), v(X, Y, z)], normal: v(1, 0, 0), frame: [v(X, Y, z), v(X, Y, Z), v(X, y, z)], size: [d, h] },
    { name: 'top', pts: [v(x, Y, z), v(X, Y, z), v(X, Y, Z), v(x, Y, Z)], normal: v(0, 1, 0), frame: [v(x, Y, Z), v(X, Y, Z), v(x, Y, z)], size: [w, d] },
  ];
}

// Prisme : faces latérales (une par arête du profil, normale sortante) et les deux bouts.
function prismFaces(p: Extract<Piece, { shape: 'prism' }>): { sides: Face[]; caps: Face[] } {
  const pr = p.profile;
  let area = 0;
  for (let i = 0; i < pr.length; i++) area += pr[i]![0] * pr[(i + 1) % pr.length]![1] - pr[(i + 1) % pr.length]![0] * pr[i]![1];
  const sign = area >= 0 ? 1 : -1; // profil dans le sens trigonométrique : normale sortante = (dy, −du)
  const P = (u: number, y: number, t: number): V3 => (p.axis === 'z' ? { x: u, y, z: t } : { x: t, y, z: u });
  const N = (nu: number, ny: number): V3 => (p.axis === 'z' ? { x: nu, y: ny, z: 0 } : { x: 0, y: ny, z: nu });
  const sides: Face[] = pr.map((a, i) => {
    const b = pr[(i + 1) % pr.length]!;
    const du = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(du, dy) || 1;
    return { pts: [P(a[0], a[1], p.from), P(b[0], b[1], p.from), P(b[0], b[1], p.to), P(a[0], a[1], p.to)], normal: N((sign * dy) / len, (-sign * du) / len) };
  });
  const dir = p.to >= p.from ? 1 : -1;
  const axisN = (k: number): V3 => (p.axis === 'z' ? { x: 0, y: 0, z: k } : { x: k, y: 0, z: 0 });
  const caps: Face[] = [
    { pts: pr.map(([u, y]) => P(u, y, p.from)), normal: axisN(-dir) },
    { pts: pr.map(([u, y]) => P(u, y, p.to)), normal: axisN(dir) },
  ];
  return { sides, caps };
}

// Direction du spectateur dans le repère du modèle : la projection confond les points alignés sur (0, d, −k) tourné (vers le haut et l'avant).
function viewDir(f: Frame): V3 {
  return { x: PX_PER_CM_Y * f.sin, y: DEPTH_PX_PER_CM, z: -PX_PER_CM_Y * f.cos };
}
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;

// Normale visible si elle regarde le spectateur (pour une normale droite : vers le haut, ou z' < 0).
function visible(f: Frame, n: V3): boolean {
  return dot(n, viewDir(f)) > 1e-6;
}

// Éclairage fixe côté spectateur : la teinte dépend de la normale tournée, pas de la face du modèle ; un pan incliné mêle côté et dessus.
function shadeOf(f: Frame, n: V3): number {
  const len = Math.hypot(n.x, n.y, n.z) || 1;
  const ny = n.y / len;
  if (ny >= 1 - 1e-9) return SHADE.top;
  const hz = Math.hypot(n.x, n.z) || 1;
  const side = SHADE.side + (SHADE.front - SHADE.side) * Math.max(0, (f.sin * n.x - f.cos * n.z) / hz);
  return ny > 0 ? side + (SHADE.top - side) * ny : side;
}

// Demi-largeur (cm) d'une feuille au point s ∈ [0, 1] de sa nervure, pour une largeur maximale w.
export function leafHalf(form: LeafForm, s: number, w: number): number {
  if (s <= 0 || s >= 1) return 0;
  if (form === 'heart') return (w / 2) * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.65)), 0.7);
  if (form === 'paddle') return (w / 2) * Math.min(1, s / 0.12) * Math.sqrt(Math.sin(Math.PI * (0.06 + 0.94 * s)));
  return (w / 2) * Math.sin(Math.PI * Math.pow(s, 0.8));
}

// Points de la nervure d'une feuille et demi-largeur (cm) en chacun : pointue aux deux bouts, plus large un peu avant le milieu.
function leafSamples(l: Leaf): [V3, number][] {
  return Array.from({ length: LEAF_STEPS + 1 }, (_, i): [V3, number] => {
    const s = i / LEAF_STEPS;
    const at = (k: 0 | 1 | 2) => (1 - s) * (1 - s) * l.base[k] + 2 * s * (1 - s) * l.ctrl[k] + s * s * l.tip[k];
    return [{ x: at(0), y: at(1), z: at(2) }, leafHalf(l.form ?? 'lance', s, l.w)];
  });
}

// Encombrement d'une pièce dans le repère du modèle : [x0, x1, y0, y1, z0, z1] (prudent pour les feuilles : nervure ± demi-largeur).
export function pieceBounds(p: Piece): [number, number, number, number, number, number] {
  switch (p.shape) {
    case 'box': return [p.x, p.x + p.w, p.y, p.y + p.h, p.z, p.z + p.d];
    case 'cyl': {
      const r = Math.max(p.r, p.r2 ?? p.r);
      return [p.cx - r, p.cx + r, p.y, p.y + p.h, p.cz - r, p.cz + r];
    }
    case 'ball': {
      const ring = Math.max(0, ...(p.rings ?? []).map((g) => g.r + g.w / 2));
      const [rx, ry, rz] = [Math.max(p.rx, ring), Math.max(p.ry, ring), Math.max(p.rz, ring)];
      return [p.cx - rx, p.cx + rx, p.cy - ry, p.cy + ry, p.cz - rz, p.cz + rz];
    }
    case 'rod': {
      // Cylindre exact : sur chaque axe, les bouts ± rayon × √(1 − u²) (u = direction de la tige).
      const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]) || 1;
      const ext = [0, 1, 2].map((k) => p.r * Math.sqrt(Math.max(0, 1 - ((p.b[k]! - p.a[k]!) / len) ** 2)));
      return [Math.min(p.a[0], p.b[0]) - ext[0]!, Math.max(p.a[0], p.b[0]) + ext[0]!, Math.min(p.a[1], p.b[1]) - ext[1]!, Math.max(p.a[1], p.b[1]) + ext[1]!, Math.min(p.a[2], p.b[2]) - ext[2]!, Math.max(p.a[2], p.b[2]) + ext[2]!];
    }
    case 'prism': {
      const us = p.profile.map((q) => q[0]);
      const ys = p.profile.map((q) => q[1]);
      const [u0, u1, t0, t1] = [Math.min(...us), Math.max(...us), Math.min(p.from, p.to), Math.max(p.from, p.to)];
      return p.axis === 'z' ? [u0, u1, Math.min(...ys), Math.max(...ys), t0, t1] : [t0, t1, Math.min(...ys), Math.max(...ys), u0, u1];
    }
    case 'foliage': {
      const b: [number, number, number, number, number, number] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
      for (const l of p.leaves) {
        for (const [q, half] of leafSamples(l)) {
          b[0] = Math.min(b[0], q.x - half); b[1] = Math.max(b[1], q.x + half);
          b[2] = Math.min(b[2], q.y - half); b[3] = Math.max(b[3], q.y + half);
          b[4] = Math.min(b[4], q.z - half); b[5] = Math.max(b[5], q.z + half);
        }
      }
      return b;
    }
  }
}

type Bounds = { x0: number; x1: number; z0: number; z1: number; bottom: number; top: number };

// Encombrement d'une pièce dans le repère tourné (x', z') et en hauteur.
function boundsOf(p: Piece, f: Frame): Bounds {
  const [x0, x1, y0, y1, z0, z1] = pieceBounds(p);
  const r = ([[x0, z0], [x1, z0], [x1, z1], [x0, z1]] as const).map(([x, z]) => turn(f, x, z));
  return { x0: Math.min(...r.map((q) => q[0])), x1: Math.max(...r.map((q) => q[0])), z0: Math.min(...r.map((q) => q[1])), z1: Math.max(...r.map((q) => q[1])), bottom: y0, top: y1 };
}

// Ordre de dessin (peintre) : tri topologique de relations deux à deux, clé de repli = profondeur du centre puis hauteur.
function paintOrder(pieces: Piece[], f: Frame): Piece[] {
  // Centre au sol de la pièce (le globe est repéré par sa sphère, sans ses arcs).
  const center = (p: Piece): [number, number, number] => {
    const [x0, x1, y0, , z0, z1] = p.shape === 'ball' ? [p.cx - p.rx, p.cx + p.rx, p.cy - p.ry, 0, p.cz - p.rz, p.cz + p.rz] : pieceBounds(p);
    return [(x0 + x1) / 2, y0, (z0 + z1) / 2];
  };
  const base = [...pieces].sort((a, b) => {
    const [ax, ay, az] = center(a);
    const [bx, by, bz] = center(b);
    return depthOf(f, bx, bz) - depthOf(f, ax, az) || ay - by;
  });
  const bs = base.map((p) => boundsOf(p, f));
  const n = base.length;
  const after: number[][] = base.map(() => []); // after[i] = pièces à dessiner après i
  const waiting = base.map(() => 0);
  const EPS = 0.5;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = bs[i]!;
      const b = bs[j]!;
      const overlap = a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;
      const la = base[i]!.layer ?? 0;
      const lb = base[j]!.layer ?? 0;
      let first = -1; // indice de la pièce à dessiner d'abord
      if (overlap && la !== lb) first = la < lb ? i : j;
      else if (overlap && b.bottom >= a.top - EPS) first = i;
      else if (overlap && a.bottom >= b.top - EPS) first = j;
      else if (a.z0 >= b.z1 - 1e-6) first = i; // a entièrement derrière b
      else if (b.z0 >= a.z1 - 1e-6) first = j;
      if (first < 0) continue;
      const second = first === i ? j : i;
      after[first]!.push(second);
      waiting[second]!++;
    }
  }
  const done = new Array<boolean>(n).fill(false);
  const out: Piece[] = [];
  for (let k = 0; k < n; k++) {
    let pick = base.findIndex((_, i) => !done[i] && waiting[i] === 0);
    if (pick < 0) pick = done.indexOf(false); // cycle : repli sur la clé de profondeur
    done[pick] = true;
    out.push(base[pick]!);
    for (const s of after[pick]!) waiting[s]!--;
  }
  return out;
}

export function renderModel(model: Model, angle: Angle): Rendered {
  const L = layoutOf(model, angle);
  const { f } = L;
  const order = paintOrder(model.pieces, f);
  const shapes: Shape[] = [];
  for (const p of order) {
    const tone = p.tone ?? 1;
    const own = p.color !== undefined || p.tag !== undefined;
    const push = (s: Shape) => shapes.push(tone === 1 && !own ? s : { ...s, shade: s.shade * tone, ...(p.color !== undefined && { color: p.color }), ...(p.tag !== undefined && { tag: p.tag }) });
    if (p.shape === 'ball') { drawBall(p, L, push); continue; }
    if (p.shape === 'rod') { drawRound(L, push, { x: p.a[0], y: p.a[1], z: p.a[2] }, { x: p.b[0], y: p.b[1], z: p.b[2] }, p.r, p.r, p.fill); continue; }
    if (p.shape === 'cyl') { drawRound(L, push, { x: p.cx, y: p.y, z: p.cz }, { x: p.cx, y: p.y + p.h, z: p.cz }, p.r, p.r2 ?? p.r, p.fill); continue; }
    if (p.shape === 'foliage') { drawFoliage(p, L, push); continue; }
    if (p.shape === 'box') {
      const faces = boxFaces(p).filter((fc) => visible(f, fc.normal));
      // Le dessus en dernier (il recouvre le haut des côtés) ; l'ordre des côtés visibles est indifférent (ils ne se recouvrent pas).
      faces.sort((a, b) => a.normal.y - b.normal.y);
      for (const fc of faces) {
        const d = p.decals?.find((q) => q.face === fc.name);
        const decal: DecalPx | undefined = d && { key: d.key, tl: L.toPx(fc.frame[0]), tr: L.toPx(fc.frame[1]), bl: L.toPx(fc.frame[2]), w: fc.size[0], h: fc.size[1] };
        push({ kind: 'poly', points: fc.pts.map((pt) => L.toPx(pt)), fill: p.fill, shade: shadeOf(f, fc.normal), ...(decal && { decal }) });
      }
      continue;
    }
    // Prisme : côtés du plus loin au plus proche, puis le bout visible (il recouvre les côtés d'un profil creux, ex. les dents d'un engrenage).
    const { sides, caps } = prismFaces(p);
    const depth = (fc: Face) => fc.pts.reduce((sum, q) => sum + depthOf(f, q.x, q.z), 0) / fc.pts.length;
    const faces = [...sides.filter((fc) => visible(f, fc.normal)).sort((a, b) => depth(b) - depth(a)), ...caps.filter((fc) => visible(f, fc.normal))];
    for (const fc of faces) push({ kind: 'poly', points: fc.pts.map((pt) => L.toPx(pt)), fill: p.fill, shade: shadeOf(f, fc.normal) });
  }
  return { shapes, cols: L.cols, rows: L.rows, floor: floorOf(model, L) };
}

type Push = (s: Shape) => void;

// Enveloppe convexe de points écran (chaîne monotone d'Andrew).
function hull(pts: [number, number][]): [number, number][] {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]) => {
    const out: [number, number][] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(s), ...half([...s].reverse())];
}

// Bande autour d'une ligne écran, demi-largeur (px) constante : côté gauche puis côté droit à rebours.
function band(line: [number, number][], half: number): { left: [number, number][]; right: [number, number][] } {
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  line.forEach((p, i) => {
    const a = line[Math.max(0, i - 1)]!;
    const b = line[Math.min(line.length - 1, i + 1)]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (-(b[1] - a[1]) / len) * half;
    const ny = ((b[0] - a[0]) / len) * half;
    left.push([p[0] + nx, p[1] + ny]);
    right.push([p[0] - nx, p[1] - ny]);
  });
  return { left, right: right.reverse() };
}

// Découpe une suite de points en morceaux consécutifs de même visibilité (le point de bascule appartient aux deux).
function runs<T>(pts: T[], front: boolean[]): { front: boolean; pts: T[] }[] {
  const out: { front: boolean; pts: T[] }[] = [];
  pts.forEach((p, i) => {
    const last = out[out.length - 1];
    if (last && last.front === front[i]) last.pts.push(p);
    else {
      if (last) last.pts.push(p);
      out.push({ front: front[i]!, pts: i > 0 ? [pts[i - 1]!, p] : [p] });
    }
  });
  return out;
}

// Sphère (ou ellipsoïde) : ellipse englobante ; pour un globe, arcs de méridien derrière puis devant, continents et parallèles sur la face visible.
function drawBall(p: Extract<Piece, { shape: 'ball' }>, L: Layout3d, push: Push): void {
  const { f } = L;
  const [cx, cy] = L.toPx({ x: p.cx, y: p.cy, z: p.cz });
  const rx = Math.hypot(p.rx * f.cos, p.rz * f.sin) * PX_PER_CM_X;
  // Hauteur écran : la hauteur propre + la profondeur tournée (rz') qui remonte dans la perspective.
  const rzTurned = Math.hypot(p.rx * f.sin, p.rz * f.cos);
  const ry = Math.hypot(p.ry * PX_PER_CM_Y, rzTurned * DEPTH_PX_PER_CM);
  const R = p.rx;
  const t = ((p.tilt ?? 0) * Math.PI) / 180;
  const v = viewDir(f);
  const vv = dot(v, v);
  // Direction (latitude, longitude) du globe, axe des pôles incliné de `tilt` vers la droite.
  const dirOf = (lat: number, lon: number): V3 => {
    const la = (lat * Math.PI) / 180;
    const lo = (lon * Math.PI) / 180;
    const x = Math.cos(la) * Math.sin(lo);
    const y = Math.sin(la);
    return { x: x * Math.cos(t) + y * Math.sin(t), y: -x * Math.sin(t) + y * Math.cos(t), z: -Math.cos(la) * Math.cos(lo) };
  };
  // Point de direction q à la distance s (rayon équatorial) : une boule aplatie (pouf) étire ses parallèles et méridiens avec elle.
  const at = (q: V3, s: number) => L.toPx({ x: p.cx + q.x * s, y: p.cy + q.y * s * (p.ry / p.rx), z: p.cz + q.z * s * (p.rz / p.rx) });
  // Un point hors de la sphère est devant elle s'il est du côté du spectateur (q · v > 0), derrière sinon.
  const front: Shape[] = [];
  for (const g of p.rings ?? []) {
    const n = 48;
    const qs = Array.from({ length: n + 1 }, (_, i) => dirOf(g.from + ((g.to - g.from) * i) / n, g.lon));
    for (const run of runs(qs, qs.map((q) => dot(q, v) > 0))) {
      if (run.pts.length < 2) continue;
      const { left, right } = band(run.pts.map((q) => at(q, g.r)), (g.w / 2) * PX_PER_CM_X);
      const shape: Shape = { kind: 'poly', points: [...left, ...right], fill: g.fill, shade: SHADE.front };
      if (run.front) front.push(shape);
      else push(shape);
    }
  }
  push({ kind: 'ellipse', cx, cy, rx, ry, fill: p.fill, shade: SHADE.front });
  // Cellulo, comme les corps ronds : croissant d'ombre nette en bas à droite (la boule moins elle-même décalée vers la lumière, en haut
  // à gauche), puis le contour repassé. Une boule minuscule (rivet, pied boule) reste une simple ellipse.
  if (Math.max(rx, ry) * 2 >= TINY_PX) {
    const N = 48;
    const [sx, sy] = [cx - rx * BALL_SHIFT[0], cy - ry * BALL_SHIFT[1]];
    const at = (ox: number, oy: number, i: number): [number, number] => [ox + rx * Math.cos((i * 2 * Math.PI) / N), oy + ry * Math.sin((i * 2 * Math.PI) / N)];
    const inside = (q: [number, number], ox: number, oy: number): boolean => ((q[0] - ox) / rx) ** 2 + ((q[1] - oy) / ry) ** 2 < 1;
    // Arc d'une ellipse qui vérifie `keep`, parcouru d'un seul tenant (on part d'un point qui ne le vérifie pas).
    const arc = (ox: number, oy: number, keep: (q: [number, number]) => boolean): [number, number][] => {
      const pts = Array.from({ length: N }, (_, i) => at(ox, oy, i));
      const start = pts.findIndex((q) => !keep(q));
      return Array.from({ length: N }, (_, k) => pts[(start + k) % N]!).filter(keep);
    };
    const outer = arc(cx, cy, (q) => !inside(q, sx, sy));
    const inner = arc(sx, sy, (q) => inside(q, cx, cy)).reverse();
    if (outer.length >= 2 && inner.length >= 2) push({ kind: 'poly', points: [...outer, ...inner], fill: p.fill, shade: SHADE.front * SHADE.side, ink: 'none' });
    push({ kind: 'poly', points: Array.from({ length: N }, (_, i) => at(cx, cy, i)), fill: p.fill, shade: SHADE.front, ink: 'only' });
  }
  for (const m of p.marks ?? []) {
    const dense = m.pts.flatMap((a, i) => {
      const b = m.pts[(i + 1) % m.pts.length]!;
      return Array.from({ length: 4 }, (_, k) => dirOf(a[0] + ((b[0] - a[0]) * k) / 4, a[1] + ((b[1] - a[1]) * k) / 4));
    });
    if (!dense.some((q) => dot(q, v) > 0)) continue;
    // Point caché : ramené sur le bord apparent de la sphère (le continent est découpé par le contour).
    const onLimb = (q: V3): V3 => {
      const k = dot(q, v) / vv;
      const r = { x: q.x - k * v.x, y: q.y - k * v.y, z: q.z - k * v.z };
      const len = Math.hypot(r.x, r.y, r.z) || 1;
      return { x: r.x / len, y: r.y / len, z: r.z / len };
    };
    push({ kind: 'poly', points: dense.map((q) => at(dot(q, v) > 0 ? q : onLimb(q), R)), fill: m.fill, shade: SHADE.front });
  }
  for (const ln of p.lines ?? []) {
    const n = 48;
    const qs = Array.from({ length: n + 1 }, (_, i) => (ln.lat !== undefined ? dirOf(ln.lat, (360 * i) / n) : dirOf(-90 + (180 * i) / n, ln.lon ?? 0)));
    for (const run of runs(qs, qs.map((q) => dot(q, v) > 0))) {
      if (run.front && run.pts.length >= 2) push({ kind: 'line', points: run.pts.map((q) => at(q, R)), fill: p.lineFill ?? 'edge', shade: SHADE.front });
    }
  }
  front.forEach(push);
}

// Corps rond (cylindre, cône, tige) entre les centres A (rayon rA) et B (rayon rB), en cellulo : silhouette lisse encrée (enveloppe des deux bouts projetés),
// ombre nette sans trait sur le côté droit, contour repassé par-dessus, puis le bout tourné vers le spectateur.
function drawRound(L: Layout3d, push: Push, A: V3, B: V3, rA: number, rB: number, fill: Fill): void {
  const { f } = L;
  const len = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z) || 1;
  const u = { x: (B.x - A.x) / len, y: (B.y - A.y) / len, z: (B.z - A.z) / len };
  const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const unit = (a: V3): V3 => {
    const l = Math.hypot(a.x, a.y, a.z) || 1;
    return { x: a.x / l, y: a.y / l, z: a.z / l };
  };
  const at = (c: V3, r: number, n: V3) => L.toPx({ x: c.x + r * n.x, y: c.y + r * n.y, z: c.z + r * n.z });
  const e1 = unit(cross(u, Math.abs(u.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }));
  const e2 = cross(u, e1);
  const dirAt = (a: number): V3 => ({ x: Math.cos(a) * e1.x + Math.sin(a) * e2.x, y: Math.cos(a) * e1.y + Math.sin(a) * e2.y, z: Math.cos(a) * e1.z + Math.sin(a) * e2.z });
  const dirs = Array.from({ length: ROUND_STEPS }, (_, i) => dirAt((i * 2 * Math.PI) / ROUND_STEPS));
  const ca = dirs.map((n) => at(A, rA, n));
  const cb = dirs.map((n) => at(B, rB, n));
  // Corps minuscule à l'écran (rivet, clou) : une seule ellipse au lieu de ~50 points (allège la pièce, Android d'abord).
  const xs = [...ca, ...cb].map((q) => q[0]);
  const ys = [...ca, ...cb].map((q) => q[1]);
  const [sw, sh] = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  if (Math.max(sw, sh) < TINY_PX) {
    push({ kind: 'ellipse', cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, rx: sw / 2, ry: sh / 2, fill, shade: SHADE.front });
    return;
  }
  const v = viewDir(f);
  const k = dot(v, u);
  // Génératrice tournée vers le spectateur : elle donne la teinte du corps.
  const toward = { x: v.x - k * u.x, y: v.y - k * u.y, z: v.z - k * u.z };
  const body = hull([...ca, ...cb]);
  if (Math.hypot(toward.x, toward.y, toward.z) > 1e-6 && body.length >= 3) {
    const shade = shadeOf(f, toward);
    const w = unit(toward);
    let side = unit(cross(u, w));
    // Côté droit de l'écran ; tige horizontale vue de face (côté vertical à l'écran) : côté du bas.
    const [sx0, sy0] = at(A, 0, side);
    const [sx1, sy1] = at(A, 1, side);
    if (Math.abs(sx1 - sx0) > 1e-3 ? sx1 < sx0 : sy1 < sy0) side = { x: -side.x, y: -side.y, z: -side.z };
    const strip = Array.from({ length: 7 }, (_, i) => {
      const g = (SHADOW_SPAN * i) / 6;
      return { x: Math.cos(g) * side.x + Math.sin(g) * w.x, y: Math.cos(g) * side.y + Math.sin(g) * w.y, z: Math.cos(g) * side.z + Math.sin(g) * w.z };
    });
    push({ kind: 'poly', points: body, fill, shade });
    push({ kind: 'poly', points: [...strip.map((n) => at(A, rA, n)), ...strip.reverse().map((n) => at(B, rB, n))], fill, shade: shade * SHADE.side, ink: 'none' });
    push({ kind: 'poly', points: body, fill, shade, ink: 'only' });
  }
  const cap = k > 0 ? { pts: cb, n: u } : { pts: ca, n: { x: -u.x, y: -u.y, z: -u.z } };
  if (visible(f, cap.n)) push({ kind: 'poly', points: cap.pts, fill, shade: shadeOf(f, cap.n) });
}

// Feuillage : feuilles du plus loin au plus proche (puis de bas en haut), chacune en aplat pointu avec sa nervure.
function drawFoliage(p: Extract<Piece, { shape: 'foliage' }>, L: Layout3d, push: Push): void {
  const { f } = L;
  const mid = (l: Leaf): V3 => ({ x: (l.base[0] + l.tip[0] + l.ctrl[0] * 2) / 4, y: (l.base[1] + l.tip[1] + l.ctrl[1] * 2) / 4, z: (l.base[2] + l.tip[2] + l.ctrl[2] * 2) / 4 });
  const leaves = [...p.leaves].sort((a, b) => {
    const [ma, mb] = [mid(a), mid(b)];
    return depthOf(f, mb.x, mb.z) - depthOf(f, ma.x, ma.z) || ma.y - mb.y;
  });
  for (const l of leaves) {
    const samples = leafSamples(l);
    const line = samples.map(([q]) => L.toPx(q));
    // Largeur en 3D : horizontale, perpendiculaire à la direction de la feuille, tournée de 40° autour de la nervure (limbe un peu vrillé,
    // visible même de profil) ; les deux bords ne se croisent jamais, même quand la feuille retombe vers le spectateur.
    const hx = l.tip[0] - l.base[0];
    const hz = l.tip[2] - l.base[2];
    const hl = Math.hypot(hx, hz);
    const w3: V3 = hl > 1e-6 ? { x: -hz / hl, y: 0, z: hx / hl } : { x: 1, y: 0, z: 0 };
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    samples.forEach(([q, half], i) => {
      const t = i / LEAF_STEPS;
      const tan: V3 = { x: 2 * (1 - t) * (l.ctrl[0] - l.base[0]) + 2 * t * (l.tip[0] - l.ctrl[0]), y: 2 * (1 - t) * (l.ctrl[1] - l.base[1]) + 2 * t * (l.tip[1] - l.ctrl[1]), z: 2 * (1 - t) * (l.ctrl[2] - l.base[2]) + 2 * t * (l.tip[2] - l.ctrl[2]) };
      const nb = { x: tan.y * w3.z - tan.z * w3.y, y: tan.z * w3.x - tan.x * w3.z, z: tan.x * w3.y - tan.y * w3.x };
      const nl = Math.hypot(nb.x, nb.y, nb.z) || 1;
      const [c, sn] = [Math.cos(LEAF_TWIST), Math.sin(LEAF_TWIST)];
      const W = { x: c * w3.x + (sn * nb.x) / nl, y: c * w3.y + (sn * nb.y) / nl, z: c * w3.z + (sn * nb.z) / nl };
      left.push(L.toPx({ x: q.x + half * W.x, y: q.y + half * W.y, z: q.z + half * W.z }));
      right.push(L.toPx({ x: q.x - half * W.x, y: q.y - half * W.y, z: q.z - half * W.z }));
    });
    // Monstera : trois paires de fentes, le bord ramené vers la nervure aux points 3, 5 et 7 (de la fin, pour garder les indices).
    if (l.form === 'heart') {
      for (const i of [7, 5, 3]) {
        const [cx, cy] = line[i]!;
        const pull = (p: [number, number]): [number, number] => [cx + (p[0] - cx) * 0.4, cy + (p[1] - cy) * 0.4];
        left.splice(i, 0, pull(left[i]!));
        right.splice(i, 0, pull(right[i]!));
      }
    }
    right.reverse();
    // Feuille tournée vers le spectateur un peu plus claire, vers le fond un peu plus sombre.
    const dz = depthOf(f, l.tip[0], l.tip[2]) - depthOf(f, l.base[0], l.base[2]);
    const reach = Math.hypot(l.tip[0] - l.base[0], l.tip[2] - l.base[2]) || 1;
    const shade = 1 - 0.08 * (dz / reach);
    const fill = l.fill ?? p.fill;
    push({ kind: 'poly', points: [...left, ...right.slice(1, -1)], fill, shade });
    push({ kind: 'line', points: line.slice(1, -2), fill, shade: shade * 0.78 });
  }
}

// Cases au sol : couvertes à plus de 50 % par la trace tournée ; au moins la plus couverte.
function floorOf(model: Model, L: Layout3d): { col: number; row: number }[] {
  const traceW = Math.max(...footprint(model, L.f).map((p) => p[0]));
  const trace = footprint(model, L.f, footOf(model));
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

// Coins du dessus du meuble (plan y = h) projetés, px du rectangle de dessin : avant gauche, avant droit, arrière gauche
// (la projection étant affine, ces trois points suffisent à placer tout point du dessus).
export function topCornersOf(model: Model, angle: Angle): [[number, number], [number, number], [number, number]] {
  const L = layoutOf(model, angle);
  return [L.toPx({ x: 0, y: model.h, z: 0 }), L.toPx({ x: model.w, y: model.h, z: 0 }), L.toPx({ x: 0, y: model.h, z: model.d })];
}

// Trace de la base tournée posée au sol (y = 0), projetée en px du rectangle de dessin : ombre au sol du meuble.
export function floorTraceOf(model: Model, angle: Angle): [number, number][] {
  const L = layoutOf(model, angle);
  return footOf(model).map(([x, z]) => L.toPx({ x, y: 0, z }));
}

// Coins de la face avant (`model.face`, plan z = 0) projetés, px du rectangle de dessin : haut gauche, haut droit, bas gauche ;
// null si on ne la voit pas. La projection est affine : en ¾, la face est un parallélogramme.
export function faceCornersOf(model: Model, angle: Angle): { tl: [number, number]; tr: [number, number]; bl: [number, number] } | null {
  if (angle !== 0 && angle !== 1 && angle !== 7) return null;
  const face = model.face ?? { x: 0, y: 0, w: model.w, h: model.h };
  const L = layoutOf(model, angle);
  const top = face.y + face.h;
  return { tl: L.toPx({ x: face.x, y: top, z: 0 }), tr: L.toPx({ x: face.x + face.w, y: top, z: 0 }), bl: L.toPx({ x: face.x, y: face.y, z: 0 }) };
}

// Ouverture de la face avant (`model.face` : entre les montants, la plinthe et le dessus) projetée, px du rectangle de dessin :
// haut gauche, haut droit, bas droit, bas gauche ; null si on ne la voit pas. Un objet rangé dans le meuble ne se voit qu'à travers elle.
export function openingOf(model: Model, angle: Angle): [number, number][] | null {
  const c = faceCornersOf(model, angle);
  if (!c) return null;
  return [c.tl, c.tr, [c.tr[0] + c.bl[0] - c.tl[0], c.tr[1] + c.bl[1] - c.tl[1]], c.bl];
}

// Niveaux de rangement de la face avant, du haut vers le bas, en fractions de sa hauteur depuis son haut : les intervalles entre
// les tablettes (boîtes horizontales minces qui traversent la face). Sans tablette : un seul niveau, toute la face.
export function levelsOf(model: Model): [number, number][] {
  const face = model.face ?? { x: 0, y: 0, w: model.w, h: model.h };
  const top = face.y + face.h;
  const boards = model.pieces
    .filter((p): p is Extract<Piece, { shape: 'box' }> => p.shape === 'box' && p.h <= 6 && p.w >= face.w * 0.9 && p.y > face.y && p.y + p.h < top)
    .map((p) => [p.y, p.y + p.h] as const)
    .sort((a, b) => b[0] - a[0]);
  const levels: [number, number][] = [];
  let ceiling = top;
  for (const [lo, hi] of boards) {
    levels.push([(top - ceiling) / face.h, (top - hi) / face.h]);
    ceiling = lo;
  }
  levels.push([(top - ceiling) / face.h, 1]);
  return levels;
}

// Repère « lumière » d'un meuble tourné, en cm : x depuis le bord gauche du rectangle de dessin (centrage compris, comme renderModel),
// y hauteur depuis le sol, z profondeur depuis l'avant de la trace (le bas du rectangle).
export type LocalBox = { x0: number; x1: number; z0: number; z1: number; d0: number; d1: number };
const shiftOf = (model: Model, angle: Angle): { f: Frame; dx: number } => {
  const L = layoutOf(model, angle);
  const trace = footprint(model, L.f);
  return { f: L.f, dx: (L.cols * 21 - Math.max(...trace.map((p) => p[0]))) / 2 };
};

// Point du modèle → px du rectangle de dessin (même projection que le dessin).
export function projectOf(model: Model, angle: Angle, p: V3t): [number, number] {
  return layoutOf(model, angle).toPx({ x: p[0], y: p[1], z: p[2] });
}

export function localPointOf(model: Model, angle: Angle, p: V3t): { x: number; y: number; z: number } {
  const { f, dx } = shiftOf(model, angle);
  const l = local(f, { x: p[0], y: p[1], z: p[2] });
  return { x: l.x + dx, y: l.y, z: l.z };
}

// Pièce qui compte pour la lumière : ni minuscule (toutes ses mesures ≤ 6 cm : embout, rivet, boule d'articulation), ni contenue à 1 cm près dans une autre
// (planches peintes, porte et plaque affleurantes de la niche) — elles n'ajoutent pas d'ombre, seulement du calcul.
const OCCLUDER_MIN = 6;
function occluding(pieces: Piece[]): Piece[] {
  const b = pieces.map(pieceBounds);
  const vol = b.map(([x0, x1, y0, y1, z0, z1]) => (x1 - x0) * (y1 - y0) * (z1 - z0));
  const inside = (i: number, j: number): boolean => [0, 2, 4].every((k) => b[j]![k]! - 1 <= b[i]![k]! && b[i]![k + 1]! <= b[j]![k + 1]! + 1);
  return pieces.filter((_, i) => {
    const [x0, x1, y0, y1, z0, z1] = b[i]!;
    if (x1 - x0 <= OCCLUDER_MIN && y1 - y0 <= OCCLUDER_MIN && z1 - z0 <= OCCLUDER_MIN) return false;
    // Deux pièces de même encombrement : la première reste.
    return !b.some((_, j) => j !== i && inside(i, j) && (vol[j]! > vol[i]! || (vol[j] === vol[i] && j < i)));
  });
}

// Occulteurs du meuble tourné : boîte englobante tournée de chaque pièce qui compte (x, profondeur d) et sa hauteur (z), en cm du repère « lumière ».
// En diagonale, la boîte englobante d'une pièce longue déborde beaucoup de la pièce (un canapé à 45° couvrirait le sol devant lui) :
// la pièce est découpée en tranches d'au plus SLICE_CM le long de sa plus grande longueur, chaque tranche donne sa boîte.
const SLICE_CM = 40;
export function occluderBoxesOf(model: Model, angle: Angle): LocalBox[] {
  const { f, dx } = shiftOf(model, angle);
  const out: LocalBox[] = [];
  for (const p of occluding(model.pieces)) {
    const [x0, x1, y0, y1, z0, z1] = pieceBounds(p);
    const alongX = x1 - x0 >= z1 - z0;
    const n = angle % 2 === 1 ? Math.max(1, Math.ceil((alongX ? x1 - x0 : z1 - z0) / SLICE_CM)) : 1;
    for (let i = 0; i < n; i++) {
      const [a0, a1] = alongX ? [x0 + ((x1 - x0) * i) / n, x0 + ((x1 - x0) * (i + 1)) / n] : [z0 + ((z1 - z0) * i) / n, z0 + ((z1 - z0) * (i + 1)) / n];
      const corners = alongX ? [[a0, z0], [a1, z0], [a1, z1], [a0, z1]] : [[x0, a0], [x1, a0], [x1, a1], [x0, a1]];
      const r = corners.map(([x, z]) => turn(f, x!, z!));
      const [xs, zs] = [r.map((q) => q[0]), r.map((q) => q[1])];
      out.push({ x0: Math.min(...xs) - f.minX + dx, x1: Math.max(...xs) - f.minX + dx, z0: y0, z1: y1, d0: Math.min(...zs) - f.minZ, d1: Math.max(...zs) - f.minZ });
    }
  }
  return out;
}

// Dessus praticable projeté (px du rectangle de dessin) : segment horizontal qui passe par son centre, bords compris dans le dessus
// (en ¾ le dessus est un parallélogramme : la corde horizontale par son centre y reste entière) ; `depth` = profondeur du centre (cm
// depuis l'avant de la trace), `height` = hauteur du dessus (cm). null sans dessus praticable.
export function perchOf(model: Model, angle: Angle): { x0: number; x1: number; y: number; depth: number; height: number } | null {
  const p = model.perch;
  if (!p) return null;
  const L = layoutOf(model, angle);
  const pts = [[p.x, p.z], [p.x + p.w, p.z], [p.x + p.w, p.z + p.d], [p.x, p.z + p.d]].map(([x, z]) => L.toPx({ x: x!, y: p.y, z: z! }));
  const [cx, cy] = [pts.reduce((s, q) => s + q[0], 0) / 4, pts.reduce((s, q) => s + q[1], 0) / 4];
  const xs: number[] = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % 4]!;
    if ((a[1] - cy) * (b[1] - cy) > 0 || a[1] === b[1]) return;
    xs.push(a[0] + ((b[0] - a[0]) * (cy - a[1])) / (b[1] - a[1]));
  });
  // Corde dégénérée (côtés horizontaux) : tout le dessus, qui est alors un rectangle à l'écran.
  const [x0, x1] = xs.length >= 2 ? [Math.min(...xs), Math.max(...xs)] : [Math.min(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[0]))];
  return { x0, x1, y: cy, depth: local(L.f, { x: p.x + p.w / 2, y: p.y, z: p.z + p.d / 2 }).z, height: p.y };
}
