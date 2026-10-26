import { FURNITURE_MODELS } from '../../furniture-models';
import type { StandingKind } from '../../library-types';
import type { LifeState } from '../life-state';
import type { CelLook, CelVariant } from '../looks';
import { bent, lathe, part, place, superEll, tube, type CelPart, type Deform, type Vec3 } from '../mesh';
import type { Tone } from '../tone';
import { CEL_MODELS } from './registry';
import { hairpin, neonRim, superZ } from './storage';

// Assises en tissu (G6, tâche 5), portées de la maquette `sofa` (l. 248-283) et `beanbag` (l. 321) : canapé, causeuse, fauteuil,
// chauffeuse, méridienne, banc, pouf tricoté, pouf carré, pouf poire. Repère centré (origine au centre de la base, x à droite, y en
// haut, z vers le spectateur, cm). Couleurs : les mêmes clés de palette que le modèle à boîtes (le meuble garde son identité d'un
// style à l'autre) ; les variantes de style (`look.variant` : pieds, capitons, rivets, plaid, motif) habillent sans changer le volume.
//
// Habillages (tâche 10, tous marqués `trim` : comptés à part de l'encombrement) : les pieds suivent la variante (fuselés, droits fins,
// épingle, tournés, compas évasés, blocs, griffes) sans bouger leur point d'appui ; les capitons sont des boutons sombres posés au fond
// de fossettes creusées dans les coussins de dos (le dossier est caché par les coussins : des boutons sur le dossier étaient invisibles,
// T5) ; les rivets sont des demi-billes de laiton qui sortent des faces (face avant de l'assise, flancs des accoudoirs) ; les rayures
// rétro 70 sont des bandes cintrées qui épousent la face des coussins de dos (elles prennent l'ombre comme le coussin : pas une
// frontière d'ombre déchiquetée) ; le liseré néon est un tube lumineux `edge` sur le nez de l'assise et la crête du dossier ; le plaid
// prend la clé choisie par style (`look.pick.throw`, crème : plus le ton du tapis).
//
// Mobilier vivant (spec §6) : `life.dent` ∈ [0, 1] creuse le coussin sous le centre du dessus praticable (3,2 cm au plus, gaussienne
// σ = 15 cm, forme `dent` de la maquette) ; le pouf poire s'affaisse de 4 cm ; `life.skirt` fait onduler la jupe du canapé et de la
// causeuse de ±1 cm (cachette dessous). `tilt`, `sway`… sont appliqués par l'appelant, pas ici.

const DENT_DEPTH = 3.2, DENT_SIGMA = 15, SAG_MAX = 4;

// Centre du dessus praticable d'un modèle dans le repère centré (x, z).
function perchXZ(kind: StandingKind): [number, number] {
  const m = FURNITURE_MODELS[kind], p = m.perch!;
  return [p.x + p.w / 2 - m.w / 2, m.d / 2 - (p.z + p.d / 2)];
}

// Creux d'assise d'un coussin de demi-hauteur `b` centré en (cx, cz) : le dessus (y > 0) descend d'une gaussienne centrée au point
// (px, pz) du repère centré, pleine au sommet, nulle à l'équateur (forme `dent` de la maquette, pondérée par `dent`).
function dentOf(dent: number, b: number, cx: number, cz: number, px: number, pz: number, depth = DENT_DEPTH): Deform | undefined {
  if (dent <= 0) return undefined;
  const [dx, dz] = [px - cx, pz - cz];
  return (x, y, z) => (y > 0 ? [x, y - depth * dent * Math.exp(-((x - dx) ** 2 + (z - dz) ** 2) / (2 * DENT_SIGMA * DENT_SIGMA)) * (y / b), z] : [x, y, z]);
}

