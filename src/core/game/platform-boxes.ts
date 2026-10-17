// Formats de boîte de jeu par console (dimensions réelles en cm), pour dessiner les boîtes.
export type BoxFormat =
  | 'bluray' | 'dvd' | 'gamecube' | 'switch' | 'ds' | 'psp' | 'vita' | 'cd-jewel'
  // Consoles à cartouche : boîte en carton (en largeur pour SNES et N64) ou boîtier à clapet (Mega Drive), cartouche dedans.
  | 'snes' | 'n64' | 'nes' | 'gb' | 'gba' | 'genesis'
  | 'generic';

export type BoxSupport =
  | { kind: 'disc'; d: number }
  | { kind: 'umd'; w: number; h: number }
  | { kind: 'cart'; w: number; h: number; color: string };

export type BoxTemplate = {
  w: number; h: number; d: number; // cm
  plastic: string;
  band: { color: string; label: string } | null;
  support: BoxSupport;
};

const NOIR = '#1B1B1F';
const BLANC = '#F2F2F0';

export const BOX_FORMATS: Record<BoxFormat, BoxTemplate> = {
  bluray: { w: 13.5, h: 17, d: 1.4, plastic: '#1F4C9E', band: { color: '#1F4C9E', label: 'Blu-ray' }, support: { kind: 'disc', d: 12 } },
  dvd: { w: 13.5, h: 19, d: 1.4, plastic: NOIR, band: null, support: { kind: 'disc', d: 12 } },
  gamecube: { w: 13.5, h: 19, d: 1.4, plastic: NOIR, band: null, support: { kind: 'disc', d: 8 } },
  switch: { w: 10.5, h: 17, d: 1.1, plastic: '#E60012', band: null, support: { kind: 'cart', w: 2.1, h: 3.1, color: NOIR } },
  ds: { w: 13.5, h: 12.2, d: 1.4, plastic: BLANC, band: null, support: { kind: 'cart', w: 3.5, h: 3.3, color: '#8A8D93' } },
  psp: { w: 11, h: 18, d: 1.4, plastic: NOIR, band: null, support: { kind: 'umd', w: 6.5, h: 6.4 } },
  // Vita : valeurs approximatives (étui de carte ~ 10,5 x 13,5 x 1,1 ; carte ~ 2,2 x 3,2), recoupées sur des photos d'étuis, non mesurées.
  vita: { w: 10.5, h: 13.5, d: 1.1, plastic: NOIR, band: null, support: { kind: 'cart', w: 2.2, h: 3.2, color: NOIR } },
  'cd-jewel': { w: 14.2, h: 12.5, d: 1, plastic: '#D9DEE6', band: null, support: { kind: 'disc', d: 12 } },
  // Consoles à cartouche : valeurs approximatives (boîtes et cartouches nord-américaines et européennes), recoupées sur des photos
  // et sur les proportions des scans de TheGamesDB (SNES 974×720, N64 986×720, GBA 804×720), non mesurées.
  snes: { w: 18.3, h: 13.2, d: 3.2, plastic: NOIR, band: null, support: { kind: 'cart', w: 12, h: 8.6, color: '#8E8C93' } },
  n64: { w: 18.4, h: 13.4, d: 3.4, plastic: NOIR, band: null, support: { kind: 'cart', w: 11.6, h: 7.5, color: '#55555A' } },
  nes: { w: 12.7, h: 17.8, d: 2.9, plastic: NOIR, band: null, support: { kind: 'cart', w: 12, h: 13.3, color: '#6E6E73' } },
  gb: { w: 12, h: 13.2, d: 2.5, plastic: BLANC, band: null, support: { kind: 'cart', w: 5.7, h: 6.5, color: '#8A8D93' } },
  gba: { w: 14.2, h: 12.7, d: 2.6, plastic: BLANC, band: null, support: { kind: 'cart', w: 5.7, h: 3.5, color: '#55555A' } },
  genesis: { w: 13.6, h: 18.9, d: 2.2, plastic: NOIR, band: null, support: { kind: 'cart', w: 11, h: 13.4, color: NOIR } },
  generic: { w: 13.5, h: 19, d: 1.5, plastic: NOIR, band: null, support: { kind: 'disc', d: 12 } },
};

// Ids TheGamesDB (liste publique des plateformes).
const TGDB: Record<number, BoxFormat> = {
  4919: 'bluray', 4980: 'bluray', 12: 'bluray', 4920: 'bluray', 4981: 'bluray',
  11: 'dvd', 14: 'dvd', 15: 'dvd', 9: 'dvd', 38: 'dvd', 1: 'dvd',
  2: 'gamecube',
  4971: 'switch',
  8: 'ds', 4912: 'ds',
  13: 'psp',
  39: 'vita',
  10: 'cd-jewel', 17: 'cd-jewel', 16: 'cd-jewel',
  6: 'snes', 3: 'n64', 7: 'nes', 4: 'gb', 41: 'gb', 5: 'gba', 18: 'genesis',
};

export function formatOfTgdbPlatform(id: number): BoxFormat {
  return TGDB[id] ?? 'generic';
}

