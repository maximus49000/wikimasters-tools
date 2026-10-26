import { FURNITURE_MODELS } from '../../furniture-models';
import type { LifeState } from '../life-state';
import type { CelLook } from '../looks';
import { bent, lathe, leaf, normalize, part, place, smooth, superEll, tube, type CelPart, type Deform, type Mesh, type Vec3 } from '../mesh';
import type { Tone } from '../tone';
import { CEL_MODELS } from './registry';

// Lampes et coin des animaux (G6, tâche 9) : lampadaire (`lamp`), lampadaire arc (porté de la maquette `arcLamp`, l. 284), lanterne en
// papier (porté de `lantern`, l. 342), panier, gamelle, niche, chargeur du robot. Repère centré (origine au centre de la base, x à
// droite, y en haut, z vers le spectateur, cm). Couleurs : les clés de palette du modèle à boîtes (`look.tones`), sauf le ton papier
// de la lanterne (`PAPER`, maquette l. 180) ; l'abat-jour (toute pièce au ton `shade`, et le papier de la lanterne) passe en WARM_LIT
// lumineux quand la lampe est allumée (celPartsOf), sinon il est ombré comme le reste.
//
// Logique des angles : la lumière est fixe (haut-gauche), le meuble tourne dessous. Les volumes sont des tours (socles, fûts,
// abat-jour, gamelle), des tubes (arc, cerclage du panier, anse, encadrement) et des superellipsoïdes (coussin, chargeur) ; les
// creux sont de vraies surfaces intérieures aux normales rentrantes (paroi intérieure du panier et de la gamelle : le flanc intérieur
// droit est éclairé, le gauche à l'ombre, comme dans une vraie cuvette). La niche est un seul volume (murs + pignon) extrudé
// avec des coins arrondis en plan et des arêtes franches entre les faces ; son toit est deux dalles épaisses qui débordent.
//
// Mobilier vivant (spec §6) : `life.dent` creuse le coussin du panier sous le point de repos (3 cm au plus, gaussienne σ = 12 cm,
// forme `dent` de la maquette) ; rien d'autre ne bouge ici (le fondu de la lueur des lampes est l'affaire du calque de lumière).

/** Ton papier de la lanterne (maquette l. 180) : la seule couleur hors palette, remplacée par WARM_LIT quand elle est allumée. */
export const PAPER: Tone = Object.freeze({ base: '#FBE4A6', shade: '#EACB8A', hi: '#FFF2C8' });

/** Rayon du globe de la lanterne à la hauteur y (ovoïde 7..53, ventre r 22,5 à 30) : les cerclages Steampunk l'épousent (steampunk.ts). */
export const LANTERN_R = (y: number): number => {
  const u = (y - 30) / 23;
  return 6.4 + 16.2 * Math.pow(Math.max(0, 1 - u * u), 0.45);
};

/** Creux du coussin du panier : profondeur max (cm) et rayon (σ de la gaussienne, cm). */
export const BASKET_DENT_DEPTH = 3, BASKET_DENT_SIGMA = 12;

