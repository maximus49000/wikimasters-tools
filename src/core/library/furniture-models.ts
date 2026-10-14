// src/core/library/furniture-models.ts
// Dessin provisoire Opus — reprise Fable prévue.
import type { StandingKind } from './library-types';
import type { Leaf, Model, Piece, V3t } from './furniture-render3d';

// Modèles des meubles en cm (x largeur depuis la gauche vue de face, y hauteur depuis le sol, z profondeur depuis l'avant).
// Ils reprennent les dessins de face historiques : mêmes éléments, mêmes couleurs de palette.
type Extra = { tone?: number; layer?: number; color?: string };
const box = (x: number, y: number, z: number, w: number, h: number, d: number, fill: Piece['fill'], extra: Extra = {}): Piece => ({ shape: 'box', x, y, z, w, h, d, fill, ...extra });
const cyl = (cx: number, cz: number, y: number, r: number, h: number, fill: Piece['fill'], extra: Extra = {}): Piece => ({ shape: 'cyl', cx, cz, y, r, h, fill, ...extra });
// Tronc de cône : rayon `r` en bas, `r2` en haut.
const cone = (cx: number, cz: number, y: number, r: number, r2: number, h: number, fill: Piece['fill'], extra: Extra = {}): Piece => ({ shape: 'cyl', cx, cz, y, r, r2, h, fill, ...extra });
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
// Patin de rocking chair : arc de 95 cm (le long de z), 4 cm d'épaisseur, posé au sol en son milieu, relevé de 5 cm aux bouts.
const rocker = (x0: number, x1: number): Piece => {
  const zs = Array.from({ length: 9 }, (_, i) => (i * 95) / 8);
  const low = (z: number): number => 5 * ((z - 47.5) / 47.5) ** 2;
  return prism('x', [...zs.map((z): [number, number] => [z, low(z)]), ...[...zs].reverse().map((z): [number, number] => [z, low(z) + 4])], x0, x1, 'woodDark');
};
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
export const crown = (cx: number, cz: number, y0: number, n: number, a0: number, ctrl: [number, number], tip: [number, number], w: number, fills: Piece['fill'][], lift: number[] = [0]): Leaf[] =>
  Array.from({ length: n }, (_, i) => {
    const a = ((a0 + (360 * i) / n) * Math.PI) / 180;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const dy = lift[i % lift.length]!;
    return { base: [cx + c * 1.5, y0, cz + s * 1.5], ctrl: [cx + c * ctrl[0], ctrl[1] + dy, cz + s * ctrl[0]], tip: [cx + c * tip[0], tip[1] + dy, cz + s * tip[0]], w, fill: fills[i % fills.length] };
  });
