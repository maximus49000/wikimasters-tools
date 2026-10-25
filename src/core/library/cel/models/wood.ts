import { FURNITURE_MODELS } from '../../furniture-models';
import type { StandingKind } from '../../library-types';
import type { LifeState } from '../life-state';
import type { CelLook, CelVariant } from '../looks';
import { lathe, part, place, superEll, tube, type CelPart, type Deform, type Mesh, type Vec3 } from '../mesh';
import type { Tone } from '../tone';
import { CEL_MODELS } from './registry';

// Bois, bascule, suspension et arbre à chat (G6, tâche 6) : rocking-chair (porté de la maquette `chair`, l. 231-247), chaise,
// fauteuil œuf suspendu, fauteuil paon, arbre à chat (porté de `catTree`, l. 351). Repère centré (origine au centre de la base,
// x à droite, y en haut, z vers le spectateur, cm). Couleurs : les clés de palette du modèle à boîtes (`look.tones`) ; les pieds
// de la chaise suivent `look.variant.legs`.
//
// Mobilier vivant (spec §6) : `life.dent` creuse la galette du rocking-chair, le coussin de la chaise, du fauteuil œuf et du fauteuil
// paon (3,2 cm au plus, gaussienne) ; `life.sag` (cm) fait ployer le plateau d'arrivée de l'arbre à chat ; `life.tassel` (rad)
// balance le pompon autour de son accroche. La bascule (`rock`), l'oscillation de l'œuf (`swing`) et `tilt` sont appliquées par
// l'appelant à partir des données de `furniture-life-specs.ts` (pivots exportés ici).

const DENT_DEPTH = 3.2, DENT_SIGMA = 15;

/** Rayon de courbure des patins du rocking-chair (cm) : il roule autour du point [0, RUN_R, 0]. */
export const RUN_R = 95;
/** Point d'accroche de la coque du fauteuil œuf (repère centré, cm) : bout du bras du pied. */
export const EGG_HOOK: Vec3 = [0, 190, 16];
/** Index du plateau de l'arbre à chat qui ploie à l'arrivée d'un animal (0 plateau bas, 1 plateau du pompon, 2 perchoir du sommet). */
export const SAG_BOARD = 2;
/** Accroche du pompon de l'arbre à chat (sous le plateau du milieu, repère centré, cm). */
export const TASSEL_PIVOT: Vec3 = [-27, 95, 0];

// Centre du dessus praticable d'un modèle dans le repère centré (x, z).
function perchXZ(kind: StandingKind): [number, number] {
  const m = FURNITURE_MODELS[kind], p = m.perch!;
  return [p.x + p.w / 2 - m.w / 2, m.d / 2 - (p.z + p.d / 2)];
}
// Creux d'assise d'un coussin de demi-hauteur `b` centré en (cx, cz) : le dessus descend d'une gaussienne au point d'assise (px, pz).
function dentOf(dent: number, b: number, cx: number, cz: number, px: number, pz: number, depth = DENT_DEPTH): Deform | undefined {
  if (dent <= 0) return undefined;
  const [dx, dz] = [px - cx, pz - cz];
  return (x, y, z) => (y > 0 ? [x, y - depth * dent * Math.exp(-((x - dx) ** 2 + (z - dz) ** 2) / (2 * DENT_SIGMA * DENT_SIGMA)) * (y / b), z] : [x, y, z]);
}
// Pied de chaise selon la variante du style : profil (r, y) de hauteur h.
function legProfile(legs: CelVariant['legs'], h: number): [number, number][] {
  switch (legs) {
    case 'taper': return [[2.8, 0], [2, h]];
    case 'turned': return [[2.6, 0], [2.6, h * 0.2], [1.9, h * 0.35], [2.9, h * 0.55], [2, h * 0.75], [2.4, h]];
    case 'hairpin': return [[1, 0], [1, h]];
    case 'block': return [[2.7, 0], [2.7, h]];
    case 'claw': return [[3.2, 0], [2.2, h * 0.3], [2.8, h * 0.7], [2.4, h]];
    default: return [[2.6, 0], [2.2, h]];
  }
}
// Barreau rond entre deux points (tube droit).
const rod = (a: Vec3, b: Vec3, r: number, col: Tone): CelPart => part(tube([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], b], r, 8), col, { crease: false });

