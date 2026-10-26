import { FURNITURE_MODELS } from '../../furniture-models';
import type { CelLook } from '../looks';
import { lathe, leaf, normalize, part, place, superEll, tube, type CelPart, type Deform, type Mesh, type Vec3 } from '../mesh';
import type { Tone } from '../tone';
import { LANTERN_R } from './lights-pets';
import { CEL_MODELS, CEL_TRIMS } from './registry';

// Steampunk (G6, tâche 10) : les trois objets propres au style — globe terrestre sur pied, lunette sur trépied, automate — et les
// garnitures cellulo des meubles garnis (équivalent dessiné de STEAMPUNK_TRIM, furniture-models : cuir, clous, laiton, bagues de bois
// sombre), posées SUR le dessin 3D de chaque meuble (plus la conversion des pièces à boîtes : le cuir du bureau y était coplanaire
// au plateau, les rivets des accoudoirs noyés, le cerclage du dôme de l'arc perçait le dôme). Repère centré (origine au centre de la
// base, x à droite, y en haut, z vers le spectateur, cm). Couleurs : les clés de la palette du style (`look.tones`) ; les objets
// n'existent qu'en Steampunk (catalogue), mais se dessinent avec n'importe quelle palette (contrôles du modèle).
//
// Logique des angles : la lumière est fixe (haut-gauche), l'objet tourne dessous ; les volumes sont des tours (socles, fûts, tubes,
// chaudière), des sphères (globe, articulations) et des tubes (anneau du globe, jambes du trépied, bras). Rien de fin ne perce un
// volume : les continents et les lignes du globe épousent la sphère (rayon + 0,3), les engrenages de l'automate sont noyés dans sa
// chaudière jusqu'à la surface, les garnitures sont des bagues autour des fûts ou des demi-billes posées sur les faces.

const deg = (a: number): number => (a * Math.PI) / 180;
// Barreau rond entre deux points.
const rod = (a: Vec3, b: Vec3, r: number, col: Tone, o: Omit<CelPart, 'm' | 'col'> = {}): CelPart => part(tube([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], b], r, 10), col, { crease: false, ...o });
// Demi-bille posée sur une face : centre 0,3 cm hors de la surface au point `p`, aplatie dans la normale `n` (rivets, clous).
const stud = (p: Vec3, n: Vec3, col: Tone, r = 1): CelPart =>
  part(place(superEll(r - 0.35 * Math.abs(n[0]), r - 0.35 * Math.abs(n[1]), r - 0.35 * Math.abs(n[2]), 1, 1, 6, 8), { t: [p[0] + 0.3 * n[0], p[1] + 0.3 * n[1], p[2] + 0.3 * n[2]] }), col, { flat: true, noshadow: true, trim: true });
// Bague (tour) autour d'un fût vertical : rayon intérieur ri (noyé dans le fût), extérieur ro, de y0 à y1.
const ring = (ri: number, ro: number, y0: number, y1: number, col: Tone, o: Omit<CelPart, 'm' | 'col'> = {}): CelPart => {
  const e = Math.min(0.4, (y1 - y0) / 3);
  return part(lathe([[ri, y0], [ro, y0 + e], [ro, y1 - e], [ri, y1]], 24), col, { crease: false, trim: true, ...o });
};
// Boucle fermée (cercle de rayon r autour de `c`, dans le plan d'axe `axis`) pour un tube : prolongée d'un point de chaque côté de la
// jointure (le lissage voit de vrais voisins, les bouchons sont noyés dans le boudin).
function loop(c: Vec3, r: number, axis: 'x' | 'y' | 'z', n = 36): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n, u = r * Math.cos(a), v = r * Math.sin(a);
    pts.push(axis === 'y' ? [c[0] + u, c[1], c[2] + v] : axis === 'x' ? [c[0], c[1] + u, c[2] + v] : [c[0] + u, c[1] + v, c[2]]);
  }
  return [pts[n - 1]!, ...pts, pts[0]!, pts[1]!];
}

/* ---------- globe terrestre : socle à deux étages, fût tourné à renflement, collier de laiton, demi-méridien de laiton qui tient
   la sphère par ses pôles (axe penché de 23°, pôle Nord en haut à droite), sphère parchemin aux continents en relief léger, équateur
   et deux méridiens tracés, pivot au pôle Nord ---------- */
