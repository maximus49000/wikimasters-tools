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
  fabric: string;
  fabricLight: string;
  fabricDark: string;
  warm: string;
  warmLight: string;
  warmDark: string;
  leaf: string;
  leafDark: string;
  rug: string;
  shade: string;
  metal: string;
  door: string;
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
  fabric: '#8FA3A8',
  fabricLight: '#A3B6BA',
  fabricDark: '#7F9398',
  warm: '#C9A98C',
  warmLight: '#D8BDA2',
  warmDark: '#B8977A',
  leaf: '#7DA57A',
  leafDark: '#6A9568',
  rug: '#B9C9C2',
  shade: '#F4E3B5',
  metal: '#8A8A8A',
  door: '#6B5B45',
};

// Les autres styles arrivent avec le morceau « Styles et décor » : en attendant, ils retombent sur Scandinave.
const PALETTES: Partial<Record<StyleId, Palette>> = { scandinave: SCANDINAVE };

export const paletteOf = (id: StyleId): Palette => PALETTES[id] ?? SCANDINAVE;
