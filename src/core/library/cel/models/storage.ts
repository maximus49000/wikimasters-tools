import type { CelLook, CelVariant } from '../looks';
import { bent, lathe, part, place, superEll, tube, type CelPart, type Deform, type Mesh, type Vec3 } from '../mesh';
import type { Tone } from '../tone';
import { CEL_MODELS } from './registry';

// Rangements, tables et tapis (G6, tâche 7) : étagère, bureau, commode, guéridon (porté de la maquette `gueridon`, l. 297), table
// basse, tapis. Repère centré (origine au centre de la base, x à droite, y en haut, z vers le spectateur, cm). Couleurs : les clés
// de palette du modèle à boîtes (`look.tones`) ; les pieds du bureau et de la table basse suivent `look.variant.legs`, le tapis lit
// `look.variant.throw` (ourlet roulotté ou franges) et `look.variant.pattern` (bordure, losanges, rayures).
//
// Logique des angles : la lumière est fixe dans la pièce (haut-gauche) et le meuble tourne dessous ; en cellulo l'ombre propre ne
// naît que sur les surfaces qui tournent franchement vers la droite ou vers le bas. Les plaques (flancs, fonds, dessus) restent en
// aplat : le modelé vient des membres ronds (montants, pieds, fûts), des façades bombées (commode ventrue, tiroirs galbés), des
// dessous visibles au-dessus de l'œil (haut de l'étagère) et des ourlets. Aucun dos nu : fond d'étagère en panneau cintré entre
// ses montants et ses traverses, dos de la commode = le même galbe que sa façade, bureau à entretoises.
//
// Rien ne bouge ici (spec §6 : aucune réaction prévue pour ces meubles) ; `life` est ignoré.

// Pied tourné selon la variante du style : profil (r, y) de hauteur h, rayon de base r0.
function legProfile(legs: CelVariant['legs'], h: number, r0 = 2.6): [number, number][] {
  switch (legs) {
    case 'turned': return [[r0, 0], [r0, h * 0.2], [r0 * 0.72, h * 0.35], [r0 * 1.1, h * 0.55], [r0 * 0.77, h * 0.75], [r0 * 0.92, h]];
    case 'hairpin': return [[1, 0], [1, h]];
    case 'block': return [[r0 * 1.1, 0], [r0 * 1.1, h]];
    case 'claw': return [[r0 * 1.3, 0], [r0 * 0.85, h * 0.3], [r0 * 1.08, h * 0.7], [r0 * 0.92, h]];
    case 'straight': return [[r0, 0], [r0, h]];
    default: return [[r0, 0], [r0 * 0.78, h]];
  }
}
// Quatre pieds aux coins (±x, ±z), hauteur h, un peu évasés (`splay` rad : pieds dehors, haut rentré), sans trait d'arête.
function legs(look: CelLook, col: Tone, x: number, z: number, h: number, splay = 0, r0 = 2.6): CelPart[] {
  const out: CelPart[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(part(place(lathe(legProfile(look.variant.legs, h, r0), 12), { rz: sx * splay, rx: -sz * splay, t: [sx * x, 0, sz * z] }), col, { crease: false }));
  return out;
}
// Barreau rond entre deux points.
const rod = (a: Vec3, b: Vec3, r: number, col: Tone): CelPart => part(tube([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], b], r, 10), col, { crease: false });
// Bouton de tiroir : galette bombée plate (0,6 cm de saillie, pas de pommeau qui dépasse de profil), axe vers le spectateur, base
// noyée de 0,6 cm dans la façade à (x, y, z).
function knob(col: Tone, x: number, y: number, z: number): CelPart {
  const m = lathe([[0, -0.6], [1.7, -0.6], [2.1, 0], [1.6, 0.45], [0, 0.6]], 14);
  return part(place(m, { rx: Math.PI / 2, t: [x, y, z] }), col, { crease: false, noshadow: true });
}
// Plaque cintrée en plan : construite plate (orientation juste), puis déformée par `bent` (normales recalculées).
const bowed = (m: Mesh, d: Deform): Mesh => bent(m, d);

/* ---------- étagère : quatre montants ronds aux coins, flancs en panneau en retrait, socle en retrait sous la tablette basse,
   tablettes à arêtes adoucies, dessus en bourrelet, fond en lames bombées (à clin) cintré vers l'arrière ---------- */
