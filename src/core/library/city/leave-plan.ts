import { hashString, mulberry32 } from '../scene-world';
import { addDays, isoDate, publicHolidays, weekdayOf, type HolidayPeriod, type YMD } from './calendar';
import type { Dwelling, Household } from './households';
import { traitsOf } from './person-traits';

// Congés payés et RTT de chaque actif sur une année ISO, puis départs en vacances du foyer (port de `planConges` de la maquette
// « lever des habitants », notes § Contrats et congés). Tout est tiré de la graine du foyer et de l'année : aucun état.
// - CP : 25 jours ouvrés par an ; parents : 3 semaines d'été consécutives + Noël + une semaine de petites vacances ; sans
//   enfant : 2 ou 3 semaines l'été + une semaine d'hiver ; le reste en jours épars. Les SEMAINES d'un couple (membres 0 et 1
//   conjoints) sont tirées une fois et partagées ; les jours épars et les RTT sont propres à chacun.
// - Jours travaillés : lundi → vendredi, mardi → samedi en restauration (HCR) ; un jour férié n'est jamais un CP.
// - Départ en vacances (`away`, propositions du constructeur) : tous les actifs en CP toute la semaine ISO, puis un tirage.

// Semaines ISO des vacances scolaires (zone C de la maquette), FIXES : le modèle reste déterministe sans le calendrier du
// relais. Une semaine 53 (31 décembre 2026 → 3 janvier 2027) prolonge Noël : vacances, et CP pour qui prend la semaine 52.
export const SCHOOL_WEEKS = { hiver: [8, 9], printemps: [16, 17], ete: [28, 29, 30, 31, 32, 33, 34, 35], toussaint: [43, 44], noel: [52] } as const;
const HOLIDAY_WEEKS: ReadonlySet<number> = new Set([...Object.values(SCHOOL_WEEKS).flat(), 53]);

export type Leave = 'CP' | 'RTT';
// home : à la maison ; leaves : part ce samedi à `at` ; away : parti toute la journée ; returns : rentre ce dimanche à `at`.
export type AwayState = 'home' | 'leaves' | 'away' | 'returns';

const CP_DAYS = 25;
// Jours épars et RTT : vendredi 60 %, lundi 20 %, mardi → jeudi 20 %.
const ISOLATED = { friday: 0.6, monday: 0.8, tries: 200 } as const;
const SMALL_WEEKS: readonly number[] = [...SCHOOL_WEEKS.hiver, ...SCHOOL_WEEKS.printemps, ...SCHOOL_WEEKS.toussaint];
const WINTER_WEEKS: readonly number[] = [52, 1, 7, 8, 9];
const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];
// Départs : actifs tous en CP + tirage (famille en vacances scolaires : plus) ; foyer sans actif : par semaine, plus l'été,
// étudiants en vacances scolaires ; départ le samedi d'avant, retour le dernier dimanche (minutes).
const AWAY = { p: 0.6, familyHoliday: 0.8, idle: 0.04, summer: 1.5, studentHoliday: 0.3, leave: [600, 690], back: [960, 1140] } as const;

type Rng = () => number;
const int5 = (rng: Rng, [lo, hi]: readonly [number, number]): number => Math.round((lo + rng() * (hi - lo)) / 5) * 5;
const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length)]!;
const memberMix = (m: number): number => Math.imul(m + 1, 0x9e3779b1);

// Lundi de la semaine ISO `w` de l'année ISO `year` (le 4 janvier est toujours en semaine 1).
function mondayOf(year: number, w: number): YMD {
  const jan4 = { y: year, m: 1, d: 4 };
  return addDays(jan4, (w - 1) * 7 - ((weekdayOf(jan4) + 6) % 7));
}
// Année ISO et numéro de semaine d'une date (d'après son jeudi).
function isoWeekOf(date: YMD): { year: number; w: number } {
  const thursday = addDays(date, 3 - ((weekdayOf(date) + 6) % 7));
  const dayOfYear = (Date.UTC(thursday.y, thursday.m - 1, thursday.d) - Date.UTC(thursday.y, 0, 1)) / 86400000;
  return { year: thursday.y, w: Math.floor(dayOfYear / 7) + 1 };
}
const holidaysByYear = new Map<number, Record<string, string>>();
const isPublicHoliday = (date: YMD): boolean => {
  let h = holidaysByYear.get(date.y);
  if (!h) holidaysByYear.set(date.y, (h = publicHolidays(date.y)));
  return h[isoDate(date)] !== undefined;
};
const hasKids = (hh: Household): boolean => hh.members.some((x) => x.who.status === 'enfant');
// Membres 0 et 1 conjoints : ils partagent leurs semaines de CP.
const pairOf = (hh: Household, m: number): boolean => m <= 1 && hh.members[0]?.who.partner === 1;

