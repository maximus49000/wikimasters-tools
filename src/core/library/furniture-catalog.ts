import type { FurnitureKind, StandingKind } from './library-types';

// Tailles en cases (largeur × hauteur). L'étagère a 3 niveaux de 5 emplacements (utilisés par le morceau « Cartes »).
export const CATALOG = {
  shelf: { label: 'Étagère', w: 6, h: 8, levels: 3, perLevel: 5 },
  desk: { label: 'Bureau', w: 5, h: 4 },
  computer: { label: 'Ordinateur' },
} as const;

export const FURNITURE_KINDS: FurnitureKind[] = ['shelf', 'desk', 'computer'];

export const labelOf = (kind: FurnitureKind): string => CATALOG[kind].label;

export function sizeOf(kind: StandingKind): { w: number; h: number } {
  const { w, h } = CATALOG[kind];
  return { w, h };
}
