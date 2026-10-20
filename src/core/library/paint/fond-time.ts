import { hashString, mulberry32 } from '../scene-world';
import { hexRgb, mixRgb, type Rgb } from './color';

// Temps lent du fond de la ville peinte (chantier « fond vivant », PR 2a) : port de `01-outils.js` et des poses lentes de
// `03-fond-peint.js` (maquette validée, docs/superpowers/maquettes/fond-ville/). Tout ce qui est peint dans les tranches fixes
// et qui dépend de la date, de la météo ou de l'heure (par tranche de 10 min) passe par un `FondMoment` : fonction pure,
// jamais Math.random, jamais l'horloge.

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
// Météo vue par le fond : nuages, pluie, vent (0..1) et neige posée.
export type FondMeteo = { cloud: number; precip: number; wind: number; snow: boolean };
// Instant du fond : date (jour de l'année `doy`, 0 = 1er janvier ; jour de semaine 0 = dimanche), météo, minutes de la scène.
export type FondMoment = { date: string; y: number; month: number; day: number; doy: number; weekday: number; season: Season; meteo: FondMeteo; minutes: number };

export const sat = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const ramp = (t: number, t0: number, d: number): number => sat((t - t0) / d);
export const smooth = (t: number): number => t * t * (3 - 2 * t);
const MIN = 1 / 60;
const SEC = 1 / 3600;

const pad = (n: number): string => String(n).padStart(2, '0');
export const doyOf = (y: number, m: number, d: number): number => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5);
export const seasonOf = (m: number): Season => (m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter');

export function fondMoment(date: { y: number; m: number; d: number }, minutes: number, meteo: FondMeteo): FondMoment {
  const { y, m, d } = date;
  return { date: `${y}-${pad(m)}-${pad(d)}`, y, month: m, day: d, doy: doyOf(y, m, d), weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), season: seasonOf(m), meteo, minutes };
}

// Instant par défaut (aperçus, tests, banc sans date) : 7 juillet 2026, 15 h, soleil (capture `ete-15h` de la maquette).
export const SUNNY: FondMeteo = { cloud: 0.1, precip: 0, wind: 0.2, snow: false };
export const DEFAULT_MOMENT: FondMoment = fondMoment({ y: 2026, m: 7, d: 7 }, 15 * 60, SUNNY);

// Heure (décimale) de la tranche de 10 min qui contient `minutes` : les poses lentes sont lues à son début.
export const slotHours = (minutes: number): number => (Math.floor((((minutes % 1440) + 1440) % 1440) / 10) * 10) / 60;

// Générateur d'un objet du fond : graine de la pièce, clé de l'objet et jour (vide pour les tirages de structure).
export const fondRng = (seed: number, key: string, day = ''): (() => number) => mulberry32((seed ^ hashString(key) ^ Math.imul(hashString(day) + 1, 2654435761)) >>> 0);

// ── Calendrier des saisons (notes.md §3 ter) : progressif, décalage propre par arbre (± 7 jours), avance d'automne par essence.
export const EVERGREEN: Rgb[] = ['#2E5A3A', '#3E7048', '#5C8E5A'].map(hexRgb);
const EVERGREENS = new Set(['cypress', 'hedge', 'lierre']);
const AUTUMN_LEAD: Record<string, number> = { platane: -10, tilleul: -8, marronnier: -4, cerisier: -6, vigne: -6, glycine: -2, bouquet: 0, poplar: -5, chestnut: -4, chene: 4 };
export const TONES = {
  tender: ['#5E9A4A', '#8CC46A', '#C4E89A'],
  summer: ['#2E6E34', '#56A844', '#A6DC60'],
  gold: ['#8A6A20', '#D8A830', '#F0D060'],
  roux: ['#7A3A1E', '#C86A2A', '#F0A040'],
  winter: ['#6A5A50', '#8A7A6A', '#A89888'],
} as const;
const toRgb = (c: string | Rgb): Rgb => (typeof c === 'string' ? hexRgb(c) : c);
export const mixTones = (a: readonly (string | Rgb)[], b: readonly (string | Rgb)[], t: number): Rgb[] => a.map((c, i) => mixRgb(toRgb(c), toRgb(b[i]!), t));

// État du feuillage d'un arbre : `d` densité 0..1 (0 = nu), `tones` (3 masses), `yel` jaunissement, `drop` part tombée.
export type Foliage = { d: number; tones: Rgb[]; stage: 'bare' | 'tender' | 'green' | 'autumn'; drop: number; tender?: number; yel?: number; base?: Rgb[]; autumn?: Rgb[] };
export function foliageOf(D: Pick<FondMoment, 'doy'>, key: string, species = 'bouquet'): Foliage {
  if (EVERGREENS.has(species)) return { d: 1, tones: EVERGREEN, stage: 'green', drop: 0 };
  const r = mulberry32(hashString('pheno-' + key));
  const o = (r() - 0.5) * 14;
  const roux = r() < 0.5;
  const lead = AUTUMN_LEAD[species] ?? 0;
  const doy = D.doy;
  const base = TONES.summer.map(hexRgb);
  const autumn = (roux ? TONES.roux : TONES.gold).map(hexRgb);
  if (doy < 84 + o || doy >= 330 + o + lead) return { d: 0, tones: TONES.winter.map(hexRgb), stage: 'bare', drop: 1, base, autumn };
  if (doy < 151 + o) {
    const out = sat((doy - (84 + o)) / 30);
    return { d: out, tones: mixTones(TONES.tender, TONES.summer, sat((doy - (110 + o)) / 40)), stage: out < 1 ? 'tender' : 'green', drop: 0, tender: 1 - out, base, autumn };
  }
  const yel = sat((doy - (274 + o + lead)) / 45);
  const drop = sat((doy - (293 + o + lead)) / 36);
  return { d: 1 - drop, tones: mixTones(TONES.summer, roux ? TONES.roux : TONES.gold, yel), stage: yel > 0 ? 'autumn' : 'green', drop, yel, base, autumn };
}
// Floraisons à leur date (0..1).
const BLOOMS: Record<string, readonly [number, number]> = { marronnier: [114, 144], cerisier: [78, 105], glycine: [99, 140], tilleul: [155, 178], vigne: [273, 309] };
export function bloomOf(D: Pick<FondMoment, 'doy'>, species: string): number {
  const b = BLOOMS[species];
  if (!b) return 0;
  const t = (D.doy - b[0]) / (b[1] - b[0]);
  return t < 0 || t > 1 ? 0 : Math.min(1, t * 4, (1 - t) * 3);
}

