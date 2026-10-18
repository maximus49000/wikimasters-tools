// Vêtements tirés du corps :
//  • « coques » : sous-ensemble des triangles du corps (zone choisie par os dominant et position), gonflé le long des
//    normales — t-shirt, pull, pantalon, short, chaussettes, chaussures, barbe… ;
//  • « jupes » : cône construit autour du bassin, poids partagés entre bassin et cuisses — jupe, robe, bas de manteau.
import * as THREE from 'three';
import type { Pattern } from '../catalogue';
import { comp, skinned, smooth, type Attr, type BodyInfo, type VertexInfo } from './body';
import type { Motif } from './materials';

export type Field = (v: VertexInfo) => number;
export type Reshape = (pos: number[], i: number, bind: number[]) => void;
export type ShellOpts = { reshape?: Reshape; pattern?: Motif | null };

// Coque : zone du corps où le champ `field(v)` est positif, découpée proprement sur la ligne field = 0 (les triangles
// à cheval sont tranchés, les nouveaux sommets interpolés), puis gonflée de `off` (fraction de la hauteur du corps).
export function shell(A: BodyInfo, field: Field, off: number | Field, color: string, opts: ShellOpts = {}): THREE.SkinnedMesh {
  const g = A.body.geometry;
  const P = g.attributes.position!, N = g.attributes.normal!, SI = g.attributes.skinIndex!, SW = g.attributes.skinWeight!;
  const f = new Float32Array(P.count);
  for (let i = 0; i < P.count; i++) f[i] = field(A.info[i]!);
  const pos: number[] = [], nor: number[] = [], si: number[] = [], sw: number[] = [], ind: number[] = [];
  const offAt = typeof off === 'function' ? (v: number) => off(A.info[v]!) * A.H : () => off * A.H;
  const bind: number[] = [];
  const map = new Map<number, number>();
  const vert = (v: number): number => {
    let j = map.get(v);
    if (j === undefined) {
      j = pos.length / 3; map.set(v, j);
      const d = offAt(v);
      pos.push(P.getX(v) + N.getX(v) * d, P.getY(v) + N.getY(v) * d, P.getZ(v) + N.getZ(v) * d);
      // Motifs : sur les bras (horizontaux en pose de liaison), la coordonnée des rayures suit le bras (|x|) pour faire des anneaux.
      const inf = A.info[v]!, arm = inf.part === 'arm' || inf.part === 'hand';
      bind.push(P.getX(v), arm ? Math.abs(P.getX(v)) + A.J.Spine2.y : P.getY(v), P.getZ(v));
      nor.push(N.getX(v), N.getY(v), N.getZ(v));
      for (let k = 0; k < 4; k++) { si.push(comp(SI, v, k)); sw.push(comp(SW, v, k)); }
    }
    return j;
  };
  // Point de coupe sur l'arête a→b (a dedans, b dehors) : position et normale interpolées, poids du sommet intérieur.
  const cut = (a: number, b: number): number => {
    const t = f[a]! / (f[a]! - f[b]!);
    const L = (A_: Attr, i: number) => comp(A_, a, i) + (comp(A_, b, i) - comp(A_, a, i)) * t;
    const n: [number, number, number] = [L(N, 0), L(N, 1), L(N, 2)];
    const d = offAt(a) + (offAt(b) - offAt(a)) * t;
    pos.push(L(P, 0) + n[0] * d, L(P, 1) + n[1] * d, L(P, 2) + n[2] * d);
    const ia = A.info[a]!, armA = ia.part === 'arm' || ia.part === 'hand';
    bind.push(L(P, 0), armA ? Math.abs(L(P, 0)) + A.J.Spine2.y : L(P, 1), L(P, 2));
    nor.push(...n);
    for (let k = 0; k < 4; k++) { si.push(comp(SI, a, k)); sw.push(comp(SW, a, k)); }
    return pos.length / 3 - 1;
  };
  const src = g.index ? g.index.array : Array.from({ length: P.count }, (_, i) => i);
  for (let k = 0; k < src.length; k += 3) {
    const t = [src[k]!, src[k + 1]!, src[k + 2]!];
    const inn = t.map((v) => f[v]! > 0);
    const n = inn.filter(Boolean).length;
    if (n === 0) continue;
    if (n === 3) { ind.push(vert(t[0]!), vert(t[1]!), vert(t[2]!)); continue; }
    // Rotation pour que le cas commence au sommet « isolé ».
    let r = 0;
    if (n === 1) r = inn.indexOf(true); else r = inn.indexOf(false);
    const a = t[r]!, b = t[(r + 1) % 3]!, c = t[(r + 2) % 3]!;
    if (n === 1) ind.push(vert(a), cut(a, b), cut(a, c));
    else { const ab = cut(b, a), ac = cut(c, a); ind.push(ab, vert(b), vert(c), ab, vert(c), ac); }
  }
  if (opts.reshape) for (let i = 0; i < pos.length; i += 3) opts.reshape(pos, i, bind);
  smooth(nor, ind, 6);
  const mesh = skinned(A, pos, nor, si, sw, ind, color, THREE.FrontSide, opts.pattern);
  mesh.geometry.setAttribute('bindPos', new THREE.Float32BufferAttribute(bind, 3));
  return mesh;
}

