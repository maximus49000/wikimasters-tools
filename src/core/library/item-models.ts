// src/core/library/item-models.ts
// Dessin provisoire Opus — reprise Fable prévue.
import { crown } from './furniture-models';
import type { BoxFace, Decal, Model, Piece } from './furniture-render3d';
import type { ShelfShape, StoredDisplay } from './library-types';

// Objets qui garnissent les meubles, en vrais volumes (cm, même repère que les meubles : x largeur vue de face, y hauteur, z profondeur depuis l'avant) :
// cartes rangées (CD, DVD, jeu, livre), écran du bureau, petite plante et petite lampe. Ils sont dessinés par le moteur dans le repère de leur
// meuble (même angle, mêmes tablettes) : ils tournent avec lui et passent devant ou derrière ses planches selon la profondeur.
export type ItemShape = ShelfShape | 'monitor' | 'small-plant' | 'small-lamp';
// Présentation d'un objet rangé : couverture vers l'avant (de face) ou tranche vers l'avant (titre lisible).
export type ItemDisplay = StoredDisplay;

// Clés de décalque des modèles : « rôle:forme ». Rôles : `cover` (image de la carte), `spine` (titre), `pages` (tranche des pages d'un livre), `screen` (écran).
const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, decals?: Decal[], tag?: string): Piece =>
  ({ shape: 'box', x, y, z, w, h, d, fill: 'metal', color, ...(decals && { decals }), ...(tag && { tag }) });
const roles = (shape: ShelfShape, extra: Decal[] = []): Decal[] => [{ face: 'front', key: `cover:${shape}` }, { face: 'left', key: `spine:${shape}` }, ...extra];

// Boîtier rangé de face : couverture à l'avant, tranche (dos) à gauche, comme un vrai boîtier tenu couverture vers soi.
// Le corps porte l'étiquette `body` : sa couleur peut être remplacée à la pose (dos d'un livre propre à chaque carte).
const CASE_COLOR: Record<ShelfShape, string> = { cd: '#D9DEE6', dvd: '#1F3A5F', game: '#1B1B1F', book: '#7A5C3E' };
const stored = (shape: ShelfShape, w: number, h: number, d: number, extra?: Decal[]): Model =>
  ({ w, h, d, pieces: [box(0, 0, 0, w, h, d, CASE_COLOR[shape], roles(shape, extra), 'body')] });

export const ITEM_MODELS: Record<ItemShape, Model> = {
  // Boîtier cristal : 14 × 12,5 × 1 cm.
  cd: stored('cd', 14, 12.5, 1),
  // Boîtier DVD et jeu : 13,5 × 19 × 1,5 cm (format portrait, comme les vrais).
  dvd: stored('dvd', 13.5, 19, 1.5),
  game: stored('game', 13.5, 19, 1.5),
  // Livre 15 × 23 × 3 cm : tranche des pages à droite (opposée au dos) et sur le dessus.
  book: stored('book', 15, 23, 3, [{ face: 'right', key: 'pages:book' }, { face: 'top', key: 'pages:book' }]),
  // Écran plat : socle, pied, dalle 55 × 33 × 3 cm, vitre (décalque de l'image de la carte) en léger relief devant la dalle.
  monitor: {
    w: 55, d: 16, h: 43,
    pieces: [
      box(16.5, 0, 1, 22, 1.5, 14, '#45454C'),
      box(25, 1.5, 8, 5, 11, 2.5, '#55555C'),
      box(0, 10, 5, 55, 33, 3, '#1D1D22'),
      box(1.5, 11.5, 4.8, 52, 30, 0.2, '#0E1A26', [{ face: 'front', key: 'screen:monitor' }]),
    ],
  },
  // Petite plante : pot en terre évasé, bord, terreau, deux couronnes de feuilles (arquées, dressées).
  'small-plant': {
    w: 15, d: 15, h: 25, round: true,
    pieces: [
      { shape: 'cyl', cx: 7.5, cz: 7.5, y: 0, r: 5, r2: 6.3, h: 9, fill: 'warm' },
      { shape: 'cyl', cx: 7.5, cz: 7.5, y: 8.5, r: 6.8, h: 1.6, fill: 'warmDark' },
      { shape: 'cyl', cx: 7.5, cz: 7.5, y: 10, r: 5.8, h: 0.4, fill: 'door' },
      {
        shape: 'foliage', fill: 'leaf', leaves: [
          ...crown(7.5, 7.5, 10.4, 5, 20, [4.5, 18], [6, 14.5], 3.2, ['leafDark', 'leaf'], [0, 1, 0.5, 1.5, 0]),
          ...crown(7.5, 7.5, 10.4, 4, 60, [2, 21], [3.5, 24], 3, ['leaf', 'leafDark'], [0, -1, 0.5, -0.5]),
        ],
      },
    ],
  },
  // Petite lampe de bureau : socle rond, tige, abat-jour évasé vers le bas (étiqueté `glow` : allumé, il prend la couleur de la lumière), embout.
  'small-lamp': {
    w: 15, d: 15, h: 30, round: true,
    pieces: [
      { shape: 'cyl', cx: 7.5, cz: 7.5, y: 0, r: 6, r2: 4.5, h: 1.6, fill: 'metal' },
      { shape: 'cyl', cx: 7.5, cz: 7.5, y: 1.6, r: 0.7, h: 17, fill: 'metal' },
      { shape: 'cyl', cx: 7.5, cz: 7.5, y: 17.5, r: 7.4, r2: 4.4, h: 11, fill: 'shade', tag: 'glow' },
      { shape: 'cyl', cx: 7.5, cz: 7.5, y: 28.5, r: 1, h: 1.5, fill: 'metal' },
    ],
  },
};