// Pied selon la variante du style : profil de tour (r, y) de hauteur h.
function legProfile(legs: CelVariant['legs'], h: number): [number, number][] {
  switch (legs) {
    case 'taper':
    case 'compass': return [[2.7, 0], [1.9, h]];
    case 'turned': return [[2.6, 0], [2.6, h * 0.2], [1.9, h * 0.35], [2.9, h * 0.55], [2, h * 0.75], [2.4, h]];
    case 'hairpin': return [[1, 0], [1, h]];
    case 'block': return [[3, 0], [3, h]];
    case 'claw': return [[3.5, 0], [2.2, h * 0.3], [3, h * 0.7], [2.4, h]];
    default: return [[2, 0], [2, h]]; // droit fin (moderne, néon)
  }
}
// Quatre pieds aux coins (±x, ±z), hauteur h, sans trait d'arête (ronds) ; pieds compas : posés au même point, évasés de 0,14 rad
// (le haut rentre sous le meuble : l'emprise au sol ne bouge pas).
function legs(look: CelLook, col: Tone, x: number, z: number, h: number): CelPart[] {
  const out: CelPart[] = [];
  const splay = look.variant.legs === 'compass' ? 0.14 : 0;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      if (look.variant.legs === 'hairpin') out.push(...hairpin(col, [sx * x, 0, sz * z], h, sx, 3)); // épingles (industriel), même point d'appui
      else out.push(part(place(lathe(legProfile(look.variant.legs, h), 10), { rz: sx * splay, rx: -sz * splay, t: [sx * x, 0, sz * z] }), col, { crease: false }));
    }
  return out;
}

