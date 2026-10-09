// L'orientation ne change que la fenêtre visible sur la pièce (large en horizontal, étroite en vertical).
export type Orientation = 'landscape' | 'portrait';

// Les huit styles de pièce ; chacun a sa palette (styles.ts).
export const STYLE_IDS = ['scandinave', 'moderne', 'industriel', 'boheme', 'retro70', 'japandi', 'neon', 'steampunk'] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export const STANDING_KINDS = ['shelf', 'desk', 'chair', 'sofa', 'armchair', 'basket', 'bowl', 'kennel', 'plant', 'lamp', 'coffee-table', 'rug', 'globe', 'telescope', 'automaton', 'charger'] as const;
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
// `lit` (lampes seulement) : faux = éteinte ; absent = allumée.
// `wall` : objet accroché au mur (case en haut à gauche). `stored` : objet rangé dans l'emplacement `slot` (0 à 14) d'une étagère.
export type Placed =
  | { id: string; kind: StandingKind; col: number; row: number; lit?: boolean }
  | { id: string; kind: 'computer'; deskId: string; slug?: string }
  | { id: string; kind: 'small'; item: SmallItem; hostId: string; slot: number; lit?: boolean }
  | { id: string; kind: 'wall'; shape: WallShape; col: number; row: number; slug: string; color?: VinylColor }
  | { id: string; kind: 'window'; col: number; row: number; w: number; h: number }
  | { id: string; kind: 'stored'; shape: ShelfShape; shelfId: string; slot: number; slug: string };

export type Layout = Placed[];

// Pelages du chat ; chacun a sa palette (pet-sprite.tsx). Le chien a les siens.
export const COATS = ['orange', 'black', 'gray', 'white', 'tabby', 'bicolor'] as const;
export const DOG_COATS = ['brown', 'black', 'cream', 'spotted', 'gray', 'red'] as const;
export const ROBOT_COATS = ['white', 'blue', 'yellow', 'red', 'graphite', 'mint'] as const;
export const ALL_COATS = ['orange', 'black', 'gray', 'white', 'tabby', 'bicolor', 'brown', 'cream', 'spotted', 'red', 'blue', 'yellow', 'graphite', 'mint'] as const;
export type Coat = (typeof ALL_COATS)[number];
export type CatCoat = (typeof COATS)[number];
export type DogCoat = (typeof DOG_COATS)[number];
export type RobotCoat = (typeof ROBOT_COATS)[number];
export type Species = 'cat' | 'dog' | 'robot';
export const coatsOf = (species: Species): readonly Coat[] => (species === 'cat' ? COATS : species === 'dog' ? DOG_COATS : ROBOT_COATS);

// Un point du dessin de la pièce, en pixels (les pieds de l'animal).
export type Pt = { x: number; y: number };

// Un déplacement : marche sur son support, ou saut en arc. `fromOn` / `on` : le meuble (dessus) qui porte l'animal au départ / à l'arrivée, null = le sol.
export type Segment = { kind: 'walk' | 'jump'; from: Pt; to: Pt; ms: number; fromOn: string | null; on: string | null };

export const PET_ACTIONS = ['sit', 'groom', 'stretch', 'yawn', 'sleep', 'eat', 'drink', 'scratch', 'perch', 'hide', 'purr', 'pant', 'sniff', 'greet', 'play', 'hiss', 'cower', 'scan', 'standby', 'charge', 'beep'] as const;
export type PetAction = (typeof PET_ACTIONS)[number];

// Les scènes à deux : se saluer, toilette mutuelle, poursuite, le chat remet le chien à sa place, dormir côte à côte, le chien suit le robot, le chat dort sur le dos du robot.
export const PAIR_SCENES = ['greet', 'groom', 'chase', 'shoo', 'nap', 'follow', 'ride'] as const;
export type PairScene = (typeof PAIR_SCENES)[number];
export type PetWith = { petId: string; role: 'lead' | 'follow'; scene: PairScene };

// Le plan en cours : un trajet (peut être vide) puis une action sur place. Tout est en horodatages absolus (`startedAt`, durées) :
// la position à n'importe quel instant se déduit du plan, sans rien simuler. `hostId` : le meuble contre/dans lequel il agit (ordre de dessin) ;
// `on` : le dessus de meuble qui le porte (null = sol) ; `sig` : signature des meubles au moment où le plan a été fait.
// `lag` : attente sur place (en ms) avant le trajet ; `key` : la place réservée visée (`<meuble>:<point>`) ;
// `with` : la scène à deux dont ce plan fait partie (les deux plans ont le même `startedAt`).
export type PetPlan = { action: PetAction; hostId: string | null; at: Pt; on: string | null; route: Segment[]; startedAt: number; actMs: number; facing: 'l' | 'r'; sig: string; lag?: number; key?: string; with?: PetWith };

export type Pet = { id: string; species: Species; name: string; coat: Coat; plan?: PetPlan };

// Décors vus par les fenêtres d'une pièce.
export const SCENE_IDS = ['city', 'countryside', 'mountain', 'sea', 'space', 'earth'] as const;
export type SceneId = (typeof SCENE_IDS)[number];

export type TimeSetting = { mode: 'real' } | { mode: 'day' } | { mode: 'night' } | { mode: 'manual'; minutes: number };

// Météo derrière les fenêtres des scènes terrestres.
export const WEATHER_STATES = ['sun', 'cloudy', 'drizzle', 'rain', 'storm', 'snow', 'fog'] as const;
export type WeatherState = (typeof WEATHER_STATES)[number];
export type WeatherSetting = { mode: 'random' } | { mode: 'forced'; state: WeatherState } | { mode: 'real' };

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
  version: 5;
  activeRoomId: string;
  homeRoomId: string | null;
  // Heure globale de la Bibliothèque (toutes les pièces).
  time: TimeSetting;
  // Météo globale de la Bibliothèque (toutes les pièces terrestres).
  weather: WeatherSetting;
  rooms: Room[];
};