const POST_R = 3.2, POST_X = 38.3, POST_Z = 11.8;
function shelf(look: CelLook): CelPart[] {
  const T = look.tones, W = T.wood, D = T.woodDark;
  const P: CelPart[] = [];
  // Montants : colonnes à léger renflement, du sol au dessous du dessus (177).
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(part(place(lathe([[2.9, 0], [POST_R, 50], [POST_R, 130], [2.9, 175]], 16), { t: [sx * POST_X, 0, sz * POST_Z] }), W, { crease: false }));
  // Flancs : panneaux en retrait entre les montants (silhouette encrée des montants devant eux).
  for (const sx of [-1, 1]) P.push(part(place(superEll(0.7, 84.5, POST_Z, 0.2, 0.2, 6, 16), { t: [sx * 36.6, 92.5, 0] }), W));
  // Socle en retrait (2 cm) et tablette basse qui le coiffe (dessus 8 = premier niveau des objets rangés).
  P.push(part(place(superEll(36, 3, 12.5, 0.3, 0.3, 6, 20), { t: [0, 3, 0] }), W)); // 0..6
  // Tablettes (58..61 et 118..121), chant en bourrelet (le dessous du chant prend l'ombre), visibles à travers l'ouverture.
  for (const y of [59.5, 119.5]) P.push(part(place(superEll(36, 1.5, 13.5, 0.7, 0.3, 8, 20), { t: [0, y, 1] }), W, { interior: true }));
  P.push(part(place(superEll(36.5, 1.2, 13.8, 0.7, 0.3, 8, 20), { t: [0, 6.8, 0.7] }), W)); // tablette basse 5,6..8
  // Dessus en bourrelet (177..180, dessus praticable 180) : au-dessus de l'œil, son dessous arrondi se lit en ombre à tous les angles.
  P.push(part(place(superEll(41, 1.5, 15, 0.8, 0.3, 10, 28), { t: [0, 178.5, 0] }), W));
  // Fond : panneau de 13 lames horizontales rectangulaires, bombées en hauteur des deux côtés (lentille de 2 cm au milieu : le bas de
  // chaque lame tourne vers le sol et prend l'ombre, de face comme de dos), l'ensemble cintré en plan (0,7 cm vers l'arrière au milieu).
  // Pas de traverses au dos : entre les montants, rien ne peut tenir dans les 2 cm du fond sans entrer dans l'ouverture ni dépasser. Le fond se lit en volume à travers l'ouverture et vu de dos, sans jamais être une plaque nue.
  const clap: Deform = (x, y, z) => [x, y, z - 0.7 * (1 - (x / 36) ** 2) + Math.sign(z) * 0.4 * (1 - (y / 6.5) ** 2)];
  for (let i = 0; i < 13; i++) P.push(part(place(bowed(superEll(36, 6.5, 0.6, 0.18, 0.18, 12, 24), clap), { t: [0, 14.5 + i * 13, -14] }), D, { interior: true }));
  return P;
}

/* ---------- bureau : plateau à bord adouci, ceinture avec un tiroir central à bouton, quatre pieds tournés (variante du style)
   et entretoises en H (le dos du bureau n'est pas un vide : une traverse ronde entre les pieds arrière) ---------- */
function desk(look: CelLook): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  P.push(...legs(look, T.leg, 54, 24, 66));
  P.push(part(place(superEll(60, 1.5, 30, 0.45, 0.3, 8, 28), { t: [0, 73.5, 0] }), T.desk)); // plateau 72..75
  P.push(part(place(superEll(53, 2.5, 25.5, 0.3, 0.3, 6, 24), { t: [0, 68.5, 0] }), T.wood)); // ceinture 66..71
  P.push(part(place(superEll(22, 2, 0.8, 0.5, 0.4, 6, 16), { t: [0, 68.5, 25.9] }), T.desk)); // façade du tiroir
  P.push(knob(T.metal, 0, 68.5, 26.6));
  P.push(rod([-54, 18, -24], [54, 18, -24], 1.5, T.leg)); // traverse arrière
  for (const sx of [-1, 1]) P.push(rod([sx * 54, 18, -24], [sx * 54, 18, 24], 1.5, T.leg)); // entretoises latérales
  return P;
}

/* ---------- commode ventrue : caisson au galbe horizontal (superellipse e2 0,6 : façade, flancs et dos bombés, jamais une plaque),
   trois tiroirs bombés affleurants qui épousent le galbe (plaques cintrées), deux boutons plats par tiroir, plateau galbé, pieds tournés ---------- */
