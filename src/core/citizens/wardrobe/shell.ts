// Vêtements tirés du corps :
//  • « coques » : sous-ensemble des triangles du corps (zone choisie par os dominant et position), gonflé le long des
//    normales — t-shirt, pull, pantalon, short, chaussettes, chaussures, barbe… ;
//  • « jupes » : cône construit autour du bassin, poids partagés entre bassin et cuisses — jupe, robe, bas de manteau.
import * as THREE from 'three';
import type { Pattern } from '../catalogue';
import { comp, drapeNormals, skinned, smooth, type Attr, type BodyInfo, type VertexInfo } from './body';
import type { Motif } from './materials';

export type Field = (v: VertexInfo) => number;
export type Reshape = (pos: number[], i: number, bind: number[]) => void;
// `drape` : gonfler le long des normales lissées (`drapeNormals`) au lieu des normales brutes — le tissu enjambe les plis.
// `lining` : doublure sur cette largeur de bord (en unités du champ, fraction de la hauteur du corps) — voir LINING.
// `soft` : passes de lissage des poids de peau (voir softenWeights).
export type ShellOpts = { reshape?: Reshape; pattern?: Motif | null; drape?: boolean; lining?: number; soft?: number };

// Doublure des ouvertures (manches, ourlets, encolure, emmanchures) : face intérieure du tissu, en retrait de LINING_INSET
// de la hauteur du corps, tournée vers l'intérieur. Sans elle, par l'ouverture d'une manche ou sous un ourlet décollé du
// corps, on voyait l'envers de la coque, que le contour encré (OutlineEffect, faces arrière) peint en noir : triangles
// et taches sombres dans les manches, au bas des pantalons, sous les gilets. Seulement près des bords (là où l'envers se
// voit) : pas de triangles en double partout.
export const LINING = 0.035, LINING_INSET = 0.0015;

