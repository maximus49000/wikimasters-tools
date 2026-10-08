import type { FurnitureKind, ShelfShape, SmallItem, SmallKind, StandingKind, StyleId, VinylColor, WallShape } from './library-types';

export type Category = 'storage' | 'seats' | 'pets' | 'deco' | 'steampunk';
export type PoiType = 'seat' | 'curl' | 'eat' | 'sleep' | 'enter';
// Point d'intérêt d'un meuble pour les animaux : une case relative au coin haut-gauche du meuble.
export type Poi = { type: PoiType; dx: number; dy: number };

type Footprint = { w: number; h: number; layer: 'floor' | 'rug'; pois: readonly Poi[] };

// Tailles en cases (largeur × hauteur). L'étagère a 3 niveaux de 5 emplacements (voir `shelfSlots`).
const FOOTPRINTS: Record<StandingKind, Footprint> = {
  shelf: { w: 6, h: 8, layer: 'floor', pois: [] },
  desk: { w: 5, h: 4, layer: 'floor', pois: [] },
  chair: { w: 2, h: 3, layer: 'floor', pois: [{ type: 'seat', dx: 1, dy: 1 }] },
  sofa: {
    w: 6,
    h: 3,
    layer: 'floor',
    pois: [
      { type: 'seat', dx: 1, dy: 1 },
      { type: 'seat', dx: 2, dy: 1 },
      { type: 'seat', dx: 4, dy: 1 },
      { type: 'sleep', dx: 3, dy: 1 },
    ],
  },
  armchair: { w: 3, h: 3, layer: 'floor', pois: [{ type: 'seat', dx: 1, dy: 1 }] },
  basket: { w: 3, h: 2, layer: 'floor', pois: [{ type: 'curl', dx: 1, dy: 1 }] },
  bowl: { w: 2, h: 1, layer: 'floor', pois: [{ type: 'eat', dx: 0, dy: 0 }] },
  kennel: {
    w: 4,
    h: 3,
    layer: 'floor',
    pois: [
      { type: 'enter', dx: 2, dy: 2 },
      { type: 'sleep', dx: 2, dy: 1 },
    ],
  },
  plant: { w: 2, h: 4, layer: 'floor', pois: [] },
  lamp: { w: 1, h: 5, layer: 'floor', pois: [] },
  'coffee-table': { w: 4, h: 2, layer: 'floor', pois: [] },
  rug: { w: 6, h: 3, layer: 'rug', pois: [] },
  // Meubles exclusifs Steampunk : les points d'intérêt viendront avec leurs comportements.
  globe: { w: 3, h: 4, layer: 'floor', pois: [] },
  telescope: { w: 3, h: 5, layer: 'floor', pois: [] },
  automaton: { w: 2, h: 3, layer: 'floor', pois: [] },
};

const LABELS: Record<FurnitureKind, string> = {
  window: 'Fenêtre',
  shelf: 'Étagère',
  desk: 'Bureau',
  computer: 'Ordinateur',
  chair: 'Chaise',
  sofa: 'Canapé',
  armchair: 'Fauteuil',
  basket: 'Panier',
  bowl: 'Gamelle',
  kennel: 'Niche',
  'coffee-table': 'Table basse',
  plant: 'Plante',
  lamp: 'Lampe',
  'small-plant': 'Petite plante',
  'small-lamp': 'Petite lampe',
  rug: 'Tapis',
  globe: 'Globe mécanique',
  telescope: 'Télescope',
  automaton: 'Automate',
};

export const CATEGORIES: { id: Category; label: string; kinds: FurnitureKind[] }[] = [
  { id: 'storage', label: 'Rangement', kinds: ['shelf', 'desk', 'computer'] },
  { id: 'seats', label: 'Assises', kinds: ['chair', 'sofa', 'armchair'] },
  { id: 'pets', label: 'Animaux', kinds: ['basket', 'bowl', 'kennel'] },
  { id: 'deco', label: 'Déco', kinds: ['coffee-table', 'plant', 'lamp', 'small-plant', 'small-lamp', 'rug', 'window'] },
  { id: 'steampunk', label: 'Steampunk', kinds: ['globe', 'telescope', 'automaton'] },
];

// Meubles réservés aux pièces Steampunk (retirés quand la pièce change de style).
export const STEAMPUNK_ONLY: readonly StandingKind[] = ['globe', 'telescope', 'automaton'];

// Catégories proposées au catalogue : « Steampunk » seulement dans une pièce Steampunk.
export const categoriesFor = (style: StyleId): typeof CATEGORIES => CATEGORIES.filter((c) => c.id !== 'steampunk' || style === 'steampunk');

export const FURNITURE_KINDS: FurnitureKind[] = CATEGORIES.flatMap((category) => category.kinds);

export const SMALL_ITEM_OF: Record<SmallKind, SmallItem> = { 'small-plant': 'plant', 'small-lamp': 'lamp' };

export const isStandingKind = (kind: FurnitureKind): kind is StandingKind => kind in FOOTPRINTS;
export const isSmallKind = (kind: FurnitureKind): kind is SmallKind => kind in SMALL_ITEM_OF;

export const WALL_SHAPES: WallShape[] = ['poster', 'vinyl', 'sleeve-square', 'sleeve-round', 'sleeve-frame'];
export const SHELF_SHAPES: ShelfShape[] = ['cd', 'dvd', 'game', 'book'];
export const VINYL_COLORS: VinylColor[] = ['black', 'red', 'blue', 'green', 'gold'];

// Tailles en cases (largeur × hauteur) des objets accrochés.
const WALL_SIZES: Record<WallShape, { w: number; h: number }> = {
  poster: { w: 3, h: 4 },
  vinyl: { w: 3, h: 3 },
  'sleeve-square': { w: 3, h: 3 },
  'sleeve-round': { w: 3, h: 3 },
  'sleeve-frame': { w: 4, h: 4 },
};
export const wallSizeOf = (shape: WallShape): { w: number; h: number } => WALL_SIZES[shape];

export const WINDOW_MIN = { w: 3, h: 3 } as const;
export const WINDOW_MAX = { w: 12, h: 10 } as const;
export const WINDOW_DEFAULT = { w: 6, h: 5 } as const;

export const labelOf = (kind: FurnitureKind): string => LABELS[kind];

export function sizeOf(kind: StandingKind): { w: number; h: number } {
  const { w, h } = FOOTPRINTS[kind];
  return { w, h };
}
export const layerOf = (kind: StandingKind): 'floor' | 'rug' => FOOTPRINTS[kind].layer;
export const poisOf = (kind: StandingKind): readonly Poi[] => FOOTPRINTS[kind].pois;
