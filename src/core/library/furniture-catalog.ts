import type { FurnitureKind, ShelfShape, StandingKind, VinylColor, WallShape } from './library-types';

// Tailles en cases (largeur × hauteur). L'étagère a 3 niveaux de 5 emplacements (utilisés par le morceau « Cartes »).
export const CATALOG = {
  shelf: { label: 'Étagère', w: 6, h: 8, levels: 3, perLevel: 5 },
  desk: { label: 'Bureau', w: 5, h: 4 },
  computer: { label: 'Ordinateur' },
} as const;

export const FURNITURE_KINDS: FurnitureKind[] = ['shelf', 'desk', 'computer'];

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

export const labelOf = (kind: FurnitureKind): string => CATALOG[kind].label;

export function sizeOf(kind: StandingKind): { w: number; h: number } {
  const { w, h } = CATALOG[kind];
  return { w, h };
}
