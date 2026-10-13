// src/core/library/furniture-models.ts
// Dessin provisoire Opus — reprise Fable prévue.
import type { StandingKind } from './library-types';
import type { Leaf, Model, Piece, V3t } from './furniture-render3d';

// Modèles des meubles en cm (x largeur depuis la gauche vue de face, y hauteur depuis le sol, z profondeur depuis l'avant).
// Ils reprennent les dessins de face historiques : mêmes éléments, mêmes couleurs de palette.
type Extra = { tone?: number; layer?: number };
const box = (x: number, y: number, z: number, w: number, h: number, d: number, fill: Piece['fill']): Piece => ({ shape: 'box', x, y, z, w, h, d, fill });
const cyl = (cx: number, cz: number, y: number, r: number, h: number, fill: Piece['fill']): Piece => ({ shape: 'cyl', cx, cz, y, r, h, fill });
const ball = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, fill: Piece['fill'], extra: Extra = {}): Piece => ({ shape: 'ball', cx, cy, cz, rx, ry, rz, fill, ...extra });
const rod = (a: V3t, b: V3t, r: number, fill: Piece['fill'], extra: Extra = {}): Piece => ({ shape: 'rod', a, b, r, fill, ...extra });
const prism = (axis: 'x' | 'z', profile: [number, number][], from: number, to: number, fill: Piece['fill'], extra: Extra = {}): Piece => ({ shape: 'prism', axis, profile, from, to, fill, ...extra });
// Tube de la lunette : axe passant par (30, 98, 30), incliné de 30° vers la droite ; P(t) = point de l'axe à t cm du centre, décalé de n cm au-dessus.
const tubeAt = (t: number, n = 0): V3t => [30 + t * Math.cos(Math.PI / 6) - n * Math.sin(Math.PI / 6), 98 + t * Math.sin(Math.PI / 6) + n * Math.cos(Math.PI / 6), 30];
const TUBE: Piece[] = [
  rod(tubeAt(-25), tubeAt(17), 4.3, 'metal', { layer: 1 }),
  rod(tubeAt(17), tubeAt(27), 5.6, 'metal', { layer: 1 }),
  rod(tubeAt(-27), tubeAt(-25), 3.2, 'woodDark', { layer: 1 }),
  rod(tubeAt(-12), tubeAt(-10), 4.8, 'desk', { layer: 1 }), rod(tubeAt(8), tubeAt(10), 4.8, 'desk', { layer: 1 }),
  rod(tubeAt(-21, 4), tubeAt(-21, 10), 1.5, 'woodDark', { layer: 1 }),
  rod(tubeAt(-5, 4), tubeAt(-5, 7), 0.6, 'metal', { layer: 1 }), rod(tubeAt(1, 4), tubeAt(1, 7), 0.6, 'metal', { layer: 1 }),
  rod(tubeAt(-8, 7.5), tubeAt(4, 7.5), 1.4, 'metal', { layer: 1 }),
];

// Quatre pieds carrés aux coins d'une base w × d.
const legs = (w: number, d: number, h: number, size: number, inset: number, fill: Piece['fill']): Piece[] => [
  box(inset, 0, inset, size, h, size, fill), box(w - inset - size, 0, inset, size, h, size, fill),
  box(inset, 0, d - inset - size, size, h, size, fill), box(w - inset - size, 0, d - inset - size, size, h, size, fill),
];
// Profil d'une porte en arc : rectangle de largeur w posé en (x, y), haut de h, fermé par un demi-cercle.
const arch = (x: number, y: number, w: number, h: number): [number, number][] => [
  [x, y], [x + w, y],
  ...Array.from({ length: 9 }, (_, i): [number, number] => [x + w / 2 + (w / 2) * Math.cos((i * Math.PI) / 8), y + h - w / 2 + (w / 2) * Math.sin((i * Math.PI) / 8)]),
];
// Profil d'un engrenage de centre (u, y) : n dents entre les rayons r0 (creux) et r1 (dents).
const gear = (u: number, y: number, r0: number, r1: number, n: number): [number, number][] =>
  Array.from({ length: n * 4 }, (_, i): [number, number] => {
    const a = (i * Math.PI * 2) / (n * 4);
    const r = i % 4 === 1 || i % 4 === 2 ? r1 : r0;
    return [u + r * Math.cos(a), y + r * Math.sin(a)];
  });