type Cushion = { a: number; b: number; c: number; e: number; cx: number; cy: number; cz: number; rx: number };
// Coussin de dos capitonné : fossettes (gaussiennes σ 3,5, 1,3 cm) autour de chaque bouton sur la face avant.
const TUFT_DEPTH = 1.3, TUFT_SIGMA = 3.5;
// Boutons du capitonnage d'un coussin de dos (repère du coussin, puis posés comme lui) : deux rangs en quinconce, 13 cm d'entraxe.
function tuftGrid(a: number, b: number): [number, number][] {
  const pts: [number, number][] = [];
  const nx = Math.max(1, Math.floor((a * 0.72) / 6.5));
  for (const [row, y] of [[0, b * 0.3], [1, -b * 0.32]] as const)
    for (let i = -nx; i <= nx; i++) {
      const x = (i + (row ? 0.5 : 0)) * 13;
      if (Math.abs(x) <= a * 0.72) pts.push([x, y]);
    }
  return pts;
}
const tuftDimple = (pts: [number, number][]): Deform => (x, y, z) => {
  if (z <= 0) return [x, y, z];
  let d = 0;
  for (const [px, py] of pts) d += Math.exp(-((x - px) ** 2 + (y - py) ** 2) / (2 * TUFT_SIGMA * TUFT_SIGMA));
  return [x, y, z - TUFT_DEPTH * Math.min(1, d) * Math.min(1, z / 2)];
};
// Capitons : boutons sombres (ton `door`, demi-billes) au fond des fossettes du coussin `k`.
function tufting(look: CelLook, k: Cushion): CelPart[] {
  return tuftGrid(k.a, k.b).map(([x, y]) => {
    const z = superZ(k.a, k.b, k.c, k.e, k.e, x, y) - TUFT_DEPTH - 0.2;
    return part(place(place(superEll(1.4, 1.4, 1.0, 1, 1, 6, 10), { t: [x, y, z] }), { rx: k.rx, t: [k.cx, k.cy, k.cz] }), look.tones.door, { flat: true, noshadow: true, trim: true });
  });
}
// Rivets laiton (ton `metal`) le long d'une ligne de (a) à (b), tous les 7 cm : demi-billes aplaties dans la normale `n`, posées
// sur la face (le centre 0,3 cm hors de la surface : la calotte sort, rien n'est noyé).
function rivets(look: CelLook, a: Vec3, b: Vec3, n: Vec3): CelPart[] {
  const out: CelPart[] = [];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), count = Math.max(1, Math.floor(L / 7));
  const r: Vec3 = [1.1 - 0.4 * Math.abs(n[0]), 1.1 - 0.4 * Math.abs(n[1]), 1.1 - 0.4 * Math.abs(n[2])];
  for (let i = 0; i <= count; i++) {
    const t = count ? i / count : 0.5;
    out.push(part(place(superEll(r[0], r[1], r[2], 1, 1, 6, 8), { t: [a[0] + (b[0] - a[0]) * t + 0.3 * n[0], a[1] + (b[1] - a[1]) * t + 0.3 * n[1], a[2] + (b[2] - a[2]) * t + 0.3 * n[2]] }), look.tones.metal, { flat: true, noshadow: true, trim: true }));
  }
  return out;
}
// Losanges du motif bohème sur le haut d'un coussin de dos (face avant, plan z).
function diamonds(col: Tone, xs: number[], y: number, z: number): CelPart[] {
  return xs.map((x) => part(place(superEll(2.6, 2.6, 0.6, 1, 1, 4, 4), { rz: Math.PI / 4, t: [x, y, z] }), col, { flat: true, noshadow: true, trim: true }));
}
// Rayures rétro 70 : deux bandes horizontales (ton `col`) cintrées sur la face avant du coussin de dos `k` (plaques minces posées à
// 0,25 cm de la surface, normales recalculées : elles prennent l'ombre avec le coussin), arrêtées avant les bords ronds.
function stripes(col: Tone, k: Cushion): CelPart[] {
  const out: CelPart[] = [];
  const hw = k.a * 0.8;
  for (const yc of [k.b * 0.36, -k.b * 0.3]) {
    const follow: Deform = (x, y, z) => [x, y, z + superZ(k.a, k.b, k.c, k.e, k.e, x, yc + y) + 0.25];
    const band = bent(superEll(hw, 1.8, 0.25, 0.25, 0.2, 6, 28), follow);
    out.push(part(place(place(band, { t: [0, yc, 0] }), { rx: k.rx, t: [k.cx, k.cy, k.cz] }), col, { noshadow: true, crease: false, trim: true }));
  }
  return out;
}
// Liserés lumineux néon (neonRim, storage.ts) posés sur les volumes : sur la face avant de l'assise entre les faces intérieures des
// accoudoirs (jamais en travers d'un accoudoir), et sur la crête du dossier (il suit la retombée des bouts ronds).
const SEAT_E = 0.22;
function neonSeat(look: CelLook, a: number, c: number, cy: number, yl: number, x0: number, x1: number): CelPart {
  return neonRim(look, { a, b: 15, c, e1: SEAT_E, e2: SEAT_E, cx: 0, cy, cz: 0 }, { front: yl }, x0, x1, 1);
}
function neonCrest(look: CelLook, a: number, b: number, c: number, cy: number, cz: number, x0: number, x1: number): CelPart {
  return neonRim(look, { a, b, c, e1: SEAT_E, e2: SEAT_E, cx: 0, cy, cz }, { top: 0 }, x0, x1, 1);
}
// Plaid plié sur un accoudoir (dessus à `top`, demi-largeur `hw` en x, demi-longueur `hl` en z) : un pan sur le dessus, un pan qui
// tombe à l'extérieur (x > 0), franges selon la variante. Ton : la clé choisie par style (`look.pick.throw`).
function plaid(look: CelLook, x: number, top: number, hw: number, hl: number, z: number, drop: number): CelPart[] {
  const col = look.tones[look.pick.throw];
  const out: CelPart[] = [];
  out.push(part(place(superEll(hw, 1.6, hl, 0.5, 0.3, 8, 20, (px, py, pz) => [px, py - 0.012 * px * px, pz]), { t: [x, top + 1.6, z] }), col, { trim: true }));
  out.push(part(place(superEll(2, drop / 2, hl - 2, 0.5, 0.3, 8, 16, (px, py, pz) => [px + (0.05 * py * py) / (drop / 2), py, pz]), { t: [x + hw - 0.5, top - drop / 2 + 1, z] }), col, { trim: true }));
  if (look.variant.throw === 'fringed')
    for (let k = -hl + 4; k <= hl - 4; k += 5) out.push(part(place(lathe([[0.6, 0], [1.4, 2], [0.8, 5], [0.4, 7]], 6), { t: [x + hw + 1, top - drop - 7, z + k] }), col, { crease: false, noshadow: true, trim: true }));
  return out;
}
// Jupe (bas de tissu) sous l'avant d'un canapé : bande mince de −hw à hw à la hauteur `y` (centre), demi-hauteur `hh`, au plan z ;
// `skirt` la fait onduler de ±1 cm en z, surtout vers le bas (le haut est cousu au corps).
function valance(col: Tone, hw: number, y: number, hh: number, z: number, skirt: number): CelPart {
  const deform: Deform | undefined = skirt > 0 ? (x, py, pz) => [x, py, pz + skirt * Math.sin(x / 9) * Math.max(0, (hh - py) / (2 * hh))] : undefined;
  return part(place(superEll(hw, hh, 0.5, 0.3, 0.2, 6, 32, deform), { t: [0, y, z] }), col, { crease: false, hi: false });
}

