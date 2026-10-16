// Formats de boîte de jeu par console (dimensions réelles en cm), pour dessiner les boîtes.
export type BoxFormat = 'bluray' | 'dvd' | 'gamecube' | 'switch' | 'ds' | 'psp' | 'vita' | 'cd-jewel' | 'generic';

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
};

export function formatOfTgdbPlatform(id: number): BoxFormat {
  return TGDB[id] ?? 'generic';
}

// Motifs testés dans l'ordre : les plus précis d'abord (« playstation 4 » avant « playstation »).
const NOMS: [RegExp, BoxFormat][] = [
  [/switch/, 'switch'],
  [/vita/, 'vita'],
  [/portable|\bpsp\b/, 'psp'],
  [/playstation 5|\bps5\b|playstation 4|\bps4\b|playstation 3|\bps3\b/, 'bluray'],
  [/playstation 2|\bps2\b/, 'dvd'],
  [/playstation|\bps1\b|\bpsx\b|saturn|dreamcast/, 'cd-jewel'],
  [/xbox series|xbox one/, 'bluray'],
  [/xbox/, 'dvd'],
  [/wii/, 'dvd'],
  [/gamecube/, 'gamecube'],
  [/3ds|nintendo ds|\bnds\b|\bdsi\b/, 'ds'],
  [/\bpc\b|windows/, 'dvd'],
];

export function formatOfPlatformName(name: string): BoxFormat {
  const n = name.toLowerCase();
  for (const [re, f] of NOMS) if (re.test(n)) return f;
  return 'generic';
}