/* ---------- aides ---------- */
// Normales retournées : surface intérieure (paroi d'une cuvette vue du dedans).
const inward = (m: Mesh): Mesh => ({ v: m.v, n: m.n.map(([x, y, z]): Vec3 => [-x, -y, -z]), t: m.t });
// Réunion de maillages en un seul (indices décalés) : une pièce, pas d'encre de silhouette entre eux.
function merge(ms: Mesh[]): Mesh {
  const out: Mesh = { v: [], n: [], t: [] };
  for (const m of ms) {
    const o = out.v.length;
    out.v.push(...m.v);
    out.n.push(...m.n);
    for (const [a, b, c] of m.t) out.t.push([a + o, b + o, c + o]);
  }
  return out;
}
// Normales lissées par sommet SANS souder les sommets confondus (contrairement à bent/finish) : un maillage dont les arêtes vives
// sont dupliquées garde ses faces planes (niche : mur / pignon / dessous).
function facetNormals(m: Mesh): Mesh {
  const nn: Vec3[] = m.v.map(() => [0, 0, 0]);
  for (const [a, b, c] of m.t) {
    const A = m.v[a]!, B = m.v[b]!, C = m.v[c]!;
    const u: Vec3 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w: Vec3 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const N: Vec3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    for (const i of [a, b, c]) nn[i] = [nn[i]![0] + N[0], nn[i]![1] + N[1], nn[i]![2] + N[2]];
  }
  return { v: m.v, n: nn.map(normalize), t: m.t };
}
// Extrusion le long de z d'une section convexe [[x, y], …] (sens trigonométrique, vue de +z), par tranches `zs` croissantes, bouchée
// aux deux bouts. Chaque face latérale a ses propres sommets (arêtes franches entre faces, lissage le long de z) ; `d` déforme
// (arrondi des coins en plan) avant le calcul des normales.
function prism(section: [number, number][], zs: number[], d: Deform = (x, y, z) => [x, y, z]): Mesh {
  const m: Mesh = { v: [], n: [], t: [] };
  const n = section.length, nz = zs.length;
  const push = (x: number, y: number, z: number): number => {
    m.v.push(d(x, y, z));
    return m.v.length - 1;
  };
  for (let k = 0; k < n; k++) {
    const [x0, y0] = section[k]!, [x1, y1] = section[(k + 1) % n]!;
    const a = zs.map((z) => push(x0, y0, z)), b = zs.map((z) => push(x1, y1, z));
    // Normale sortante de la face (section trigonométrique : (dy, −dx)) ; triangles orientés vers elle.
    for (let i = 0; i + 1 < nz; i++) m.t.push([a[i]!, b[i]!, a[i + 1]!], [b[i]!, b[i + 1]!, a[i + 1]!]);
  }
  // Bouchons (éventail depuis le centroïde).
  const cx = section.reduce((s, p) => s + p[0], 0) / n, cy = section.reduce((s, p) => s + p[1], 0) / n;
  for (const [z, sgn] of [[zs[0]!, -1], [zs[nz - 1]!, 1]] as const) {
    const c = push(cx, cy, z), ring = section.map(([x, y]) => push(x, y, z));
    for (let k = 0; k < n; k++) {
      const p = ring[k]!, q = ring[(k + 1) % n]!;
      m.t.push(sgn > 0 ? [c, p, q] : [c, q, p]);
    }
  }
  return facetNormals(m);
}
// Creux du coussin : le dessus (y > 0 dans le repère du coussin de demi-hauteur b) descend d'une gaussienne centrée en (dx, dz).
function dentOf(dent: number, b: number, dx: number, dz: number): Deform | undefined {
  if (dent <= 0) return undefined;
  return (x, y, z) => (y > 0 ? [x, y - BASKET_DENT_DEPTH * dent * Math.exp(-((x - dx) ** 2 + (z - dz) ** 2) / (2 * BASKET_DENT_SIGMA * BASKET_DENT_SIGMA)) * (y / b), z] : [x, y, z]);
}
// Tranches en z d'une extrusion : serrées près des bouts (là où l'arrondi en plan agit), lâches au milieu.
function slices(h: number, n = 7): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(-h + 2 * h * (0.5 - 0.5 * Math.cos(Math.PI * t)));
  }
  return out;
}

/* ---------- lampadaire : socle rond lesté (disque à chanfrein + dôme), tige fine, douille et ampoule, abat-jour en tissu évasé
   vers le bas (paroi ouverte, cerclage du haut), araignée à trois branches et embout ---------- */
