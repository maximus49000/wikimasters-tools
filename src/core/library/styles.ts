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

const variant = (overrides: Partial<Palette>): Palette => ({ ...SCANDINAVE, ...overrides });

const PALETTES: Record<StyleId, Palette> = {
  scandinave: SCANDINAVE,
  moderne: variant({ wall: '#E9ECEF', floor: '#B8BEC6', skirt: '#FFFFFF', wood: '#9AA3AD', woodDark: '#7C8691', desk: '#F2F4F6', leg: '#4A5058', edge: '#AEB6BF', text: '#6B737C', fabric: '#4A6FA5', fabricLight: '#6283B8', fabricDark: '#3A5A8A', warm: '#2F3A46', warmLight: '#46525F', warmDark: '#222B34', leaf: '#4FA37C', leafDark: '#3F8C69', rug: '#CBD3DC', shade: '#FFF3C4', metal: '#C0C6CC', door: '#38424C' }),
  industriel: variant({ wall: '#8C8C88', floor: '#5E5A55', skirt: '#3E3C39', wood: '#8B6B4A', woodDark: '#6C5238', desk: '#A27C55', leg: '#2B2B2B', edge: '#4D4A46', text: '#D9D9D6', fabric: '#6B4F3A', fabricLight: '#80614A', fabricDark: '#57402F', warm: '#7A5A3C', warmLight: '#92704F', warmDark: '#5F442C', leaf: '#6E8F5B', leafDark: '#587349', rug: '#4F4B47', shade: '#E8C77A', metal: '#2F2F2F', door: '#2E2A26' }),
  boheme: variant({ wall: '#EBD3B5', floor: '#A9744F', skirt: '#7C4F34', wood: '#B5835A', woodDark: '#8F6542', desk: '#C99A6B', leg: '#7C4F34', edge: '#8F6542', text: '#7A5A44', fabric: '#C2603F', fabricLight: '#D47A59', fabricDark: '#A24C2F', warm: '#D9A441', warmLight: '#E5BA67', warmDark: '#B8862B', leaf: '#4E8B5A', leafDark: '#3C6F47', rug: '#C77D5A', shade: '#F6D58E', metal: '#B08D57', door: '#6B3F2A' }),
  retro70: variant({ wall: '#F2D49B', floor: '#8A5A2B', skirt: '#5E3B1B', wood: '#A8702E', woodDark: '#7E5222', desk: '#C98B3A', leg: '#5E3B1B', edge: '#7E5222', text: '#6B4A22', fabric: '#D96B1E', fabricLight: '#E8863E', fabricDark: '#B5540F', warm: '#8A9A2B', warmLight: '#A3B346', warmDark: '#6E7C1D', leaf: '#7A9A32', leafDark: '#617D24', rug: '#E0A93B', shade: '#FFE08A', metal: '#9C7A3C', door: '#5E3B1B' }),
  japandi: variant({ wall: '#EFEAE0', floor: '#C8B08A', skirt: '#F7F4EC', wood: '#CBB48F', woodDark: '#A38C68', desk: '#DCC8A4', leg: '#3E3A35', edge: '#B49C77', text: '#7E7A72', fabric: '#9AA394', fabricLight: '#ADB5A7', fabricDark: '#838C7D', warm: '#B9A58A', warmLight: '#CBB9A0', warmDark: '#9E8B70', leaf: '#7F9B6E', leafDark: '#68825A', rug: '#DAD3C2', shade: '#F3E6C4', metal: '#4A4640', door: '#5A4A38' }),
  neon: variant({ wall: '#14142B', floor: '#1E1E3A', skirt: '#2B2B52', wood: '#2A2A4D', woodDark: '#1C1C38', desk: '#34345E', leg: '#0F0F22', edge: '#00E5FF', text: '#7FE9FF', fabric: '#5B2A86', fabricLight: '#7A3DB0', fabricDark: '#431F66', warm: '#8A1F5C', warmLight: '#B02C78', warmDark: '#661545', leaf: '#14C77A', leafDark: '#0E9E60', rug: '#2A1F5C', shade: '#FF4FD8', metal: '#8A8AB8', door: '#0F0F22' }),
  steampunk: variant({ wall: '#2F4A3B', floor: '#4A3426', skirt: '#B5833A', wood: '#7A4E2D', woodDark: '#58361D', desk: '#B5833A', leg: '#8A5A2A', edge: '#D9A441', text: '#E8C57A', fabric: '#6B3A24', fabricLight: '#84492E', fabricDark: '#4F2917', warm: '#8C4A2B', warmLight: '#A5603D', warmDark: '#6E3820', leaf: '#5E8A4A', leafDark: '#486E37', rug: '#5A2E2A', shade: '#FFD27A', metal: '#B87333', door: '#3A2418' }),
};

export const paletteOf = (id: StyleId): Palette => PALETTES[id] ?? SCANDINAVE;

export const STYLE_LABELS: Record<StyleId, string> = {
  scandinave: 'Scandinave',
  moderne: 'Moderne',
  industriel: 'Industriel',
  boheme: 'Bohème',
  retro70: 'Rétro 70s',
  japandi: 'Japandi',
  neon: 'Néon gaming',
  steampunk: 'Steampunk',
};

// Motifs de tapisserie et de sol, dessinés en SVG par `RoomBackdrop`. `accent` : couleur des traits du motif ; `glow` : liseré lumineux des meubles.
export type WallPattern = 'plain' | 'bands' | 'bricks' | 'leaves' | 'stripes' | 'slats' | 'brass';
export type FloorPattern = 'plain' | 'boards' | 'concrete' | 'checker' | 'tatami' | 'tiles' | 'plates';
export type Decor = { wall: WallPattern; floor: FloorPattern; accent: string; glow?: string };

const DECORS: Record<StyleId, Decor> = {
  scandinave: { wall: 'plain', floor: 'boards', accent: '#C9B48E' },
  moderne: { wall: 'bands', floor: 'plain', accent: '#C9D0D8' },
  industriel: { wall: 'bricks', floor: 'concrete', accent: '#6E6E6A' },
  boheme: { wall: 'leaves', floor: 'boards', accent: '#4E8B5A' },
  retro70: { wall: 'stripes', floor: 'checker', accent: '#E0A93B' },
  japandi: { wall: 'slats', floor: 'tatami', accent: '#B49C77' },
  neon: { wall: 'plain', floor: 'tiles', accent: '#00E5FF', glow: '#00E5FF' },
  steampunk: { wall: 'brass', floor: 'plates', accent: '#D9A441' },
};

export const decorOf = (id: StyleId): Decor => DECORS[id] ?? DECORS.scandinave;