// Rayon horizontal du corps autour de l'axe du bassin, par tranche de hauteur et par angle (pour jupes et manteaux).
export function bodyRadius(A: BodyInfo): (y: number, az: number) => number {
  const NA = 48, c = A.J.Hips;
  const cache = new Map<number, Float32Array>();
  return (y, az) => {
    const key = Math.round(y * 200);
    let row = cache.get(key);
    if (!row) {
      row = new Float32Array(NA);
      for (const v of A.info) {
        if (Math.abs(v.y - key / 200) > 0.01 || v.part === 'hand' || v.part === 'arm') continue;
        const dx = v.x - c.x, dz = v.z - c.z;
        const a = Math.floor(((Math.atan2(dx, dz) + Math.PI) / (2 * Math.PI)) * NA) % NA;
        row[a] = Math.max(row[a]!, Math.hypot(dx, dz));
      }
      for (let a = 0; a < NA; a++) if (!row[a]) row[a] = Math.max(row[(a + NA - 1) % NA]!, row[(a + 1) % NA]!);
      cache.set(key, row);
    }
    const a = Math.floor(((az + Math.PI) / (2 * Math.PI)) * NA) % NA;
    return Math.max(row[a]!, row[(a + 1) % NA]!, row[(a + NA - 1) % NA]!);
  };
}

export type SkirtOpts = { top?: number; len?: number; flare?: number; off?: number; color: string; folds?: number; pattern?: Pattern | null };