function lamp(look: CelLook): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  P.push(part(lathe([[0, 0], [14.6, 0], [15.6, 1], [15.6, 2.6], [14.6, 3.4], [9.5, 4.3], [6, 5.8], [3.2, 7], [1.7, 7.6]], 32), T.metal, { creaseThr: 0.75 })); // socle 0..7,6
  // Tige : anneaux tous les 12 cm (un tour à deux anneaux fait des triangles très longs : traits de profondeur parasites au milieu).
  const stem: [number, number][] = [[1.4, 7.2]];
  for (let y = 18; y < 126; y += 12) stem.push([1.4 - (0.25 * (y - 7.2)) / 119, y]);
  stem.push([1.15, 126]);
  P.push(part(lathe(stem, 12), T.metal, { crease: false })); // tige
  P.push(part(lathe([[1.15, 125.5], [2.4, 126], [2.4, 134], [1.9, 134.6]], 12), T.metal, { crease: false })); // douille 126..134,6
  P.push(part(lathe([[0, 134], [3, 135.2], [3.9, 139.5], [3.4, 143.5], [1.6, 146.5], [0, 147.2]], 14), T.shade, { crease: false, noshadow: true })); // ampoule (point de lueur 140)
  // Abat-jour : paroi ouverte (dehors comme dedans au même ton : c'est elle qui s'allume), légèrement galbée.
  P.push(part(lathe([[17.6, 124], [17.2, 125.2], [15.4, 135], [13.2, 146], [11.6, 155.4], [11.3, 157]], 36, undefined, { caps: false, center: [0, 140, 0] }), T.shade, { creaseThr: 0.75 }));
  P.push(part(lathe([[11.1, 156.4], [12, 156.6], [12, 158], [11.1, 158.2]], 36), T.metal, { crease: false })); // cerclage du haut
  for (let k = 0; k < 3; k++) {
    const a = (k * 2 * Math.PI) / 3 + 0.5;
    P.push(part(tube([[0, 157.3, 0], [Math.cos(a) * 11.2, 157.3, Math.sin(a) * 11.2]], 0.45, 6), T.metal, { crease: false, noshadow: true })); // araignée
  }
  P.push(part(lathe([[0, 156.5], [1.5, 156.5], [1.7, 158.4], [1.1, 159.4], [0, 160]], 12), T.metal, { crease: false })); // embout
  return P;
}

/* ---------- lampadaire arc (porté de la maquette) : socle de marbre épais à chanfrein, collier, fût droit qui part en grand arc
   (vraie épaisseur), dôme ouvert vers le bas, intérieur chaud, ampoule. Le fût est coupé en deux tubes qui se recouvrent, là où
   l'arc quitte l'emprise du socle : le socle et le fût vertical restent avec la base, l'arc et le dôme forment le surplomb dessiné
   PAR-DESSUS les meubles qu'il surplombe (règle du surplomb, celPartsOf part 'base' | 'overhang'). ---------- */
const ARC_BASE_X = FURNITURE_MODELS['arc-lamp'].base!.x + FURNITURE_MODELS['arc-lamp'].base!.w / 2 - FURNITURE_MODELS['arc-lamp'].w / 2; // 66,5
const ARC_SPLIT_X = FURNITURE_MODELS['arc-lamp'].base!.x - FURNITURE_MODELS['arc-lamp'].w / 2 - 2.6; // 48 : au-delà, un tube de rayon 2,2 reste hors du socle à 0,5 cm près
function arcLamp(look: CelLook): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  const bx = ARC_BASE_X;
  P.push(part(place(lathe([[0, 0], [15, 0], [16, 1.2], [16, 5.5], [15, 6.8], [4.5, 6.8], [4.5, 7.2], [0, 7.2]], 32), { t: [bx, 0, 0] }), T.desk, { creaseThr: 0.75 })); // socle
  P.push(part(place(lathe([[3.4, 6.8], [3.4, 10], [2.7, 10.8]], 14), { t: [bx, 0, 0] }), T.metal, { crease: false })); // collier
  // Fût et arc : une seule courbe lissée, coupée en deux tubes avec un segment de recouvrement.
  const ctrl: Vec3[] = [[bx, 8, 0], [bx, 70, 0], [bx, 128, 0], [bx - 14.5, 172, 0], [bx - 50.5, 196, 0], [bx - 92.5, 194, 0], [bx - 118.5, 178, 0], [bx - 127.5, 163, 0]];
  const path = smooth(ctrl, 4);
  const cut = path.findIndex((p) => p[0] <= ARC_SPLIT_X);
  P.push(part(tube(path.slice(0, cut + 2), 2.2, 12), T.metal, { crease: false })); // fût (base)
  P.push(part(tube(path.slice(cut), 2.1, 12), T.metal, { crease: false })); // arc (surplomb)
  const end = path[path.length - 1]!;
  const at = { rz: 0.4, rx: -0.15, t: [end[0] - 1, end[1] + 1, 0] as Vec3 };
  P.push(part(place(lathe([[13, -16.5], [12.6, -15], [5.2, 0], [0, 0]], 28, undefined, { caps: false, center: [0, -4, 0] }), at), T.metal)); // dôme
  P.push(part(place(lathe([[12.2, -16.1], [4.8, -1.2]], 28, undefined, { caps: false, center: [0, -30, 0] }), at), T.shade, { crease: false })); // intérieur (s'allume)
  P.push(part(place(lathe([[0, -11], [3, -10], [3.4, -7], [2.2, -4], [0, -4]], 12), at), T.shade, { crease: false, noshadow: true })); // ampoule
  // Steampunk : le cerclage de laiton du dôme est dessiné sur le bord du dôme incliné (celui du modèle à boîtes, horizontal à
  // l'ancienne place du dôme, transperçait le nouveau dôme) ; le reste de la garniture (bandeau, pieds boule, bagues) : CEL_TRIMS (steampunk.ts).
  if (look.style === 'steampunk') P.push(part(place(lathe([[13.1, -16.9], [13.7, -16.4], [13.7, -14.9], [13.2, -14.4]], 28), at), T.text, { crease: false, noshadow: true, trim: true }));
  return P;
}