// ── Poses lentes (fonctions pures de l'heure `T`, du jour et de l'objet) ──
// Fenêtre du mur du fond : seuil, logement vide, heures de fermeture et d'ouverture, exposée au soleil d'été.
export type FarWinLife = { u: number; blue: boolean; vac: boolean; closeAt: number; openAt: number; sun: boolean };
// Volets : fraction fermée (0 ouvert … 1 fermé). Fermés la nuit à une heure propre (21 h 20 – 23 h 40), rouverts le matin
// (7 h – 9 h 10) ; une fenêtre sur trois exposée se ferme l'après-midi d'été ensoleillé ; 8 % de logements vides.
export function shutterK(T: number, D: FondMoment, wn: FarWinLife): number {
  if (wn.vac) return 1;
  const night = T >= wn.closeAt ? ramp(T, wn.closeAt, 0.5 * MIN) : 1 - ramp(T, wn.openAt, 0.5 * MIN);
  const summer = wn.sun && D.season === 'summer' && D.meteo.cloud < 0.5 ? Math.min(ramp(T, 14 + wn.u * 1.5, 0.5 * MIN), 1 - ramp(T, 18.4 + wn.u, 0.5 * MIN)) : 0;
  return Math.max(night, summer);
}
// Linge aux fenêtres du fond : jours secs et peu venteux, un immeuble sur quatre (tirage du jour), pendu vers 9 h 30, rentré
// vers 17 h 30. `key` : clé de l'immeuble.
export function laundryK(T: number, D: FondMoment, key: string, hasFloor: boolean, seed: number): number {
  if (!hasFloor || D.meteo.precip > 0 || D.meteo.wind > 0.7) return 0;
  const r = fondRng(seed, `linge-${key}`, D.date);
  if (r() > 0.25) return 0;
  const t0 = 9.2 + r() * 1.2;
  const t1 = 16.8 + r() * 1.6;
  return Math.min(ramp(T, t0, 1 * MIN), 1 - ramp(T, t1, 1 * MIN));
}
// Parasol d'une terrasse : ouvert les après-midis d'été ensoleillés (12 h – 19 h, heure propre), replié sinon et sous la pluie.
export function parasolK(T: number, D: FondMoment, x: number): number {
  if (D.season !== 'summer' || D.meteo.cloud >= 0.5 || D.meteo.precip > 0) return 0;
  const o = 12 + ((x % 7) / 7) * 1.5;
  return Math.min(ramp(T, o, 20 * SEC), 1 - ramp(T, 19 + (x % 5) / 5, 20 * SEC));
}
// Jours de marché : mercredi, samedi, dimanche ; étals montés un à un entre 6 h 40 et 7 h 10, remballés entre 13 h 20 et 13 h 50.
export function marketK(T: number, D: FondMoment, i: number): number {
  if (![0, 3, 6].includes(D.weekday)) return 0;
  const up = 6 + (40 + i * 8) * MIN;
  const down = 13 + (20 + i * 8) * MIN;
  return T >= up && T < down ? 1 : 0;
}
export const fountainOn = (D: FondMoment): boolean => D.doy >= 74 && D.doy < 319 && !D.meteo.snow;
export const waterFrozen = (D: FondMoment): boolean => D.doy >= 335 || D.doy < 60 || D.meteo.snow;
// Poules dehors de 8 h à 19 h (pas sous la neige) ; boules de pétanque de 10 h à 19 h à la belle saison, sans pluie.
export const hensOut = (T: number, D: FondMoment): boolean => T >= 8 && T < 19 && !D.meteo.snow;
export const boulesOut = (T: number, D: FondMoment): boolean => T >= 10 && T < 19 && D.meteo.precip === 0 && D.doy >= 100 && D.doy < 300;
// Linge tendu d'une maison de la colline à son bouquet (jours secs, 9 h – 18 h) : 30 % des maisons l'été, 15 % en demi-saison,
// 5 % l'hiver. Renvoie le générateur prêt pour les pièces, ou null sans linge.
export function hillLaundry(T: number, D: FondMoment, key: string, seed: number): (() => number) | null {
  const rl = fondRng(seed, `linge-colline-${key}`, D.date);
  const part = D.doy >= 150 && D.doy < 270 ? 0.3 : D.doy >= 330 || D.doy < 60 ? 0.05 : 0.15;
  if (D.meteo.precip === 0 && D.meteo.wind < 0.7 && rl() < part && T >= 9 + rl() && T < 17 + rl()) return rl;
  return null;
}