// Coussin d'assise bombé à coins ronds (demi-axes a, b, c) centré en (cx, cy, cz), creusé au point d'assise (px, pz).
function seatCushion(col: Tone, a: number, b: number, c: number, cx: number, cy: number, cz: number, px: number, pz: number, dent: number): CelPart {
  return part(place(superEll(a, b, c, 0.35, 0.35, 14, 28, dentOf(dent, b, cx, cz, px, pz)), { t: [cx, cy, cz] }), col);
}
// Coussin de dos légèrement incliné en arrière (rx −0,17), appuyé au dossier ; capitonné (fossettes) si le style l'est. Renvoie aussi
// sa description pour les habillages posés sur sa face (boutons, rayures, losanges).
const BACK_E = 0.35, BACK_RX = -0.17;
function backCushion(look: CelLook, col: Tone, a: number, b: number, c: number, cx: number, cy: number, cz: number): { part: CelPart; k: Cushion } {
  const k: Cushion = { a, b, c, e: BACK_E, cx, cy, cz, rx: BACK_RX };
  const dimple = look.variant.tufted ? tuftDimple(tuftGrid(a, b)) : undefined;
  return { part: part(place(superEll(a, b, c, BACK_E, BACK_E, 14, 28, dimple), { rx: BACK_RX, t: [cx, cy, cz] }), col), k };
}
// Habillages des coussins de dos selon la variante : capitons, rayures (les losanges bohèmes restent posés par chaque meuble).
function backDress(look: CelLook, stripeCol: Tone, ks: Cushion[]): CelPart[] {
  const out: CelPart[] = [];
  for (const k of ks) {
    if (look.variant.tufted) out.push(...tufting(look, k));
    if (look.variant.pattern === 'stripes') out.push(...stripes(stripeCol, k));
  }
  return out;
}
// Accoudoir roulé : bloc plein surmonté d'un boudin rond (profil ⌒ vu de face), de x = cx ± hw, de la base `y0` au sommet `top`.
function rolledArm(col: Tone, cx: number, hw: number, hd: number, y0: number, top: number, zc = 0): CelPart[] {
  const roll = hw, blockTop = top - roll;
  const bh = (blockTop - y0) / 2;
  return [
    part(place(superEll(hw, bh, hd, 0.3, 0.3, 10, 28), { t: [cx, y0 + bh, zc] }), col),
    part(place(superEll(hw, roll, hd, 1, 0.3, 12, 28), { t: [cx, blockTop, zc] }), col, { hi: true }),
  ];
}

/* ---------- canapé (porté de la maquette : pieds, assise, dossier, accoudoirs, coussins à creux, coussin d'appoint, plaid, jupe) ---------- */
function sofa(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones, F = T.fabric, A = T.fabricDark, CU = T.fabricLight;
  const [px, pz] = perchXZ('sofa');
  const P: CelPart[] = [];
  P.push(...legs(look, T.leg, 92, 38, 12));
  P.push(part(place(superEll(99, 15, 44, 0.22, 0.22, 10, 28), { t: [0, 27, 0] }), F)); // assise 12..42
  P.push(part(place(superEll(99, 21, 8, 0.22, 0.22, 10, 28), { t: [0, 63, -37] }), F)); // dossier 42..84
  for (const sx of [-1, 1]) P.push(part(place(superEll(11, 17, 44, 0.35, 0.28, 12, 28), { t: [sx * 89, 50, 0] }), A)); // accoudoirs 33..67
  for (const sx of [-1, 0, 1]) P.push(seatCushion(CU, 26, 7, 31, sx * 52, 47, 10, px, pz, life.dent)); // dessus 54
  const backs = [-1, 0, 1].map((sx) => backCushion(look, CU, 25.5, 18, 7, sx * 52, 61, -24));
  P.push(...backs.map((b) => b.part));
  P.push(valance(A, 76, 11, 4.5, 42, life.skirt)); // jupe 6,5..15,5 (ton des accoudoirs, mince) : un ourlet qui sort du corps
  P.push(part(place(superEll(13, 13, 5, 0.4, 0.4, 12, 20), { ry: 0.3, rz: 0.15, t: [-62, 59, -14] }), T.warm)); // coussin d'appoint
  P.push(...backDress(look, T.warm, backs.map((b) => b.k)));
  if (look.variant.rivets) {
    P.push(...rivets(look, [-88, 31, 44], [88, 31, 44], [0, 0, 1])); // face avant de l'assise (z 44)
    for (const sx of [-1, 1]) P.push(...rivets(look, [sx * 100, 60, -36], [sx * 100, 60, 36], [sx, 0, 0])); // flancs des accoudoirs (x ±100)
  }
  if (look.variant.pattern === 'diamonds') P.push(...diamonds(T.warm, [-62, -52, -42], 70, -18.3));
  if (look.variant.pattern === 'neon-edge') P.push(neonSeat(look, 99, 44, 27, 10, -76, 76), neonCrest(look, 99, 21, 8, 63, -37, -96, 96)); // accoudoirs : faces intérieures à ±78
  if (look.variant.throw !== 'none') P.push(...plaid(look, 89, 67, 10.5, 22, -4, 22));
  return P;
}