// Couronne de n feuilles autour de (cx, cz), azimut de départ a0 (degrés) : point de contrôle et pointe à [rayon, hauteur], hauteur décalée de `lift`.
const crown = (cx: number, cz: number, y0: number, n: number, a0: number, ctrl: [number, number], tip: [number, number], w: number, fills: Piece['fill'][], lift: number[] = [0]): Leaf[] =>
  Array.from({ length: n }, (_, i) => {
    const a = ((a0 + (360 * i) / n) * Math.PI) / 180;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const dy = lift[i % lift.length]!;
    return { base: [cx + c * 1.5, y0, cz + s * 1.5], ctrl: [cx + c * ctrl[0], ctrl[1] + dy, cz + s * ctrl[0]], tip: [cx + c * tip[0], tip[1] + dy, cz + s * tip[0]], w, fill: fills[i % fills.length] };
  });
// Continents du globe en (latitude, longitude) degrés, longitude 0 = face avant du globe.
const CONTINENTS: [number, number][][] = [
  [[70, -10], [71, 28], [60, 40], [45, 38], [37, 12], [36, -8], [44, -9], [50, -4], [58, -6]], // Europe
  [[35, -6], [32, 32], [12, 43], [11, 51], [-2, 42], [-34, 26], [-35, 18], [-6, 10], [5, -8], [14, -17], [28, -13]], // Afrique
  [[72, 42], [76, 100], [70, 140], [62, 172], [46, 142], [34, 128], [21, 118], [9, 104], [8, 78], [24, 58], [40, 46]], // Asie
  [[70, -162], [73, -100], [62, -66], [46, -55], [30, -80], [26, -97], [17, -94], [8, -79], [20, -106], [33, -118], [49, -126], [60, -146]], // Amérique du Nord
  [[11, -74], [5, -51], [-7, -35], [-23, -42], [-40, -62], [-54, -69], [-40, -73], [-18, -71], [-4, -81]], // Amérique du Sud
  [[-12, 131], [-11, 142], [-25, 153], [-38, 147], [-34, 116], [-22, 114]], // Australie
  [[82, -42], [77, -19], [64, -40], [72, -56]], // Groenland
];

