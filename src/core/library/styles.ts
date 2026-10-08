import type { StyleId } from './library-types';

export type Palette = {
  wall: string;
  floor: string;
  skirt: string;
  wood: string;
  woodDark: string;
  desk: string;
  leg: string;
  edge: string;
  text: string;
};

const SCANDINAVE: Palette = {
  wall: '#EDE6DA',
  floor: '#D9BE95',
  skirt: '#FFFFFF',
  wood: '#D8C3A0',
  woodDark: '#B79F78',
  desk: '#E8D3AE',
  leg: '#FFFFFF',
  edge: '#C9B48E',
  text: '#8A8A8A',
};

// Les autres styles arrivent avec le morceau « Styles et décor » : en attendant, ils retombent sur Scandinave.
const PALETTES: Partial<Record<StyleId, Palette>> = { scandinave: SCANDINAVE };

export const paletteOf = (id: StyleId): Palette => PALETTES[id] ?? SCANDINAVE;