const GLOBE_R = 19, GLOBE_C: Vec3 = [0, 76, 0], GLOBE_TILT = deg(23), RING_R = 21.5;
// Continents du modèle à boîtes (latitude, longitude en degrés ; longitude 0 = face avant).
const CONTINENTS: [number, number][][] = [
  [[70, -10], [71, 28], [60, 40], [45, 38], [37, 12], [36, -8], [44, -9], [50, -4], [58, -6]], // Europe
  [[35, -6], [32, 32], [12, 43], [11, 51], [-2, 42], [-34, 26], [-35, 18], [-6, 10], [5, -8], [14, -17], [28, -13]], // Afrique
  [[72, 42], [76, 100], [70, 140], [62, 172], [46, 142], [34, 128], [21, 118], [9, 104], [8, 78], [24, 58], [40, 46]], // Asie
  [[70, -162], [73, -100], [62, -66], [46, -55], [30, -80], [26, -97], [17, -94], [8, -79], [20, -106], [33, -118], [49, -126], [60, -146]], // Amérique du Nord
  [[11, -74], [5, -51], [-7, -35], [-23, -42], [-40, -62], [-54, -69], [-40, -73], [-18, -71], [-4, -81]], // Amérique du Sud
  [[-12, 131], [-11, 142], [-25, 153], [-38, 147], [-34, 116], [-22, 114]], // Australie
  [[82, -42], [77, -19], [64, -40], [72, -56]], // Groenland
];
// Point de la sphère (repère du globe, axe y) à la latitude/longitude données (degrés), rayon r.
const sph = (lat: number, lon: number, r: number): Vec3 => [r * Math.cos(deg(lat)) * Math.sin(deg(lon)), r * Math.sin(deg(lat)), r * Math.cos(deg(lat)) * Math.cos(deg(lon))];
// Normales radiales (sphère centrée à l'origine) : exactes pour tout ce qui épouse la sphère.
const radial = (m: Mesh): Mesh => ({ v: m.v, n: m.v.map(normalize), t: m.t });
function globe(look: CelLook): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  P.push(part(lathe([[0, 0], [20.3, 0], [21.5, 1], [21.5, 2.8], [20.5, 3.6], [14, 3.6], [13, 3.9], [0, 3.9]], 36), T.woodDark, { creaseThr: 0.75 })); // socle bas 0..3,9
  P.push(part(lathe([[0, 3.8], [12.6, 3.8], [13.2, 4.4], [12.8, 6.6], [11.5, 7.2], [0, 7.2]], 32), T.wood, { creaseThr: 0.75 })); // étage 3,8..7,2
  P.push(part(lathe([[3.6, 7], [2.8, 10], [2.4, 19], [4.9, 23.5], [4.6, 26], [2.4, 29], [2.5, 46], [3.2, 49.2]], 16), T.wood, { crease: false })); // fût tourné
  P.push(part(lathe([[3.8, 49], [4.4, 50], [4.4, 52.6], [3.4, 53.4], [2, 53.6], [2, 55], [0, 55]], 16), T.metal, { crease: false })); // collier + embase de l'anneau
  // Sphère et ce qui l'épouse, dans le repère du globe (axe y), puis penchés de 23° et portés au centre.
  const tilt = { rz: -GLOBE_TILT, t: GLOBE_C };
  P.push(part(place(superEll(GLOBE_R, GLOBE_R, GLOBE_R, 1, 1, 24, 48), tilt), T.desk));
  for (const pts of CONTINENTS) {
    const cen: [number, number] = [pts.reduce((s, p) => s + p[1], 0) / pts.length, pts.reduce((s, p) => s + p[0], 0) / pts.length];
    const onSphere: Deform = (lon, y, lat) => sph(lat, lon, GLOBE_R + 0.3 + y);
    const m = leaf(pts.map(([lat, lon]): [number, number] => [lon, lat]), 0.5, onSphere, cen);
    P.push(part(place(radial(m), tilt), T.woodDark, { crease: false, noshadow: true }));
  }
  // Équateur et méridiens (0° et 90°) : cordons sombres qui épousent la sphère.
  const lines: Vec3[][] = [loop([0, 0, 0], GLOBE_R + 0.15, 'y', 48), loop([0, 0, 0], GLOBE_R + 0.15, 'x', 48), loop([0, 0, 0], GLOBE_R + 0.15, 'z', 48)];
  for (const l of lines) P.push(part(place(tube(l, 0.35, 6), tilt), T.door, { flat: true, noshadow: true, crease: false }));
  // Demi-méridien de laiton : du pôle Nord (92°) par le côté gauche jusque sous le pôle Sud (−113°), où il rejoint l'embase.
  const arc: Vec3[] = [];
  for (let phi = 92; phi >= -113; phi -= 5) arc.push([-RING_R * Math.cos(deg(phi)), RING_R * Math.sin(deg(phi)), 0]);
  P.push(part(place(tube(arc, 1.3, 10), tilt), T.metal, { crease: false }));
  // Pivots aux pôles et bouton du pôle Nord.
  P.push(part(place(lathe([[1.1, GLOBE_R - 0.6], [1.1, RING_R + 0.4]], 10), tilt), T.metal, { crease: false }));
  P.push(part(place(lathe([[1.1, -RING_R - 0.4], [1.1, -GLOBE_R + 0.6]], 10), tilt), T.metal, { crease: false }));
  P.push(part(place(place(superEll(1.9, 1.9, 1.9, 1, 1, 8, 12), { t: [0, RING_R, 0] }), tilt), T.metal, { crease: false }));
  return P;
}