/* ---------- lanterne en papier (porté de la maquette) : chōchin en fuseau à côtes horizontales, anneaux de bois en haut et en bas,
   socle de bois, anse en cordon ---------- */
function paperLantern(look: CelLook): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  P.push(part(lathe([[0, 0], [12, 0], [13.5, 1], [13.5, 3.6], [12.4, 4.4], [7.2, 4.7], [0, 4.7]], 24), T.woodDark, { creaseThr: 0.75 })); // socle
  P.push(part(lathe([[0, 4.5], [7.4, 4.5], [7.6, 6.8], [6.2, 7]], 16), T.woodDark, { crease: false })); // anneau du bas
  // Globe : rayon d'un ovoïde (7..53, ventre à 30), côtes alternées comme la maquette (crête +0,7, creux −0,5 tous les 2,6 cm).
  const R = LANTERN_R;
  const prof: [number, number][] = [[0, 6.8], [6.2, 6.8], [R(8.2) - 0.4, 8.2]];
  for (let y = 9.5; y <= 50; y += 2.6) prof.push([R(y) + 0.7, y], [R(y + 1.3) - 0.5, y + 1.3]);
  prof.push([8.5, 52.3], [5.2, 53], [0, 53]);
  P.push(part(lathe(prof, 32), PAPER, { creaseThr: 0.9 }));
  P.push(part(lathe([[5.4, 52.6], [7.2, 53], [7.4, 55.5], [5.4, 56]], 16), T.woodDark, { crease: false })); // anneau du haut
  P.push(part(tube([[-4, 55.3, 0], [-3.2, 59, 1], [0, 61.2, 2], [3.2, 59, 1], [4, 55.3, 0]], 0.6, 6), T.warmDark, { crease: false, noshadow: true })); // anse
  return P;
}

/* ---------- panier : corbeille ovale lisse, devant échancré (le rebord descend de
   21,6 derrière à 13 devant : on voit le coussin), paroi intérieure aux normales rentrantes, boudin sur le bord qui suit
   l'échancrure, coussin bombé à creux (spec §6) ---------- */
