import { hashString, mulberry32 } from '../scene-world';
import type { DayContext } from './calendar';
import type { HomeTone } from './facade-layout';

// Fenêtres allumées des immeubles de la Ville : un rythme de logements, distinct de l'activité des passants (activity.ts).
// Part des fenêtres allumées QUAND IL FAIT SOMBRE, par heure : presque rien entre 2 h et 4 h, montée dès 6 h, pic du soir.
// Le week-end, on se lève plus tard (matins du samedi, du dimanche et des jours fériés) et on se couche plus tard
// (soirées du vendredi et du samedi).
type Keys = readonly (readonly [number, number])[];

const MORNING: Keys = [[0, 0.22], [1, 0.08], [2, 0.02], [3, 0.01], [4, 0.01], [5, 0.04], [6, 0.2], [7, 0.45], [8, 0.5], [9, 0.35], [10, 0.25], [12, 0.25]];
const MORNING_LIE_IN: Keys = [[0, 0.38], [1, 0.22], [2, 0.07], [3, 0.02], [4, 0.02], [5, 0.02], [6, 0.04], [7, 0.1], [8, 0.22], [9, 0.38], [10, 0.3], [12, 0.3]];

const evening = (lieIn: boolean, late: boolean): Keys => {
  const day = lieIn ? 0.3 : 0.25;
  return [[12, day], [16, day], [18, 0.5], [20, 0.8], [21, 0.85], [22, late ? 0.85 : 0.65], [23, late ? 0.65 : 0.4], [24, late ? 0.38 : 0.22]];
};

function interpolate(keys: Keys, hours: number): number {
  for (let i = 1; i < keys.length; i++) {
    const [h1, a1] = keys[i]!;
    const [h0, a0] = keys[i - 1]!;
    if (hours <= h1) return a0 + ((a1 - a0) * (hours - h0)) / (h1 - h0);
  }
  return keys[keys.length - 1]![1];
}

export type WindowDay = Pick<DayContext, 'weekday' | 'kind'>;

// Sans jour connu (pas de contexte de ville) : rythme de semaine.
export function windowsLitFraction(minutes: number, day: WindowDay | undefined): number {
  const hours = (((minutes % 1440) + 1440) % 1440) / 60;
  const lieIn = day !== undefined && (day.kind === 'weekend' || day.kind === 'public-holiday');
  if (hours < 12) return interpolate(lieIn ? MORNING_LIE_IN : MORNING, hours);
  const late = day !== undefined && (day.weekday === 5 || day.weekday === 6);
  return interpolate(evening(lieIn, late), hours);
}

// Obscurité du ciel vue des logements : 1 tant qu'il fait sombre, 0 en plein jour. Le jour qui se lève éteint les fenêtres
// une à une (les seuils les plus hauts d'abord).
export const nightness = (daylight: number): number => Math.min(1, Math.max(0, (0.7 - daylight) / 0.5));
// Un ciel de mauvais temps compte comme sombre.
const darkness = (daylight: number, gloom: boolean): number => (gloom ? 1 : nightness(daylight));

// Chaque fenêtre a un seuil u ∈ [0,1) tiré de sa graine : allumée quand la part du moment dépasse ce seuil.
export const windowLit = (u: number, minutes: number, day: WindowDay | undefined, daylight: number, gloom: boolean): boolean =>
  u < windowsLitFraction(minutes, day) * darkness(daylight, gloom);

// Pièce seule : une famille n'allume souvent qu'une pièce (sa pièce principale). Part des logements allumés dans ce cas,
// par heure : la moitié la nuit, peu au dîner (toute la famille est debout), de nouveau la moitié après 22 h.
const SOLO: Keys = [[0, 0.5], [5, 0.4], [7, 0.25], [12, 0.3], [18, 0.25], [19.5, 0.2], [20.5, 0.2], [22, 0.5], [24, 0.5]];

export function soloShare(minutes: number): number {
  return interpolate(SOLO, (((minutes % 1440) + 1440) % 1440) / 60);
}

// Tirage par logement (sa clé) et par heure : le logement garde le même choix toute l'heure.
export function soloRoom(key: number, minutes: number): boolean {
  return mulberry32(key ^ Math.imul(Math.floor(minutes / 60) + 1, 2654435761))() < soloShare(minutes);
}

// Pièce d'un logement : le logement est allumé (seuil u commun à ses fenêtres) ; sa pièce principale l'est toujours, les
// autres pièces s'éteignent quand la famille n'en éclaire qu'une.
export function roomLit(win: { u: number; key: number; main: boolean }, minutes: number, day: WindowDay | undefined, daylight: number, gloom: boolean): boolean {
  return windowLit(win.u, minutes, day, daylight, gloom) && (win.main || !soloRoom(win.key, minutes));
}

// Teinte d'une pièce : la télé ne bleuit que la pièce principale ; une famille seule dans sa pièce après 20 h la regarde
// parfois (tirage fixe par logement, 30 %) ; les autres pièces d'un logement « télé » restent d'une lumière chaude.
export function roomTone(home: { key: number; tone: HomeTone }, main: boolean, minutes: number): HomeTone {
  if (!main) return home.tone === 'tv' ? 'warm' : home.tone;
  const hours = (((minutes % 1440) + 1440) % 1440) / 60;
  if (hours >= 20 && soloRoom(home.key, minutes) && mulberry32(home.key ^ hashString('tv'))() < 0.3) return 'tv';
  return home.tone;
}