/* ---------- lunette sur trépied : trois jambes de bois à sabots de laiton (une à droite, deux à gauche devant et derrière),
   entretoises, tête et berceau, tube incliné de 30° vers la droite (corps, pare-buée évasé, bouchon arrière, bagues de laiton,
   porte-oculaire coudé vers le haut, chercheur sur deux pattes), collier de laiton au berceau ---------- */
const TRI_R = 29.5, TRI_HEAD = 80, TUBE_C: Vec3 = [0, 98, 0], TUBE_TILT = Math.PI / 3; // rz −60° : l'axe local y devient (cos 30°, sin 30°, 0)
function telescope(look: CelLook): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  const at = (a: number, r: number, y: number): Vec3 => [r * Math.cos(deg(a)), y, -r * Math.sin(deg(a))];
  for (const a of [0, 120, 240]) {
    const foot = at(a, TRI_R, 0), top = at(a, 2.2, TRI_HEAD);
    const d = normalize([top[0] - foot[0], top[1] - foot[1], top[2] - foot[2]]);
    P.push(part(tube([foot, [(foot[0] + top[0]) / 2, (foot[1] + top[1]) / 2, (foot[2] + top[2]) / 2], top], 1.75, 10), T.wood, { crease: false }));
    P.push(part(tube([foot, [foot[0] + 2.5 * d[0], foot[1] + 2.5 * d[1], foot[2] + 2.5 * d[2]], [foot[0] + 5 * d[0], foot[1] + 5 * d[1], foot[2] + 5 * d[2]]], 2.2, 10), T.text, { crease: false })); // sabot
  }
  // Entretoises à mi-hauteur (y 30 : la jambe y passe au rayon 2,2 + 27,3 × 50/80).
  const rb = 2.2 + (TRI_R - 2.2) * (50 / 80);
  for (const [a, b] of [[0, 120], [120, 240], [240, 0]] as const) P.push(rod(at(a, rb, 30), at(b, rb, 30), 0.7, T.metal));
  P.push(part(lathe([[0, 78.5], [4.6, 78.5], [5.2, 79.5], [5.2, 85], [4.6, 85.6], [0, 85.6]], 20), T.woodDark, { creaseThr: 0.75 })); // tête
  P.push(part(place(superEll(3.3, 4.4, 3.3, 0.3, 0.3, 10, 20), { t: [0, 89.4, 0] }), T.metal)); // berceau 85..93,8
  // Tube dans son repère (axe y = l'axe optique, s de −27 à 27 ; porte-oculaire et chercheur vers −x = vers le haut-gauche une fois penché).
  const pose = { rz: -TUBE_TILT, t: TUBE_C };
  const tubeParts: [Mesh, Tone, Omit<CelPart, 'm' | 'col'>][] = [
    [lathe([[0, -25], [4.3, -25], [4.3, 17], [0, 17]], 24), T.metal, { crease: false }], // corps
    [lathe([[0, 17], [4.6, 17], [5.4, 17.8], [5.6, 19], [5.6, 26.6], [5.2, 27.2], [4.4, 27.2], [4.4, 26.4], [0, 26.4]], 24), T.metal, { creaseThr: 0.75 }], // pare-buée
    [lathe([[0, 26.2], [4.3, 26.2], [4.3, 26.5], [0, 26.5]], 20), T.door, { flat: true, noshadow: true, crease: false }], // objectif
    [lathe([[0, -27.4], [3, -27.4], [3.5, -26.8], [3.5, -25.4], [0, -25.4]], 16), T.woodDark, { crease: false }], // bouchon arrière
    [lathe([[4.3, -12], [4.8, -11.6], [4.8, -10.2], [4.3, -9.8]], 24), T.text, { crease: false }], // bagues
    [lathe([[4.3, 8], [4.8, 8.4], [4.8, 9.8], [4.3, 10.2]], 24), T.text, { crease: false }],
    [lathe([[4.3, -3], [5, -2.6], [5, 2.6], [4.3, 3]], 24), T.text, { crease: false }], // collier du berceau
    [tube([[-4, -21, 0], [-7, -21, 0], [-10, -21, 0]], 1.6, 10), T.woodDark, { crease: false }], // porte-oculaire
    [tube([[-9.5, -21, 0], [-11, -21, 0], [-12.5, -21, 0]], 1.15, 10), T.text, { crease: false }], // oculaire
    [tube([[-4, -5, 0], [-5.5, -5, 0], [-7, -5, 0]], 0.6, 6), T.metal, { crease: false, noshadow: true }], // pattes du chercheur
    [tube([[-4, 1, 0], [-5.5, 1, 0], [-7, 1, 0]], 0.6, 6), T.metal, { crease: false, noshadow: true }],
    [tube([[-7.5, -8, 0], [-7.5, -2, 0], [-7.5, 4, 0]], 1.4, 8), T.metal, { crease: false }], // chercheur
    [tube([[-7.5, 3, 0], [-7.5, 3.8, 0], [-7.5, 4.6, 0]], 1.6, 8), T.text, { crease: false }],
  ];
  for (const [m, col, o] of tubeParts) P.push(part(place(m, pose), col, o));
  return P;
}

