import type { Leaf, Model, Piece } from '../furniture-render3d';
import { leafHalf, pieceBounds } from '../furniture-render3d';
import type { CelLook } from './looks';
import { lathe, leaf, normalize, part, place, superEll, tube, type CelPart, type Mesh, type Vec3 } from './mesh';
import { tone, WARM_LIT, type Tone } from './tone';

// Passage d'un modèle à boîtes (furniture-models, en cm : x depuis la gauche, y depuis le sol, z de l'avant vers le fond) aux
// maillages arrondis du moteur cellulo (repère centré : origine au centre de la base, z vers le spectateur). C'est le dessin de
// repli d'un meuble tant qu'il n'est pas redessiné en 3D (cel/models) : même encombrement, pièce par pièce.

// Rondeur des boîtes (superellipsoïde) : presque carrées, arêtes adoucies.
const BOX_ROUND = 0.15;
// Feuille : pas le long de la nervure, épaisseur (cm).
const LEAF_STEPS = 10;
const LEAF_TH = 0.5;

type Frame = { w: number; d: number };
// Point du modèle → repère centré ; normale (vecteur) : seul z change de sens.
const at = (m: Frame, x: number, y: number, z: number): Vec3 => [x - m.w / 2, y, m.d / 2 - z];
const dirOf = (x: number, y: number, z: number): Vec3 => [x, y, -z];