/* ---------- rocking-chair (porté de la maquette : patins en arc, pieds, cadre, galette à creux, montants, traverses, barreaux, accoudoirs) ---------- */
// Hauteur de l'axe du patin au-dessus du sol à la profondeur z (arc de rayon RUN_R, le plus bas au milieu).
const runnerY = (z: number): number => RUN_R - Math.sqrt(RUN_R * RUN_R - z * z) + 1.6;
const RUNNER_X = 26.5, RUNNER_R = 1.75;

/** Les deux patins seuls (tubes en arc), pour le contrôle du dessin de profil. */
export function rockingRunners(look: CelLook): CelPart[] {
  const out: CelPart[] = [];
  for (const sx of [-1, 1]) {
    const pts: Vec3[] = [];
    for (let z = -46; z <= 46.1; z += 4.6) pts.push([sx * RUNNER_X, runnerY(z), z]);
    out.push(part(tube(pts, RUNNER_R, 10), look.tones.woodDark, { crease: false }));
  }
  return out;
}
function rockingChair(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones, W = T.wood;
  const [px, pz] = perchXZ('rocking-chair');
  const P: CelPart[] = [...rockingRunners(look)];
  // Pieds posés sur les patins (deux par côté), légèrement coniques.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const z0 = sz * 17, y0 = runnerY(z0) + 1;
      P.push(part(place(lathe([[2.3, 0], [1.7, 40.2 - y0]], 12), { t: [sx * 24.5, y0, z0] }), W, { crease: false }));
    }
  P.push(part(place(superEll(29.5, 2.2, 23, 0.35, 0.3, 10, 24), { t: [0, 42, 0] }), W)); // cadre de l'assise 39,8..44,2
  P.push(part(place(superEll(25.5, 5.5, 20, 0.5, 0.5, 16, 30, dentOf(life.dent, 5.5, 0, 1.5, px, pz)), { t: [0, 46.3, 1.5] }), T.fabric)); // galette bombée 40,8..51,8
  // Dossier : deux montants inclinés vers l'arrière, traverse haute bombée, traverse basse, cinq barreaux légèrement cintrés.
  for (const sx of [-1, 1]) P.push(part(tube([[sx * 25.5, 43, -19], [sx * 25, 75, -22], [sx * 24.5, 101, -26]], 1.9, 10), W, { crease: false }));
  P.push(part(place(superEll(27.5, 3.4, 2.7, 0.3, 0.3, 8, 20), { t: [0, 100, -26] }), W, { crease: false })); // sommet 103,4
  P.push(part(place(superEll(26, 1.7, 1.5, 0.6, 0.6, 6, 16), { t: [0, 53, -19.6] }), W, { crease: false }));
  for (const sx of [-1, 1]) P.push(rod([sx * 24.5, 22, 17], [sx * 24.5, 22, -17], 1.3, W)); // entretoises entre les pieds
  const bow: Deform = (x, y, z) => [x, y, z - 1.1 * Math.cos((Math.PI * y) / 44)]; // barreau cintré (ventre vers le dos)
  for (let i = -2; i <= 2; i++) P.push(part(place(superEll(2, 22, 0.9, 0.3, 0.6, 10, 10, bow), { rx: -0.075, t: [i * 9, 76, -22.4] }), W, { crease: false }));
  // Accoudoirs : du montant vers l'avant, posés sur un montant avant rond.
  for (const sx of [-1, 1]) {
    P.push(part(tube([[sx * 26.2, 72, -21.5], [sx * 27.6, 71, 0], [sx * 28.2, 70, 16]], 1.9, 10), W, { crease: false }));
    P.push(part(place(lathe([[1.6, 0], [1.6, 27]], 10), { t: [sx * 28.2, 43, 14] }), W, { crease: false }));
  }
  return P;
}

/* ---------- chaise : quatre pieds (variante du style) un peu évasés, assise de bois adoucie, galette nouée, dossier à barreaux
   et traverses cintrées (le dos n'est pas une plaque : deux traverses courbes autour du dos de l'assis, trois fuseaux) ---------- */
