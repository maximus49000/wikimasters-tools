import { drawSize } from './footprint';
import type { FurnitureKind, ShelfShape, SmallItem, SmallKind, StandDepth, StandingKind, StyleId, VinylColor, WallShape } from './library-types';

export type Category = 'storage' | 'seats' | 'pets' | 'deco' | 'steampunk';
export type PoiType = 'seat' | 'curl' | 'eat' | 'sleep' | 'enter' | 'charge' | 'hide';
// Point d'intérêt d'un meuble pour les animaux : une case relative au coin haut-gauche du meuble.
export type Poi = { type: PoiType; dx: number; dy: number };

// Dimensions, cases au sol et points d'intérêt viennent des modèles 3D (furniture-models.ts, via footprint.ts) ; restent ici la couche,
// la profondeur par défaut et le passage dessous.
type Footprint = { layer: 'floor' | 'rug'; depth: StandDepth; under: boolean };

const FOOTPRINTS: Record<StandingKind, Footprint> = {
  shelf: { layer: 'floor', depth: 1, under: false },
  desk: { layer: 'floor', depth: 2, under: true },
  chair: { layer: 'floor', depth: 2, under: true },
  sofa: { layer: 'floor', depth: 2, under: false },
  armchair: { layer: 'floor', depth: 2, under: false },
  basket: { layer: 'floor', depth: 3, under: false },
  bowl: { layer: 'floor', depth: 3, under: false },
  kennel: { layer: 'floor', depth: 2, under: false },
  // Station de recharge du robot : une dalle au sol, le robot s'y place (point « charge » du modèle).
  charger: { layer: 'floor', depth: 3, under: false },
  plant: { layer: 'floor', depth: 1, under: false },
  lamp: { layer: 'floor', depth: 1, under: false },
  'coffee-table': { layer: 'floor', depth: 3, under: true },
  rug: { layer: 'rug', depth: 1, under: true },
  // Meubles exclusifs Steampunk.
  globe: { layer: 'floor', depth: 2, under: false },
  telescope: { layer: 'floor', depth: 2, under: true },
  automaton: { layer: 'floor', depth: 2, under: false },
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
  charger: 'Station de recharge',
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
  { id: 'pets', label: 'Pour animaux', kinds: ['basket', 'bowl', 'kennel', 'charger'] },
  { id: 'deco', label: 'Déco', kinds: ['coffee-table', 'plant', 'lamp', 'small-plant', 'small-lamp', 'rug', 'window'] },
  { id: 'steampunk', label: 'Steampunk', kinds: ['globe', 'telescope', 'automaton'] },
];

// Meubles réservés aux pièces Steampunk (retirés quand la pièce change de style).
export const STEAMPUNK_ONLY: readonly StandingKind[] = ['globe', 'telescope', 'automaton'];

// Catégories proposées au catalogue : « Steampunk » seulement dans une pièce Steampunk.
export const categoriesFor = (style: StyleId): typeof CATEGORIES => CATEGORIES.filter((c) => c.id !== 'steampunk' || style === 'steampunk');

export type Subcategory = 'plants' | 'lights' | 'floor' | 'walls';
export type CatalogNode = { id: Category; label: string; kinds: FurnitureKind[]; subcategories: { id: Subcategory; label: string; kinds: FurnitureKind[] }[] };

// Sous-catégories du tiroir de construction : seulement pour une catégorie trop fournie pour une seule ligne de vignettes.
const SUBCATEGORIES: Partial<Record<Category, CatalogNode['subcategories']>> = {
  deco: [
    { id: 'plants', label: 'Plantes', kinds: ['plant', 'small-plant'] },
    { id: 'lights', label: 'Lumières', kinds: ['lamp', 'small-lamp'] },
    { id: 'floor', label: 'Sol', kinds: ['rug', 'coffee-table'] },
    { id: 'walls', label: 'Murs', kinds: ['window'] },
  ],
};

// Arbre affiché par le tiroir : catégories du style, chacune avec ses sous-catégories éventuelles.
export const catalogTree = (style: StyleId): CatalogNode[] =>
  categoriesFor(style).map((c) => ({ id: c.id, label: c.label, kinds: c.kinds, subcategories: SUBCATEGORIES[c.id] ?? [] }));

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
// Baie vitrée : jusqu'à toute la hauteur du mur (WALL_ROWS = 12, room-grid.ts) et toute la largeur (MAX_COLS = 96), bornée par la pièce.
export const WINDOW_MAX = { w: 96, h: 12 } as const;
export const WINDOW_DEFAULT = { w: 6, h: 5 } as const;

export const labelOf = (kind: FurnitureKind): string => LABELS[kind];

// Rectangle de dessin de face (en cases), tiré du modèle 3D.
export const sizeOf = (kind: StandingKind): { w: number; h: number } => drawSize(kind, 0);
export const layerOf = (kind: StandingKind): 'floor' | 'rug' => FOOTPRINTS[kind].layer;

// Niveau de profondeur par défaut du type (1 fond, 2 milieu, 3 avant).
export const depthDefault = (kind: StandingKind): StandDepth => FOOTPRINTS[kind].depth;
// Vrai si un animal passe dessous (table, bureau, chaise, trépied).
export const underOf = (kind: StandingKind): boolean => FOOTPRINTS[kind].under;