const OVAL = 0.75; // z / x : 60 × 45
const BASKET_RIM = 21.6, BASKET_NOTCH = 8.6; // hauteur du rebord derrière ; de combien il descend devant
// Hauteur du rebord à l'azimut a (a = 0 vers +x, π/2 vers le devant +z) : échancrure en cloche sur le devant.
const rimH = (a: number): number => BASKET_RIM - BASKET_NOTCH * Math.pow(Math.max(0, Math.sin(a)), 3);
function basket(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones;
  const m = FURNITURE_MODELS.basket, poi = m.pois!.find((p) => p.type === 'curl')!;
  const [px, pz] = [poi.x - m.w / 2, m.d / 2 - poi.z];
  // Ovale, et le haut de la paroi (y > 4,6, au-dessus du fond) descend vers le devant.
  const wall: Deform = (x, y, z) => {
    const a = Math.atan2(z, x), h = rimH(a);
    return [x, y > 4.6 ? 4.6 + (y - 4.6) * ((h - 4.6) / (BASKET_RIM - 4.6)) : y, z * OVAL];
  };
  // Profil extérieur : galbe lisse (parabole, anneaux tous les 1,5 cm). Essayé et retiré : des rangs de tressage (±0,4 puis ±0,6 cm,
  // pas 3,6-4,4 cm) : la frontière d'ombre devenait une suite de griffures horizontales (leçon du pouf, T5).
  const outer: [number, number][] = [[0, 0], [24, 0], [27.4, 0.6]];
  for (let y = 1.5; y < BASKET_RIM; y += 1.5) outer.push([29.6 - 0.0075 * (y - 9) ** 2, y]);
  outer.push([28.6, BASKET_RIM]);
  const inner: [number, number][] = [[28, BASKET_RIM]];
  for (let y = BASKET_RIM - 2; y > 5; y -= 2.5) inner.push([27.6 - 0.006 * (y - 9) ** 2 - 0.5 * ((BASKET_RIM - y) / BASKET_RIM), y]);
  inner.push([24.6, 4.6], [0, 4.6]);
  const P: CelPart[] = [];
  P.push(part(merge([lathe(outer, 48, wall, { caps: false }), inward(lathe(inner, 48, wall, { caps: false }))]), T.warm, { crease: false }));
  // Boudin du bord : tube fermé qui suit le rebord échancré (couture derrière).
  const ring: Vec3[] = [];
  for (let k = 0; k <= 74; k++) {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / 72;
    ring.push([Math.cos(a) * 28.7, rimH(a), Math.sin(a) * 28.7 * OVAL]);
  }
  P.push(part(tube(ring, 2.3, 10), T.warmDark, { crease: false }));
  // Coussin : galette ovale bombée posée au fond (sommet à 12,2, à 1,2 du point de repos), creusée sous l'animal ; sa clé de palette
  // est choisie par style (`look.pick.cushion`, tâche 10 : `fabricLight` se confondait avec la vannerie `warm` en Steampunk et Industriel).
  P.push(part(place(superEll(26.8, 4.2, 20.2, 0.5, 1, 14, 32, dentOf(life.dent, 4.2, px, pz)), { t: [0, 8, 0] }), T[look.pick.cushion]));
  return P;
}

/* ---------- gamelle : cuvette en métal au tour (paroi extérieure, bord roulé, paroi intérieure rentrante, fond), croquettes en dôme
   et quelques croquettes posées dessus ---------- */
function bowl(look: CelLook): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  const outer = lathe([[0, 0], [6.5, 0], [8.8, 0.6], [9.8, 2.5], [9.9, 5], [9.6, 7.4], [10.2, 8.4], [9.6, 8.9]], 32, undefined, { caps: false });
  const inner = inward(lathe([[9.6, 8.9], [8.6, 8.3], [8.2, 6], [7.3, 4.6], [0, 4.4]], 32, undefined, { caps: false, center: [0, 30, 0] }));
  P.push(part(merge([outer, inner]), T.metal));
  P.push(part(place(superEll(7, 1.4, 7, 0.6, 1, 8, 24), { t: [0, 4.4, 0] }), T.warm, { crease: false, noshadow: true })); // croquettes
  for (const [x, z, a] of [[-3, 1.5, 0.4], [2.5, -2.5, 1.3], [1, 3.5, 2.2], [-1.5, -3.8, 0.9], [4, 1, 1.8]] as const)
    P.push(part(place(superEll(1.4, 0.7, 1.1, 0.7, 0.7, 6, 10), { ry: a, t: [x, 5.9, z] }), T.warmDark, { crease: false, noshadow: true }));
  return P;
}

