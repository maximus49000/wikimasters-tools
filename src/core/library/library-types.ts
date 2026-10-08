// L'orientation ne change que la fenêtre visible sur la pièce (large en horizontal, étroite en vertical).
export type Orientation = 'landscape' | 'portrait';

// Les huit styles de pièce ; chacun a sa palette (styles.ts).
export const STYLE_IDS = ['scandinave', 'moderne', 'industriel', 'boheme', 'retro70', 'japandi', 'neon', 'steampunk'] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export const STANDING_KINDS = ['shelf', 'desk', 'chair', 'sofa', 'armchair', 'basket', 'bowl', 'kennel', 'plant', 'lamp', 'coffee-table', 'rug', 'globe', 'telescope', 'automaton'] as const;
export type StandingKind = (typeof STANDING_KINDS)[number];

// Petits objets posés sur la surface d'un bureau ou d'une étagère.
export const SMALL_ITEMS = ['plant', 'lamp'] as const;
export type SmallItem = (typeof SMALL_ITEMS)[number];
export type SmallKind = 'small-plant' | 'small-lamp';

export type FurnitureKind = StandingKind | 'computer' | 'window' | SmallKind;

export type WallShape = 'poster' | 'vinyl' | 'sleeve-square' | 'sleeve-round' | 'sleeve-frame';
export type ShelfShape = 'cd' | 'dvd' | 'game' | 'book';
export type VinylColor = 'black' | 'red' | 'blue' | 'green' | 'gold';

// Un meuble au sol : (col, row) est sa case en haut à gauche. L'ordinateur n'a pas de case : il suit son bureau (et peut afficher une carte).
// `small` : petit objet posé sur l'emplacement `slot` de la surface du bureau ou de l'étagère `hostId`.
// `wall` : objet accroché au mur (case en haut à gauche). `stored` : objet rangé dans l'emplacement `slot` (0 à 14) d'une étagère.
export type Placed =
  | { id: string; kind: StandingKind; col: number; row: number }
  | { id: string; kind: 'computer'; deskId: string; slug?: string }
  | { id: string; kind: 'small'; item: SmallItem; hostId: string; slot: number }
  | { id: string; kind: 'wall'; shape: WallShape; col: number; row: number; slug: string; color?: VinylColor }
  | { id: string; kind: 'window'; col: number; row: number; w: number; h: number }
  | { id: string; kind: 'stored'; shape: ShelfShape; shelfId: string; slot: number; slug: string };

export type Layout = Placed[];

// Pelages du chat ; chacun a sa palette (pet-sprite.tsx).
export const COATS = ['orange', 'black', 'gray', 'white', 'tabby', 'bicolor'] as const;
export type Coat = (typeof COATS)[number];

// Un point du dessin de la pièce, en pixels (les pieds de l'animal).
export type Pt = { x: number; y: number };

// Un déplacement : marche sur son support, ou saut en arc. `fromOn` / `on` : le meuble (dessus) qui porte l'animal au départ / à l'arrivée, null = le sol.
export type Segment = { kind: 'walk' | 'jump'; from: Pt; to: Pt; ms: number; fromOn: string | null; on: string | null };

export const PET_ACTIONS = ['sit', 'groom', 'stretch', 'yawn', 'sleep', 'eat', 'drink', 'scratch', 'perch', 'hide', 'purr'] as const;
export type PetAction = (typeof PET_ACTIONS)[number];

// Le plan en cours : un trajet (peut être vide) puis une action sur place. Tout est en horodatages absolus (`startedAt`, durées) :
// la position à n'importe quel instant se déduit du plan, sans rien simuler. `hostId` : le meuble contre/dans lequel il agit (ordre de dessin) ;
// `on` : le dessus de meuble qui le porte (null = sol) ; `sig` : signature des meubles au moment où le plan a été fait.
export type PetPlan = { action: PetAction; hostId: string | null; at: Pt; on: string | null; route: Segment[]; startedAt: number; actMs: number; facing: 'l' | 'r'; sig: string };

export type Pet = { id: string; species: 'cat'; name: string; coat: Coat; plan?: PetPlan };

// Décors vus par les fenêtres d'une pièce.
export const SCENE_IDS = ['city', 'countryside', 'mountain', 'sea', 'space', 'earth'] as const;
export type SceneId = (typeof SCENE_IDS)[number];

export type TimeSetting = { mode: 'real' } | { mode: 'day' } | { mode: 'night' } | { mode: 'manual'; minutes: number };

// `cols` : largeur de la pièce en colonnes (multiple de 12, de 24 à 96). Un seul aménagement, quelle que soit l'orientation.
export type Room = {
  id: string;
  name: string;
  style: StyleId;
  scene: SceneId;
  orientation: Orientation;
  cols: number;
  layout: Layout;
  pets: Pet[];
};

export type LibraryState = {
  version: 4;
  activeRoomId: string;
  homeRoomId: string | null;
  // Heure globale de la Bibliothèque (toutes les pièces).
  time: TimeSetting;
  rooms: Room[];
};