function chair(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones, W = T.wood;
  const [px, pz] = perchXZ('chair');
  const P: CelPart[] = [];
  const h = 40, splay = 0.06;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(part(place(lathe(legProfile(look.variant.legs, h), 10), { rz: sx * splay, rx: -sz * splay, t: [sx * 19.5, 0, sz * 21] }), T.leg, { crease: false }));
  P.push(part(place(superEll(20.5, 2, 22, 0.5, 0.3, 10, 24), { t: [0, 42, 1] }), T.desk)); // assise 40..44
  P.push(part(place(superEll(17.5, 3.5, 19, 0.7, 0.5, 14, 28, dentOf(life.dent, 3.5, 0, 1, px, pz, 2.8)), { t: [0, 45, 1] }), T.fabric)); // galette dodue 41,5..48,5
  for (const sx of [-1, 1]) P.push(part(place(superEll(1.4, 1.1, 1.4, 1, 1, 6, 10), { t: [sx * 14, 47, -17.5] }), T.fabricDark, { crease: false, noshadow: true })); // nœuds de la galette
  // Entretoises en H entre les pieds (leur dessous prend l'ombre : le piètement a du relief).
  for (const sx of [-1, 1]) P.push(rod([sx * 18.6, 15, 20], [sx * 18.6, 15, -20], 1.1, T.leg));
  P.push(rod([-18.6, 19, -2], [18.6, 19, -2], 1.1, T.leg));
  // Montants du dossier, qui prolongent les pieds arrière et s'inclinent vers l'arrière.
  for (const sx of [-1, 1]) P.push(part(tube([[sx * 19.5, 44, -20], [sx * 19.3, 66, -22], [sx * 19, 86, -24.5]], 1.8, 10), W, { crease: false }));
  // Traverses cintrées : les bouts viennent vers l'avant (autour du dos), légèrement penchées en arrière.
  const CURL = 0.012; // les bouts des traverses viennent de 5 cm vers l'avant : le dos enveloppe l'assis, et de face le quart droit prend l'ombre
  const curl: Deform = (x, y, z) => [x, y, z + CURL * x * x];
  const comb: Deform = (x, y, z) => [x, y * (1 - 0.3 * (x / 21) ** 2), z + CURL * x * x]; // la traverse haute s'amincit vers ses bouts
  P.push(part(place(superEll(21, 5, 1.9, 0.55, 0.5, 8, 24, comb), { rx: -0.1, t: [0, 83, -24] }), W)); // traverse haute 78..88
  P.push(part(place(superEll(20, 2.5, 1.6, 0.5, 0.45, 6, 24, curl), { rx: -0.1, t: [0, 68, -22.8] }), W)); // traverse médiane
  for (const x of [-8, 0, 8]) P.push(part(place(lathe([[1, 0], [1.3, 17], [1, 32]], 8), { rx: -0.1, t: [x, 46, -21.8 + CURL * x * x] }), W, { crease: false })); // fuseaux
  return P;
}

/* ---------- fauteuil œuf suspendu : socle lourd, pied en arc qui passe derrière la coque, bras au-dessus, tige, coque en œuf de
   rotin creusée devant (tour de révolution autour de l'axe de l'ouverture : paroi, lèvre, cavité lisse), jonc autour de l'ouverture,
   coussin d'assise à creux dans le fond de la cavité, coussin de dos ---------- */