export const FURNITURE_MODELS: Record<StandingKind, Model> = {
  shelf: {
    w: 80, d: 30, h: 180,
    pieces: [
      box(3, 8, 28, 74, 169, 2, 'woodDark'),
      box(0, 0, 0, 3, 180, 30, 'wood'), box(77, 0, 0, 3, 180, 30, 'wood'),
      box(3, 0, 0, 74, 8, 30, 'wood'), box(3, 58, 0, 74, 3, 28, 'wood'), box(3, 118, 0, 74, 3, 28, 'wood'), box(0, 177, 0, 80, 3, 30, 'wood'),
    ],
    face: { x: 3, y: 8, w: 74, h: 169 },
  },
  desk: {
    w: 120, d: 60, h: 75,
    pieces: [...legs(120, 60, 72, 4, 4, 'leg'), box(0, 72, 0, 120, 3, 60, 'desk')],
    face: { x: 0, y: 72, w: 120, h: 3 },
  },
  chair: {
    w: 45, d: 50, h: 90,
    pieces: [
      ...legs(45, 50, 44, 3, 3, 'leg'),
      box(2, 44, 2, 41, 4, 44, 'desk'),
      box(3, 48, 44, 3, 42, 3, 'wood'), box(39, 48, 44, 3, 42, 3, 'wood'),
      box(3, 66, 44, 39, 6, 3, 'wood'), box(3, 80, 44, 39, 8, 3, 'wood'),
    ],
    pois: [{ type: 'seat', x: 22, y: 48, z: 24 }],
  },
  sofa: {
    w: 200, d: 90, h: 85,
    pieces: [
      ...legs(200, 90, 12, 6, 8, 'leg'),
      box(0, 12, 0, 200, 30, 90, 'fabric'),
      box(0, 42, 68, 200, 43, 22, 'fabric'),
      box(0, 42, 0, 22, 25, 68, 'fabricDark'), box(178, 42, 0, 22, 25, 68, 'fabricDark'),
      box(22, 42, 4, 52, 12, 62, 'fabricLight'), box(74, 42, 4, 52, 12, 62, 'fabricLight'), box(126, 42, 4, 52, 12, 62, 'fabricLight'),
    ],
    pois: [{ type: 'seat', x: 50, y: 54, z: 35 }, { type: 'seat', x: 100, y: 54, z: 35 }, { type: 'seat', x: 150, y: 54, z: 35 }, { type: 'sleep', x: 120, y: 54, z: 35 }],
  },
  armchair: {
    w: 80, d: 80, h: 90,
    pieces: [
      ...legs(80, 80, 12, 6, 6, 'leg'),
      box(0, 12, 0, 80, 30, 80, 'warm'),
      box(0, 42, 60, 80, 48, 20, 'warm'),
      box(0, 42, 0, 14, 24, 60, 'warmDark'), box(66, 42, 0, 14, 24, 60, 'warmDark'),
      box(14, 42, 4, 52, 12, 54, 'warmLight'),
    ],
    pois: [{ type: 'seat', x: 40, y: 54, z: 30 }],
  },
  'coffee-table': { w: 100, d: 55, h: 45, pieces: [...legs(100, 55, 41, 4, 5, 'leg'), box(0, 41, 0, 100, 4, 55, 'desk')] },
  lamp: {
    w: 40, d: 40, h: 160, round: true,
    // Lampadaire : socle rond lesté (disque + dôme), tige fine, abat-jour en tissu évasé vers le bas, embout.
    pieces: [
      cyl(20, 20, 0, 15, 2.5, 'metal'), { shape: 'cyl', cx: 20, cz: 20, y: 2.5, r: 15, r2: 6, h: 4, fill: 'metal' },
      cyl(20, 20, 6.5, 1.1, 118, 'metal'),
      { shape: 'cyl', cx: 20, cz: 20, y: 124, r: 17.5, r2: 11, h: 33, fill: 'shade' },
      cyl(20, 20, 157, 1.4, 3, 'metal'),
    ],
  },
  plant: {
    w: 45, d: 45, h: 110,
    // Pot en terre évasé avec son bord et son terreau ; touffe de feuilles lancéolées en trois couronnes (retombantes, arquées, dressées).
    pieces: [
      { shape: 'cyl', cx: 22.5, cz: 22.5, y: 0, r: 12, r2: 15.5, h: 31, fill: 'warm' },
      cyl(22.5, 22.5, 30, 17, 6, 'warmDark'),
      cyl(22.5, 22.5, 35, 14.5, 1.5, 'door'),
      {
        shape: 'foliage', fill: 'leaf', leaves: [
          ...crown(22.5, 22.5, 36.5, 5, 45, [14, 60], [21, 44], 8, ['leafDark', 'leaf'], [0, 3, 1, 4, 2]),
          ...crown(22.5, 22.5, 36.5, 6, 15, [10, 80], [19, 66], 9.5, ['leaf', 'leafDark'], [0, 5, 2, 6, 1, 4]),
          ...crown(22.5, 22.5, 36.5, 5, 0, [5, 86], [11, 104], 8.5, ['leaf', 'leafDark', 'leaf'], [0, 4, -3, 2, 5]),
        ],
      },
    ],
  },
  rug: { w: 200, d: 140, h: 1, pieces: [box(0, 0, 0, 200, 1, 140, 'rug')] },
  basket: {
    w: 60, d: 45, h: 25,
    // Panier ouvert : fond, quatre parois de 3 cm, coussin visible à l'intérieur.
    pieces: [
      box(0, 0, 0, 60, 3, 45, 'warm'),
      box(0, 3, 0, 60, 22, 3, 'warm'), box(0, 3, 42, 60, 22, 3, 'warm'),
      box(0, 3, 3, 3, 22, 39, 'warm'), box(57, 3, 3, 3, 22, 39, 'warm'),
      box(3, 3, 3, 54, 8, 39, 'fabricLight'),
    ],
    pois: [{ type: 'curl', x: 30, y: 11, z: 22 }],
  },
  // Gamelle : socle, bord en anneau (quatre parois), croquettes en retrait sous le bord.
  bowl: {
    w: 20, d: 20, h: 8,
    pieces: [cyl(10, 10, 0, 10, 3, 'metal'), box(0, 3, 0, 20, 5, 2, 'metal'), box(0, 3, 18, 20, 5, 2, 'metal'), box(0, 3, 2, 2, 5, 16, 'metal'), box(18, 3, 2, 2, 5, 16, 'metal'), cyl(10, 10, 5, 8, 1, 'warm')],
    pois: [{ type: 'eat', x: 10, y: 0, z: 10 }],
  },
  kennel: {
    w: 70, d: 90, h: 75,
    // Niche à pignon : socle, corps en bois (profil de maison), porte en arc sombre et son encadrement, planches marquées,
    // plaque au-dessus de la porte, toit à deux pans qui déborde de 6 cm sur les côtés, devant et derrière.
    pieces: [
      box(3, 0, 3, 64, 3, 84, 'woodDark'),
      prism('z', [[6, 3], [64, 3], [64, 47.8], [35, 71], [6, 47.8]], 6, 86, 'wood'),
      prism('z', arch(21.5, 3, 27, 39), 5.75, 6, 'woodDark'),
      prism('z', arch(24, 3, 22, 35), 5.6, 5.75, 'door', { tone: 0.55 }),
      ...[17, 31].flatMap((y) => [
        box(5.6, y, 6, 0.4, 0.8, 80, 'woodDark'), box(64, y, 6, 0.4, 0.8, 80, 'woodDark'), box(6, y, 86, 58, 0.8, 0.4, 'woodDark'),
        box(6, y, 5.6, 15.5, 0.8, 0.4, 'woodDark'), box(48.5, y, 5.6, 15.5, 0.8, 0.4, 'woodDark'),
      ]),
      box(29, 45, 5.5, 12, 4, 0.5, 'desk'),
      prism('z', [[0, 43], [35, 71], [35, 75], [0, 47]], 0, 90, 'door', { layer: 1 }),
      prism('z', [[35, 71], [70, 43], [70, 47], [35, 75]], 0, 90, 'door', { layer: 1 }),
    ],
    pois: [{ type: 'enter', x: 35, y: 0, z: 2 }, { type: 'sleep', x: 35, y: 3, z: 50 }],
  },
  charger: {
    w: 40, d: 30, h: 10,
    pieces: [box(0, 0, 0, 40, 4, 30, 'metal'), box(0, 4, 24, 40, 6, 6, 'metal'), box(18, 6, 23, 4, 2, 1, 'leaf')],
    pois: [{ type: 'charge', x: 20, y: 4, z: 12 }],
  },
  globe: {
    w: 50, d: 50, h: 100,
    // Globe terrestre sur pied : socle rond à deux étages, fût tourné, demi-méridien en laiton qui tient la sphère inclinée de 23°
    // (pôle Sud au bas de l'arc, pôle Nord en haut à droite), continents, équateur et méridiens tracés.
    pieces: [
      cyl(25, 25, 0, 19, 3, 'woodDark'), cyl(25, 25, 3, 13, 3, 'wood'),
      cyl(25, 25, 6, 2.6, 44, 'wood'), ball(25, 24, 25, 5, 4.5, 5, 'wood'), cyl(25, 25, 49, 4, 4, 'metal'),
      {
        shape: 'ball', cx: 25, cy: 76, cz: 25, rx: 19, ry: 19, rz: 19, fill: 'fabric', tilt: 23,
        marks: CONTINENTS.map((pts) => ({ fill: 'leaf' as const, pts })),
        lines: [{ lat: 0 }, { lon: 0 }, { lon: 90 }], lineFill: 'edge',
        rings: [{ lon: -90, from: -113, to: 92, r: 21.5, w: 3, fill: 'metal' }],
      },
      ball(33.4, 95.8, 25, 1.8, 1.8, 1.8, 'metal', { layer: 1 }),
    ],
  },
  telescope: {
    w: 60, d: 60, h: 130,
    // Lunette sur trépied : trois pieds de bois inclinés depuis une tête ronde, entretoises, berceau, tube incliné de 30° (bagues, pare-buée plus large
    // côté objectif, bouchon arrière, porte-oculaire coudé), petit chercheur fixé au-dessus. Le tube passe après le trépied (couche 1).
    pieces: [
      ...[90, 210, 330].map((deg) => {
        const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
        return rod([30 + 2 * c, 80, 30 + 2 * s], [30 + 26 * c, 0.6, 30 + 26 * s], 1.8, 'wood'); // bout du pied relevé de 0,6 cm : la coupe inclinée reste au-dessus du sol
      }),
      ...[[90, 210], [210, 330], [330, 90]].map(([d1, d2]) => {
        const at = (deg: number): V3t => [30 + 17 * Math.cos((deg * Math.PI) / 180), 30, 30 + 17 * Math.sin((deg * Math.PI) / 180)];
        return rod(at(d1!), at(d2!), 0.7, 'metal');
      }),
      cyl(30, 30, 80, 4.5, 5, 'woodDark'), box(27, 85, 27, 6, 8, 6, 'metal'),
      ...TUBE,
    ],
  },
  automaton: {
    w: 45, d: 40, h: 110,
    // Automate Steampunk : pieds, jambes articulées, bassin, chaudière cerclée (cadran en façade, engrenages sur les flancs, clé de remontage au dos),
    // bras articulés (le droit tendu vers l'avant), tête aux yeux ronds lumineux, grille de bouche, boulons d'oreilles et antenne à ampoule.
    pieces: [
      box(8, 0, 10, 13, 5, 20, 'woodDark'), box(24, 0, 10, 13, 5, 20, 'woodDark'),
      ...[14.5, 30.5].flatMap((x) => [rod([x, 5, 20], [x, 21, 20], 3.2, 'metal'), ball(x, 22, 20, 3.8, 3.8, 3.8, 'desk'), rod([x, 23, 20], [x, 37, 20], 3.6, 'metal')]),
      box(9, 37, 13, 27, 6, 14, 'woodDark'),
      // Cercle du bas avant la chaudière (à hauteur égale, l'ordre de la liste départage) : la chaudière recouvre son dessus.
      cyl(22.5, 20, 43, 14, 3, 'desk'), cyl(22.5, 20, 43, 13, 36, 'metal'), cyl(22.5, 20, 76, 14, 3, 'desk'),
      rod([22.5, 62, 7.6], [22.5, 62, 6], 7, 'desk'), rod([22.5, 62, 6], [22.5, 62, 5.4], 5.6, 'shade'), rod([22.5, 62, 5.2], [25.5, 65, 5.2], 0.5, 'door'),
      prism('x', gear(20, 59, 4.6, 6, 10), 35.3, 36.8, 'desk'), rod([36.8, 59, 20], [37.8, 59, 20], 1.8, 'metal'),
      prism('x', gear(24, 53, 3.4, 4.5, 8), 9.7, 8.2, 'desk'),
      rod([22.5, 62, 33], [22.5, 62, 37], 1.2, 'metal'),
      prism('z', [[15, 58], [20, 60.5], [25, 60.5], [30, 58], [30, 66], [25, 63.5], [20, 63.5], [15, 66]], 37, 38.5, 'desk'),
      ball(6.5, 74, 20, 4.5, 4.5, 4.5, 'desk'), rod([6.5, 74, 20], [5, 59, 18], 2.6, 'metal'), ball(5, 58, 18, 3, 3, 3, 'desk'), rod([5, 58, 18], [6, 45, 13], 2.3, 'metal'), ball(6.2, 43, 12, 3.2, 3.2, 3.2, 'woodDark'),
      ball(38.5, 74, 20, 4.5, 4.5, 4.5, 'desk'), rod([38.5, 74, 20], [40, 60, 17], 2.6, 'metal'), ball(40, 59, 17, 3, 3, 3, 'desk'), rod([40, 59, 17], [40, 63, 6], 2.3, 'metal'), ball(40, 63.5, 3.6, 3.2, 3.2, 3.2, 'woodDark'),
      rod([22.5, 79, 20], [22.5, 82, 20], 3.2, 'woodDark'),
      box(11, 82, 10, 23, 18, 19, 'metal'), box(13, 100, 12, 19, 1.5, 15, 'desk'),
      ...[16.5, 28.5].flatMap((x) => [rod([x, 93, 10], [x, 93, 9.5], 3.4, 'door'), rod([x, 93, 9.5], [x, 93, 9.1], 2.4, 'shade')]),
      box(15.5, 86, 9.6, 14, 2.4, 0.4, 'door'),
      rod([11, 91, 19.5], [8.5, 91, 19.5], 2.4, 'desk'), rod([34, 91, 19.5], [36.5, 91, 19.5], 2.4, 'desk'),
      rod([22.5, 101.5, 19.5], [22.5, 106.5, 19.5], 0.8, 'metal'), ball(22.5, 108, 19.5, 2, 2, 2, 'shade'),
    ],
  },
};

