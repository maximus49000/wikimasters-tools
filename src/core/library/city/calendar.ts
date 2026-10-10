export type YMD = { y: number; m: number; d: number };
// `start` inclus, `end` EXCLU (jour de reprise des cours), au format AAAA-MM-JJ : la comparaison de chaînes suffit.
export type HolidayPeriod = { name: string; start: string; end: string };
export type DayKind = 'school' | 'wednesday' | 'weekend' | 'holiday' | 'public-holiday';
// Fêtes de la scène Ville (vague 1b-ii) : `hours` en minutes, [début, fin) ; une plage ne passe pas minuit (on écrit une ligne par jour).
export type FestivityId = 'new-year' | 'bastille' | 'christmas-eve';
export type Festivity = { id: FestivityId; hours: readonly (readonly [number, number])[] };
export type DayContext = { date: YMD; iso: string; weekday: number; kind: DayKind; schoolOn: boolean; publicHoliday: string | null; festivities: Festivity[] };

const pad = (n: number): string => String(n).padStart(2, '0');
export const isoDate = ({ y, m, d }: YMD): string => `${y}-${pad(m)}-${pad(d)}`;
export const weekdayOf = ({ y, m, d }: YMD): number => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

export function addDays(date: YMD, n: number): YMD {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

// Calendrier grégorien (algorithme de Meeus, Jones et Butcher).
export function easterSunday(year: number): YMD {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { y: year, m: month, d: day };
}

const FIXED: readonly (readonly [number, number, string])[] = [
  [1, 1, 'Jour de l’An'],
  [5, 1, 'Fête du Travail'],
  [5, 8, 'Victoire de 1945'],
  [7, 14, 'Fête nationale'],
  [8, 15, 'Assomption'],
  [11, 1, 'Toussaint'],
  [11, 11, 'Armistice'],
  [12, 25, 'Noël'],
];

export function publicHolidays(year: number, alsaceMoselle = false): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [m, d, name] of FIXED) out[isoDate({ y: year, m, d })] = name;
  const easter = easterSunday(year);
  out[isoDate(addDays(easter, 1))] = 'Lundi de Pâques';
  out[isoDate(addDays(easter, 39))] = 'Ascension';
  out[isoDate(addDays(easter, 50))] = 'Lundi de Pentecôte';
  if (alsaceMoselle) {
    out[isoDate(addDays(easter, -2))] = 'Vendredi saint';
    out[isoDate({ y: year, m: 12, d: 26 })] = 'Saint-Étienne';
  }
  return out;
}

// Ajouter une fête = ajouter une ligne (un id peut avoir plusieurs jours).
export const FESTIVITIES: readonly { id: FestivityId; m: number; d: number; hours: Festivity['hours'] }[] = [
  { id: 'new-year', m: 12, d: 31, hours: [[1290, 1440]] },
  { id: 'new-year', m: 1, d: 1, hours: [[0, 30]] },
  { id: 'bastille', m: 7, d: 14, hours: [[1260, 1440]] },
  { id: 'christmas-eve', m: 12, d: 24, hours: [[0, 1440]] },
  { id: 'christmas-eve', m: 12, d: 25, hours: [[0, 720]] },
];

export const festivitiesOn = ({ m, d }: YMD): Festivity[] => FESTIVITIES.filter((f) => f.m === m && f.d === d).map(({ id, hours }) => ({ id, hours }));

export function activeFestivities(list: readonly Festivity[], minute: number): FestivityId[] {
  const ids = list.filter((f) => f.hours.some(([a, b]) => minute >= a && minute < b)).map((f) => f.id);
  return ids.filter((id, i) => ids.indexOf(id) === i);
}

export function dayContext(date: YMD, periods: HolidayPeriod[], alsaceMoselle = false): DayContext {
  const iso = isoDate(date);
  const weekday = weekdayOf(date);
  const publicHoliday = publicHolidays(date.y, alsaceMoselle)[iso] ?? null;
  const onVacation = periods.some((p) => iso >= p.start && iso < p.end);
  const kind: DayKind = publicHoliday ? 'public-holiday' : weekday === 0 || weekday === 6 ? 'weekend' : onVacation ? 'holiday' : weekday === 3 ? 'wednesday' : 'school';
  return { date, iso, weekday, kind, schoolOn: kind === 'school' || kind === 'wednesday', publicHoliday, festivities: festivitiesOn(date) };
}