/* ---------- causeuse : deux coussins d'assise, deux de dos, accoudoirs roulés pleine hauteur, jupe ---------- */
function loveseat(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones, F = T.warm, D = T.warmDark, CU = T.warmLight;
  const [px, pz] = perchXZ('loveseat');
  const P: CelPart[] = [];
  P.push(...legs(look, T.leg, 68, 37, 8));
  P.push(part(place(superEll(74, 15, 43, 0.22, 0.22, 10, 28), { t: [0, 23, 0] }), F)); // assise 8..38
  P.push(part(place(superEll(66, 22, 7, 0.22, 0.22, 10, 28), { t: [0, 60, -37] }), D)); // dossier 38..82
  for (const sx of [-1, 1]) P.push(...rolledArm(F, sx * 66.5, 8.5, 42.5, 8, 62.5));
  for (const sx of [-1, 1]) P.push(seatCushion(CU, 33, 5.5, 29, sx * 29.25, 43.5, 11, px, pz, life.dent)); // dessus 49 (les deux coussins se chevauchent sous le centre)
  const backs = [-1, 1].map((sx) => backCushion(look, CU, 27, 16, 6.5, sx * 29.25, 58, -23));
  P.push(...backs.map((b) => b.part));
  P.push(valance(D, 55, 7.5, 4, 41, life.skirt));
  P.push(...backDress(look, T.fabric, backs.map((b) => b.k)));
  if (look.variant.rivets) P.push(...rivets(look, [-55, 24, 43], [55, 24, 43], [0, 0, 1]));
  if (look.variant.pattern === 'diamonds') P.push(...diamonds(T.fabric, [-39, -29, -19], 65, -17.6));
  if (look.variant.pattern === 'neon-edge') P.push(neonSeat(look, 74, 43, 23, 8, -56, 56), neonCrest(look, 66, 22, 7, 60, -37, -64, 64)); // accoudoirs roulés : faces intérieures à ±58
  return P;
}

/* ---------- fauteuil : une place, dossier haut, accoudoirs ronds ---------- */
function armchair(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones, F = T.warm, A = T.warmDark, CU = T.warmLight;
  const [px, pz] = perchXZ('armchair');
  const P: CelPart[] = [];
  P.push(...legs(look, T.leg, 32, 32, 12));
  P.push(part(place(superEll(39, 15, 39, 0.22, 0.22, 10, 28), { t: [0, 27, 0] }), F)); // assise 12..42
  P.push(part(place(superEll(39, 24, 7, 0.22, 0.22, 10, 28), { t: [0, 66, -33] }), F)); // dossier 42..90
  for (const sx of [-1, 1]) P.push(part(place(superEll(7, 13, 38, 0.35, 0.28, 12, 28), { t: [sx * 33, 53, 1] }), A)); // accoudoirs 40..66
  P.push(seatCushion(CU, 26, 6, 27, 0, 48, 9, px, pz, life.dent)); // dessus 54
  const back = backCushion(look, CU, 25, 17, 6, 0, 62, -22);
  P.push(back.part);
  P.push(...backDress(look, T.fabric, [back.k]));
  if (look.variant.rivets) {
    P.push(...rivets(look, [-32, 31, 39], [32, 31, 39], [0, 0, 1]));
    for (const sx of [-1, 1]) P.push(...rivets(look, [sx * 40, 56, -30], [sx * 40, 56, 30], [sx, 0, 0])); // flancs des accoudoirs (x ±40)
  }
  if (look.variant.pattern === 'diamonds') P.push(...diamonds(T.fabric, [-10, 0, 10], 70, -15.6));
  if (look.variant.pattern === 'neon-edge') P.push(neonSeat(look, 39, 39, 27, 10, -24, 24), neonCrest(look, 39, 24, 7, 66, -33, -37, 37)); // accoudoirs : faces intérieures à ±26
  return P;
}