// Point d'une courbe de Bézier quadratique (a → c → b) en t ∈ [0, 1].
const qAt = (a: V3t, c: V3t, b: V3t, t: number): V3t => [0, 1, 2].map((k) => (1 - t) ** 2 * a[k]! + 2 * (1 - t) * t * c[k]! + t * t * b[k]!) as V3t;
// Feuille sur sa tige : départ à `r0` cm du centre (cx, cz) et à `h0` cm du sol dans l'azimut `az` (degrés ; 270 = vers l'avant),
// longueur `L` relevée de `elev` degrés, largeur `w` ; la tige part de `from`.
function stemLeaf(cx: number, cz: number, from: V3t, [az, h0, r0, L, elev, w]: [number, number, number, number, number, number], form: Leaf['form'], fill: Piece['fill']): { stem: Piece; leaf: Leaf } {
  const [a, e] = [(az * Math.PI) / 180, (elev * Math.PI) / 180];
  const [dx, dz] = [Math.cos(a), Math.sin(a)];
  const base: V3t = [cx + dx * r0, h0, cz + dz * r0];
  const tip: V3t = [base[0] + dx * L * Math.cos(e), h0 + L * Math.sin(e), base[2] + dz * L * Math.cos(e)];
  const ctrl: V3t = [base[0] + dx * L * 0.5 * Math.cos(e), h0 + L * 0.5 * Math.sin(e) + L * 0.15, base[2] + dz * L * 0.5 * Math.cos(e)];
  return { stem: rod(from, base, 0.9, 'leafDark'), leaf: { base, ctrl, tip, w, fill, form } };
}
// Plante en feuilles sur tiges : les tiges, puis le feuillage.
const stemmed = (cx: number, cz: number, from: V3t, specs: [number, number, number, number, number, number][], form: Leaf['form'], fills: Piece['fill'][]): Piece[] => {
  const all = specs.map((s, i) => stemLeaf(cx, cz, from, s, form, fills[i % fills.length]!));
  return [...all.map((x) => x.stem), { shape: 'foliage', fill: 'leaf', leaves: all.map((x) => x.leaf) }];
};
// Palme : 7 paires de folioles fines le long d'une nervure courbe (a → c → b), plus courtes vers la pointe, retombantes.
function frond(a: V3t, c: V3t, b: V3t): Leaf[] {
  const out: Leaf[] = [];
  for (let i = 0; i < 7; i++) {
    const t = 0.16 + i * 0.13;
    const p = qAt(a, c, b, t);
    const tan = [0, 1, 2].map((k) => 2 * (1 - t) * (c[k]! - a[k]!) + 2 * t * (b[k]! - c[k]!));
    const tl = Math.hypot(tan[0]!, tan[1]!, tan[2]!) || 1;
    const T = tan.map((v) => v / tl);
    const hl = Math.hypot(T[0]!, T[2]!) || 1;
    const N = [-T[2]! / hl, 0, T[0]! / hl];
    const len = 16 * (1 - 0.5 * t) + 3;
    for (const side of [-1, 1]) {
      const d = [side * N[0]! * 0.75 + T[0]! * 0.35, T[1]! * 0.35 - 0.4, side * N[2]! * 0.75 + T[2]! * 0.35];
      const tip: V3t = [p[0] + d[0]! * len, p[1] + d[1]! * len, p[2] + d[2]! * len];
      out.push({ base: p, ctrl: [(p[0] + tip[0]) / 2, (p[1] + tip[1]) / 2 + len * 0.12, (p[2] + tip[2]) / 2], tip, w: 2.4, fill: (i + (side > 0 ? 1 : 0)) % 2 ? 'leaf' : 'leafDark' });
    }
  }
  return out;
}
// Palmier : sommets des trois cannes, et ses palmes [canne, azimut, portée, montée de la pointe, montée du contrôle].
const PALM_CANES: V3t[] = [[46, 140, 48], [54, 150, 52], [50, 128, 50]];
const PALM_FRONDS: [number, number, number, number, number][] = [[0, 180, 32, -15, 40], [0, 240, 30, -5, 42], [1, 0, 32, -10, 38], [1, 60, 30, 0, 40], [1, 120, 28, -20, 36], [2, 300, 30, -25, 30], [2, 90, 24, 30, 40], [1, 270, 10, 32, 30]];
// Plumets du pampas : bout de chaque tige, relatif au col du vase (21, 60, 15).
const PAMPAS_ENDS: V3t[] = [[-8, 32, 0], [-6, 24, -4], [0, 33, 0], [7, 24, 4], [9, 30, -3]].map(([x, y, z]) => [21 + x!, 60 + y!, 15 + z!] as V3t);