// Motifs testés dans l'ordre : les plus précis d'abord (« playstation 4 » avant « playstation »).
// Le style (couleur de boîtier, bandeau) est propre à la console ; sans clé, on prend celui du format.
const NOMS: [RegExp, BoxFormat, string?][] = [
  [/switch/, 'switch', 'switch'],
  [/vita/, 'vita'],
  [/playstation portable|\bpsp\b/, 'psp'],
  [/playstation 5|\bps5\b/, 'bluray', 'ps5'],
  [/playstation 4|\bps4\b/, 'bluray', 'ps4'],
  [/playstation 3|\bps3\b/, 'bluray', 'ps3'],
  [/playstation 2|\bps2\b/, 'dvd', 'ps2'],
  [/^playstation$|\bps1\b|\bpsx\b|saturn|dreamcast/, 'cd-jewel'],
  [/xbox series/, 'bluray', 'xseries'],
  [/xbox one/, 'bluray', 'xone'],
  [/xbox/, 'dvd', 'xbox'],
  [/wii u/, 'dvd', 'wiiu'],
  [/wii/, 'dvd', 'wii'],
  [/gamecube/, 'gamecube'],
  [/3ds|nintendo ds|\bnds\b|\bdsi\b/, 'ds', 'ds'],
  // Cartouches : Super Nintendo avant NES (« Super Nintendo Entertainment System »), Advance avant Game Boy.
  [/super nintendo|snes|super famicom/, 'snes', 'snes'],
  [/nintendo 64|\bn64\b/, 'n64', 'n64'],
  [/nintendo entertainment system|\bnes\b|famicom/, 'nes', 'nes'],
  [/game ?boy advance|\bgba\b/, 'gba', 'gba'],
  [/game ?boy color|\bgbc\b/, 'gb', 'gbc'],
  [/game ?boy/, 'gb', 'gb'],
  [/genesis|mega ?drive/, 'genesis', 'genesis'],
  [/^pc( \(.*\))?$|^(microsoft )?windows$|\(microsoft windows\)/, 'dvd'],
];

function lookup(name: string): [BoxFormat, string | undefined] {
  const n = name.toLowerCase().trim();
  for (const [re, f, k] of NOMS) if (re.test(n)) return [f, k];
  return ['generic', undefined];
}

export function formatOfPlatformName(name: string): BoxFormat {
  return lookup(name)[0];
}

export type CaseStyle = { plastic: string; band: { color: string; label: string } | null };

const VERT = '#107C10';
const STYLES: Record<string, CaseStyle> = {
  ps5: { plastic: BLANC, band: { color: '#FFFFFF', label: 'PS5' } },
  ps4: { plastic: '#1F4C9E', band: { color: '#1F4C9E', label: 'PS4' } },
  ps3: { plastic: NOIR, band: { color: NOIR, label: 'PS3' } },
  ps2: { plastic: NOIR, band: null },
  xseries: { plastic: VERT, band: { color: VERT, label: 'XBOX SERIES X' } },
  xone: { plastic: VERT, band: { color: VERT, label: 'XBOX ONE' } },
  xbox: { plastic: VERT, band: null },
  switch: { plastic: '#E60012', band: { color: '#E60012', label: 'NINTENDO SWITCH' } },
  wii: { plastic: BLANC, band: null },
  wiiu: { plastic: BLANC, band: { color: '#0096C8', label: 'Wii U' } },
  ds: { plastic: BLANC, band: null },
};

// Clé de style par id TheGamesDB.
const TGDB_STYLE: Record<number, string> = {
  4980: 'ps5', 4919: 'ps4', 12: 'ps3', 11: 'ps2',
  4981: 'xseries', 4920: 'xone', 15: 'xbox', 14: 'xbox',
  4971: 'switch', 9: 'wii', 38: 'wiiu', 8: 'ds', 4912: 'ds',
};

function styleOf(format: BoxFormat, key?: string): CaseStyle {
  if (key && STYLES[key]) return STYLES[key];
  const t = BOX_FORMATS[format];
  return { plastic: t.plastic, band: t.band };
}

export function caseStyleOfTgdbPlatform(id: number): CaseStyle {
  return styleOf(formatOfTgdbPlatform(id), TGDB_STYLE[id]);
}

export function caseStyleOfPlatformName(name: string): CaseStyle {
  const [f, k] = lookup(name);
  return styleOf(f, k);
}

// Nom court de la console (« PS4 », « Switch »), pour la fiche de la boîte ouverte ; une console inconnue garde son nom.
const LABELS: Record<string, string> = {
  ps5: 'PS5', ps4: 'PS4', ps3: 'PS3', ps2: 'PS2', xseries: 'Xbox Series', xone: 'Xbox One', xbox: 'Xbox',
  switch: 'Switch', wii: 'Wii', wiiu: 'Wii U', ds: 'DS',
  snes: 'Super Nintendo', n64: 'N64', nes: 'NES', gba: 'GBA', gbc: 'Game Boy Color', gb: 'Game Boy', genesis: 'Mega Drive',
};
const FORMAT_LABELS: Partial<Record<BoxFormat, string>> = { psp: 'PSP', vita: 'PS Vita', gamecube: 'GameCube' };

export function consoleLabelOf(name: string): string {
  const n = name.toLowerCase().trim();
  if (/3ds/.test(n)) return '3DS';
  if (/^pc\b|windows/.test(n)) return 'PC';
  const [f, k] = lookup(name);
  return (k ? LABELS[k] : undefined) ?? FORMAT_LABELS[f] ?? name.trim();
}