/* ---------- chauffeuse : basse et large, accoudoirs roulés pleine hauteur, coussins d'assise et de dos ---------- */
function clubChair(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones, F = T.fabric, D = T.fabricDark, CU = T.fabricLight;
  const [px, pz] = perchXZ('club-chair');
  const P: CelPart[] = [];
  P.push(...legs(look, T.leg, 38, 35, 8));
  P.push(part(place(superEll(44, 15, 41.5, 0.22, 0.22, 10, 28), { t: [0, 23, 0] }), F)); // assise 8..38
  P.push(part(place(superEll(37, 21, 8, 0.22, 0.22, 10, 28), { t: [0, 59, -34] }), D)); // dossier 38..80
  for (const sx of [-1, 1]) P.push(...rolledArm(F, sx * 36.5, 8.5, 41, 8, 62.5));
  P.push(seatCushion(CU, 28, 5.5, 23, 0, 43.5, 15.5, px, pz, life.dent)); // dessus 49
  const back = backCushion(look, F, 27, 14, 6, 0, 57, -21);
  P.push(back.part);
  P.push(...backDress(look, T.warm, [back.k]));
  if (look.variant.rivets) P.push(...rivets(look, [-34, 24, 41.5], [34, 24, 41.5], [0, 0, 1]));
  if (look.variant.pattern === 'diamonds') P.push(...diamonds(T.warm, [-10, 0, 10], 64, -14.6));
  if (look.variant.pattern === 'neon-edge') P.push(neonSeat(look, 44, 41.5, 23, 8, -26, 26), neonCrest(look, 37, 21, 8, 59, -34, -35, 35)); // accoudoirs roulés : faces intérieures à ±28
  return P;
}

/* ---------- méridienne : haut accoudoir à volute à gauche, dossier qui descend vers la droite, long coussin, petit coussin rond ---------- */
function daybed(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones, F = T.warm, D = T.warmDark, CU = T.warmLight;
  const [px, pz] = perchXZ('daybed');
  const P: CelPart[] = [];
  P.push(...legs(look, T.leg, 76, 29, 8));
  P.push(part(place(superEll(82, 15, 34, 0.22, 0.22, 10, 28), { t: [0, 23, 0] }), F)); // assise 8..38
  // Dossier en pente, épais et bombé : 74 cm de haut à gauche (x = −58,5), 46 à droite (x = 27,5), le long du bord arrière ; il
  // sort de l'assise (sa base est noyée dans le corps, 8 cm sous le dessus) ; profil vertical arrondi (e1 0,6) et dos renflé ;
  // un coussin de dos s'y appuie.
  const H = (x: number) => 36 - (28 * (x + 43)) / 86; // hauteur du dossier au-dessus de l'assise (38) selon x local
  const slope: Deform = (x, y, z) => {
    const u = (y + 22) / 44; // 0 à la base (noyée), 1 à la crête
    const bulge = z < 0 ? 3 * Math.sin(Math.PI * Math.min(1, u * 1.15)) : 0; // dos bombé vers l'arrière
    return [x, -22 + u * (H(x) + 8), z - bulge];
  };
  P.push(part(place(superEll(43, 22, 8.5, 0.6, 0.3, 16, 32, slope), { t: [-15.5, 52, -24.5] }), D)); // arrière à −36 avec le renflement
  const back = backCushion(look, CU, 22, 12, 5.5, -20, 52, -18.5);
  P.push(back.part);
  // Accoudoir haut à gauche, volute roulée au sommet : boudin cylindrique le long de z (section ronde, bouts presque plats),
  // fermé par deux disques enroulés rentrés dans sa section.
  P.push(part(place(superEll(12, 31, 34, 0.3, 0.3, 10, 28), { t: [-70.5, 39, 0] }), F)); // 8..70
  P.push(part(place(superEll(12, 33, 12, 0.3, 1, 14, 28), { rx: Math.PI / 2, t: [-70.5, 70, 0] }), CU, { hi: true })); // volute, sommet 82
  for (const sz of [-1, 1]) {
    P.push(part(place(superEll(10.5, 10.5, 1, 1, 1, 8, 24), { t: [-70.5, 70, sz * 32.8] }), D, { crease: false })); // bout de la volute
    P.push(part(place(superEll(5, 5, 0.8, 1, 1, 6, 16), { t: [-70.5, 70, sz * 33.6] }), CU, { crease: false, noshadow: true })); // cœur de l'enroulement
  }
  P.push(seatCushion(CU, 69, 5.5, 26, 11, 43.5, 5, px, pz, life.dent)); // dessus 49
  P.push(part(place(superEll(9, 6, 8, 0.45, 0.45, 12, 20), { ry: 0.35, rz: 0.1, t: [-46, 55, -12] }), T.fabric)); // petit coussin rond
  P.push(...backDress(look, T.fabric, [back.k]));
  if (look.variant.rivets) P.push(...rivets(look, [-80, 24, 34], [80, 24, 34], [0, 0, 1]));
  if (look.variant.pattern === 'diamonds') P.push(...diamonds(T.fabric, [60, 70, 80], 44, 31));
  if (look.variant.pattern === 'neon-edge') P.push(neonSeat(look, 82, 34, 23, 8, -57, 80)); // du grand accoudoir (face intérieure à −58,5) au bout droit
  return P;
}