// Jupe : du haut (yTop) jusqu'à la longueur `len` (fraction de la hauteur hanche→cheville), évasée de `flare`.
export function skirt(A: BodyInfo, { top = A.waistY + 0.02 * A.H, len = 0.6, flare = 0.35, off = 0.012, color, folds = 0.006, pattern = null }: SkirtOpts): THREE.SkinnedMesh {
  const R = bodyRadius(A), c = A.J.Hips, e = A.ease ?? 1;
  const ankle = A.J.LeftFoot.y, hem = top - len * (A.J.LeftUpLeg.y - ankle);
  const NA = 64, NY = 24, pos: number[] = [], si: number[] = [], sw: number[] = [], ind: number[] = [];
  const H = A.idx.Hips, L = A.idx.LeftUpLeg, Rr = A.idx.RightUpLeg;
  // Rayon de départ : le plus large du corps entre la taille et le haut des cuisses (la jupe tombe sans coller).
  const base = (az: number) => { let r = 0; for (let y = top; y >= top - 0.25 * (top - hem); y -= 0.01) r = Math.max(r, R(y, az)); return r; };
  for (let iy = 0; iy <= NY; iy++) {
    const t = iy / NY, y = top + (hem - top) * t;
    for (let ia = 0; ia <= NA; ia++) {
      const az = -Math.PI + (ia / NA) * 2 * Math.PI;
      let r0 = 0.02;
      for (let dy = -0.03; dy <= 0.03; dy += 0.01) r0 = Math.max(r0, R(top + dy * A.H, az));
      r0 += off * e * A.H;
      const fold = folds * A.H * Math.pow(t, 1.4) * (0.6 * Math.sin(az * 9 + 0.7) + 0.4 * Math.sin(az * 14 + 2.1));
      const r = r0 + (base(az) + off * e * A.H - r0) * Math.min(1, t * 4) + flare * (top - hem) * t * t + fold;
      pos.push(c.x + Math.sin(az) * r, y, c.z + Math.cos(az) * r);
      const s = Math.sin(az);
      const wl = t * 0.8 * (0.5 + 0.5 * s), wr = t * 0.8 * (0.5 - 0.5 * s);
      si.push(H, L, Rr, 0); sw.push(1 - wl - wr, wl, wr, 0);
    }
  }
  for (let iy = 0; iy < NY; iy++) for (let ia = 0; ia < NA; ia++) {
    const a = iy * (NA + 1) + ia, b = a + NA + 1;
    ind.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return skinned(A, pos, null, si, sw, ind, color, THREE.DoubleSide, pattern);
}

// ——— Vêtements (coques) ———
// Champs continus : la pose de liaison est en T, donc bas de haut / taille / ourlets = coupes en hauteur, manches = coupes
// le long de x. `aT` / `lT` : avancement le long du bras / de la jambe, prolongés sur tout le corps.
export const aT = (v: VertexInfo): number => (v.part === 'head' || v.part === 'neck' ? -1 : v.armT);
export const lT = (v: VertexInfo): number => v.legT;
export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export type TopOpts = { sleeve?: number; off?: number; color: string; hem?: number; collar?: number; neckR?: number; ease?: number; pattern?: Pattern | null };
export type BottomOpts = { cut?: number; off?: number; color: string; rise?: number; slim?: boolean; pattern?: Pattern | null };

export const garments = {
  boots: (A: BodyInfo, { from = 0.72, color, sole = null }: { from?: number; color: string; sole?: string | null }) => shoeShell(A, from, 0.011, color, 0.006, sole),
  // Peau posée par-dessus le tee-shirt gris du corps de base (bras nus d'un débardeur ou d'une robe).
  skin: (A: BodyInfo, { from = -0.1, to = 0.5 }: { from?: number; to?: number }) => shell(A, (v) => (v.part === 'arm' || v.part === 'shoulder' ? Math.min(aT(v) - from, to - aT(v)) * 0.2 : -1), 0.002, A.skin ?? '#F2C8A0'),
  // Hauts : `sleeve` = longueur de manche, `hem` = bas du haut sous la taille, `ease` = aisance : le tissu s'écarte du corps
  // vers le bas du haut et vers le poignet au lieu de coller comme une seconde peau.
  top: (A: BodyInfo, { sleeve = 0.45, off = 0.008, color, hem = 0.065, collar = 0.3, neckR = 0.062, ease = 0.008, pattern = null }: TopOpts) => {
    const hemY = A.waistY - hem * A.H, colY = A.J.Neck.y + collar * (A.J.Head.y - A.J.Neck.y);
    const nx = A.J.Neck.x, nz = A.J.Neck.z, r0 = neckR * A.H;
    const col = (v: VertexInfo) => Math.max(colY - v.y, Math.hypot(v.x - nx, v.z - nz) - r0);
    const chest = A.J.Spine2.y;
    const e = A.ease ?? 1;
    const offAt = (v: VertexInfo) => e * (off + ease * (v.part === 'arm' ? clamp01(aT(v)) * 0.8 : clamp01((chest - v.y) / (chest - hemY))));
    return shell(A, (v) => Math.min(v.y - hemY, col(v), (sleeve - aT(v)) * 0.2, v.part === 'hand' || v.part === 'head' ? -1 : 1), offAt, color, { pattern });
  },
  // Col de chemise : bande montante autour du cou.
  collar: (A: BodyInfo, { color, collar = 0.3, neckR = 0.062 }: { color: string; collar?: number; neckR?: number }) => {
    const colY = A.J.Neck.y + collar * (A.J.Head.y - A.J.Neck.y), nx = A.J.Neck.x, nz = A.J.Neck.z;
    return shell(A, (v) => (v.part === 'head' || v.part === 'hand' ? -1 : Math.min(v.y - (colY - 0.012 * A.H), colY + 0.03 * A.H - v.y, (neckR + 0.014) * A.H - Math.hypot(v.x - nx, v.z - nz))), 0.016, color);
  },
  // Bas : `cut` = longueur sur la jambe ; jambe droite (aisance croissante vers la cheville) sauf `slim`.
  bottom: (A: BodyInfo, { cut = 0.97, off = 0.006, color, rise = 0.01, slim = false, pattern = null }: BottomOpts) => {
    const top = A.waistY + rise * A.H;
    const e = A.ease ?? 1;
    const offAt = (v: VertexInfo) => e * (off + (slim ? 0.003 : 0.012) * clamp01(lT(v)));
    return shell(A, (v) => Math.min(top - v.y, (cut - lT(v)) * 0.3, v.part === 'arm' || v.part === 'hand' ? -1 : 1), offAt, color, { pattern });
  },
  socks: (A: BodyInfo, { from = 0.8, color }: { from?: number; color: string }) => shell(A, (v) => (lT(v) - from) * 0.3, 0.003, color),
  shoes: (A: BodyInfo, { from = 0.965, color, off = 0.01, sole = null }: { from?: number; color: string; off?: number; sole?: string | null }) => shoeShell(A, from, off, color, 0.012, sole),
};

// Chaussure : coque du pied, semelle aplatie au sol, bout un peu allongé ; `sole` = couleur d'une semelle (bande basse).
function shoeShell(A: BodyInfo, from: number, off: number, color: string, toe: number, sole: string | null): THREE.SkinnedMesh | THREE.SkinnedMesh[] {
  const ground = 0.004 * A.H;
  const reshape: Reshape = (pos, i, bind) => {
    if (pos[i + 1]! < ground * 2.5) pos[i + 1] = Math.max(0, Math.min(pos[i + 1]!, ground));
    const fwd = bind[i + 2]! - A.J.LeftFoot.z;
    if (fwd > 0) pos[i + 2] = pos[i + 2]! + toe * A.H * clamp01(fwd / (0.12 * A.H));
  };
  const upper = shell(A, (v) => (lT(v) - from) * 0.3, off, color, { reshape });
  if (!sole) return upper;
  const s = shell(A, (v) => Math.min((lT(v) - from) * 0.3, 0.018 * A.H - v.y), off + 0.002, sole, { reshape });
  return [upper, s];
}
