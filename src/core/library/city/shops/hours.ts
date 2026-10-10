import { addDays, isoDate, publicHolidays, weekdayOf, type YMD } from '../calendar';
import type { ShopDef } from './catalog';

// Jours comptés depuis le 1970-01-01 (date locale, sans fuseau) : unité du cycle de vie des commerces.
export const dayNumber = ({ y, m, d }: YMD): number => Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
export function ymdOfDay(n: number): YMD {
  const date = new Date(n * 86_400_000);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

const holidayOf = (date: YMD): boolean => isoDate(date) in publicHolidays(date.y);

// Jour où une équipe peut venir : ni dimanche ni jour férié.
export const isWorkday = (n: number): boolean => {
  const date = ymdOfDay(n);
  return weekdayOf(date) !== 0 && !holidayOf(date);
};
export function nextWorkday(n: number): number {
  let day = n;
  while (!isWorkday(day)) day++;
  return day;
}

// Plages d'un jour donné (dimanche : plages propres s'il y en a) ; aucune si le commerce est fermé ce jour-là.
export function rangesOf(def: ShopDef, date: YMD): readonly (readonly [number, number])[] {
  const weekday = weekdayOf(date);
  if (!def.days.includes(weekday)) return [];
  if (!def.holidays && holidayOf(date)) return [];
  return weekday === 0 && def.sundayHours ? def.sundayHours : def.hours;
}

// Ouvert à `minutes` (0..1439) du jour `date` : plages du jour, ou fin d'une plage de la veille qui passe minuit.
export function isOpenAt(def: ShopDef, date: YMD, minutes: number): boolean {
  if (rangesOf(def, date).some(([a, b]) => minutes >= a && minutes < b)) return true;
  return rangesOf(def, addDays(date, -1)).some(([, b]) => b > 1440 && minutes < b - 1440);
}

// Plage d'ouverture en cours à `minutes` : [ouverture, fermeture] en minutes du jour `date` (une plage de la veille qui passe
// minuit est ramenée à ce jour : ouverture négative) ; null si le commerce est fermé. Même règle que isOpenAt.
export function openRangeAt(def: ShopDef, date: YMD, minutes: number): [number, number] | null {
  const today = rangesOf(def, date).find(([a, b]) => minutes >= a && minutes < b);
  if (today) return [today[0], today[1]];
  const carried = rangesOf(def, addDays(date, -1)).find(([, b]) => b > 1440 && minutes < b - 1440);
  return carried ? [carried[0] - 1440, carried[1] - 1440] : null;
}

// Affluence (0..1) selon la forme de clientèle, multipliée par `level` ; l'ouverture est vérifiée à part (isOpenAt).
export function crowdAt(def: ShopDef, minutes: number): number {
  const h = (((minutes % 1440) + 1440) % 1440) / 60;
  const bump = (center: number, width: number): number => Math.max(0, 1 - Math.abs(h - center) / width);
  let shape: number;
  switch (def.crowd) {
    case 'morning': shape = Math.max(bump(8, 2), bump(12.5, 1.5), 0.3); break;
    case 'meals': shape = Math.max(bump(8, 1.5) * 0.7, bump(12.75, 1.5), bump(20, 2), 0.15); break;
    case 'afternoon': shape = Math.max(bump(16, 3), 0.25); break;
    case 'after-school': shape = Math.max(bump(17, 1.5), 0.25); break;
    case 'evening': shape = Math.max(bump(19, 3), 0.2); break;
    case 'night': shape = h >= 22 || h < 4 ? 1 : h >= 18 ? 0.5 : 0; break;
    case 'allday': shape = 0.6; break;
    default: shape = Math.max(bump(11, 3), bump(17.5, 2), 0.35);
  }
  return Math.min(1, shape * def.level);
}