// Semaines de CP tirées pour le membre `m` (partagées entre conjoints : même flux, indépendant de `m`).
function leaveWeeks(hh: Household, m: number, year: number): number[] {
  const shared = pairOf(hh, m);
  const rng = mulberry32((hh.seed ^ hashString('leave') ^ year ^ (shared ? 0 : memberMix(m))) >>> 0);
  if (hasKids(hh)) {
    const start = SCHOOL_WEEKS.ete[Math.floor(rng() * (SCHOOL_WEEKS.ete.length - 2))]!;
    return [start, start + 1, start + 2, ...SCHOOL_WEEKS.noel, pick(SMALL_WEEKS, rng)];
  }
  const n = rng() < 0.5 ? 2 : 3;
  const start = 27 + Math.floor(rng() * (36 - 27 - n));
  return [...Array.from({ length: n }, (_, i) => start + i), pick(WINTER_WEEKS, rng)];
}

// Plan d'une année : semaines de CP, jours épars jusqu'à 25 CP, puis `rtt` RTT isolés.
function buildPlan(weeks: readonly number[], days: readonly number[], rtt: number, year: number, rng: Rng): Map<string, Leave> {
  const out = new Map<string, Leave>();
  const worked = (date: YMD) => days.includes(weekdayOf(date)) && !isPublicHoliday(date);
  // Semaine 53 (si l'année ISO en a une) : suite de Noël pour qui prend la semaine 52.
  const all = weeks.includes(52) && isoWeekOf(mondayOf(year, 53)).w === 53 ? [...weeks, 53] : weeks;
  for (const w of all) {
    const monday = mondayOf(year, w);
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      if (worked(date) && !out.has(isoDate(date))) out.set(isoDate(date), 'CP');
    }
  }
  const isolated = (type: Leave): void => {
    for (let t = 0; t < ISOLATED.tries; t++) {
      const w = 1 + Math.floor(rng() * 52);
      const x = rng();
      const wd = x < ISOLATED.friday ? 5 : x < ISOLATED.monday ? 1 : 2 + Math.floor(rng() * 3);
      const date = addDays(mondayOf(year, w), wd - 1);
      if (worked(date) && !out.has(isoDate(date))) { out.set(isoDate(date), type); return; }
    }
    // Repli (jamais atteint en pratique) : premier jour travaillé libre de l'année.
    for (let i = 0; i < 52 * 7; i++) {
      const date = addDays(mondayOf(year, 1), i);
      if (worked(date) && !out.has(isoDate(date))) { out.set(isoDate(date), type); return; }
    }
  };
  let cp = [...out.values()].length;
  while (cp < CP_DAYS) { isolated('CP'); cp++; }
  for (let r = 0; r < rtt; r++) isolated('RTT');
  return out;
}

const EMPTY: ReadonlyMap<string, never> = new Map<string, never>();
const plans = new WeakMap<Household, Map<string, ReadonlyMap<string, Leave>>>();
const memo = <T extends ReadonlyMap<string, Leave>>(hh: Household, key: string, make: () => T): T => {
  let byKey = plans.get(hh);
  if (!byKey) plans.set(hh, (byKey = new Map()));
  let plan = byKey.get(key);
  if (!plan) byKey.set(key, (plan = make()));
  return plan as T;
};

/** Congés (date ISO → CP | RTT) du membre `m` sur l'année ISO `isoYear` ; vide pour un non-actif. Mémoïsé par foyer. */
export function leavePlanOf(hh: Household, m: number, isoYear: number): ReadonlyMap<string, Leave> {
  const work = traitsOf(hh, m).work;
  if (!work) return EMPTY;
  return memo(hh, `${m}|${isoYear}`, () => {
    const rng = mulberry32((hh.seed ^ hashString('leave-days') ^ isoYear ^ memberMix(m)) >>> 0);
    return buildPlan(leaveWeeks(hh, m, isoYear), work.split?.days ?? WEEKDAYS, work.rttPerYear, isoYear, rng);
  });
}

