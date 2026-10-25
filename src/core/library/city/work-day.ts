import type { DayContext } from './calendar';
import type { Household } from './households';
import { LAW, type Shift } from './labour-law';
import { leaveOn } from './leave-plan';
import { dayRng, traitsOf } from './person-traits';

// Journée de travail du jour de chaque actif (port de `travailDuJour`, `journee` et `amenage` de la maquette « lever des
// habitants », notes § Droit du travail et § Horaires coupés). Tirée sur le flux `dayRng(graine, membre, date, 'work')`,
// dans l'ordre de la maquette : préparation, flex du cadre, journée longue, pause, midi. Aucun état d'un jour à l'autre.
// - Cadre : début du trait ± 15 (pas de 5), déjeuner entre 12 h et 13 h, pause du trait ± 15 bornée [45, 90], journée
//   longue 12 % des jours (+ 30 – 60 min), fin à 19 h 30 au plus tard.
// - Non-cadre : début fixe, pause de 30 min après 3 h 30 – 4 h 30 de travail.
// - Restauration (HCR) : deux services fixes, mardi → samedi, retour à la maison pendant la coupure 3 fois sur 4.

export type WorkDay = {
  shifts: Shift[]; start: number; end: number; effective: number; commute: number; prep: number; walk: boolean;
  split: boolean; homeAtBreak: boolean; long: boolean; drop: boolean;
};
// `off` : week-end, jour férié, jour de repos en restauration.
export type Duty = { kind: 'work'; w: WorkDay } | { kind: 'leave'; leave: 'CP' | 'RTT' } | { kind: 'sick' } | { kind: 'off' };

const WORK = {
  prepNoise: 5, cadreFlex: 15, long: { p: 0.12, extra: [30, 60] }, pauseNoise: 15, cadrePause: [45, 90],
  lunch: [720, 780], morning: [210, 270], morningMin: 120, cadreEndMax: 1170, homeAtBreak: 0.75,
} as const;
// Malade (proposition du constructeur) : 1,5 % des jours par adulte, jamais un enfant.
const SICK_P = 0.015;
// Dépose à l'école : 8 h 20.
const DROP_AT = 500;
const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];

type Rng = () => number;
const int5 = (rng: Rng, lo: number, hi: number): number => Math.round((lo + rng() * (hi - lo)) / 5) * 5;

type ContinuousInput = {
  start: number; effective: number; pause: number; morning: number; commute: number; prep: number;
  walk: boolean; cadre: boolean; long: boolean;
};

/** Journée continue avec pause déjeuner : matin dans [120, 360], après-midi ≤ 6 h, effectif ≤ 10 h, fin ≤ 19 h 30 (cadre). */
export function continuousDay(o: ContinuousInput): WorkDay {
  const morning = Math.max(WORK.morningMin, Math.min(LAW.noBreakMax, o.morning));
  let effective = Math.min(o.effective, LAW.dayMax, morning + LAW.noBreakMax);
  if (o.cadre) effective = Math.min(effective, WORK.cadreEndMax - o.start - o.pause);
  const lunch = o.start + morning;
  const shifts: Shift[] = [[o.start, lunch], [lunch + o.pause, o.start + effective + o.pause]];
  return arrange(shifts, { commute: o.commute, prep: o.prep, walk: o.walk, split: false, homeAtBreak: false, long: o.long, drop: false });
}

// Port de `amenage` : début, fin et effectif lus sur les services.
function arrange(shifts: Shift[], rest: Omit<WorkDay, 'shifts' | 'start' | 'end' | 'effective'>): WorkDay {
  return {
    shifts, start: shifts[0]![0], end: shifts[shifts.length - 1]![1],
    effective: shifts.reduce((n, [a, b]) => n + b - a, 0), ...rest,
  };
}

/** Jour de dépose à l'école : début repoussé à 8 h 20 + trajet (jamais avancé), matin raccourci d'autant, journée recalculée. */
export function withDrop(w: WorkDay, cadre: boolean): WorkDay {
  const start = Math.max(w.start, DROP_AT + w.commute);
  if (w.split || start === w.start) return { ...w, drop: true };
  const first = w.shifts[0]!;
  const second = w.shifts[1]!;
  const morning = first[1] - first[0] - (start - w.start);
  const pause = second[0] - first[1];
  const day = continuousDay({ start, effective: w.effective, pause, morning, commute: w.commute, prep: w.prep, walk: w.walk, cadre, long: w.long });
  return { ...day, drop: true };
}

/** Malade ce jour-là : 1,5 % des jours d'un adulte, jamais un enfant (flux `sick`). */
export function sickOn(hh: Household, m: number, iso: string): boolean {
  if (hh.members[m]?.who.status === 'enfant') return false;
  return dayRng(hh.seed, m, iso, 'sick')() < SICK_P;
}

/** Obligation de travail du membre `m` ce jour-là ; null s'il n'est pas actif. */
export function dutyOf(hh: Household, m: number, day: DayContext): Duty | null {
  const t = traitsOf(hh, m);
  const work = t.work;
  if (!work) return null;
  const days = work.split?.days ?? WEEKDAYS;
  if (day.publicHoliday || !days.includes(day.weekday)) return { kind: 'off' };
  const leave = leaveOn(hh, m, day.date);
  if (leave) return { kind: 'leave', leave };
  if (sickOn(hh, m, day.iso)) return { kind: 'sick' };
  return { kind: 'work', w: workDay(hh, m, day.iso) };
}

function workDay(hh: Household, m: number, iso: string): WorkDay {
  const t = traitsOf(hh, m);
  const work = t.work!;
  const cadre = hh.members[m]!.who.status === 'cadre';
  const r = dayRng(hh.seed, m, iso, 'work');
  const prep = t.prep + Math.round(-WORK.prepNoise + r() * 2 * WORK.prepNoise);
  const { commute, walk } = t;
  if (work.split) {
    const shifts: Shift[] = [[work.split.a[0], work.split.a[1]], [work.split.b[0], work.split.b[1]]];
    return arrange(shifts, { commute, prep, walk, split: true, homeAtBreak: r() < WORK.homeAtBreak, long: false, drop: false });
  }
  const start = work.start + (cadre ? int5(r, -WORK.cadreFlex, WORK.cadreFlex) : 0);
  const extra = cadre && r() < WORK.long.p ? int5(r, WORK.long.extra[0], WORK.long.extra[1]) : 0;
  const pause = cadre
    ? Math.min(WORK.cadrePause[1], Math.max(WORK.cadrePause[0], t.pause + int5(r, -WORK.pauseNoise, WORK.pauseNoise)))
    : t.pause;
  // Minutes de travail avant la pause : déjeuner entre 12 h et 13 h (cadre), sinon 3 h 30 – 4 h 30 après l'embauche.
  const morning = cadre ? int5(r, WORK.lunch[0], WORK.lunch[1]) - start : int5(r, WORK.morning[0], WORK.morning[1]);
  return continuousDay({ start, effective: work.effective + extra, pause, morning, commute, prep, walk, cadre, long: extra > 0 });
}