/* ---------- automate : bottes, jambes articulées (genoux), bassin, chaudière cerclée de laiton riveté, cadran en façade (lunette de
   laiton, verre, aiguille), engrenages noyés dans les flancs, clé de remontage au dos, bras articulés (le droit tendu devant, le gauche
   le long du corps), cou, tête aux yeux ronds lumineux, grille de bouche, boulons d'oreilles, plaque de chapeau, antenne à ampoule ---------- */
// Engrenage (axe y, épaisseur th) : n dents entre les rayons r0 (creux) et r1 (dents) — un tour à 4n colonnes dont le rayon saute.
function gear(r0: number, r1: number, n: number, th: number): Mesh {
  const nv = 4 * n, step = (2 * Math.PI) / nv;
  return lathe([[0, -th / 2], [1, -th / 2], [1, th / 2], [0, th / 2]], nv, (x, y, z) => {
    const i = ((Math.round(Math.atan2(z, x) / step) % 4) + 4) % 4;
    const r = i === 1 || i === 2 ? r1 : r0;
    return [x * r, y, z * r];
  });
}
const BOILER_R = 13;
function automaton(look: CelLook): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  for (const sx of [-1, 1]) {
    P.push(part(place(superEll(6.5, 2.5, 10, 0.3, 0.3, 8, 20), { t: [sx * 8, 2.5, 0] }), T.woodDark)); // bottes 0..5
    P.push(part(place(lathe([[3, 0], [3.4, 17]], 14), { t: [sx * 8, 4.5, 0] }), T.metal, { crease: false })); // tibias 4,5..21,5
    P.push(part(place(superEll(3.9, 3.9, 3.9, 1, 1, 10, 14), { t: [sx * 8, 22, 0] }), T.desk, { crease: false })); // genoux
    P.push(part(place(lathe([[3.4, 0], [3.8, 14.5]], 14), { t: [sx * 8, 23, 0] }), T.metal, { crease: false })); // cuisses 23..37,5
  }
  P.push(part(place(superEll(13.5, 3, 7, 0.3, 0.3, 8, 24), { t: [0, 40, 0] }), T.woodDark)); // bassin 37..43
  // Chaudière et ses cerclages rivetés.
  P.push(part(lathe([[0, 43], [12, 43], [BOILER_R, 44], [BOILER_R, 78], [12, 79], [0, 79]], 40), T.metal, { creaseThr: 0.75 }));
  for (const [y0, y1] of [[43, 46.2], [75.8, 79]] as const) {
    P.push(part(lathe([[BOILER_R - 0.2, y0], [BOILER_R + 1, y0 + 0.4], [BOILER_R + 1, y1 - 0.4], [BOILER_R - 0.2, y1]], 40), T.desk, { crease: false }));
    for (let k = 0; k < 12; k++) {
      const a = (2 * Math.PI * k) / 12 + 0.26, n: Vec3 = [Math.cos(a), 0, Math.sin(a)];
      P.push({ ...stud([(BOILER_R + 1) * n[0], (y0 + y1) / 2, (BOILER_R + 1) * n[2]], n, T.text, 0.75), trim: false });
    }
  }
  // Cadran en façade : lunette de laiton enfoncée jusqu'à la surface courbe, verre, aiguille.
  const dial = { rx: Math.PI / 2, t: [0, 62, 0] as Vec3 };
  P.push(part(place(lathe([[5.4, 10.6], [7.2, 10.6], [7.6, 13.2], [7.2, 14.2], [5.4, 14.2]], 28), dial), T.text, { crease: false }));
  P.push(part(place(lathe([[0, 13.3], [5.5, 13.3], [5.5, 13.8], [0, 13.8]], 24), dial), T.shade, { flat: true, noshadow: true, crease: false }));
  P.push(part(place(superEll(0.45, 2.6, 0.3, 0.3, 0.3, 4, 8), { rz: -0.6, t: [1.3, 63.2, 14.05] }), T.door, { flat: true, noshadow: true, crease: false })); // aiguille
  // Engrenages des flancs (noyés dans la chaudière jusqu'à la surface, axe x) et leurs axes.
  P.push(part(place(gear(4.6, 6, 10, 3.2), { rz: Math.PI / 2, t: [13.2, 59, 0] }), T.desk, { creaseThr: 0.5 }));
  P.push(part(place(lathe([[1.6, -3.4], [1.6, 1.6]], 12), { rz: -Math.PI / 2, t: [14.2, 59, 0] }), T.metal, { crease: false })); // axe droit 10,8..15,8
  P.push(part(place(gear(3.4, 4.5, 8, 3.6), { rz: Math.PI / 2, t: [-12, 53, -4] }), T.desk, { creaseThr: 0.5 }));
  P.push(part(place(lathe([[1.4, -2.6], [1.4, 1.2]], 12), { rz: Math.PI / 2, t: [-13.4, 53, -4] }), T.metal, { crease: false })); // axe gauche −14,6..−10,8
  // Clé de remontage au dos : tige et anneau à deux lobes.
  P.push(rod([0, 62, -12.4], [0, 62, -17], 1.2, T.text));
  for (const sx of [-1, 1]) P.push(part(place(superEll(3.6, 3, 0.8, 0.45, 0.45, 8, 16), { t: [sx * 3.4, 62, -17.6] }), T.text, { crease: false }));
  P.push(part(place(superEll(1.5, 1.5, 1, 1, 1, 6, 10), { t: [0, 62, -17.6] }), T.text, { crease: false }));
  // Bras : épaules, bras, coudes, avant-bras, mains (le droit tendu devant, le gauche le long du corps).
  const arm = (sh: Vec3, el: Vec3, ha: Vec3): void => {
    P.push(part(place(superEll(4.5, 4.5, 4.5, 1, 1, 10, 16), { t: sh }), T.desk, { crease: false }));
    P.push(rod(sh, el, 2.6, T.metal));
    P.push(part(place(superEll(3, 3, 3, 1, 1, 8, 12), { t: el }), T.desk, { crease: false }));
    P.push(rod(el, ha, 2.3, T.metal));
    P.push(part(place(superEll(3.2, 3.2, 3.2, 1, 1, 8, 12), { t: ha }), T.woodDark, { crease: false }));
  };
  arm([-16, 74, 0], [-17.5, 58, 2], [-16.3, 43.5, 7.6]);
  arm([16, 74, 0], [17.5, 59, 3], [17.5, 63.5, 16.4]);
  // Cou, tête, yeux, bouche, oreilles, chapeau, antenne.
  P.push(part(lathe([[3.2, 78.6], [3.2, 82.6]], 12), T.woodDark, { crease: false }));
  P.push(part(place(superEll(11.5, 9, 9.5, 0.25, 0.25, 12, 28), { t: [0, 91, 0.5] }), T.metal)); // tête 82..100, façade à z 10
  for (const sx of [-1, 1]) {
    const eye = { rx: Math.PI / 2, t: [sx * 6, 93, 0] as Vec3 };
    P.push(part(place(lathe([[0, 9.7], [3.4, 9.7], [3.4, 10.6], [0, 10.6]], 16), eye), T.door, { crease: false, noshadow: true }));
    P.push(part(place(lathe([[0, 10.5], [2.4, 10.5], [2.4, 10.95], [0, 10.95]], 16), eye), T.shade, { flat: true, noshadow: true, crease: false }));
    P.push(part(place(lathe([[2.2, 0], [2.4, 0.4], [2.4, 2.2], [1.6, 2.6], [0, 2.6]], 6), { rz: -sx * (Math.PI / 2), t: [sx * 11.3, 91, 0.5] }), T.desk, { crease: false })); // boulon d'oreille
  }
  P.push(part(place(superEll(7, 1.2, 0.35, 0.2, 0.2, 4, 12), { t: [0, 87.2, 10.15] }), T.door, { flat: true, noshadow: true, crease: false })); // grille
  for (const x of [-3.5, 0, 3.5]) P.push(part(place(superEll(0.4, 1, 0.3, 0.3, 0.3, 4, 8), { t: [x, 87.2, 10.5] }), T.text, { flat: true, noshadow: true, crease: false }));
  P.push(part(place(superEll(9.5, 0.75, 7.5, 0.3, 0.3, 6, 20), { t: [0, 100.6, 0.5] }), T.desk)); // plaque de chapeau 99,85..101,35
  P.push(part(place(lathe([[0.8, 0], [0.8, 5.5], [0.5, 5.8]], 10), { t: [0, 101.2, 0.5] }), T.metal, { crease: false })); // antenne
  P.push(part(place(superEll(2, 2, 2, 1, 1, 8, 12), { t: [0, 108, 0.5] }), T.shade, { crease: false, noshadow: true })); // ampoule (sommet 110)
  return P;
}