const DR_A = 48, DR_C = 21, DR_E = 0.6;
// Profondeur de la façade du caisson à l'abscisse x (superellipse |x/a|^(2/e) + |z/c|^(2/e) = 1).
const dresserFront = (x: number): number => DR_C * Math.max(0, 1 - Math.abs(x / DR_A) ** (2 / DR_E)) ** (DR_E / 2);
function dresser(look: CelLook): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(part(place(lathe([[2.3, 0], [1.9, 8]], 12), { t: [sx * 43, 0, sz * 15.5] }), T.leg, { crease: false }));
  P.push(part(place(superEll(DR_A, 35, DR_C, 0.3, DR_E, 12, 72), { t: [0, 43, 0] }), T.wood)); // caisson 8..78 (72 colonnes : le galbe ne fait pas de facettes encrées entre les tiroirs)
  // Tiroirs : façades rectangulaires presque affleurantes (0,3 cm devant le caisson, toujours devant ses facettes : un joint encré,
  // pas d'oreilles de profil),
  // plaques minces cintrées sur le galbe de la façade ET bombées en hauteur (0,55 cm : le bas de chaque tiroir tourne vers le sol et
  // prend l'ombre, le haut vers la lumière).
  const follow: Deform = (x, y, z) => [x, y, z + dresserFront(x) + 0.3 + 0.55 * (1 - (y / 9.2) ** 2)];
  for (const y of [21.5, 43.5, 65.5]) {
    P.push(part(place(bowed(superEll(43, 9.2, 0.6, 0.25, 0.25, 14, 28), follow), { t: [0, y, 0] }), T.desk));
    for (const x of [-15, 15]) P.push(knob(T.metal, x, y, dresserFront(x) + 1.45));
  }
  P.push(part(place(superEll(50, 2, 22.5, 0.4, DR_E, 8, 72), { t: [0, 80, 0] }), T.woodDark)); // plateau 78..82
  return P;
}

/* ---------- guéridon (porté de la maquette l. 297 à l'échelle du modèle) : plateau rond à bord mouluré, fût tourné à collerette,
   moyeu, trépied en tubes (une branche vers le fond, deux vers l'avant comme le modèle) ---------- */
function sideTable(look: CelLook): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  P.push(part(lathe([[0, 56], [23.5, 56], [25, 57.6], [24.5, 59.2], [23, 60], [0, 60]], 36), T.desk)); // plateau 56..60
  P.push(part(lathe([[2.6, 8], [2.2, 30], [2.6, 53], [3.6, 56]], 14), T.wood, { crease: false })); // fût
  P.push(part(lathe([[0, 4.5], [3.6, 5], [4.6, 8], [4, 11], [0, 12]], 16), T.woodDark, { crease: false })); // moyeu
  for (const deg of [90, 210, 330]) {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = -Math.sin(a);
    P.push(part(tube([[0, 8.5, 0], [c * 9, 4.5, s * 9], [c * 18.4, 1.6, s * 18.4]], 1.6, 10), T.wood, { crease: false }));
  }
  return P;
}

/* ---------- table basse : plateau épais en galet, quatre pieds tournés évasés (variante du style), porte-revues à barreaux ronds ---------- */
function coffeeTable(look: CelLook): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  P.push(...legs(look, T.leg, 43, 20.5, 40, 0.05, 3.3));
  P.push(part(place(superEll(50, 3, 27.5, 0.8, 0.45, 12, 28), { t: [0, 42, 0] }), T.desk)); // plateau épais 39..45 en galet (chant rond)
  // Porte-revues : deux traverses rondes entre les pieds et trois barreaux ronds posés dessus (leur dessous prend l'ombre de face).
  for (const sx of [-1, 1]) P.push(rod([sx * 43, 10, -20.5], [sx * 43, 10, 20.5], 1.8, T.woodDark));
  for (const z of [-13, 0, 13]) P.push(rod([-43, 14, z], [43, 14, z], 2.6, T.woodDark));
  // Ceinture ronde sous le plateau (devant et derrière, entre les pieds) : son dessous prend l'ombre de face.
  for (const sz of [-1, 1]) P.push(rod([-43, 37.6, sz * 20.5], [43, 37.6, sz * 20.5], 2.5, T.leg));
  return P;
}

/* ---------- tapis : nappe plate à coins doux, bordure tissée (bande plate d'un autre ton, sans encre), ourlet roulotté tout autour
   (tube le long du bord) ou, selon la variante, franges aux deux petits côtés ; motif selon la variante ; jamais d'ombre portée ---------- */
