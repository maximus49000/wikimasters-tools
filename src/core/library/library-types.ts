// L'orientation ne change que la fenêtre visible sur la pièce (large en horizontal, étroite en vertical).
export type Orientation = 'landscape' | 'portrait';

// Les styles prévus ; seul `scandinave` a une palette dans ce morceau.
export const STYLE_IDS = ['scandinave', 'moderne', 'industriel', 'boheme', 'retro70', 'japandi', 'neon', 'steampunk'] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export type FurnitureKind = 'shelf' | 'desk' | 'computer';
export type StandingKind = 'shelf' | 'desk';

export type WallShape = 'poster' | 'vinyl' | 'sleeve-square' | 'sleeve-round' | 'sleeve-frame';
export type ShelfShape = 'cd' | 'dvd' | 'game' | 'book';
export type VinylColor = 'black' | 'red' | 'blue' | 'green' | 'gold';

// Un meuble au sol : (col, row) est sa case en haut à gauche. L'ordinateur n'a pas de case : il suit son bureau (et peut afficher une carte).
// `wall` : objet accroché au mur (case en haut à gauche). `stored` : objet rangé dans l'emplacement `slot` (0 à 14) d'une étagère.
export type Placed =
  | { id: string; kind: StandingKind; col: number; row: number }
  | { id: string; kind: 'computer'; deskId: string; slug?: string }
  | { id: string; kind: 'wall'; shape: WallShape; col: number; row: number; slug: string; color?: VinylColor }
  | { id: string; kind: 'stored'; shape: ShelfShape; shelfId: string; slot: number; slug: string };

export type Layout = Placed[];

// `cols` : largeur de la pièce en colonnes (multiple de 12, de 24 à 96). Un seul aménagement, quelle que soit l'orientation.
export type Room = {
  id: string;
  name: string;
  style: StyleId;
  orientation: Orientation;
  cols: number;
  layout: Layout;
};

export type LibraryState = {
  version: 1;
  activeRoomId: string;
  homeRoomId: string | null;
  rooms: Room[];
};