// Rivet ou clou de tapissier : petit disque posé sur une face avant (z = 0 côté spectateur), saillie de 0,4 cm vers l'arrière de z.
const stud = (x: number, y: number, z: number, r = 1.3, fill: Piece['fill'] = 'shade'): Piece => rod([x, y, z + 0.4], [x, y, z], r, fill);

// Garnitures ajoutées dans une pièce Steampunk : laiton (`metal`, `text` = laiton poli), rivets et clous clairs (`shade`), bois sombre.
export const STEAMPUNK_TRIM: Partial<Record<StandingKind, Piece[]>> = {
  // Bureau : sous-main en cuir encadré par le plateau, ceinture en bois sombre rivetée, entretoises et pieds boule en laiton.
  desk: [
    // Le cuir est logé DANS le plateau (72 à 75), dessus à fleur : il ne passe après le plateau que grâce à la tolérance EPS
    // de l'ordre du peintre (paintOrder, furniture-render3d : « b.bottom >= a.top − EPS », 74,6 ≥ 75 − 0,5). Changer EPS ou
    // l'épaisseur du cuir peut le faire disparaître sous le plateau.
    box(6, 74.6, 6, 108, 0.4, 48, 'fabric'),
    box(8, 62, 4, 104, 10, 1, 'woodDark'), box(4, 62, 8, 1, 10, 44, 'woodDark'), box(115, 62, 8, 1, 10, 44, 'woodDark'),
    ...[14, 37, 60, 83, 106].map((x) => stud(x, 67, 3.6)),
    ...[[6, 6], [114, 6], [6, 54], [114, 54]].flatMap(([x, z]) => [ball(x!, 3, z!, 3.4, 3, 3.4, 'metal'), cyl(x!, z!, 6, 2.9, 2, 'text')]),
    rod([8, 16, 6], [112, 16, 6], 1.1, 'metal'), rod([6, 16, 8], [6, 16, 52], 1.1, 'metal'), rod([114, 16, 8], [114, 16, 52], 1.1, 'metal'),
  ],
  // Fauteuil : accoudoirs coiffés de laiton, clous de tapissier sur l'assise et les accoudoirs, bandeau laiton en haut du dossier, pieds boule en laiton.
  armchair: [
    box(0, 66, 0, 14, 1, 60, 'metal'), box(66, 66, 0, 14, 1, 60, 'metal'),
    ...[18, 27, 36, 45, 54, 63].map((x) => stud(x, 38, 0)),
    ...[46, 54, 62].flatMap((y) => [stud(7, y, 0), stud(73, y, 0)]),
    box(0, 85, 59.5, 80, 3, 0.5, 'metal'),
    // Dos et flancs aussi : rangée de clous au dos du dossier, trois clous sur chaque flanc d'accoudoir (lisible de dos et de profil).
    ...[10, 22, 34, 46, 58, 70].map((x) => rod([x, 84, 79.6], [x, 84, 80], 1.3, 'shade')),
    ...[15, 30, 45].flatMap((z) => [rod([0.4, 56, z], [0, 56, z], 1.3, 'shade'), rod([79.6, 56, z], [80, 56, z], 1.3, 'shade')]),
    ...[[9, 9], [71, 9], [9, 71], [71, 71]].map(([x, z]) => ball(x!, 3, z!, 4, 3, 4, 'metal')),
  ],
  // Lampadaire : trois pieds boule autour du socle, bagues de bois sombre sur la tige, cerclage et couvercle en laiton poli sur l'abat-jour.
  lamp: [
    ...[90, 210, 330].map((deg) => ball(20 + 16 * Math.cos((deg * Math.PI) / 180), 2, 20 + 16 * Math.sin((deg * Math.PI) / 180), 2.5, 2, 2.5, 'text')),
    ...[35, 70, 105].map((y) => cyl(20, 20, y, 2.4, 2.5, 'woodDark')),
    cyl(20, 20, 121.5, 18, 2.5, 'text'), cyl(20, 20, 157, 11.5, 1.2, 'text'), ball(20, 159, 20, 1.6, 1, 1.6, 'text', { layer: 1 }),
  ],
};