// Éclaircit (> 1) ou assombrit (< 1) une couleur #RRGGBB (teinte propre `tone` d'une pièce).
function scaleHex(hex: string, k: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`.toUpperCase();
}

// Teinte d'une pièce : celle de la palette (même objet que look.tones : l'abat-jour se reconnaît par identité), sa couleur propre sinon.
function toneOf(p: Piece, look: CelLook): Tone {
  const k = p.tone ?? 1;
  if (p.color === undefined && k === 1) return look.tones[p.fill];
  return tone(scaleHex(p.color ?? look.tones[p.fill].base, k));
}

function boxMesh(p: Extract<Piece, { shape: 'box' }>, m: Frame): Mesh {
  const { x, y, z, w, h, d } = p;
  const e = superEll(w / 2, h / 2, d / 2, BOX_ROUND, BOX_ROUND);
  if (!p.lean) return place(e, { t: at(m, x + w / 2, y + h / 2, z + d / 2) });
  // Penchée autour de son arête bas avant : le haut part vers le fond (−z du repère centré) pour un angle positif.
  const pivot = at(m, x + w / 2, y, z);
  return place(place(e, { t: [0, h / 2, -d / 2] }), { rx: (-p.lean * Math.PI) / 180, t: pivot });
}

// Feuille le long de sa nervure (Bézier base → contrôle → pointe) : contour paramétré (s le long, v en travers), posé par déformation.
function leafMesh(l: Leaf, m: Frame): Mesh {
  const form = l.form ?? 'lance';
  const B = (s: number): Vec3 => {
    const k = (i: 0 | 1 | 2) => (1 - s) * (1 - s) * l.base[i] + 2 * s * (1 - s) * l.ctrl[i] + s * s * l.tip[i];
    return at(m, k(0), k(1), k(2));
  };
  const T = (s: number): Vec3 => {
    const a = B(Math.max(0, s - 0.02)), b = B(Math.min(1, s + 0.02));
    return normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  };
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const deform = (s: number, y: number, v: number): Vec3 => {
    const p = B(s), t = T(s);
    const side = normalize(cross(t, Math.abs(t[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0]));
    const up = cross(side, t);
    return [p[0] + side[0] * v + up[0] * y, p[1] + side[1] * v + up[1] * y, p[2] + side[2] * v + up[2] * y];
  };
  const outline: [number, number][] = [];
  for (let i = 0; i <= LEAF_STEPS; i++) outline.push([i / LEAF_STEPS, leafHalf(form, i / LEAF_STEPS, l.w)]);
  for (let i = LEAF_STEPS - 1; i > 0; i--) outline.push([i / LEAF_STEPS, -leafHalf(form, i / LEAF_STEPS, l.w)]);
  return leaf(outline, LEAF_TH, deform, [0.5, 0]);
}

// Prisme : faces latérales planes (une par arête du profil, normale sortante) et deux bouts en éventail depuis le centre du profil.
function prismMesh(p: Extract<Piece, { shape: 'prism' }>, m: Frame): Mesh {
  const pr = p.profile;
  let area = 0;
  for (let i = 0; i < pr.length; i++) area += pr[i]![0] * pr[(i + 1) % pr.length]![1] - pr[(i + 1) % pr.length]![0] * pr[i]![1];
  const sign = area >= 0 ? 1 : -1;
  const P = (u: number, y: number, t: number): Vec3 => (p.axis === 'z' ? at(m, u, y, t) : at(m, t, y, u));
  const N = (nu: number, ny: number): Vec3 => (p.axis === 'z' ? dirOf(nu, ny, 0) : dirOf(0, ny, nu));
  const mesh: Mesh = { v: [], n: [], t: [] };
  const push = (v: Vec3, n: Vec3): number => {
    mesh.v.push(v);
    mesh.n.push(n);
    return mesh.v.length - 1;
  };
  pr.forEach((a, i) => {
    const b = pr[(i + 1) % pr.length]!;
    const [du, dy] = [b[0] - a[0], b[1] - a[1]];
    const len = Math.hypot(du, dy) || 1;
    const n = N((sign * dy) / len, (-sign * du) / len);
    const q = [P(a[0], a[1], p.from), P(b[0], b[1], p.from), P(b[0], b[1], p.to), P(a[0], a[1], p.to)].map((v) => push(v, n));
    mesh.t.push([q[0]!, q[1]!, q[2]!], [q[0]!, q[2]!, q[3]!]);
  });
  const dir = p.to >= p.from ? 1 : -1;
  const [cu, cy] = [pr.reduce((s, q) => s + q[0], 0) / pr.length, pr.reduce((s, q) => s + q[1], 0) / pr.length];
  for (const [t, k] of [[p.from, -dir], [p.to, dir]] as const) {
    const n = p.axis === 'z' ? dirOf(0, 0, k) : dirOf(k, 0, 0);
    const c = push(P(cu, cy, t), n);
    const ring = pr.map(([u, y]) => push(P(u, y, t), n));
    ring.forEach((r, i) => mesh.t.push([c, r, ring[(i + 1) % ring.length]!]));
  }
  return mesh;
}

// Maillages d'une pièce (une feuille = un maillage).
function meshesOf(p: Piece, m: Frame): Mesh[] {
  switch (p.shape) {
    case 'box': return [boxMesh(p, m)];
    case 'cyl': return [place(lathe([[p.r, 0], [p.r2 ?? p.r, p.h]]), { t: at(m, p.cx, p.y, p.cz) })];
    case 'lathe': return [place(lathe(p.profile), { t: at(m, p.cx, 0, p.cz) })];
    case 'rod': return [tube([at(m, ...p.a), at(m, ...p.b)], p.r)];
    case 'ball': return [place(superEll(p.rx, p.ry, p.rz, 1, 1), { rz: (-(p.tilt ?? 0) * Math.PI) / 180, t: at(m, p.cx, p.cy, p.cz) })];
    case 'prism': return [prismMesh(p, m)];
    case 'foliage': return p.leaves.map((l) => leafMesh(l, m));
  }
}

export type ConvertOptions = {
  /** Pièce lumineuse (abat-jour allumé) : teinte WARM_LIT, sans ombrage ni ombre portée. */
  glow?: (p: Piece) => boolean;
};

// Boîte d'ouverture (cm, repère du modèle) : la face rétrécie de 2 cm, sur toute la profondeur ; une pièce qui la touche se voit à
// travers l'ouverture (tablettes, fond) et est marquée `interior`.
function openingBox(model: Model): [number, number, number, number, number, number] | null {
  const f = model.face;
  if (!f || f.w <= 4 || f.h <= 4) return null;
  return [f.x + 2, f.x + f.w - 2, f.y + 2, f.y + f.h - 2, 0, model.d];
}
const overlaps = (b: readonly number[], o: readonly number[]): boolean =>
  b[0]! < o[1]! && o[0]! < b[1]! && b[2]! < o[3]! && o[2]! < b[3]! && b[4]! < o[5]! && o[4]! < b[5]!;

// Pièces données (repère du modèle `model`, qui fixe le centrage) → pièces cellulo.
export function celFromPieces(pieces: readonly Piece[], model: Pick<Model, 'w' | 'd' | 'face'>, look: CelLook, opts: ConvertOptions = {}): CelPart[] {
  const open = 'face' in model ? openingBox(model as Model) : null;
  return pieces.flatMap((p) => {
    const glow = opts.glow?.(p) === true;
    const interior = open !== null && overlaps(pieceBounds(p), open);
    const col = glow ? WARM_LIT : toneOf(p, look);
    return meshesOf(p, model).map((m) => part(m, col, { ...(glow && { glow: true }), ...(interior && { interior: true }) }));
  });
}

// Modèle à boîtes → maillages arrondis (box → superellipsoïde e = 0,15, cyl/lathe → tour, rod → tube, ball → ellipsoïde,
// foliage → feuilles, prism → extrusion), même encombrement.
export function celFromModel(model: Model, look: CelLook): CelPart[] {
  return celFromPieces(model.pieces, model, look);
}