// Arc du lampadaire arc : Bézier cubique du haut de la tige droite jusqu'au crochet du dôme.
const ARC: V3t[] = [[149, 118, 16], [149, 219, 16], [40, 219, 16], [19, 176, 16]];
const arcAt = (t: number): V3t => [0, 1, 2].map((k) => (1 - t) ** 3 * ARC[0]![k]! + 3 * (1 - t) ** 2 * t * ARC[1]![k]! + 3 * (1 - t) * t * t * ARC[2]![k]! + t ** 3 * ARC[3]![k]!) as V3t;

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
    perch: { x: 0, z: 0, w: 80, d: 30, y: 180 },
  },
  desk: {
    w: 120, d: 60, h: 75,
    pieces: [...legs(120, 60, 72, 4, 4, 'leg'), box(0, 72, 0, 120, 3, 60, 'desk')],
    face: { x: 0, y: 72, w: 120, h: 3 },
    perch: { x: 0, z: 0, w: 120, d: 60, y: 75 },
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
    perch: { x: 2, z: 2, w: 41, d: 44, y: 48 },
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
    pois: [{ type: 'seat', x: 50, y: 54, z: 35 }, { type: 'seat', x: 100, y: 54, z: 35 }, { type: 'seat', x: 150, y: 54, z: 35 }, { type: 'sleep', x: 120, y: 54, z: 35 }, { type: 'hide', x: 60, y: 0, z: 10 }],
    // Coussins de l'assise ; cachette du chat : au sol, sous l'avant de l'assise (derrière les pieds avant).
    perch: { x: 22, z: 4, w: 156, d: 62, y: 54 },
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
    perch: { x: 14, z: 4, w: 52, d: 54, y: 54 },
  },
  'coffee-table': { w: 100, d: 55, h: 45, pieces: [...legs(100, 55, 41, 4, 5, 'leg'), box(0, 41, 0, 100, 4, 55, 'desk')], perch: { x: 0, z: 0, w: 100, d: 55, y: 45 } },
  lamp: {
    w: 40, d: 40, h: 160, round: true, glow: [20, 140, 20],
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

  // Mobilier divers (lot A). Dessin provisoire Opus — Fable n'est pas passé (gel jusqu'au 2026-10-17), reprise Fable prévue.
  // Rocking chair : patins courbes, pieds tournés, assise et coussin, dossier incliné à barreaux, accoudoirs.
  'rocking-chair': {
    w: 65, d: 95, h: 104,
    pieces: [
      rocker(3, 9), rocker(56, 62),
      rod([6, 5, 22], [6, 42, 22], 1.8, 'wood'), rod([59, 5, 22], [59, 42, 22], 1.8, 'wood'),
      rod([6, 5, 72], [6, 42, 72], 1.8, 'wood'), rod([59, 5, 72], [59, 42, 72], 1.8, 'wood'),
      box(1, 40, 15, 63, 5, 62, 'wood'),
      box(6, 45, 18, 53, 7, 56, 'fabric'),
      rod([12, 45, 74], [12, 100, 90], 2.2, 'wood'), rod([53, 45, 74], [53, 100, 90], 2.2, 'wood'),
      ...[19, 25.5, 32, 38.5, 45].map((x) => rod([x, 49, 76], [x, 96, 89], 1.1, 'woodDark')),
      rod([9, 99, 90], [56, 99, 90], 2.5, 'wood'),
      rod([3.5, 45, 22], [3, 64, 22], 1.6, 'wood'), rod([61.5, 45, 22], [62, 64, 22], 1.6, 'wood'),
      rod([3, 64, 20], [3, 66, 76], 2, 'woodDark', { layer: 1 }), rod([62, 64, 20], [62, 66, 76], 2, 'woodDark', { layer: 1 }),
    ],
    pois: [{ type: 'seat', x: 32.5, y: 52, z: 45 }],
    perch: { x: 6, z: 18, w: 53, d: 50, y: 52 },
  },
  // Chauffeuse : canapé une place, accoudoirs pleins arrondis, coussins d'assise et de dos.
  'club-chair': {
    w: 90, d: 85, h: 80,
    pieces: [
      ...legs(90, 85, 8, 5, 6, 'leg'),
      box(0, 8, 0, 90, 30, 85, 'fabric'),
      box(8, 38, 62, 74, 42, 23, 'fabricDark'),
      box(17, 38, 4, 56, 11, 56, 'fabricLight'),
      box(17, 49, 50, 56, 28, 12, 'fabric'),
      box(0, 8, 0, 17, 46, 85, 'fabric'), box(73, 8, 0, 17, 46, 85, 'fabric'),
      rod([8.5, 54, 4], [8.5, 54, 85], 8.5, 'fabric'), rod([81.5, 54, 4], [81.5, 54, 85], 8.5, 'fabric'),
    ],
    pois: [{ type: 'seat', x: 45, y: 49, z: 30 }],
    perch: { x: 17, z: 4, w: 56, d: 46, y: 49 },
  },
  // Canapé deux places : deux coussins d'assise et deux de dos ; cachette du chat au sol, sous l'avant de l'assise.
  loveseat: {
    w: 150, d: 88, h: 82,
    pieces: [
      ...legs(150, 88, 8, 5, 7, 'leg'),
      box(0, 8, 0, 150, 30, 88, 'warm'),
      box(8, 38, 64, 134, 44, 24, 'warmDark'),
      box(17, 38, 4, 57.5, 11, 58, 'warmLight'), box(75.5, 38, 4, 57.5, 11, 58, 'warmLight'),
      box(17, 49, 54, 57.5, 29, 10, 'warm'), box(75.5, 49, 54, 57.5, 29, 10, 'warm'),
      box(0, 8, 0, 17, 46, 88, 'warm'), box(133, 8, 0, 17, 46, 88, 'warm'),
      rod([8.5, 54, 4], [8.5, 54, 88], 8.5, 'warm'), rod([141.5, 54, 4], [141.5, 54, 88], 8.5, 'warm'),
    ],
    pois: [{ type: 'seat', x: 46, y: 49, z: 30 }, { type: 'seat', x: 104, y: 49, z: 30 }, { type: 'sleep', x: 75, y: 49, z: 30 }, { type: 'hide', x: 40, y: 0, z: 10 }],
    perch: { x: 17, z: 4, w: 116, d: 50, y: 49 },
  },
  // Méridienne : haut accoudoir à volute à gauche, dossier qui descend vers la droite, long coussin, petit coussin rond.
  daybed: {
    w: 165, d: 70, h: 85,
    pieces: [
      ...legs(165, 70, 8, 5, 6, 'leg'),
      box(0, 8, 0, 165, 30, 70, 'warm'),
      prism('z', [[24, 38], [110, 38], [110, 46], [70, 62], [24, 74]], 56, 70, 'warmDark'),
      box(24, 38, 4, 139, 11, 52, 'warmLight'),
      box(0, 8, 0, 24, 62, 70, 'warm'),
      rod([12, 70, 2], [12, 70, 68], 12, 'warmLight'),
      ball(36, 57, 48, 6, 8, 7, 'fabric'),
    ],
    pois: [{ type: 'seat', x: 60, y: 49, z: 28 }, { type: 'sleep', x: 110, y: 49, z: 28 }],
    perch: { x: 24, z: 4, w: 139, d: 52, y: 49 },
  },
  // Fauteuil œuf suspendu : socle rond, pied en arc terminé par un crochet, chaîne, œuf en rotin ouvert vers l'avant, coussins.
  'egg-chair': {
    w: 100, d: 100, h: 195, round: true,
    pieces: [
      cyl(45, 50, 0, 30, 4, 'metal'),
      ...Array.from({ length: 10 }, (_, i) => {
        const q = (t: number): V3t => [(1 - t) ** 2 * 72 + 2 * (1 - t) * t * 98 + t * t * 72, (1 - t) ** 2 * 4 + 2 * (1 - t) * t * 95 + t * t * 186, 50];
        return rod(q(i / 10), q((i + 1) / 10), 1.8, 'metal');
      }),
      ...Array.from({ length: 4 }, (_, i) => {
        const q = (t: number): V3t => [(1 - t) ** 2 * 72 + 2 * (1 - t) * t * 60 + t * t * 46, (1 - t) ** 2 * 186 + 2 * (1 - t) * t * 196 + t * t * 190, 50];
        return rod(q(i / 4), q((i + 1) / 4), 1.8, 'metal');
      }),
      rod([46, 190, 50], [45, 151, 50], 0.5, 'metal'),
      ball(45, 96, 50, 32, 55, 32, 'wood'),
      ball(45, 92, 32, 25, 42, 14, 'woodDark', { tone: 0.8, layer: 1 }),
      ball(45, 62, 36, 21, 8, 14, 'fabricLight', { layer: 2 }),
      ball(45, 92, 40, 19, 22, 6, 'fabric', { layer: 2 }),
    ],
    pois: [{ type: 'seat', x: 45, y: 70, z: 36 }],
    perch: { x: 30, z: 26, w: 30, d: 20, y: 70 },
  },
  // Fauteuil paon : dossier en éventail tressé, pied en sablier, coussin rond.
  'peacock-chair': {
    w: 90, d: 65, h: 140,
    pieces: [
      cone(45, 30, 0, 22, 10, 20, 'woodDark'), cone(45, 30, 20, 10, 24, 20, 'woodDark'),
      cyl(45, 30, 40, 27, 6, 'wood'),
      cyl(45, 30, 46, 24, 4, 'fabric'),
      prism('z', [[24, 40], [66, 40], [80, 55], [87, 80], [85, 105], [75, 125], [60, 137], [45, 140], [30, 137], [15, 125], [5, 105], [3, 80], [10, 55]], 50, 56, 'wood'),
      ...[-60, -40, -20, 0, 20, 40, 60].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return rod([45, 44, 49.6], [45 + Math.sin(a) * 36, 44 + Math.cos(a) * 88, 49.6], 0.6, 'woodDark', { layer: 1 });
      }),
    ],
    pois: [{ type: 'seat', x: 45, y: 50, z: 28 }],
    perch: { x: 25, z: 10, w: 40, d: 38, y: 50 },
  },
  // Pouf tricoté : boule de grosse maille un peu écrasée ; côtes de tricot (méridiens) qui se rejoignent au centre du dessus.
  pouf: {
    w: 55, d: 55, h: 40, round: true,
    pieces: [
      {
        shape: 'ball', cx: 27.5, cy: 20, cz: 27.5, rx: 27.5, ry: 20, rz: 27.5, fill: 'warm', lineFill: 'warmDark',
        lines: Array.from({ length: 24 }, (_, i) => ({ lon: i * 15 })),
      },
    ],
    pois: [{ type: 'seat', x: 27.5, y: 40, z: 27.5 }],
    perch: { x: 8, z: 8, w: 39, d: 39, y: 40 },
  },
  // Pouf poire côtelé (maquette validée) : goutte molle affaissée ; devant, le corps bas dont le bord haut fait le pli du creux d'assise,
  // derrière, le dos relevé dont les coutures montent au sommet ; velours à côtes (méridiens).
  beanbag: {
    w: 80, d: 80, h: 70, round: true,
    pieces: [
      {
        shape: 'lathe', cx: 40, cz: 40, fill: 'fabricLight', lineFill: 'fabricDark', ribs: 40,
        profile: [[30, 0], [37, 3], [40, 12], [39.5, 24], [36, 36], [29, 48], [19, 59], [9, 66.5], [0, 70]],
        lines: [{ lon: -150 }, { lon: -30 }, { lon: -90 }, { lon: 90 }],
        folds: [{ y: 44, dip: 7, span: 62 }],
      },
    ],
    pois: [{ type: 'sleep', x: 40, y: 40, z: 22 }],
    perch: { x: 24, z: 12, w: 32, d: 26, y: 40 },
  },
  // Banc à coussin : deux pieds pleins, tablette basse, assise et coussin ; on passe dessous.
  bench: {
    w: 120, d: 40, h: 48,
    pieces: [
      box(3, 0, 4, 6, 36, 32, 'wood'), box(111, 0, 4, 6, 36, 32, 'wood'),
      box(9, 10, 8, 102, 3, 24, 'woodDark'),
      box(0, 36, 0, 120, 6, 40, 'wood'),
      box(4, 42, 3, 112, 6, 34, 'fabric'),
    ],
    pois: [{ type: 'seat', x: 35, y: 48, z: 20 }, { type: 'seat', x: 85, y: 48, z: 20 }],
    perch: { x: 4, z: 3, w: 112, d: 34, y: 48 },
  },
  // Commode basse : pieds fuselés, caisson, trois tiroirs à deux boutons, plateau qui couvre tout.
  dresser: {
    w: 100, d: 45, h: 82,
    pieces: [
      ...[[7, 7], [93, 7], [7, 38], [93, 38]].map(([x, z]) => rod([x!, 0, z!], [x!, 8, z!], 2, 'leg')),
      box(2, 8, 1.6, 96, 70, 42.4, 'wood'),
      ...[12, 34, 56].flatMap((y) => [box(6, y, 0.6, 88, 19, 1, 'desk'), rod([35, y + 9.5, 0.6], [35, y + 9.5, 0], 2.2, 'metal'), rod([65, y + 9.5, 0.6], [65, y + 9.5, 0], 2.2, 'metal')]),
      box(0, 78, 0, 100, 4, 45, 'woodDark'),
    ],
    perch: { x: 0, z: 0, w: 100, d: 45, y: 82 },
  },
  // Guéridon : plateau rond, fût, trépied ; on passe dessous.
  'side-table': {
    w: 50, d: 50, h: 60, round: true,
    pieces: [
      ...[90, 210, 330].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return rod([25, 8, 25], [25 + 19 * Math.cos(a), 1.5, 25 + 19 * Math.sin(a)], 1.5, 'wood');
      }),
      ball(25, 9, 25, 4, 3, 4, 'woodDark'),
      cyl(25, 25, 8, 2, 48, 'wood'),
      cyl(25, 25, 56, 25, 4, 'desk'),
    ],
    perch: { x: 7, z: 7, w: 36, d: 36, y: 60 },
  },
  // Arbre à chat : socle moquette, deux poteaux en sisal, niche ronde, plateforme à 1 m, panier en haut, balle pendue.
  // Lot A : seul le panier du haut est un perchoir (plateformes basses et niche au lot D).
  'cat-tree': {
    w: 62, d: 50, h: 150,
    pieces: [
      box(0, 0, 0, 62, 6, 50, 'rug'),
      cyl(12, 25, 6, 4, 89, 'warmLight', { color: '#D8BE86' }),
      box(28, 6, 8, 32, 34, 34, 'fabric'),
      rod([44, 22, 8], [44, 22, 7.4], 8.5, 'door', { tone: 0.6 }),
      box(26, 40, 6, 36, 4, 38, 'fabricDark'),
      cyl(42, 25, 44, 4, 99, 'warmLight', { color: '#D8BE86' }),
      box(0, 95, 6, 36, 5, 38, 'fabricDark'),
      rod([4, 95, 25], [4, 79, 25], 0.3, 'edge'),
      ball(4, 76.5, 25, 3, 3, 3, 'warm', { color: '#E0664A' }),
      cyl(42, 25, 143, 19, 7, 'fabric'),
    ],
    perch: { x: 27, z: 10, w: 30, d: 30, y: 150 },
  },
  // Monstera : pot évasé, six grandes feuilles en cœur découpées sur leurs tiges.
  monstera: {
    w: 85, d: 70, h: 120,
    pieces: [
      cone(42.5, 35, 0, 12, 16, 32, 'warm'), cyl(42.5, 35, 31, 17, 5, 'warmDark'), cyl(42.5, 35, 35.5, 14.5, 1.5, 'door'),
      ...stemmed(42.5, 35, [42.5, 37, 35], [
        [180, 64, 14, 19, 10, 18], [0, 66, 14, 19, 8, 18], [215, 82, 12, 28, 30, 25], [325, 85, 12, 28, 32, 25], [270, 74, 8, 18, 25, 18], [90, 88, 6, 24, 50, 23],
      ], 'heart', ['leaf', 'leafDark']),
    ],
  },
  // Oiseau de paradis : pot droit, grandes feuilles en palette dressées, une fleur orange et bleue.
  strelitzia: {
    w: 60, d: 60, h: 170,
    pieces: [
      cyl(30, 30, 0, 13, 32, 'warmLight'), cyl(30, 30, 30, 15, 5, 'warm'),
      ...stemmed(30, 30, [30, 35, 30], [
        [180, 88, 6, 40, 66, 11], [0, 90, 6, 40, 64, 11], [200, 105, 4, 58, 76, 13], [340, 110, 4, 54, 78, 13], [270, 98, 4, 58, 74, 14], [90, 96, 4, 52, 72, 13],
      ], 'paddle', ['leaf', 'leafDark']),
      rod([32, 35, 32], [36, 126, 28], 1, 'leafDark'),
      rod([36, 126, 28], [52, 131, 28], 1.6, 'leafDark'),
      rod([42, 129, 28], [48, 143, 27], 1.4, 'warm', { color: '#F08A24' }),
      rod([46, 130, 28], [55, 140, 28], 1.2, 'warm', { color: '#F2A63A' }),
      rod([48, 131, 28], [53, 136, 28], 0.9, 'fabric', { color: '#3E6FD8' }),
    ],
  },
  // Palmier areca : panier tressé, trois cannes, huit palmes arquées en folioles.
  palm: {
    w: 100, d: 100, h: 190,
    pieces: [
      cone(50, 50, 0, 15, 17, 34, 'woodDark'), cyl(50, 50, 32, 18, 4, 'wood'),
      ...PALM_CANES.map((top) => rod([50, 36, 50], top, 1.4, 'leafDark')),
      {
        shape: 'foliage', fill: 'leaf', leaves: PALM_FRONDS.flatMap(([cane, az, reach, rise, ctrlRise]) => {
          const base = PALM_CANES[cane]!;
          const a = (az * Math.PI) / 180;
          const [dx, dz] = [Math.cos(a), Math.sin(a)];
          return frond(base, [base[0] + dx * reach * 0.45, base[1] + ctrlRise, base[2] + dz * reach * 0.45], [base[0] + dx * reach, base[1] + rise, base[2] + dz * reach]);
        }),
      },
    ],
  },
  // Cactus cierge : pot en terre, colonne et deux bras coudés arrondis, fleur rose au sommet.
  cactus: {
    w: 35, d: 35, h: 132, round: true,
    pieces: [
      cone(17.5, 17.5, 0, 10, 13, 20, 'warm'), cyl(17.5, 17.5, 19, 14, 4, 'warmDark'),
      rod([14, 60, 17.5], [6.5, 62, 17.5], 3.5, 'leaf'), cyl(6.5, 17.5, 62, 3.5, 26, 'leaf'), ball(6.5, 88, 17.5, 3.5, 3.5, 3.5, 'leaf'),
      rod([21, 74, 17.5], [28.5, 76, 17.5], 3.5, 'leaf'), cyl(28.5, 17.5, 76, 3.5, 22, 'leaf'), ball(28.5, 98, 17.5, 3.5, 3.5, 3.5, 'leaf'),
      cyl(17.5, 17.5, 23, 5.5, 100, 'leaf'), ball(17.5, 123, 17.5, 5.5, 5.5, 5.5, 'leaf'),
      ball(17.5, 129.5, 17.5, 3.5, 2, 3.5, 'leaf', { color: '#EF6F9C', layer: 1 }),
    ],
  },
  // Grand vase et pampas : vase haut en céramique, cinq tiges, plumets crème.
  pampas: {
    w: 42, d: 30, h: 122,
    pieces: [
      cone(21, 15, 0, 9, 12, 30, 'warmLight'), cone(21, 15, 30, 12, 5, 24, 'warmLight'), cyl(21, 15, 54, 5, 8, 'warmLight'),
      ...PAMPAS_ENDS.map((e) => rod([21, 60, 15], e, 0.5, 'warm', { color: '#B8A47A' })),
      {
        shape: 'foliage', fill: 'shade', leaves: PAMPAS_ENDS.map((e): Leaf => {
          const d = [e[0] - 21, e[1] - 60, e[2] - 15];
          const n = Math.hypot(d[0]!, d[1]!, d[2]!);
          const tip: V3t = [e[0] + (d[0]! / n) * 24, e[1] + (d[1]! / n) * 24, e[2] + (d[2]! / n) * 24];
          return { base: e, ctrl: [(e[0] + tip[0]) / 2, (e[1] + tip[1]) / 2, (e[2] + tip[2]) / 2], tip, w: 8, fill: 'shade' };
        }),
      },
    ],
  },
  // Pouf carré côtelé (maquette validée) : cube mou aux arêtes arrondies et flancs bombés (profil extrudé d'avant en arrière),
  // côtes verticales en façade.
  'square-pouf': {
    w: 55, d: 55, h: 40,
    pieces: [
      prism('z', [[3, 0], [52, 0], [54, 4], [55, 14], [55, 26], [54, 34], [52, 38], [45, 39.6], [27.5, 40], [10, 39.6], [3, 38], [1, 34], [0, 26], [0, 14], [1, 4]], 0.4, 55, 'fabricLight'),
      ...Array.from({ length: 10 }, (_, i) => box(5 + i * 5, 3, 0, 1, 32, 0.4, 'fabricLight', { tone: 0.9 })),
    ],
    pois: [{ type: 'seat', x: 27.5, y: 40, z: 27.5 }],
    perch: { x: 5, z: 5, w: 45, d: 45, y: 40 },
  },
  // Lanterne en papier : socle bas, globe de papier à nervures, chapeau ; tout le globe s'allume.
  'paper-lantern': {
    w: 45, d: 45, h: 61, round: true, glow: [22.5, 32, 22.5],
    pieces: [
      cyl(22.5, 22.5, 0, 13.5, 5, 'woodDark'),
      { shape: 'ball', cx: 22.5, cy: 32, cz: 22.5, rx: 22.5, ry: 27, rz: 22.5, fill: 'shade', lines: [{ lat: -45 }, { lat: -22 }, { lat: 0 }, { lat: 22 }, { lat: 45 }], lineFill: 'edge' },
      cyl(22.5, 22.5, 57, 6.5, 4, 'woodDark'),
    ],
  },
  // Lampadaire arc : socle de marbre rond (seul au sol), tige droite puis grand arc, dôme métal ouvert vers le bas, ampoule.
  'arc-lamp': {
    w: 165, d: 32, h: 205, glow: [19, 156, 16],
    base: { x: 133, z: 0, w: 32, d: 32, round: true },
    pieces: [
      cyl(149, 16, 0, 16, 7, 'desk', { color: '#E7E2D8' }),
      cyl(149, 16, 7, 3, 4, 'metal'),
      rod([149, 11, 16], [149, 118, 16], 1.2, 'metal'),
      ...Array.from({ length: 12 }, (_, i) => rod(arcAt(i / 12), arcAt((i + 1) / 12), 1.2, 'metal')),
      cone(19, 16, 152, 16, 5, 22, 'metal'),
      cyl(19, 16, 151.5, 15, 0.5, 'shade'),
      ball(19, 150, 16, 4, 3, 4, 'shade'),
      cyl(19, 16, 174, 2, 2, 'metal'),
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
  // Lanterne : cerclages de laiton, bague au socle, trois pieds boule.
  'paper-lantern': [
    cyl(22.5, 22.5, 14, 17.5, 1.2, 'text'), cyl(22.5, 22.5, 49.2, 17.5, 1.2, 'text'), cyl(22.5, 22.5, 4, 14, 1, 'text'),
    ...[90, 210, 330].map((deg) => ball(22.5 + 12 * Math.cos((deg * Math.PI) / 180), 1.5, 22.5 + 12 * Math.sin((deg * Math.PI) / 180), 2.2, 1.5, 2.2, 'text')),
  ],
  // Lampadaire arc : bandeau de laiton au socle, trois pieds boule, bagues de bois sombre sur la tige, cerclage du dôme.
  'arc-lamp': [
    cyl(149, 16, 6.4, 15, 1.2, 'text'),
    ...[90, 210, 330].map((deg) => ball(149 + 13 * Math.cos((deg * Math.PI) / 180), 1.5, 16 + 13 * Math.sin((deg * Math.PI) / 180), 2.2, 1.5, 2.2, 'text')),
    cyl(149, 16, 40, 2.6, 2.5, 'woodDark'), cyl(149, 16, 80, 2.6, 2.5, 'woodDark'),
    cyl(19, 16, 151, 16, 1.5, 'text'),
  ],
};
