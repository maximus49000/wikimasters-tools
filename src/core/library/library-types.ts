// L'orientation ne change que la fenêtre visible sur la pièce (large en horizontal, étroite en vertical).
export type Orientation = 'landscape' | 'portrait';

// Les styles prévus ; seul `scandinave` a une palette dans ce morceau.
export const STYLE_IDS = ['scandinave', 'moderne', 'industriel', 'boheme', 'retro70', 'japandi', 'neon', 'steampunk'] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export type FurnitureKind = 'shelf' | 'desk' | 'computer';
export type StandingKind = 'shelf' | 'desk';

// Un meuble au sol : (col, row) est sa case en haut à gauche. L'ordinateur n'a pas de case : il suit son bureau.
export type Placed =
  | { id: string; kind: StandingKind; col: number; row: number }
  | { id: string; kind: 'computer'; deskId: string };

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