CEL_MODELS.globe = globe;
CEL_MODELS.telescope = telescope;
CEL_MODELS.automaton = automaton;

/* ---------- garnitures cellulo des meubles garnis (STEAMPUNK_TRIM redessiné sur les volumes des tâches 5 à 9) ---------- */
// Bureau (storage.ts : plateau 72..75 de 60 × 30, ceinture 66..71 de 55,5 × 25,8, pieds griffes aux coins (±54, ±24)) : sous-main
// de cuir posé sur le plateau, clous de laiton sur la ceinture (de part et d'autre du tiroir), sabots de laiton aux pieds.
CEL_TRIMS.desk = (look) => {
  const T = look.tones;
  const P: CelPart[] = [];
  P.push(part(place(superEll(50, 0.3, 21, 0.3, 0.3, 4, 24), { t: [0, 75.2, 0] }), T.fabric, { trim: true })); // cuir 74,9..75,5
  for (const x of [-50, -40, -30, 30, 40, 50]) P.push(stud([x, 68.5, 25.8], [0, 0, 1], T.text, 0.9));
  for (const z of [-16, -8, 0, 8, 16]) for (const sx of [-1, 1]) P.push(stud([sx * 55.5, 68.5, z], [sx, 0, 0], T.text, 0.9));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(part(place(lathe([[0, 0], [3.9, 0], [3.9, 2.4], [3.5, 3], [0, 3]], 16), { t: [sx * 54, 0, sz * 24] }), T.text, { crease: false, trim: true }));
  return P;
};
// Fauteuil (seating.ts : assise 12..42 de 39 × 39, accoudoirs ±33 (faces à ±40, dessus 66), dossier à z −33 (dos à −40, crête 90),
// pieds griffes (±32, ±32)) : dessus d'accoudoirs coiffés de laiton, clous sur le devant de l'assise, les flancs et le dos, bandeau
// de laiton sur la crête du dossier, sabots de laiton aux pieds. (Les rivets de la variante restent ceux de seating.ts.)
CEL_TRIMS.armchair = (look) => {
  const T = look.tones;
  const P: CelPart[] = [];
  for (const sx of [-1, 1]) P.push(part(place(superEll(5.5, 0.6, 30, 0.3, 0.3, 4, 20), { t: [sx * 33, 66.2, 1] }), T.text, { trim: true, crease: false }));
  for (const x of [-30, -18, -6, 6, 18, 30]) P.push(stud([x, 84, -40], [0, 0, -1], T.text, 0.9)); // dos du dossier
  for (const sx of [-1, 1]) for (const z of [-24, -12, 0, 12, 24]) P.push(stud([sx * 40, 48, z], [sx, 0, 0], T.text, 0.9)); // flancs
  P.push(part(tube([[-36, 89.6, -33], [0, 89.6, -33], [36, 89.6, -33]], 1.1, 10), T.text, { crease: false, trim: true })); // bandeau
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(part(place(lathe([[0, 0], [4, 0], [4, 2.4], [3.6, 3], [0, 3]], 16), { t: [sx * 32, 0, sz * 32] }), T.text, { crease: false, trim: true }));
  return P;
};
// Lampadaire (lights-pets.ts : socle r 15,6 (0..7,6), tige r 1,4 → 1,15 de 7,2 à 126, abat-jour 124..157 r 17,6 → 11,3, cerclage
// 156,4..158,2) : trois pieds boule de laiton, bagues de bois sombre sur la tige, cerclage de laiton au bas de l'abat-jour, couvercle.
CEL_TRIMS.lamp = (look) => {
  const T = look.tones;
  const P: CelPart[] = [];
  for (const a of [90, 210, 330]) P.push(part(place(superEll(2.3, 2.3, 2.3, 1, 1, 8, 12), { t: [16.3 * Math.cos(deg(a)), 2.2, 16.3 * Math.sin(deg(a))] }), T.text, { crease: false, trim: true }));
  for (const y of [35, 70, 105]) P.push(ring(1.05, 2.3, y - 1.2, y + 1.2, T.woodDark));
  P.push(ring(17.2, 18.3, 123.3, 125.6, T.text, { noshadow: true }));
  P.push(part(lathe([[0, 157.7], [11.4, 157.7], [11.7, 158.3], [11.4, 158.8], [0, 158.8]], 36), T.text, { crease: false, noshadow: true, trim: true })); // couvercle
  return P;
};
// Lanterne (lights-pets.ts : socle r 13,5 (0..4,7), globe R(y) de 7 à 53, anneaux de bois) : cerclages de laiton qui épousent le
// globe (à 14 et 49,2), bague au socle, trois pieds boule.
CEL_TRIMS['paper-lantern'] = (look) => {
  const T = look.tones;
  const P: CelPart[] = [];
  for (const y of [14, 49.2]) P.push(part(tube(loop([0, y, 0], LANTERN_R(y) + 0.35, 'y', 40), 0.7, 8), T.text, { crease: false, noshadow: true, trim: true }));
  P.push(ring(12.2, 13.2, 4.4, 6, T.text));
  for (const a of [90, 210, 330]) P.push(part(place(superEll(2, 2, 2, 1, 1, 8, 12), { t: [13.3 * Math.cos(deg(a)), 1.6, 13.3 * Math.sin(deg(a))] }), T.text, { crease: false, trim: true }));
  return P;
};
// Lampadaire arc (lights-pets.ts : socle r 16 (0..7,2) à x = 66,5, fût r 2,2) : bandeau de laiton au socle, trois pieds boule, bagues
// de bois sombre sur le fût ; le cerclage du dôme est dessiné avec le dôme (arcLamp, incliné comme lui).
const ARC_BX = FURNITURE_MODELS['arc-lamp'].base!.x + FURNITURE_MODELS['arc-lamp'].base!.w / 2 - FURNITURE_MODELS['arc-lamp'].w / 2;
CEL_TRIMS['arc-lamp'] = (look) => {
  const T = look.tones;
  const P: CelPart[] = [];
  P.push(part(place(lathe([[14.4, 6.6], [15.7, 7], [15.7, 8], [14.6, 8.4]], 32), { t: [ARC_BX, 0, 0] }), T.text, { crease: false, trim: true }));
  for (const a of [90, 210, 330]) P.push(part(place(superEll(2.2, 2.2, 2.2, 1, 1, 8, 12), { t: [ARC_BX + 15.6 * Math.cos(deg(a)), 1.6, 15.6 * Math.sin(deg(a))] }), T.text, { crease: false, trim: true }));
  for (const y of [40, 80]) {
    const r = ring(1.9, 3.1, y - 1.3, y + 1.3, T.woodDark);
    P.push({ ...r, m: place(r.m, { t: [ARC_BX, 0, 0] }) });
  }
  return P;
};