const RUG_HW = 99, RUG_HD = 69, HEM_R = 1.4;
// Tour du tapis (coins arrondis de rayon 6), fermé, pour l'ourlet : la boucle est prolongée d'un point de chaque côté de la jointure
// (le lissage voit de vrais voisins, les bouchons du tube sont noyés dans le boudin : pas de bosse à la fermeture).
function rugLoop(hw: number, hd: number): Vec3[] {
  const r = 6, pts: Vec3[] = [];
  // Côtés droits échantillonnés tous les ~8 cm : le lissage (Catmull-Rom) ne déborde pas aux coins quand les points sont régulièrement espacés.
  const side = (a: Vec3, b: Vec3): void => {
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 8));
    for (let i = 0; i < n; i++) pts.push([a[0] + ((b[0] - a[0]) * i) / n, HEM_R, a[2] + ((b[2] - a[2]) * i) / n]);
  };
  const corner = (cx: number, cz: number, a0: number): void => {
    for (let i = 0; i <= 3; i++) {
      const a = a0 + (i / 3) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(a), HEM_R, cz + r * Math.sin(a)]);
    }
  };
  corner(hw - r, hd - r, 0);
  side([hw - r, HEM_R, hd], [-hw + r, HEM_R, hd]);
  corner(-hw + r, hd - r, Math.PI / 2);
  side([-hw, HEM_R, hd - r], [-hw, HEM_R, -hd + r]);
  corner(-hw + r, -hd + r, Math.PI);
  side([-hw + r, HEM_R, -hd], [hw - r, HEM_R, -hd]);
  corner(hw - r, -hd + r, 1.5 * Math.PI);
  side([hw, HEM_R, -hd + r], [hw, HEM_R, hd - r]);
  return [pts[pts.length - 1]!, ...pts, pts[0]!, pts[1]!];
}
function rug(look: CelLook): CelPart[] {
  const T = look.tones, F = T.rug, B = T.fabricDark;
  const fringed = look.variant.throw === 'fringed';
  const hw = fringed ? 97.5 : RUG_HW, hd = RUG_HD;
  const P: CelPart[] = [];
  P.push(part(place(superEll(hw, 0.6, hd, 0.3, 0.25, 6, 32), { t: [0, 0.6, 0] }), F, { noshadow: true })); // nappe 0..1,2
  // Bordure tissée : quatre bandes plates posées sur la nappe (0,35 cm au-dessus : pas de bataille de profondeur, pas d'encre), 5 cm de large à 8 cm du bord.
  const band = (a: number, c: number, x: number, z: number): CelPart => part(place(superEll(a, 0.3, c, 0.3, 0.2, 4, 12), { t: [x, 1.25, z] }), B, { flat: true, noshadow: true });
  const bx = hw - 8, bz = hd - 8;
  P.push(band(bx, 2.5, 0, bz), band(bx, 2.5, 0, -bz), band(2.5, bz, bx, 0), band(2.5, bz, -bx, 0));
  if (look.variant.pattern === 'diamonds') for (const x of [-45, -22.5, 0, 22.5, 45]) P.push(part(place(superEll(7, 0.3, 7, 1, 1, 4, 4), { ry: Math.PI / 4, t: [x, 1.25, 0] }), B, { flat: true, noshadow: true }));
  if (look.variant.pattern === 'stripes') for (const x of [-60, -30, 0, 30, 60]) P.push(band(3, bz - 10, x, 0));
  // Ourlet roulotté : un boudin le long du bord (sa face du dessous prend l'ombre : le tapis a une épaisseur lisible).
  if (fringed) {
    for (const sz of [-1, 1]) P.push(part(tube([[-hw + 4, HEM_R, sz * (hd - HEM_R)], [0, HEM_R, sz * (hd - HEM_R)], [hw - 4, HEM_R, sz * (hd - HEM_R)]], HEM_R, 10), F, { crease: false, noshadow: true }));
    // Franges couchées aux deux petits côtés : mèches effilées tous les 5 cm.
    for (const sx of [-1, 1]) for (let z = -hd + 4; z <= hd - 4; z += 5) P.push(part(place(lathe([[0.8, 0], [0.6, 2.5], [0.25, 4]], 6), { rz: -sx * (Math.PI / 2), t: [sx * (hw - 0.5), 0.85, z] }), F, { crease: false, noshadow: true }));
  } else P.push(part(tube(rugLoop(hw - HEM_R, hd - HEM_R), HEM_R, 10), F, { crease: false, noshadow: true }));
  return P;
}

CEL_MODELS.shelf = shelf;
CEL_MODELS.desk = desk;
CEL_MODELS.dresser = dresser;
CEL_MODELS['side-table'] = sideTable;
CEL_MODELS['coffee-table'] = coffeeTable;
CEL_MODELS.rug = rug;