// Écran d'une pièce Steampunk, façon machine analytique : socle en laiton et ses touches rondes, coffre de cuivre, écran à tube (image de la carte),
// deux cadrans clairs à droite, corniche en laiton. Mêmes mesures que l'écran plat.
export const STEAMPUNK_MONITOR: Model = {
  w: 55, d: 16, h: 43,
  pieces: [
    { shape: 'box', x: 0, y: 0, z: 0, w: 55, h: 5, d: 16, fill: 'desk' },
    ...Array.from({ length: 7 }, (_, i): Piece => ({ shape: 'rod', a: [8 + i * 6.5, 5, 2.6], b: [8 + i * 6.5, 6, 2.6], r: 1.6, fill: 'text', layer: 1 })),
    { shape: 'box', x: 3, y: 5, z: 5, w: 49, h: 36, d: 10, fill: 'metal' },
    box(7, 10, 4.8, 34, 27, 0.2, '#1D1D22', [{ face: 'front', key: 'screen:monitor' }]),
    ...[18, 31].map((y): Piece => ({ shape: 'rod', a: [46.5, y, 5], b: [46.5, y, 4.6], r: 3, fill: 'metal', color: '#F4F0E0' })),
    { shape: 'box', x: 2, y: 41, z: 4, w: 51, h: 2, d: 12, fill: 'desk' },
  ],
};

export function itemModel(shape: ItemShape, steampunk = false): Model {
  return shape === 'monitor' && steampunk ? STEAMPUNK_MONITOR : ITEM_MODELS[shape];
}

// Largeur occupée sur la tablette (cm), sans l'écart : la largeur de la couverture de face, l'épaisseur sur la tranche.
export function itemFootprintCm(shape: ShelfShape, display: ItemDisplay): number {
  const m = ITEM_MODELS[shape];
  return display === 'cover' ? m.w : m.d;
}

