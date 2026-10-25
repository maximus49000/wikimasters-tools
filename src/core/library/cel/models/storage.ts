import type { CelLook, CelVariant } from '../looks';
import { bent, lathe, part, place, superEll, tube, type CelPart, type Deform, type Vec3 } from '../mesh';
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

/* ---------- étagère : quatre montants ronds aux coins (ils portent le dessus), flancs en panneau en retrait, socle en retrait sous la
   tablette basse, tablettes à chant rond, dessus en bourrelet, fond en panneau de bois à peine bombé (cintré par bent()) ---------- */
const POST_R = 3.4, POST_X = 38.5, POST_Z = 11.6;
function shelf(look: CelLook): CelPart[] {
  const T = look.tones, W = T.wood, D = T.woodDark;
  const P: CelPart[] = [];
  // Montants : colonnes à léger renflement, du sol jusque DANS le dessus (178,5 : ils le portent, pas de jour entre les deux).
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(part(place(lathe([[3, 0], [POST_R, 50], [POST_R, 130], [3, 178.5]], 16), { t: [sx * POST_X, 0, sz * POST_Z] }), W, { crease: false }));
  // Flancs : panneaux minces en retrait entre les montants (silhouette encrée des montants devant eux). Les bouts d'une plaque
  // superellipsoïde se resserrent sur le dernier centimètre : ils sont noyés dans la tablette basse (4..8) et dans le dessus (177..180).
  for (const sx of [-1, 1]) P.push(part(place(superEll(0.8, 86, POST_Z, 0.1, 0.2, 20, 16), { t: [sx * 36.4, 92.5, 0] }), W)); // e1 0,1 et 20 rangs : coins francs, pas de chanfrein aux bouts
  // Socle : en retrait de 2 cm devant, jusqu'au dos derrière (il reçoit le bas du panneau du fond) ; la tablette basse le coiffe
  // (dessus 8 = premier niveau des objets rangés) et couvre le bas des flancs.
  P.push(part(place(superEll(36, 3, 13.75, 0.3, 0.3, 6, 20), { t: [0, 3, -1.25] }), W)); // 0..6
  P.push(part(place(superEll(37.5, 1.5, 13.8, 0.3, 0.3, 8, 20), { t: [0, 6.5, 0.7] }), W)); // tablette basse 5..8
  // Tablettes (58..61 et 118..121, dessus = niveaux des objets rangés) à arêtes adoucies, avec un NEZ rond (boudin r 3 le long du
  // chant avant, d'un montant à l'autre, 1 cm sous le dessus : le dessus reste plan à 0,5 cm près jusqu'au nez) : la tablette se lit épaisse et son dessous de nez prend l'ombre à tous les angles de face.
  for (const y of [59.5, 119.5]) {
    P.push(part(place(superEll(36, 1.5, 13.5, 0.3, 0.3, 8, 20), { t: [0, y, 1] }), W, { interior: true }));
    P.push(part(tube([[-36, y - 1, 12], [0, y - 1, 12], [36, y - 1, 12]], 3, 14), W, { interior: true, crease: false }));
  }
  P.push(part(tube([[-36, 5.5, 12], [0, 5.5, 12], [36, 5.5, 12]], 3, 14), W, { crease: false })); // nez de la tablette basse (2,5..8,5)
  // Dessus en bourrelet (177..180, dessus praticable 180) : au-dessus de l'œil, son dessous arrondi se lit en ombre à tous les angles.
  P.push(part(place(superEll(41.5, 1.5, 15, 0.8, 0.3, 10, 28), { t: [0, 178.5, 0] }), W));
  // Fond : un panneau de bois (Ruling 23) en quatre planches jointives verticales : plaque mince à peine bombée vers l'arrière (0,7 cm
  // au milieu, cintrée par bent()), entre les montants arrière, du socle au dessus (bouts noyés dedans), et trois joints en V sur chaque
  // face (deux chanfreins de 2,2 cm à 40° par joint) : le chanfrein tourné vers la droite prend l'ombre, l'autre la lumière — c'est le
  // dessin des planches, et c'est de là que vient le modelé du fond, pas d'un bombé.
  const bowZ = (x: number): number => -0.7 * (1 - (x / 36) ** 2);
  P.push(part(place(bent(superEll(36, 86, 0.8, 0.1, 0.2, 20, 24), (x, y, z) => [x, y, z + bowZ(x)]), { t: [0, 92.5, -14] }), D, { interior: true })); // coins francs (e1 0,1, 20 rangs)
  const CH = (40 * Math.PI) / 180;
  for (const xg of [-18, 0, 18])
    for (const face of [1, -1])
      for (const side of [-1, 1]) {
        // Chanfrein : bande mince tournée de 40° autour de y, sa normale regarde vers le fond du joint.
        P.push(part(place(superEll(1.1, 84.5, 0.25, 0.2, 0.2, 6, 8), { ry: -side * face * CH, t: [xg + side * 0.85, 92.5, -14 + bowZ(xg) + face * 0.45] }), D, { interior: true, crease: false }));
      }
  return P;
}