/* ---------- banc à coussin : deux pieds pleins, tablette basse, assise de bois, coussin plat ---------- */
function bench(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones;
  const [px, pz] = perchXZ('bench');
  const P: CelPart[] = [];
  for (const sx of [-1, 1]) P.push(part(place(superEll(3, 18, 16, 0.2, 0.2, 10, 20), { t: [sx * 54, 18, 0] }), T.wood)); // pieds 0..36
  P.push(part(place(superEll(51, 1.5, 12, 0.2, 0.2, 6, 24), { t: [0, 11.5, 0] }), T.woodDark)); // tablette 10..13
  P.push(part(place(superEll(60, 3, 20, 0.2, 0.2, 8, 28), { t: [0, 39, 0] }), T.wood)); // assise 36..42
  P.push(seatCushion(T.fabric, 56, 3, 17, 0, 45, 0, px, pz, life.dent)); // coussin 42..48
  if (look.variant.rivets) P.push(...rivets(look, [-50, 39, 20], [50, 39, 20], [0, 0, 1]));
  if (look.variant.pattern === 'diamonds') for (const x of [-30, 0, 30]) P.push(part(place(superEll(2.6, 0.6, 2.6, 1, 1, 4, 4), { ry: Math.PI / 4, t: [x, 48.2, 0] }), T.warm, { flat: true, noshadow: true, trim: true })); // à plat sur le coussin (dessus 48)
  if (look.variant.pattern === 'neon-edge') P.push(neonRim(look, { a: 60, b: 3, c: 20, e1: 0.2, e2: 0.2, cx: 0, cy: 39, cz: 0 }, { front: 2.1 }, -57, 57, 0.7)); // haut du chant avant de l'assise de bois (à mi-chant, l'encre du tube mangeait la bande d'ombre du bas du chant : 7 % de face)
  return P;
}

/* ---------- pouf tricoté : galette ronde de grosse maille (dessus et base aplatis), fronce au sommet où la maille se rejoint ;
   sans côtes modelées : sur le flanc, la normale frôle le seuil d'ombre et la moindre côte déchiquette la frontière de l'ombre ---------- */
function pouf(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones;
  return [
    part(place(superEll(26.9, 20, 26.9, 0.55, 1, 40, 80, dentOf(life.dent, 20, 0, 0, 0, 0)), { t: [0, 20, 0] }), T.warm),
    // Fronce du sommet : elle descend avec le creux.
    part(place(superEll(3.2, 1, 3.2, 1, 1, 6, 12), { t: [0, 39.6 - DENT_DEPTH * life.dent, 0] }), T.warmDark, { crease: false, noshadow: true }),
  ];
}

/* ---------- pouf carré : cube mou aux arêtes arrondies et flancs bombés, passepoil, galette cousue dessus (les côtes du modèle à
   boîtes sont abandonnées : en cellulo chaque côte s'encre des deux côtés et la façade devient un code-barres) ---------- */