// Couleur du dos d'un livre, dérivée du slug (donc stable) : teinte hsl(somme % 360, 35 %, 45 %), en #RRGGBB.
export function bookColor(slug: string): string {
  let sum = 0;
  for (let i = 0; i < slug.length; i++) sum += slug.charCodeAt(i);
  const [h, s, l] = [sum % 360, 0.35, 0.45];
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const ch = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(8)}${ch(4)}`;
}

// Objet posé : `key` le distingue (clés de décalque « key|rôle:forme », formes « stored:key », abat-jour « glow:key ») ; (x, y, z) = coin bas avant gauche de sa boîte
// dans le repère du meuble, une fois posé ; `color` : couleur du dos d'un livre.
export type ItemPlacement = { key: string; shape: ItemShape; display?: ItemDisplay; x: number; y: number; z: number; color?: string };

// Quart de tour (tranche vers l'avant) : la face gauche passe devant, l'avant à droite, la droite au fond, le fond à gauche.
const TURNED: Record<BoxFace, BoxFace> = { left: 'front', front: 'right', right: 'back', back: 'left', top: 'top' };

// Présentoir : un CD, un DVD ou un jeu rangé de face ne tient pas droit comme un piquet. Il penche vers l'arrière de STAND_LEAN_DEG,
// posé sur un petit support sombre : socle fin, rebord avant qui retient le bas du boîtier, béquille au dos qui l'appuie aux deux tiers
// de sa hauteur. Le support est moins large que la couverture : la place prise sur la tablette ne change pas (seule la profondeur grandit).
// Un livre de face, ou tout objet sur la tranche, reste droit.
export const STAND_LEAN_DEG = 14;
const STAND_COLOR = '#5B4636';
const STAND = { base: 0.4, lip: 1, lipD: 0.5, strut: 0.4, back: 1.5, rest: 0.62 } as const;
const onStand = (p: ItemPlacement): boolean => (p.display ?? 'cover') === 'cover' && (p.shape === 'cd' || p.shape === 'dvd' || p.shape === 'game');

// Support du boîtier `m` posé en (x, y, z) (coin bas avant gauche), et le boîtier penché dessus.
function standPieces(m: Model, c: Extract<Piece, { shape: 'box' }>, x: number, y: number, z: number): Piece[] {
  const t = (STAND_LEAN_DEG * Math.PI) / 180;
  const [y0, z0] = [y + STAND.base, z + STAND.lipD];
  const depth = STAND.lipD + m.h * Math.sin(t) + m.d * Math.cos(t) + STAND.back;
  const sw = m.w * 0.7;
  const sx = x + (m.w - sw) / 2;
  const tag = c.tag;
  const part = (q: Omit<Extract<Piece, { shape: 'box' }>, 'shape' | 'fill' | 'color'>): Piece => ({ shape: 'box', fill: 'metal', color: STAND_COLOR, ...(tag && { tag }), ...q });
  // Béquille : du fond du socle jusqu'au dos du boîtier, aux deux tiers de sa hauteur ; penchée vers l'avant autour de son arête bas avant.
  const at = m.h * STAND.rest;
  const [backY, backZ] = [y0 + at * Math.cos(t) - m.d * Math.sin(t), z0 + at * Math.sin(t) + m.d * Math.cos(t)];
  const footZ = z + depth - 0.3 - STAND.strut;
  const lean = Math.atan2(footZ - backZ, backY - y0);
  const sww = Math.max(1, m.w * 0.24);
  return [
    part({ x: sx, y, z, w: sw, h: STAND.base, d: depth }),
    part({ x: sx, y: y0, z, w: sw, h: STAND.lip, d: STAND.lipD }),
    part({ x: x + (m.w - sww) / 2, y: y0, z: footZ, w: sww, h: Math.hypot(backY - y0, footZ - backZ), d: STAND.strut, lean: -(lean * 180) / Math.PI }),
    { ...c, y: c.y + STAND.base, z: c.z + STAND.lipD, lean: STAND_LEAN_DEG },
  ];
}

// Face avant d'un objet rangé (couverture de face, penchée sur son présentoir ; tranche sur la tranche), repère du meuble (cm) :
// haut gauche, haut droit, bas droit, bas gauche.
export function storedFrontCorners(p: ItemPlacement): [number, number, number][] {
  const m = ITEM_MODELS[p.shape];
  if (!onStand(p)) {
    const w = p.display === 'spine' ? m.d : m.w;
    return [[p.x, p.y + m.h, p.z], [p.x + w, p.y + m.h, p.z], [p.x + w, p.y, p.z], [p.x, p.y, p.z]];
  }
  const t = (STAND_LEAN_DEG * Math.PI) / 180;
  const [y0, z0] = [p.y + STAND.base, p.z + STAND.lipD];
  const [yt, zt] = [y0 + m.h * Math.cos(t), z0 + m.h * Math.sin(t)];
  return [[p.x, yt, zt], [p.x + m.w, yt, zt], [p.x + m.w, y0, z0], [p.x, y0, z0]];
}

// Pièces d'un objet posé dans le repère de son meuble. Sur la tranche, l'objet rangé tourne d'un quart (les objets rangés ne sont faits que de boîtes).
export function itemPieces(p: ItemPlacement, steampunk = false): Piece[] {
  const m = itemModel(p.shape, steampunk);
  const pieces = placedPieces(p, m);
  // Le boîtier (seule pièce d'un objet rangé) passe en dernier : la béquille et le socle se trient avec lui par le peintre.
  return onStand(p) && pieces[0]?.shape === 'box' ? standPieces(m, pieces[0], p.x, p.y, p.z) : pieces;
}

function placedPieces(p: ItemPlacement, m: Model): Piece[] {
  const stored = p.shape !== 'monitor' && p.shape !== 'small-plant' && p.shape !== 'small-lamp';
  const turned = p.display === 'spine' && stored;
  return m.pieces.map((q): Piece => {
    // Étiquettes : `body` reçoit la couleur propre ; un objet rangé est marqué « stored:key » (il ne se voit qu'à travers l'ouverture du meuble),
    // `glow` devient « glow:key » (allumage de cet objet-là).
    const base: Piece = { ...q, ...(q.tag === 'body' && p.color && { color: p.color }) };
    if (q.tag === 'glow') base.tag = `glow:${p.key}`;
    else if (stored) base.tag = `stored:${p.key}`;
    else delete base.tag;
    switch (base.shape) {
      case 'box': {
        const decals = base.decals?.map((d) => ({ face: turned ? TURNED[d.face] : d.face, key: `${p.key}|${d.key}` }));
        const placed = turned
          ? { x: p.x + m.d - (base.z + base.d), z: p.z + base.x, w: base.d, d: base.w }
          : { x: p.x + base.x, z: p.z + base.z, w: base.w, d: base.d };
        return { ...base, ...placed, y: p.y + base.y, ...(decals && { decals }) };
      }
      case 'cyl': return { ...base, cx: p.x + base.cx, cz: p.z + base.cz, y: p.y + base.y };
      case 'rod': return { ...base, a: [p.x + base.a[0], p.y + base.a[1], p.z + base.a[2]], b: [p.x + base.b[0], p.y + base.b[1], p.z + base.b[2]] };
      case 'ball': return { ...base, cx: p.x + base.cx, cy: p.y + base.cy, cz: p.z + base.cz };
      case 'prism': return { ...base, profile: base.axis === 'z' ? base.profile.map(([u, y]) => [u + p.x, y + p.y]) : base.profile.map(([u, y]) => [u + p.z, y + p.y]), from: base.from + (base.axis === 'z' ? p.z : p.x), to: base.to + (base.axis === 'z' ? p.z : p.x) };
      case 'lathe': return { ...base, cx: p.x + base.cx, cz: p.z + base.cz, profile: base.profile.map(([r, y]): [number, number] => [r, y + p.y]), ...(base.folds && { folds: base.folds.map((fo) => ({ ...fo, y: fo.y + p.y })) }), ...(base.seat && { seat: { ...base.seat, y0: base.seat.y0 + p.y, y1: base.seat.y1 + p.y } }) };
      case 'foliage': return { ...base, leaves: base.leaves.map((l) => ({ ...l, base: [l.base[0] + p.x, l.base[1] + p.y, l.base[2] + p.z], ctrl: [l.ctrl[0] + p.x, l.ctrl[1] + p.y, l.ctrl[2] + p.z], tip: [l.tip[0] + p.x, l.tip[1] + p.y, l.tip[2] + p.z] })) };
    }
  });
}
