import type { DayContext } from './calendar';
import type { Household } from './households';
import type { Shift } from './labour-law';
import { nannyLeavePlan } from './leave-plan';
import { dayRng, traitsOf, type SchoolKind } from './person-traits';
import { isoWeek } from './scene-day';
import { withDrop, type Duty, type WorkDay } from './work-day';

// École et logistique des enfants (port de `ecoleDuJour`, `coursDuJour` et de la logistique `LOG` de la maquette « lever des
// habitants », notes § École, § Dépose, § Sortie d'école, § Nounou). Un seul parent suffit à la dépose, un seul à la sortie.
// - École (3–10 ans) : 8 h 20 – 16 h 30 les jours d'école ; le mercredi, centre de loisirs l'après-midi, sortie à 16 h 30.
// - Crèche (moins de 3 ans) : 8 h 30 – 16 h 30, tous les jours ouvrés, vacances scolaires comprises.
// - Collège, lycée (11 ans et plus) et études supérieures : seuls, horaires des traits ; la fac, les jours ouvrés seulement.
// - Dépose : un parent libre ; sinon un cadre, qui décale son arrivée (`withDrop`) ; sinon un non-cadre qui commence assez tard.
// - Sortie : un parent libre ou rentré à 16 h 20 ; sinon la nounou (si elle n'est pas en congé) jusqu'au retour du premier
//   parent ; sinon garderie jusqu'au premier retour, 18 h 30 au plus tard (le parent quitte alors son travail plus tôt).

export const SCHOOL = {
  drop: 500, pickup: 990, walk: 10, kidPrep: 40, garderieMax: 1110, nannyArrive: 965, nannyHome: 1000,
  nannyLeave: [5, 10], collegeWalk: 15, crecheStart: 510, autonomousAge: 11,
} as const;

export type SchoolDay = { kind: SchoolKind; start: number; end: number; autonomous: boolean; wednesday: boolean };
// parent : le membre `m` va chercher à 16 h 30 ; nanny : la nounou, jusqu'à `until`, relayée par le membre `relay` ;
// garderie : le membre `m` passe à la garderie à `at`.
export type Pickup = { by: 'parent'; m: number } | { by: 'nanny'; until: number; relay: number } | { by: 'garderie'; m: number; at: number };
// `drop` : membre qui dépose (null : accueil du matin, aucun parent disponible).
export type SchoolRun = { drop: number | null; pickup: Pickup };

const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];
const workingDay = (day: DayContext): boolean => WEEKDAYS.includes(day.weekday) && !day.publicHoliday;

/** Journée d'école ou de cours du membre `m` (enfant, étudiant) ; null sans école ce jour-là. */
export function schoolDayOf(hh: Household, m: number, day: DayContext): SchoolDay | null {
  const school = traitsOf(hh, m).school;
  if (!school) return null;
  const { kind } = school;
  const wednesday = day.weekday === 3;
  if (kind === 'creche') {
    if (!workingDay(day)) return null;
    return { kind, start: SCHOOL.crecheStart, end: SCHOOL.pickup, autonomous: false, wednesday: false };
  }
  if (kind === 'ecole') {
    if (!day.schoolOn) return null;
    return { kind, start: SCHOOL.drop, end: SCHOOL.pickup, autonomous: false, wednesday };
  }
  if (kind === 'college' ? !day.schoolOn : !workingDay(day)) return null;
  const i = day.weekday - 1;
  const start = school.start[i]!;
  if (start === -1) return null;
  return { kind, start, end: school.end[i]!, autonomous: true, wednesday };
}

const workOf = (d: Duty | null | undefined): WorkDay | null => (d?.kind === 'work' ? d.w : null);
const backHome = (w: WorkDay): number => w.end + w.commute;

// Fin du travail avancée pour être rentré (en passant par la garderie) à `at` : services coupés à `at − trajet`.
function endBy(w: WorkDay, at: number): WorkDay {
  const end = at - w.commute;
  if (w.end <= end) return w;
  const shifts: Shift[] = w.shifts.filter(([a]) => a < end).map(([a, b]): Shift => [a, Math.min(b, end)]);
  if (!shifts.length) return w;
  return { ...w, shifts, end: shifts[shifts.length - 1]![1], effective: shifts.reduce((n, [a, b]) => n + b - a, 0) };
}

/** Logistique du jour : qui dépose, qui va chercher (et devoirs de travail ajustés) ; run null sans enfant à accompagner. */
export function schoolRunOf(hh: Household, day: DayContext, duties: readonly (Duty | null)[]): { run: SchoolRun | null; duties: (Duty | null)[] } {
  const out = duties.slice();
  const kids = hh.members.map((_, m) => ({ m, s: schoolDayOf(hh, m, day) }))
    .filter((k): k is { m: number; s: SchoolDay } => !!k.s && !k.s.autonomous);
  const parents = [...new Set(kids.flatMap(({ m }) => hh.members[m]!.who.parents))].filter((p) => hh.members[p]);
  if (!kids.length || !parents.length) return { run: null, duties: out };
  const r = dayRng(hh.seed, 0, day.iso, 'ecole');
  const pick = (list: number[]): number => list[Math.floor(r() * list.length)]!;
  const dropEnd = Math.max(...kids.map(({ s }) => s.start));

  // Dépose : un parent libre ; sinon un cadre (horaire souple) ; sinon un non-cadre qui commence assez tard.
  const free = parents.filter((p) => !workOf(out[p]));
  let cand = free.length ? free : parents.filter((p) => hh.members[p]!.who.status === 'cadre' && workOf(out[p]));
  if (!cand.length) cand = parents.filter((p) => { const w = workOf(out[p]); return !!w && w.start >= dropEnd + w.commute; });
  const drop = cand.length ? pick(cand) : null;
  if (drop !== null) {
    const w = workOf(out[drop]);
    if (w) out[drop] = { kind: 'work', w: withDrop(w, hh.members[drop]!.who.status === 'cadre', dropEnd) };
  }

  // Sortie : un parent libre ou rentré à 16 h 20 ; sinon la nounou ; sinon garderie jusqu'au premier retour.
  const ready = parents.filter((p) => { const w = workOf(out[p]); return !w || backHome(w) <= SCHOOL.pickup - SCHOOL.walk; });
  let pickup: Pickup;
  if (ready.length) pickup = { by: 'parent', m: pick(ready) };
  else {
    const first = parents.slice().sort((a, b) => backHome(workOf(out[a])!) - backHome(workOf(out[b])!))[0]!;
    const back = backHome(workOf(out[first])!);
    const isoYear = Math.floor(isoWeek(day.date, day.weekday).week / 100);
    const nanny = !!hh.nanny && nannyLeavePlan(hh, isoYear).get(day.iso) !== 'CP';
    if (nanny) {
      const [lo, hi] = SCHOOL.nannyLeave;
      pickup = { by: 'nanny', until: back + lo + Math.floor(r() * (hi - lo + 1)), relay: first };
    } else {
      const at = Math.max(SCHOOL.pickup, Math.min(back, SCHOOL.garderieMax));
      out[first] = { kind: 'work', w: endBy(workOf(out[first])!, at) };
      pickup = { by: 'garderie', m: first, at };
    }
  }
  return { run: { drop, pickup }, duties: out };
}