const EGG_C: Vec3 = [0, 96, 16]; // centre de la coque
const EGG_STRETCH = 55 / 33; // l'œuf est 55 de haut pour 33 de large : la révolution (ronde) est étirée en hauteur
const EGG_TAPER = 0.15; // plus étroit en haut (œuf)
// Profil (r, s) de la coque, s = profondeur depuis le centre vers le spectateur : paroi extérieure du pôle arrière à la lèvre, lèvre,
// paroi intérieure (cavité) jusqu'au fond. Le tour est fait autour de l'axe de l'ouverture.
const EGG_PROFILE: [number, number][] = [
  [0, -33], [12, -31], [21, -26], [28, -17], [32, -6], [33, 4], [31.5, 12], [28.5, 18], [26, 22], // extérieur
  [24.5, 23.2], [22.5, 22], // lèvre
  [24, 17], [24.5, 8], [23.5, -3], [21, -12], [16, -19], [9, -24], [0, -26], // cavité
];
const EGG_INNER_FROM = 11; // premier anneau de la cavité (normales à retourner)
// Un point du tour (x à droite, s profondeur, v hauteur ronde) → repère de la coque : hauteur étirée, affinement vers le haut.
const eggPoint = (x: number, s: number, v: number): Vec3 => {
  const y = v * EGG_STRETCH, k = 1 - EGG_TAPER * Math.max(0, y / 55);
  return [x * k, y, s * k];
};
function eggShell(): Mesh {
  // Tour autour de y : (x, y = −s, z = v) ; la déformation étire/affine ; puis rotation rx −π/2 : y → −z (s vers le spectateur), z → y.
  const nv = 48;
  const m = lathe(
    EGG_PROFILE.map(([r, s]) => [r, -s] as [number, number]),
    nv,
    (x, y, z) => {
      const p = eggPoint(x, -y, z);
      return [p[0], -p[2], p[1]];
    },
    { caps: false },
  );
  // Les anneaux de la cavité sont concaves : la construction oriente leurs normales vers la paroi, on les retourne.
  for (let i = EGG_INNER_FROM * (nv + 1); i < m.n.length; i++) m.n[i] = [-m.n[i]![0], -m.n[i]![1], -m.n[i]![2]];
  return place(m, { rx: -Math.PI / 2 });
}
function eggChair(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones, M = T.metal;
  const [px, pz] = perchXZ('egg-chair');
  const P: CelPart[] = [];
  P.push(part(lathe([[43, 0], [43, 2.5], [40.5, 4], [6, 4], [5, 6], [0, 6]], 36), M)); // socle 0..4, moyeu
  // Pied : arc dans le plan z = −10, derrière la coque ; bras qui revient au-dessus de la coque jusqu'à l'accroche.
  const arc: Vec3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    arc.push([(1 - t) ** 2 * 27 + 2 * (1 - t) * t * 53 + t * t * 27, (1 - t) ** 2 * 4 + 2 * (1 - t) * t * 95 + t * t * 186, -10]);
  }
  P.push(part(tube(arc, 2.2, 10), M, { crease: false }));
  P.push(part(tube([[27.3, 183, -10], [26, 188.5, -8], [20, 191.5, 0], [8, 192, 12], [EGG_HOOK[0], EGG_HOOK[1], EGG_HOOK[2]]], 2.2, 10), M, { crease: false }));
  P.push(part(place(lathe([[0.7, 0], [0.7, EGG_HOOK[1] - (EGG_C[1] + 55) + 1]], 8), { t: [EGG_HOOK[0], EGG_C[1] + 55 - 1, EGG_HOOK[2]] }), M, { crease: false })); // tige
  P.push(part(place(eggShell(), { t: EGG_C }), T.wood)); // coque de rotin, cavité comprise (une seule silhouette)
  // Jonc de rotin sombre sur la lèvre, autour de l'ouverture.
  const rim: Vec3[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = (2 * Math.PI * i) / 40, p = eggPoint(25.3 * Math.cos(a), 22.8, 25.3 * Math.sin(a));
    rim.push([p[0] + EGG_C[0], p[1] + EGG_C[1], p[2] + EGG_C[2]]);
  }
  P.push(part(tube(rim, 1.6, 10), T.woodDark, { crease: false }));
  P.push(part(place(superEll(17, 7, 12, 0.4, 0.4, 14, 28, dentOf(life.dent, 7, 0, pz - 6, px, pz)), { t: [0, 63, pz - 6] }), T.fabricLight)); // assise au fond de la cavité, dessus 70
  P.push(part(place(superEll(15, 20, 5, 0.35, 0.35, 14, 28), { rx: -0.12, t: [0, 92, 4] }), T.fabric)); // coussin de dos
  return P;
}