/* ---------- niche : socle, corps en bois (murs + pignon en un seul volume extrudé, coins arrondis en plan, arêtes franches),
   ouverture en arc sombre et son encadrement, plaque, toit à deux dalles épaisses qui débordent, faîtage ---------- */
const KEN_EAVE_Y = 48, KEN_RIDGE_Y = 71.2, KEN_HALF_W = 29, KEN_HALF_D = 40;
function kennel(look: CelLook): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  P.push(part(place(superEll(32.5, 1.7, 42.5, 0.3, 0.3, 6, 28), { t: [0, 1.7, 0] }), T.woodDark)); // socle 0..3,4
  // Corps : section maison (sens trigonométrique vu de face), coins arrondis en plan (x réduit près des bouts en z).
  // `x0` : abscisse fixe de l'arrondi (0 = le centre ; pour une dalle de toit, le faîte : ses coins de gouttière s'arrondissent, le
  // faîte reste bord à bord sur toute la longueur).
  const round = (p: number, zmax: number, x0 = 0): Deform => (x, y, z) => [x0 + (x - x0) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(z) / zmax, p)), 1 / p), y, z];
  const section: [number, number][] = [[-KEN_HALF_W, 2.5], [KEN_HALF_W, 2.5], [KEN_HALF_W, KEN_EAVE_Y], [0, KEN_RIDGE_Y], [-KEN_HALF_W, KEN_EAVE_Y]];
  P.push(part(prism(section, slices(KEN_HALF_D, 9), round(7, KEN_HALF_D + 2.5)), T.wood, { creaseThr: 0.8 }));
  // Quatre poteaux d'angle ronds (ossature de la niche) : de face, leur moitié droite est à l'ombre.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(part(place(lathe([[2.4, 0.5], [2.7, 2], [2.7, 46], [2.4, 48.5]], 14), { t: [sx * 28.6, 0, sz * 38.4] }), T.woodDark, { crease: false }));
  // Ouverture : arc sombre à fleur de la façade (plat : un trou), encadrement en boudin, plaque au-dessus.
  const arch: [number, number][] = [[-11, 0], [11, 0]];
  for (let k = 1; k < 12; k++) {
    const a = (Math.PI * k) / 12;
    arch.push([Math.cos(a) * 11, 24 + Math.sin(a) * 12.5]);
  }
  const zf = KEN_HALF_D + 0.5;
  P.push(part(place(leaf(arch, 0.6, undefined, [0, 12]), { rx: -Math.PI / 2, t: [0, 3, zf] }), T.door, { flat: true, noshadow: true, crease: false }));
  const frame: Vec3[] = [[-12.4, 3, zf]];
  for (let k = 0; k <= 12; k++) {
    const a = Math.PI - (Math.PI * k) / 12;
    frame.push([Math.cos(a) * 12.4, 27 + Math.sin(a) * 13.9, zf]);
  }
  frame.push([12.4, 3, zf]);
  P.push(part(tube(frame, 1.3, 8), T.woodDark, { crease: false, noshadow: true }));
  P.push(part(place(superEll(6, 2.1, 0.7, 0.4, 0.3, 6, 16), { t: [0, 45, zf + 0.2] }), T.desk, { crease: false, noshadow: true }));
  // Toit : deux dalles épaisses (section extrudée le long du faîte par `prism` : coins arrondis en plan aux seuls bouts, arête de
  // faîte droite) posées sur les pignons, débordant de 6 cm aux gouttières et devant/derrière. Au faîte, chaque dalle est coupée
  // D'APLOMB (coupe verticale, comme un chevron) : les deux coupes se rejoignent dans le plan x = 0, bord à bord, sans encoche ni
  // lèvre ; l'arête du faîte est le trait d'encre entre les deux pièces. Pas de rondin de faîtage : essayé à deux hauteurs (tours 0 et
  // 1), vu de face il se lisait comme un poteau au-dessus du pignon.
  const slope = Math.atan2(KEN_RIDGE_Y - KEN_EAVE_Y, KEN_HALF_W), eaveX = 35, th = 2.8, halfD = 46;
  const eaveY = KEN_RIDGE_Y - eaveX * Math.tan(slope), L = Math.hypot(eaveX, KEN_RIDGE_Y - eaveY);
  for (const sx of [-1, 1]) {
    // Repère local de la dalle : x le long de la pente, y = épaisseur ; avec rz = −sx·pente, le faîte est du côté local +x pour le pan
    // gauche et −x pour le pan droit (r). Coupe d'aplomb au faîte : le coin haut est décalé de th·tan(pente) le long de la pente, vers
    // l'autre pan (la verticale du monde vaut (±sin, cos) dans ce repère).
    const r = -sx, e = th * Math.tan(slope) + 0.15; // + 0,15 : les deux coupes se chevauchent d'un rien (aucun jour au faîte)
    const section: [number, number][] = [[-L / 2, -th / 2], [L / 2, -th / 2], [L / 2 + (r > 0 ? e : 0), th / 2], [-L / 2 - (r < 0 ? e : 0), th / 2]];
    const plate = prism(section, slices(halfD, 9), round(8, halfD + 2.5, (r * L) / 2));
    // rz = −sx·pente : l'axe local x monte vers le faîte ; la normale du dessus (nx, ny) penche vers la gouttière.
    const nx = sx * Math.sin(slope), ny = Math.cos(slope);
    const c: Vec3 = [(sx * eaveX) / 2 + nx * (th / 2), (eaveY + KEN_RIDGE_Y) / 2 + ny * (th / 2), 0];
    P.push(part(place(plate, { rz: -sx * slope, t: c }), T.door, { creaseThr: 0.8 }));
  }
  return P;
}