// Coque : zone du corps où le champ `field(v)` est positif, découpée proprement sur la ligne field = 0 (les triangles
// à cheval sont tranchés, les nouveaux sommets interpolés), puis gonflée de `off` (fraction de la hauteur du corps).
export function shell(A: BodyInfo, field: Field, off: number | Field, color: string, opts: ShellOpts = {}): THREE.SkinnedMesh {
  const g = A.body.geometry;
  const P = g.attributes.position!, N = g.attributes.normal!, SI = g.attributes.skinIndex!, SW = g.attributes.skinWeight!;
  const f = new Float32Array(P.count);
  for (let i = 0; i < P.count; i++) f[i] = field(A.info[i]!);
  const pos: number[] = [], nor: number[] = [], si: number[] = [], sw: number[] = [], ind: number[] = [], fo: number[] = [];
  const offAt = typeof off === 'function' ? (v: number) => off(A.info[v]!) * A.H : () => off * A.H;
  const bind: number[] = [];
  // Direction de gonflement du sommet v (composante k), aussi normale de la coque (ombrage, contour) : brute, ou drapée.
  const D = opts.drape ? drapeNormals(g) : null;
  const dir = (v: number, k: number): number => (D ? D[v * 3 + k]! : comp(N, v, k));
  const map = new Map<number, number>();
  const vert = (v: number): number => {
    let j = map.get(v);
    if (j === undefined) {
      j = pos.length / 3; map.set(v, j);
      fo.push(f[v]!);
      const d = offAt(v);
      pos.push(P.getX(v) + dir(v, 0) * d, P.getY(v) + dir(v, 1) * d, P.getZ(v) + dir(v, 2) * d);
      // Motifs : sur les bras (horizontaux en pose de liaison), la coordonnée des rayures suit le bras (|x|) pour faire des anneaux.
      const inf = A.info[v]!, arm = inf.part === 'arm' || inf.part === 'hand';
      bind.push(P.getX(v), arm ? Math.abs(P.getX(v)) + A.J.Spine2.y : P.getY(v), P.getZ(v));
      nor.push(dir(v, 0), dir(v, 1), dir(v, 2));
      for (let k = 0; k < 4; k++) { si.push(comp(SI, v, k)); sw.push(comp(SW, v, k)); }
    }
    return j;
  };
  // Point de coupe sur l'arête a→b (a dedans, b dehors) : position et normale interpolées, poids du sommet intérieur.
  const cut = (a: number, b: number): number => {
    const t = f[a]! / (f[a]! - f[b]!);
    const L = (A_: Attr, i: number) => comp(A_, a, i) + (comp(A_, b, i) - comp(A_, a, i)) * t;
    const m = (k: number) => dir(a, k) + (dir(b, k) - dir(a, k)) * t;
    const n: [number, number, number] = [m(0), m(1), m(2)];
    const d = offAt(a) + (offAt(b) - offAt(a)) * t;
    fo.push(0);
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
  if (opts.soft) softenWeights(pos, si, sw, ind, opts.soft);
  smooth(nor, ind, 6);
  if (opts.lining) addLining(pos, nor, si, sw, bind, ind, fo, opts.lining * A.H, LINING_INSET * A.H);
  const mesh = skinned(A, pos, nor, si, sw, ind, color, THREE.FrontSide, opts.pattern);
  mesh.geometry.setAttribute('bindPos', new THREE.Float32BufferAttribute(bind, 3));
  return mesh;
}

// Poids de peau adoucis (moyenne des voisins, sommets confondus des coutures de texture soudés) : le tissu se plie en
// douceur. Avec les poids secs du corps, quand les bras retombent de la pose en T, la coque se repliait sur elle-même
// derrière les épaules et sous les omoplates : les triangles retournés, peints en noir par le contour encré, faisaient
// des « V » sombres dans le dos des chemises et des pulls.
export function softenWeights(pos: number[], si: number[], sw: number[], ind: number[], iters: number): void {
  const n = pos.length / 3, key = new Map<string, number>(), grp = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3]! * 1e4)},${Math.round(pos[i * 3 + 1]! * 1e4)},${Math.round(pos[i * 3 + 2]! * 1e4)}`;
    let g = key.get(k);
    if (g === undefined) { g = key.size; key.set(k, g); }
    grp[i] = g;
  }
  const G = key.size, nb = Array.from({ length: G }, () => new Set<number>()), rep = new Int32Array(G).fill(-1);
  for (let i = 0; i < n; i++) if (rep[grp[i]!]! < 0) rep[grp[i]!] = i;
  for (let k = 0; k < ind.length; k += 3) {
    const a = grp[ind[k]!]!, b = grp[ind[k + 1]!]!, c = grp[ind[k + 2]!]!;
    nb[a]!.add(b).add(c); nb[b]!.add(a).add(c); nb[c]!.add(a).add(b);
  }
  let W: Map<number, number>[] = Array.from({ length: G }, (_, g) => {
    const m = new Map<number, number>(), i = rep[g]!;
    for (let k = 0; k < 4; k++) { const w = sw[i * 4 + k]!; if (w > 0) m.set(si[i * 4 + k]!, (m.get(si[i * 4 + k]!) ?? 0) + w); }
    return m;
  });
  for (let it = 0; it < iters; it++) {
    W = W.map((m, g) => {
      const L = nb[g]!;
      if (!L.size) return m;
      const o = new Map<number, number>();
      for (const [b, w] of m) o.set(b, w * 0.5);
      for (const j of L) for (const [b, w] of W[j]!) o.set(b, (o.get(b) ?? 0) + (w * 0.5) / L.size);
      return o;
    });
  }
  for (let i = 0; i < n; i++) {
    const best = [...W[grp[i]!]!].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = best.reduce((t, [, w]) => t + w, 0) || 1;
    for (let k = 0; k < 4; k++) { si[i * 4 + k] = best[k]?.[0] ?? 0; sw[i * 4 + k] = (best[k]?.[1] ?? 0) / sum; }
  }
}
// Passes de lissage des poids des hauts et du gilet (pas des pantalons : le genou plie sec, la jambe ressortirait).
export const SOFT = 6;

// Doublure : copie retournée (normales et sens des triangles inversés, en retrait de `inset`) des triangles dont un sommet
// est à moins de `band` du bord (champ sous `band`).
function addLining(pos: number[], nor: number[], si: number[], sw: number[], bind: number[], ind: number[], fo: number[], band: number, inset: number): void {
  const copy = new Map<number, number>();
  const dup = (v: number): number => {
    let j = copy.get(v);
    if (j === undefined) {
      j = pos.length / 3; copy.set(v, j);
      pos.push(pos[v * 3]! - nor[v * 3]! * inset, pos[v * 3 + 1]! - nor[v * 3 + 1]! * inset, pos[v * 3 + 2]! - nor[v * 3 + 2]! * inset);
      nor.push(-nor[v * 3]!, -nor[v * 3 + 1]!, -nor[v * 3 + 2]!);
      bind.push(bind[v * 3]!, bind[v * 3 + 1]!, bind[v * 3 + 2]!);
      for (let k = 0; k < 4; k++) { si.push(si[v * 4 + k]!); sw.push(sw[v * 4 + k]!); }
    }
    return j;
  };
  const n = ind.length;
  for (let k = 0; k < n; k += 3) {
    const a = ind[k]!, b = ind[k + 1]!, c = ind[k + 2]!;
    if (Math.min(fo[a]!, fo[b]!, fo[c]!) >= band) continue;
    ind.push(dup(a), dup(c), dup(b));
  }
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

// `over` : vêtements déjà construits dont le bas passe SOUS la jupe (haut rentré dedans).
export type SkirtOpts = { top?: number; len?: number; flare?: number; off?: number; color: string; folds?: number; pattern?: Pattern | null; over?: THREE.Mesh[] };

// Haut rentré dans une jupe : il descend de TUCK_DEPTH sous le haut de la jupe (assez pour ne jamais laisser de jour à
// la marche, pas plus : plus bas, la torsion du buste contre le bassin le fait ressortir), et la jupe passe à TUCK_GAP
// au-dessus de lui (fractions de la hauteur du corps).
export const TUCK_DEPTH = 0.05, TUCK_GAP = 0.008;
// Part des cuisses dans les poids du dos d'une jupe (devant : 1).
export const SKIRT_BACK = 0.5;
export const skirtTop = (A: BodyInfo): number => A.waistY + 0.02 * A.H;

// Rayon horizontal (autour de `c`) des vêtements `over` dans la tranche de hauteur [y0, y1], par secteur d'angle (NA
// secteurs, le secteur ia commence à l'angle -π + ia·2π/NA, comme les colonnes de la jupe), élargi aux secteurs
// voisins ; 0 = rien dans ce secteur.
export function coverRadius(over: THREE.Mesh[], c: THREE.Vector3, y0: number, y1: number, NA: number): Float32Array {
  const row = new Float32Array(NA);
  for (const m of over) {
    const P = m.geometry.attributes.position!;
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i);
      if (y < y0 || y > y1) continue;
      const dx = P.getX(i) - c.x, dz = P.getZ(i) - c.z;
      const a = Math.floor(((Math.atan2(dx, dz) + Math.PI) / (2 * Math.PI)) * NA) % NA;
      row[a] = Math.max(row[a]!, Math.hypot(dx, dz));
    }
  }
  return row.map((_, a) => Math.max(row[a]!, row[(a + 1) % NA]!, row[(a + NA - 1) % NA]!));
}

// Tenue posée par-dessus les vêtements `under` (gilet, tablier) : chaque sommet du tronc (hors bras) est repoussé
// horizontalement, depuis l'axe des hanches, à `gap` au-dessus du plus large des vêtements du dessous dans sa tranche de
// hauteur et son secteur. Sans cela, le gilet (aisance fixe) passait sous un manteau et le tablier sous la jupe d'une
// robe, qui ne laissaient voir que des lambeaux.
export function overCloth(A: BodyInfo, ms: THREE.SkinnedMesh[], under: readonly THREE.Mesh[], gap: number): THREE.SkinnedMesh[] {
  if (!under.length) return ms;
  const c = A.J.Hips, NA = 48, step = 0.008 * A.H, armX = Math.abs(A.J.LeftArm.x - c.x);
  const arm = (x: number, y: number): boolean => Math.abs(x - c.x) > armX && y > A.waistY;
  const rows = new Map<number, Float32Array>();
  const sector = (dx: number, dz: number): number => Math.floor(((Math.atan2(dx, dz) + Math.PI) / (2 * Math.PI)) * NA) % NA;
  for (const m of under) {
    const P = m.geometry.attributes.position!;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (arm(x, y)) continue;
      const k = Math.round(y / step);
      let row = rows.get(k);
      if (!row) { row = new Float32Array(NA); rows.set(k, row); }
      const a = sector(x - c.x, z - c.z);
      row[a] = Math.max(row[a]!, Math.hypot(x - c.x, z - c.z));
    }
  }
  const at = (y: number, a: number): number => {
    let r = 0;
    const k = Math.round(y / step);
    for (let dk = -1; dk <= 1; dk++) {
      const row = rows.get(k + dk);
      if (row) for (let da = -1; da <= 1; da++) r = Math.max(r, row[(a + da + NA) % NA]!);
    }
    return r;
  };
  for (const m of ms) {
    const P = m.geometry.attributes.position!;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (arm(x, y)) continue;
      const dx = x - c.x, dz = z - c.z, r = Math.hypot(dx, dz);
      if (r < 1e-6) continue;
      const want = at(y, sector(dx, dz));
      if (!want || r >= want + gap) continue;
      const k = (want + gap) / r;
      P.setXYZ(i, c.x + dx * k, y, c.z + dz * k);
    }
    P.needsUpdate = true;
    m.geometry.computeBoundingBox();
    m.geometry.computeBoundingSphere();
  }
  return ms;
}

// Rayon du corps sous une jupe, par rangée (NY + 1, de `top` à `hem`) et colonne (NA + 1, angle -π + ia·2π/NA) : le
// plus large du corps entre le haut de la jupe et la rangée, sans descendre sous le haut des cuisses.
export function hangRadius(A: BodyInfo, R: (y: number, az: number) => number, top: number, hem: number, NY: number, NA: number): Float32Array {
  const low = A.J.LeftUpLeg.y - 0.08 * A.H, dy = 0.004 * A.H;
  const out = new Float32Array((NY + 1) * (NA + 1));
  for (let ia = 0; ia <= NA; ia++) {
    const az = -Math.PI + (ia / NA) * 2 * Math.PI;
    let m = 0.02 * A.H, y = top;
    for (let iy = 0; iy <= NY; iy++) {
      const yr = Math.max(low, top + (hem - top) * (iy / NY));
      for (; y >= yr - 1e-9; y -= dy) m = Math.max(m, R(y, az));
      out[iy * (NA + 1) + ia] = m;
    }
  }
  return out;
}

// Jupe : du haut (yTop) jusqu'à la longueur `len` (fraction de la hauteur hanche→cheville), évasée de `flare`.
// Un haut porté avec (`over`) est rentré dedans : la jupe ne descend jamais sous lui, sinon son bas ressortait à travers
// la jupe en traînées (corps ronds : le haut gonflé le long des normales dépasse le rayon de la jupe).
export function skirt(A: BodyInfo, { top = skirtTop(A), len = 0.6, flare = 0.35, off = 0.012, color, folds = 0.006, pattern = null, over = [] }: SkirtOpts): THREE.SkinnedMesh {
  const R = bodyRadius(A), c = A.J.Hips, e = A.ease ?? 1;
  const ankle = A.J.LeftFoot.y, hem = top - len * (A.J.LeftUpLeg.y - ankle);
  const NA = 64, NY = 24, pos: number[] = [], si: number[] = [], sw: number[] = [], ind: number[] = [];
  // Haut rentré : son rayon autour de chaque rangée de la jupe (tranche d'une rangée de part et d'autre, sans le
  // dépasser au-dessus du haut de la jupe), plus une marge.
  const step = (top - hem) / NY, gap = TUCK_GAP * A.H;
  const under = (y: number) => (over.length ? coverRadius(over, c, y - step, Math.min(top, y + step), NA) : null);
  const H = A.idx.Hips, L = A.idx.LeftUpLeg, Rr = A.idx.RightUpLeg;
  // Tombé du tissu : en haut la jupe épouse le corps (taille, reins, fesses, ventre), puis tombe droit depuis le point
  // le plus saillant au-dessus d'elle (maximum cumulé du rayon du corps en descendant). Autrefois l'anneau du haut prenait
  // déjà le plus large de la tranche voisine : sur les corps aux fesses marquées il restait décollé des reins et formait
  // une tournure. On s'arrête au haut des cuisses (genoux et pieds ne comptent pas).
  const hang = hangRadius(A, R, top, hem, NY, NA);
  for (let iy = 0; iy <= NY; iy++) {
    const t = iy / NY, y = top + (hem - top) * t, u = under(y);
    for (let ia = 0; ia <= NA; ia++) {
      const az = -Math.PI + (ia / NA) * 2 * Math.PI;
      const fold = folds * A.H * Math.pow(t, 1.4) * (0.6 * Math.sin(az * 9 + 0.7) + 0.4 * Math.sin(az * 14 + 2.1));
      // Jamais sous le haut rentré dedans (0 = rien dessous : rayon d'origine).
      const lip = u && u[ia % NA]! > 0 ? u[ia % NA]! + gap : 0;
      const r = Math.max(lip, hang[iy * (NA + 1) + ia]! + off * e * A.H) + flare * (top - hem) * t * t + fold;
      pos.push(c.x + Math.sin(az) * r, y, c.z + Math.cos(az) * r);
      // Le devant suit les cuisses, le dos un peu moins : assis ou accroupi, le pan avant se pose sur les genoux et le
      // pan arrière reste pendu derrière (avec les mêmes poids partout, il remontait aussi en ballon autour du bassin).
      const s = Math.sin(az), k = SKIRT_BACK + (1 - SKIRT_BACK) * Math.max(0, Math.cos(az));
      const wl = t * 0.8 * k * (0.5 + 0.5 * s), wr = t * 0.8 * k * (0.5 - 0.5 * s);
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

// `tuckY` : hauteur sous laquelle le haut est coupé, rentré dans une jupe (l'aisance garde la forme d'origine).
export type TopOpts = { sleeve?: number; off?: number; color: string; hem?: number; collar?: number; neckR?: number; ease?: number; pattern?: Pattern | null; tuckY?: number };
export type BottomOpts = { cut?: number; off?: number; color: string; rise?: number; slim?: boolean; pattern?: Pattern | null };

export const garments = {
  boots: (A: BodyInfo, { from = 0.72, color, sole = null }: { from?: number; color: string; sole?: string | null }) => shoeShell(A, from, 0.011, color, 0.006, sole),
  // Peau posée par-dessus le tee-shirt gris du corps de base (bras nus d'un débardeur ou d'une robe).
  // Champ continu (l'avancement le long du bras retombe à 0 sur le tronc) : pas de bord en dents de scie à l'aisselle.
  skin: (A: BodyInfo, { from = -0.1, to = 0.5 }: { from?: number; to?: number }) => shell(A, (v) => Math.min(aT(v) - Math.max(from, 0.005), to - aT(v)) * 0.2, 0.002, A.skin ?? '#F2C8A0'),
  // Hauts : `sleeve` = longueur de manche, `hem` = bas du haut sous la taille, `ease` = aisance : le tissu s'écarte du corps
  // vers le bas du haut et vers le poignet au lieu de coller comme une seconde peau.
  top: (A: BodyInfo, { sleeve = 0.45, off = 0.008, color, hem = 0.065, collar = 0.3, neckR = 0.062, ease = 0.008, pattern = null, tuckY = -Infinity }: TopOpts) => {
    const hemY = A.waistY - hem * A.H, colY = A.J.Neck.y + collar * (A.J.Head.y - A.J.Neck.y);
    const nx = A.J.Neck.x, nz = A.J.Neck.z, r0 = neckR * A.H;
    const col = (v: VertexInfo) => Math.max(colY - v.y, Math.hypot(v.x - nx, v.z - nz) - r0);
    const chest = A.J.Spine2.y;
    const e = A.ease ?? 1;
    // Rentré dans une jupe : l'aisance retombe à zéro vers la ceinture (tissu resserré à la taille), sinon le haut gonflé
    // repoussait le haut de la jupe loin du corps (tournure dans le dos, bourrelet au ventre).
    const belt = tuckY + TUCK_DEPTH * A.H, band = 0.06 * A.H;
    const gather = (v: VertexInfo) => (tuckY === -Infinity ? 1 : clamp01((v.y - belt) / band));
    const offAt = (v: VertexInfo) => e * (off + ease * (v.part === 'arm' ? clamp01(aT(v)) * 0.8 : clamp01((chest - v.y) / (chest - hemY)) * gather(v)));
    const cutY = Math.max(hemY, tuckY);
    const reshape = tuckY === -Infinity ? undefined : bridgeBack(A, chest, belt, e * off);
    // Manche coupée par le seul avancement le long du bras (champ continu) : exclure la main par son os dominant faisait
    // suivre au poignet la frontière irrégulière des os (poignets de manteau en lambeaux).
    const m = shell(A, (v) => Math.min(v.y - cutY, col(v), (sleeve - aT(v)) * 0.2, v.part === 'head' ? -1 : 1), offAt, color, { pattern, drape: true, reshape, lining: LINING, soft: SOFT });
    if (tuckY !== -Infinity) pinToHips(A, m, belt + 0.02 * A.H, belt - 0.02 * A.H);
    return m;
  },
  // Col de chemise : bande montante autour du cou.
  collar: (A: BodyInfo, { color, collar = 0.3, neckR = 0.062 }: { color: string; collar?: number; neckR?: number }) => {
    const colY = A.J.Neck.y + collar * (A.J.Head.y - A.J.Neck.y), nx = A.J.Neck.x, nz = A.J.Neck.z;
    return shell(A, (v) => (v.part === 'head' || v.part === 'hand' ? -1 : Math.min(v.y - (colY - 0.012 * A.H), colY + 0.03 * A.H - v.y, (neckR + 0.014) * A.H - Math.hypot(v.x - nx, v.z - nz))), 0.016, color, { lining: LINING });
  },
  // Bas : `cut` = longueur sur la jambe ; jambe droite (aisance croissante vers la cheville) sauf `slim`.
  bottom: (A: BodyInfo, { cut = 0.97, off = 0.006, color, rise = 0.01, slim = false, pattern = null }: BottomOpts) => {
    const top = A.waistY + rise * A.H;
    const e = A.ease ?? 1;
    const offAt = (v: VertexInfo) => e * (off + (slim ? 0.003 : 0.012) * clamp01(lT(v)));
    return shell(A, (v) => Math.min(top - v.y, (cut - lT(v)) * 0.3, v.part === 'arm' || v.part === 'hand' ? -1 : 1), offAt, color, { pattern, lining: LINING });
  },
  socks: (A: BodyInfo, { from = 0.8, color }: { from?: number; color: string }) => shell(A, (v) => (lT(v) - from) * 0.3, 0.003, color),
  shoes: (A: BodyInfo, { from = 0.965, color, off = 0.01, sole = null }: { from?: number; color: string; off?: number; sole?: string | null }) => shoeShell(A, from, off, color, 0.012, sole),
};

// Haut rentré dans une jupe (robe, manteau long, haut + jupe) : dans le dos, le tissu enjambe le creux des reins en ligne
// droite des omoplates (hauteur `chest`) au haut de la jupe (`belt`, rayon pris au plus saillant juste dessous). Sur les
// corps cambrés aux fesses marquées, le haut collé aux reins puis la jupe sur les fesses dessinaient une marche (une
// tournure). Seulement dans le dos : devant, rien n'est ajouté (pas de faux ventre). `off` : épaisseur du haut.
export function bridgeBack(A: BodyInfo, chest: number, belt: number, off: number): Reshape {
  const R = bodyRadius(A), c = A.J.Hips, span = chest - belt, far = 0.3 * A.H;
  const seat = (az: number): number => {
    let m = 0;
    for (let y = belt; y >= belt - 0.04 * A.H; y -= 0.004 * A.H) m = Math.max(m, R(y, az));
    return m;
  };
  return (pos, i) => {
    const y = pos[i + 1]!;
    if (span <= 0 || y >= chest) return;
    const dx = pos[i]! - c.x, dz = pos[i + 2]! - c.z, r = Math.hypot(dx, dz);
    if (r < 1e-6 || r > far) return;
    const az = Math.atan2(dx, dz);
    // Poids du dos : 1 plein dos, 0 dès les flancs.
    const w = clamp01((-Math.cos(az) - 0.2) / 0.5);
    if (w <= 0) return;
    const s = clamp01((chest - y) / span), rc = R(chest, az);
    const want = rc + (seat(az) - rc) * s + off;
    if (want <= r) return;
    const k = (r + (want - r) * w) / r;
    pos[i] = c.x + dx * k;
    pos[i + 2] = c.z + dz * k;
  };
}

// Partie d'un haut rentrée dans la jupe : liée au bassin comme le haut de la jupe (fondu de `y0` à `y1`, positions au
// repos). Avec les poids du corps (fesses liées aux cuisses), la jambe qui part en arrière poussait le bas du haut à
// travers la jupe : une bosse sur les fesses à chaque pas.
export function pinToHips(A: BodyInfo, m: THREE.SkinnedMesh, y0: number, y1: number): void {
  const g = m.geometry, P = g.attributes.bindPos ?? g.attributes.position!, SI = g.attributes.skinIndex!, SW = g.attributes.skinWeight!;
  const hips = A.idx.Hips;
  for (let i = 0; i < SI.count; i++) {
    const h = clamp01((y0 - P.getY(i)) / (y0 - y1));
    if (h <= 0) continue;
    const w = new Map<number, number>();
    for (let k = 0; k < 4; k++) {
      const b = comp(SI, i, k), x = comp(SW, i, k) * (1 - h);
      if (x > 0) w.set(b, (w.get(b) ?? 0) + x);
    }
    w.set(hips, (w.get(hips) ?? 0) + h);
    const best = [...w].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = best.reduce((s, [, x]) => s + x, 0);
    const at = (k: number): [number, number] => best[k] ?? [0, 0];
    SI.setXYZW(i, at(0)[0], at(1)[0], at(2)[0], at(3)[0]);
    SW.setXYZW(i, at(0)[1] / sum, at(1)[1] / sum, at(2)[1] / sum, at(3)[1] / sum);
  }
  SI.needsUpdate = true;
  SW.needsUpdate = true;
}

// Chaussure : coque du pied, semelle aplatie au sol, bout un peu allongé ; `sole` = couleur d'une semelle (bande basse).
// La semelle est une bande de couleur (motif `bande` sur la hauteur au repos) : une seconde coque presque confondue avec
// la première, coupée en travers des triangles, laissait des taches blanches en dents de scie sur l'empeigne.
function shoeShell(A: BodyInfo, from: number, off: number, color: string, toe: number, sole: string | null): THREE.SkinnedMesh {
  const ground = 0.004 * A.H;
  const reshape: Reshape = (pos, i, bind) => {
    if (pos[i + 1]! < ground * 2.5) pos[i + 1] = Math.max(0, Math.min(pos[i + 1]!, ground));
    const fwd = bind[i + 2]! - A.J.LeftFoot.z;
    if (fwd > 0) pos[i + 2] = pos[i + 2]! + toe * A.H * clamp01(fwd / (0.12 * A.H));
  };
  return shell(A, (v) => (lT(v) - from) * 0.3, off, color, { reshape, pattern: sole ? { kind: 'bande', color: sole, lo: -A.H, hi: SOLE * A.H } : null });
}
// Hauteur de la semelle (fraction de la hauteur du corps).
export const SOLE = 0.018;