/* ---------- fauteuil paon : pied en sablier, assise ronde adoucie, coussin à creux, dossier en éventail (galette plate à bord
   rond, resserrée en col vers l'assise) cintré autour de l'assis et bombé au dos, bordé d'un jonc, treillis de rotin en relief sur
   les deux faces (rayons et anneaux) ---------- */
const FAN_Z = -24, FAN_CURL = 0.0045, FAN_C: [number, number] = [0, 88], FAN_RX = 44.5, FAN_RY = 47.5, FAN_BULGE = 4;
// Cintrage en plan : les bouts viennent vers l'avant.
const fanZ = (x: number): number => FAN_Z + FAN_CURL * x * x;
// Forme de l'éventail : point du disque (repère de l'éventail, centre FAN_C) → col resserré vers l'assise (demi-largeur 21 en bas).
const fanXY = (x: number, y: number): [number, number] => {
  const u = Math.min(1, Math.max(0, (y + FAN_RY) / (FAN_RY - 24))), sm = u * u * (3 - 2 * u); // resserrement progressif (lisse) du col
  return [x * (0.47 + 0.53 * sm), y];
};
const fanBulge = (x: number, y: number): number => FAN_BULGE * Math.max(0, 1 - (x * x) / (FAN_RX * FAN_RX) - (y * y) / (FAN_RY * FAN_RY));
function peacockChair(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones;
  const [px, pz] = perchXZ('peacock-chair');
  const zc = 2.5; // axe du pied
  const P: CelPart[] = [];
  P.push(part(place(lathe([[24, 0], [23.5, 1.5], [17, 6], [11, 14], [9.5, 21], [11, 28], [16, 36], [22, 41], [25, 43]], 28), { t: [0, 0, zc] }), T.woodDark)); // sablier
  P.push(part(place(lathe([[25, 42], [27.5, 43.5], [27.5, 45], [26, 46.5], [0, 46.5]], 36), { t: [0, 0, zc] }), T.wood)); // assise 42..46,5
  P.push(part(place(superEll(25, 2, 25, 0.4, 1, 12, 36, dentOf(life.dent, 2, 0, zc, px, pz)), { t: [0, 48, zc] }), T.fabric)); // coussin, dessus 50
  // Éventail : galette plate (3 cm) à bord rond, col vers l'assise, cintrée en plan, dos bombé ; le sommet est à 135,5.
  const fan: Deform = (x, y, z) => {
    const [fx, fy] = fanXY(x, y);
    return [fx, fy, z + FAN_CURL * fx * fx - (z < 0 ? fanBulge(fx, fy) : 0)];
  };
  P.push(part(place(superEll(FAN_RX, FAN_RY, 1.5, 0.4, 1, 20, 56, fan), { t: [FAN_C[0], FAN_C[1], FAN_Z] }), T.wood));
  // Jonc du bord.
  const edge: Vec3[] = [];
  for (let i = 0; i <= 56; i++) {
    const a = (2 * Math.PI * i) / 56, [fx, fy] = fanXY(FAN_RX * Math.cos(a), FAN_RY * Math.sin(a));
    edge.push([fx, FAN_C[1] + fy, fanZ(fx)]);
  }
  P.push(part(tube(edge, 1.7, 8), T.woodDark, { crease: false }));
  // Treillis de rotin en relief sur les deux faces : rayons depuis le hub et anneaux concentriques (c'est le dessin du paon, et vu de
  // dos le treillis rond prend la lumière là où une plaque serait toute en ombre).
  const faces: ((x: number, h: number) => number)[] = [(x) => fanZ(x) + 1.5 + 0.3, (x, h) => fanZ(x) - 1.5 - fanBulge(x, h - FAN_C[1]) - 0.3];
  for (const front of faces) {
    const SPOKE: Record<number, number> = { 0: 85, 20: 80, 40: 66, 60: 41 }; // longueur jusqu'à 4-6 cm du jonc
    for (const deg of [-60, -40, -20, 0, 20, 40, 60]) {
      const a = (deg * Math.PI) / 180, sx = Math.sin(a), cy = Math.cos(a), L = SPOKE[Math.abs(deg)]!;
      const pts: Vec3[] = [];
      for (let s = 0; s <= 4; s++) {
        const r = 10 + (s / 4) * (L - 10);
        pts.push([sx * r, 46 + cy * r, front(sx * r, 46 + cy * r)]);
      }
      P.push(part(tube(pts, 0.9, 6), T.woodDark, { crease: false, noshadow: true }));
    }
    for (const R of [14, 24, 34]) {
      const ring: Vec3[] = [];
      const span = R < 30 ? 80 : 70;
      for (let i = 0; i <= 16; i++) {
        const a = (-span + (2 * span * i) / 16) * (Math.PI / 180), x = R * Math.sin(a), h = 88 + R * Math.cos(a);
        ring.push([x, h, front(x, h)]);
      }
      P.push(part(tube(ring, 0.9, 6), T.woodDark, { crease: false, noshadow: true }));
    }
  }
  return P;
}