/* ---------- chargeur du robot : plateau arrondi creusé d'une cuvette peu profonde (là où le robot se gare : son flanc gauche
   est à l'ombre, son flanc droit éclairé), dosseret = plaque dressée mince aux bouts ronds, posée sur l'arrière du plateau,
   deux contacts, voyant vert ---------- */
function charger(look: CelLook): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  // Cuvette : le dessus (y > 0) descend de 1,6 cm au centre d'une ellipse 15 × 10, en pente douce jusqu'au bord.
  const dish: Deform = (x, y, z) => {
    const r = Math.hypot(x / 15, (z - 1.5) / 10);
    return [x, y > 0 && r < 1 ? y - 1.6 * (1 - r * r) * Math.min(1, y / 2) : y, z];
  };
  P.push(part(place(superEll(20, 2, 15, 0.45, 0.6, 14, 40, dish), { t: [0, 2, 0] }), T.metal, { crease: false })); // plateau 0..4, bouts arrondis
  // Dosseret : 12,5 de demi-largeur (le plateau en fait encore 14,3 à z −13,3), 1,8 d'épaisseur, 2,6..10, pied noyé dans le plateau.
  P.push(part(place(superEll(12.5, 3.7, 1.8, 0.45, 0.6, 12, 32), { t: [0, 6.3, -11.5] }), T.metal)); // dosseret
  for (const x of [-6, 6]) P.push(part(place(superEll(1.6, 0.5, 1.6, 0.6, 1, 6, 12), { t: [x, 3.6, 4] }), T.door, { crease: false, noshadow: true })); // contacts
  P.push(part(place(superEll(1.8, 0.8, 0.6, 0.6, 0.6, 6, 12), { t: [0, 8, -9.6] }), T.leaf, { flat: true, noshadow: true, crease: false })); // voyant
  return P;
}

CEL_MODELS.lamp = lamp;
CEL_MODELS['arc-lamp'] = arcLamp;
CEL_MODELS['paper-lantern'] = paperLantern;
CEL_MODELS.basket = basket;
CEL_MODELS.bowl = bowl;
CEL_MODELS.kennel = kennel;
CEL_MODELS.charger = charger;