function squarePouf(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones, F = T.fabricLight;
  const P: CelPart[] = [];
  const bulge: Deform = (x, y, z) => {
    const k = 1 + 0.03 * (1 - (y * y) / (17 * 17)); // flancs bombés à mi-hauteur
    return [x * k, y, z * k];
  };
  P.push(part(place(superEll(26.6, 17, 26.6, 0.35, 0.35, 12, 32, bulge), { t: [0, 17, 0] }), F)); // corps 0..34
  // Passepoil cousu au bord du corps, sous la galette (son dessous est dans l'ombre : la couture se lit à tous les angles).
  const ring: Vec3[] = [];
  for (let i = 0; i <= 32; i++) { const a = (2 * Math.PI * i) / 32, c = Math.cos(a), sn = Math.sin(a); const k = 25.6 / Math.max(Math.abs(c), Math.abs(sn)) ** 0.5; ring.push([Math.sign(c) * Math.min(25.6, Math.abs(c) * k), 33.6, Math.sign(sn) * Math.min(25.6, Math.abs(sn) * k)]); }
  // (Néon : le passepoil est le liseré lumineux `edge`.)
  P.push(look.variant.pattern === 'neon-edge' ? part(tube(ring, 1.1, 8), T.edge, { crease: false, glow: true, noshadow: true }) : part(tube(ring, 1.1, 8), T.fabric, { crease: false }));
  P.push(part(place(superEll(27.4, 3, 27.4, 0.4, 0.4, 10, 32, dentOf(life.dent, 3, 0, 0, 0, 0)), { t: [0, 37, 0] }), F)); // galette 34..40
  if (look.variant.rivets) P.push(...rivets(look, [-24, 36, 26.4], [24, 36, 26.4], [0, 0, 1]));
  return P;
}

/* ---------- pouf poire (porté de la maquette l. 321) : goutte molle affaissée, plis verticaux, dos relevé, creux d'assise devant ---------- */
const BEANBAG_PROFILE: [number, number][] = [[0, 0], [30, 0], [37, 3], [40, 12], [39.5, 24], [36, 36], [29, 48], [19, 59], [9, 66.5], [3, 69.4], [0, 70]];
function beanbag(look: CelLook, life: LifeState): CelPart[] {
  const dent = life.dent;
  const [, pz] = perchXZ('beanbag');
  const def: Deform = (x, y, z) => {
    const a = Math.atan2(z, x), r = Math.hypot(x, z);
    // Plis verticaux du tissu, estompés vers le sommet.
    const fold = 1 + (0.07 * (Math.abs(Math.sin(2.5 * a + 0.6)) - 0.5) + 0.025 * Math.sin(7 * a - 1.1)) * (y < 28 ? 1 : Math.max(0, (70 - y) / 42));
    const rr = r * fold;
    // Le haut penche vers le fond (dos relevé), le devant forme l'assise.
    const lean = y > 30 ? (y - 30) * 0.5 : 0;
    const zz = rr * Math.sin(a) - lean;
    let yy = y;
    // Creux d'assise devant : le tissu s'enfonce autour de y ≈ 50, d'autant plus que l'on est à l'avant.
    const front = Math.max(0, Math.sin(a));
    yy -= 12.5 * front * Math.exp(-(((y - 50) / 12) ** 2));
    // Léger creux au sommet.
    if (r < 8 && y > 30) yy -= 0.8;
    // Affaissement sous l'animal : tout le sac s'écrase (4 cm au sommet) sans s'élargir au sol, le creux d'assise s'approfondit.
    yy *= 1 - (SAG_MAX * dent) / 70;
    yy -= 1.2 * dent * front * Math.exp(-((zz - pz) ** 2 + x * x) / (2 * DENT_SIGMA * DENT_SIGMA)) * Math.exp(-(((y - 46) / 12) ** 2));
    return [rr * Math.cos(a), yy, zz];
  };
  return [part(lathe(BEANBAG_PROFILE, 36, def), look.tones.fabricLight, { creaseThr: 0.8 })];
}

CEL_MODELS.sofa = sofa;
CEL_MODELS.loveseat = loveseat;
CEL_MODELS.armchair = armchair;
CEL_MODELS['club-chair'] = clubChair;
CEL_MODELS.daybed = daybed;
CEL_MODELS.bench = bench;
CEL_MODELS.pouf = pouf;
CEL_MODELS['square-pouf'] = squarePouf;
CEL_MODELS.beanbag = beanbag;