/** Congés de la nounou du foyer (particulier employeur, lundi → vendredi) : semaines du couple, jours épars à elle ; vide sans nounou. */
export function nannyLeavePlan(hh: Household, isoYear: number): ReadonlyMap<string, 'CP'> {
  if (!hh.nanny) return EMPTY;
  return memo(hh, `nanny|${isoYear}`, () => {
    const rng = mulberry32((hh.seed ^ hashString('leave-nanny') ^ isoYear) >>> 0);
    return buildPlan(leaveWeeks(hh, 0, isoYear), WEEKDAYS, 0, isoYear, rng) as Map<string, 'CP'>;
  });
}

/** Congé du membre `m` à une date (lu sur le plan de l'année ISO de la date), sinon null. */
export function leaveOn(hh: Household, m: number, date: YMD): Leave | null {
  return leavePlanOf(hh, m, isoWeekOf(date).year).get(isoDate(date)) ?? null;
}

// Semaine ISO (année, numéro) où le foyer est parti, et ses heures de départ (samedi d'avant) et de retour (dimanche).
function awayWeek(d: Pick<Dwelling, 'key' | 'hh'>, seed: number, year: number, w: number): { away: boolean; leave: number; back: number } {
  const rng = mulberry32((seed ^ hashString('away') ^ d.key ^ (year * 100 + w)) >>> 0);
  const rAway = rng();
  const leave = int5(rng, AWAY.leave);
  const back = int5(rng, AWAY.back);
  const { hh } = d;
  const monday = mondayOf(year, w);
  const holiday = HOLIDAY_WEEKS.has(w);
  const actives = hh.members.map((_, m) => m).filter((m) => traitsOf(hh, m).work);
  let p: number;
  if (actives.length) {
    // Tous les actifs en CP chacun de leurs jours travaillés de la semaine (fériés exceptés) ; en HCR, le samedi d'avant aussi
    // (le départ a lieu ce jour-là).
    const allLeave = actives.every((m) => {
      const days = traitsOf(hh, m).work!.split?.days ?? WEEKDAYS;
      for (let i = -2; i < 6; i++) {
        const date = addDays(monday, i);
        if (i === -1 || !days.includes(weekdayOf(date)) || isPublicHoliday(date)) continue;
        if (leaveOn(hh, m, date) !== 'CP') return false;
      }
      return true;
    });
    p = !allLeave ? 0 : hasKids(hh) && holiday ? AWAY.familyHoliday : AWAY.p;
  } else {
    const students = hh.members.every((x) => x.who.status === 'etudiant');
    const thursday = addDays(monday, 3);
    p = students && holiday ? AWAY.studentHoliday : AWAY.idle * (thursday.m === 7 || thursday.m === 8 ? AWAY.summer : 1);
  }
  // Enfants scolarisés : jamais de départ hors des vacances scolaires, même si des CP épars couvrent toute la semaine.
  if (hasKids(hh) && !holiday) p = 0;
  return { away: rAway < p, leave, back };
}

/** État du foyer ce jour-là : semaine W partie ⇒ samedi d'avant `leaves`, dimanche d'avant → samedi de W `away`, dimanche de W
 *  `returns` (sinon `away` si W + 1 l'est aussi). `at` : heure du départ (`leaves`) ou du retour (`returns`). Vacances
 *  scolaires : semaines fixes (`SCHOOL_WEEKS`) ; `_periods` est ignoré, gardé pour l'interface du plan. */
export function awayState(d: Pick<Dwelling, 'key' | 'hh'>, seed: number, date: YMD, _periods: readonly HolidayPeriod[] = []): { state: AwayState; at?: number } {
  const wd = weekdayOf(date);
  const cur = isoWeekOf(date);
  const nxt = isoWeekOf(addDays(date, 7));
  const thisWeek = awayWeek(d, seed, cur.year, cur.w);
  if (wd >= 1 && wd <= 5) return { state: thisWeek.away ? 'away' : 'home' };
  if (wd === 6 && thisWeek.away) return { state: 'away' };
  const nextWeek = awayWeek(d, seed, nxt.year, nxt.w);
  if (wd === 6) return nextWeek.away ? { state: 'leaves', at: nextWeek.leave } : { state: 'home' };
  if (nextWeek.away) return { state: 'away' };
  return thisWeek.away ? { state: 'returns', at: thisWeek.back } : { state: 'home' };
}