/* ---------- bureau : plateau à bord adouci, ceinture aux coins (elle reçoit les pieds) avec un tiroir central à bouton, quatre pieds
   tournés (variante du style) qui montent jusque sous le plateau, entretoises en H (le dos : une traverse ronde entre les pieds arrière) ---------- */
function desk(look: CelLook): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  P.push(...legs(look, T.leg, 54, 24, 72.5)); // jusque dans le plateau
  P.push(part(place(superEll(60, 1.5, 30, 0.45, 0.3, 12, 32), { t: [0, 73.5, 0] }), T.desk)); // plateau 72..75
  P.push(part(place(superEll(55.5, 2.5, 25.8, 0.2, 0.15, 6, 32), { t: [0, 68.5, 0] }), T.wood)); // ceinture 66..71, aux coins jusqu'aux pieds
  P.push(part(place(superEll(22, 1.9, 0.8, 0.2, 0.15, 6, 24), { t: [0, 68.5, 26.2] }), T.desk)); // façade du tiroir (rectangle, 0,4 cm devant)
  P.push(knob(T.metal, 0, 68.5, 26.9));
  P.push(rod([-54, 18, -24], [54, 18, -24], 1.5, T.leg)); // traverse arrière
  for (const sx of [-1, 1]) P.push(rod([sx * 54, 18, -24], [sx * 54, 18, 24], 1.5, T.leg)); // entretoises latérales
  return P;
}

/* ---------- commode ventrue : caisson au galbe horizontal (superellipse e2 0,55 : façade, flancs et dos bombés), arêtes hautes et
   basses adoucies mais lisibles (e1 0,2), trois tiroirs bombés affleurants qui épousent le galbe dans les deux sens (plaques cintrées),
   deux boutons plats par tiroir, plateau galbé, dos en panneau (plaque cintrée sur le galbe du dos, encadrée), plinthe, pieds tournés
   sous l'emprise du caisson ---------- */
const DR_A = 48, DR_B = 35, DR_C = 21, DR_E1 = 0.2, DR_E = 0.55, DR_Y = 43;
// Profondeur de la façade du caisson au point (x, y) (y dans le repère du meuble) : section horizontale de la superellipsoïde à cette
// hauteur (demi-axes réduits par cos(eta)^e1), puis superellipse |x/a'|^(2/e2) + |z/c'|^(2/e2) = 1.
function dresserFront(x: number, y: number): number {
  const sy = Math.min(1, Math.abs((y - DR_Y) / DR_B) ** (1 / DR_E1));
  const k = Math.sqrt(Math.max(0, 1 - sy * sy)) ** DR_E1;
  return DR_C * k * Math.max(0, 1 - Math.abs(x / (DR_A * k)) ** (2 / DR_E)) ** (DR_E / 2);
}
function dresser(look: CelLook): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  // Pieds sous l'emprise du caisson (le galbe ne couvre pas les coins du modèle), montés jusque dans le caisson.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(part(place(lathe([[2.4, 0], [2, 11]], 12), { t: [sx * 38, 0, sz * 11] }), T.leg, { crease: false }));
  P.push(part(place(superEll(DR_A, DR_B, DR_C, DR_E1, DR_E, 16, 72), { t: [0, DR_Y, 0] }), T.wood)); // caisson 8..78 (72 colonnes : pas de facettes encrées)
  // Plinthe : bandeau sombre sous le caisson, en retrait de 2 cm, qui relie les pieds (un meuble, pas un sac posé sur des godets).
  P.push(part(place(superEll(42, 2.5, 16, 0.2, 0.5, 6, 48), { t: [0, 9.5, 0] }), T.woodDark)); // 7..12
  // Tiroirs : façades rectangulaires presque affleurantes (0,3 cm devant le caisson, devant ses facettes : un joint encré, pas
  // d'oreilles de profil), plaques minces cintrées sur le galbe de la façade dans les DEUX sens (elles suivent aussi l'arrondi haut
  // et bas du caisson) et bombées en hauteur (0,4 cm : le bas de chaque tiroir tourne vers le sol et prend l'ombre).
  for (const yc of [21.5, 43.5, 65.5]) {
    const follow: Deform = (x, y, z) => [x, y, z + dresserFront(x, yc + y) + 0.3 + 0.4 * (1 - (y / 9.2) ** 2)];
    P.push(part(place(bent(superEll(43, 9.2, 0.6, 0.2, 0.2, 14, 28), follow), { t: [0, yc, 0] }), T.desk));
    for (const x of [-15, 15]) P.push(knob(T.metal, x, yc, dresserFront(x, yc) + 1.3));
  }
  // Dos en panneau : plaque sombre cintrée sur le galbe du dos (0,3 cm derrière le caisson), encadrée par 3 cm de caisson tout autour.
  const back: Deform = (x, y, z) => [x, y, z - dresserFront(x, DR_Y + y) - 0.3];
  P.push(part(place(bent(superEll(44, 31, 0.6, 0.12, 0.2, 20, 28), back), { t: [0, DR_Y, 0] }), T.woodDark)); // coins francs
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
  P.push(band(bx, 2.5, 0, bz), band(bx, 2.5, 0, -bz), band(2.5, bz - 5.2, bx, 0), band(2.5, bz - 5.2, -bx, 0)); // les latérales s'arrêtent avant les autres (pas de chevauchement)
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