/* ---------- arbre à chat (porté de la maquette) : socle de feutre, niche à entrée ronde, deux poteaux de sisal, plateau bas,
   plateau du pompon, perchoir en corbeille au sommet ; le perchoir ploie (sag), le pompon se balance (tassel) ---------- */
function catTree(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones, SISAL = T.warmLight, FELT = T.fabricDark;
  const P: CelPart[] = [];
  P.push(part(place(superEll(31, 3, 25, 0.2, 0.2, 6, 20), { t: [0, 3, 0] }), T.rug)); // socle 0..6
  P.push(part(place(superEll(16, 17, 17, 0.25, 0.25, 10, 20), { t: [13, 23, 0] }), T.fabric)); // niche 6..40
  P.push(part(place(superEll(7.5, 8, 0.6, 1, 1, 8, 16), { t: [13, 22, 17.1] }), T.door, { flat: true, noshadow: true })); // entrée
  // Poteaux de sisal : cylindres, avec deux ligatures sombres (bouts de corde) chacun.
  const post = (x: number, y0: number, y1: number): void => {
    P.push(part(place(lathe([[4.3, 0], [4.3, y1 - y0]], 16), { t: [x, y0, 0] }), SISAL, { crease: false }));
    for (const f of [0.3, 0.7]) P.push(part(place(lathe([[4.3, 0], [4.7, 0.5], [4.7, 1.4], [4.3, 1.9]], 16), { t: [x, y0 + (y1 - y0) * f, 0] }), T.warmDark, { crease: false, noshadow: true }));
  };
  post(-19, 6, 95);
  post(11, 44, 143);
  // Plateaux de feutre, bords adoucis (index : 0 bas, 1 pompon, 2 perchoir).
  P.push(part(place(superEll(18, 3, 19, 0.25, 0.25, 6, 20), { t: [13, 41, 0] }), FELT)); // 38..44
  P.push(part(place(superEll(18, 3.5, 19, 0.25, 0.25, 6, 20), { t: [-13, 96.5, 0] }), FELT)); // 93..100
  // Perchoir en corbeille : fond à 149, rebord à 150 ; sous l'animal le bord ploie (sag, cm, nul au centre sur le poteau).
  const sag: Deform | undefined = life.sag > 0 ? (x, y, z) => [x, y - life.sag * Math.min(1, (x * x + z * z) / (19 * 19)), z] : undefined;
  P.push(part(place(lathe([[0, 0], [17, 0], [19, 3.5], [19, 7], [16, 6.5], [0, 6]], 28, sag), { t: [11, 143, 0] }), T.fabric));
  // Pompon suspendu sous le plateau du milieu : cordon + boule, balancés de `tassel` autour de l'accroche.
  const sw = { rz: life.tassel, t: TASSEL_PIVOT };
  P.push(part(place(lathe([[0.4, -16], [0.4, 0]], 6), sw), T.door, { crease: false, noshadow: true }));
  P.push(part(place(place(superEll(3, 3, 3, 1, 1, 10, 14), { t: [0, -18.5, 0] }), sw), T.leaf, { crease: false }));
  return P;
}

CEL_MODELS['rocking-chair'] = rockingChair;
CEL_MODELS.chair = chair;
CEL_MODELS['egg-chair'] = eggChair;
CEL_MODELS['peacock-chair'] = peacockChair;
CEL_MODELS['cat-tree'] = catTree;
