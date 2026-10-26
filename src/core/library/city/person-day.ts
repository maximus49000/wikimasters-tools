import { addDays, dayContext, type DayContext } from './calendar';
import type { Dwelling, Household } from './households';
import type { Visitor } from './id-card';
import { LAW, type Shift } from './labour-law';
import { awayState, nannyLeavePlan, type AwayState } from './leave-plan';
import { appointmentOf, dayErrands, eveningOuting, familyErrands, outingGroups, type Appointment, type Block, type Outing } from './outings';
import { dayRng, traitsOf } from './person-traits';
import { isoWeek } from './scene-day';
import { SCHOOL, schoolDayOf, schoolRunOf, type SchoolDay, type SchoolRun } from './school-run';
import { sickOn, dutyOf, type Duty, type WorkDay } from './work-day';

// Journée de chaque habitant (port de la boucle de `modele.js` de la maquette « lever des habitants », étapes 1 à 5) :
// obligations de la veille, du jour et du lendemain (travail, école, cours, rendez-vous, logistique), lever, blocs hors du
// logement, sorties de jour, sortie du soir décidée d'après le lendemain, coucher, nounou. Tout est recalculé : la veille
// (profondeur 1) sert au coucher de la nuit précédente, jamais mémorisée.
//
// Invariant de profondeur 1 : le coucher d'un jour ne dépend que des obligations du jour et du lendemain, de la sortie du
// soir (dont le départ = max(départ tiré, fin des blocs d'obligation commencés avant 19 h 30 + 30)) et du flux `coucher` ;
// jamais du lever ni des sorties de jour. Ainsi `prevBed` de J vaut exactement `bed` de J − 1 − 1440.
//
// Choix (à confirmer) :
// - « Accueil du matin » (aucun parent pour la dépose) : les petits partent avec le dernier parent qui s'en va (il les dépose
//   sur son trajet), jamais seuls au logement.
// - Vacances scolaires, jour ouvré, tous les parents au travail : les écoliers vont au centre de loisirs (mêmes horaires et
//   même logistique que l'école), sinon ils seraient seuls.
// - Parent en restauration rentré pendant la coupure : il ne compte PAS pour la sortie de 16 h 30 (comme la maquette, où le
//   retour est la fin du dernier service). Quand la nounou dépasserait 6 h d'affilée (deux parents en restauration), elle
//   prend sa pause (30 min) pendant qu'un parent est rentré à la coupure, juste avant qu'il reparte (on le fait rentrer si
//   le tirage ne l'avait pas prévu).
// - Un adulte qui sort (courses, rendez-vous…) en laissant seul un enfant de moins de 11 ans l'emmène avec lui.
// - Sortie du soir d'un foyer avec de jeunes enfants : seulement si la nounou peut venir (ni dimanche, ni férié, ni congé).
// - Foyer `away` : ni école, ni rendez-vous, ni travail ; dehors de 0 à 1800. `leaves` : tous partent à `at` ;
//   `returns` : dehors de 0 à `at`.

export type PersonDay = {
  m: number; wake: number; bed: number; prevBed: number; why: string; prepEnd: number | null; dressAt: number; undressAt: number;
  duty: Duty | null; school: SchoolDay | null; outing: Outing | null; appointment: Appointment | null; sick: boolean;
  blocks: Block[]; out: [number, number][];
};
// matin : garde avant l'ouverture de l'accueil du matin ; sortie : sortie d'école ; soir : garde du samedi soir.
export type NannyVisit = { arrive: number; leave: number; reason: 'matin' | 'sortie' | 'soir' };
export type NannyDay = { visitor: Visitor; visits: NannyVisit[]; shifts: Shift[] };
export type HouseholdDays = { iso: string; away: { state: AwayState; at?: number }; people: PersonDay[]; run: SchoolRun | null; nanny: NannyDay | null };

// Valeurs de la maquette (P) et du plan (contraintes globales).
const DAY = {
  free: {
    retiredEarly: [405, 450], retired: [450, 570], unemployed: [450, 600], active: [480, 630], student: [540, 690],
    kid: [420, 495], bigKid: [510, 630],
  },
  catchUp: { minus: 30, plus: 10, max: 780 },
  collegeWalk: 15, kidPrep: 40, kidAge: 11, wednesdayNoon: 690,
  nextFreeFrom: 660, // lendemain « libre » : pas d'obligation avant 11 h
  outingAfter: 30, outingObligationsBefore: 1170, outingMin: 60,
  bed: { noise: 25, free: 20, respect: 0.85, outing: [10, 20], kidNoise: 10, kidFree: 30, kidAnchor: 450, afterDay: 45, kidAfterDay: 20 },
  dress: [25, 75], dressBefore: 12, undress: 15, undressNight: 10,
  leavesPack: 30, // préparation des bagages avant le départ en vacances
  homeDetour: 20, // dépose : on repasse au logement s'il reste au moins 20 min avant le trajet du travail
  nannyBreak: 30, nannyLeave: [5, 10],
} as const;

type Rng = () => number;
const int5 = (r: Rng, lo: number, hi: number): number => Math.round((lo + r() * (hi - lo)) / 5) * 5;
const range5 = (r: Rng, [lo, hi]: readonly [number, number]): number => int5(r, lo, hi);
const pad = (n: number): string => String(n).padStart(2, '0');
const hm = (m: number): string => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${Math.floor(x / 60)} h ${pad(x % 60)}`; };
const isKid = (hh: Household, m: number): boolean => hh.members[m]!.who.status === 'enfant';
const isYoung = (hh: Household, m: number): boolean => isKid(hh, m) && hh.members[m]!.who.age < DAY.kidAge;
const workOf = (d: Duty | null | undefined): WorkDay | null => (d?.kind === 'work' ? d.w : null);
const workingDay = (day: DayContext): boolean => day.weekday >= 1 && day.weekday <= 5 && !day.publicHoliday;

// Obligation du matin : lever, départ, stricte (travail, école, dépose) ou non (cours, rendez-vous, départ en vacances).
type Ob = { lever: number; dep: number; strict: boolean; why: string };
type NannyPlan = { visits: NannyVisit[]; shifts: Shift[] };
// Tout ce qui ne dépend pas du lever : obligations et leurs blocs (le coucher et la sortie du soir s'en déduisent).
type Plan = {
  day: DayContext; away: { state: AwayState; at?: number }; gone: boolean;
  duties: (Duty | null)[]; schools: (SchoolDay | null)[]; appts: (Appointment | null)[]; sick: boolean[];
  run: SchoolRun | null; ob: (Ob | null)[]; blocks: Block[][]; nanny: NannyPlan;
};

function nannyAvailable(hh: Household, day: DayContext): boolean {
  if (!hh.nanny || day.weekday === 0 || day.publicHoliday) return false;
  const iso = day.weekday === 6 ? addDays(day.date, -1) : day.date;
  const isoYear = Math.floor(isoWeek(iso, day.weekday === 6 ? 5 : day.weekday).week / 100);
  const key = `${iso.y}-${pad(iso.m)}-${pad(iso.d)}`;
  return nannyLeavePlan(hh, isoYear).get(key) !== 'CP';
}

const near = (day: DayContext, k: number): DayContext => ({ ...dayContext(addDays(day.date, k), [...(day.periods ?? [])]), periods: day.periods });

// Centre de loisirs : vacances scolaires, jour ouvré, tous les parents des écoliers au travail.
function centreDay(hh: Household, day: DayContext, duties: readonly (Duty | null)[]): boolean {
  if (!workingDay(day) || day.schoolOn) return false;
  const pupils = hh.members.flatMap((_, m) => (traitsOf(hh, m).school?.kind === 'ecole' ? [m] : []));
  const parents = [...new Set(pupils.flatMap((m) => hh.members[m]!.who.parents))].filter((p) => hh.members[p]);
  return pupils.length > 0 && parents.length > 0 && parents.every((p) => workOf(duties[p]));
}

// Fin de la sortie d'école gardée par la nounou ce jour-là (sans garde du matin, qui n'y change rien), sinon −∞. Sert au repos
// quotidien avant une garde du matin le lendemain ; sans récursion (la veille de la veille n'est jamais lue).
function nannyPickupEnd(d: Dwelling, day: DayContext, seed: number): number {
  const { hh } = d;
  if (!hh.nanny || awayState(d, seed, day.date, day.periods ?? []).state !== 'home') return -Infinity;
  const duties0 = hh.members.map((_, m) => dutyOf(hh, m, day));
  const runDay: DayContext = centreDay(hh, day, duties0) ? { ...day, schoolOn: true } : day;
  const pickup = schoolRunOf(hh, runDay, duties0, Infinity).run?.pickup;
  return pickup?.by === 'nanny' ? pickup.until : -Infinity;
}

function planOf(d: Dwelling, day: DayContext, seed: number): Plan {
  const { hh } = d;
  const away = awayState(d, seed, day.date, day.periods ?? []);
  const empty = (): Block[][] => hh.members.map(() => []);
  const nanny: NannyPlan = { visits: [], shifts: [] };
  if (away.state !== 'home') {
    // Départ ou retour de vacances, ou semaine partie : ni école, ni rendez-vous, ni travail (actifs en CP).
    const duties = hh.members.map((_, m) => { const x = dutyOf(hh, m, day); return x?.kind === 'work' || x?.kind === 'sick' ? { kind: 'off' } as Duty : x; });
    const at = away.at ?? 0;
    const trip: Block = away.state === 'away' ? { a: 0, b: 1800, k: 'trip', label: 'en vacances' }
      : away.state === 'leaves' ? { a: at, b: 1800, k: 'trip', label: 'départ en vacances' } : { a: 0, b: at, k: 'trip', label: 'retour de vacances' };
    const ob = hh.members.map((_, m): Ob | null => {
      if (away.state !== 'leaves') return null;
      const prep = isKid(hh, m) ? DAY.kidPrep : traitsOf(hh, m).prep;
      return { lever: at - prep - DAY.leavesPack, dep: at, strict: false, why: `départ en vacances ${hm(at)} − ${prep} min préparation − ${DAY.leavesPack} min bagages` };
    });
    return {
      day, away, gone: away.state !== 'returns', duties, schools: hh.members.map(() => null), appts: hh.members.map(() => null),
      sick: hh.members.map(() => false), run: null, ob, blocks: hh.members.map(() => [{ ...trip }]), nanny,
    };
  }

  const duties0 = hh.members.map((_, m) => dutyOf(hh, m, day));
  const sick = hh.members.map((x, m) => duties0[m]?.kind === 'sick' || (!duties0[m] && x.who.status !== 'enfant' && sickOn(hh, m, day.iso)));
  // Centre de loisirs : vacances scolaires, jour ouvré, tous les parents des écoliers au travail.
  const centre = centreDay(hh, day, duties0);
  const runDay: DayContext = centre ? { ...day, schoolOn: true } : day;
  const { run, duties } = schoolRunOf(hh, runDay, duties0, () => nannyPickupEnd(d, near(day, -1), seed));
  const schools = hh.members.map((_, m) => {
    const kind = traitsOf(hh, m).school?.kind;
    if (kind === 'ecole' || kind === 'creche') return schoolDayOf(hh, m, runDay);
    return sick[m] ? null : schoolDayOf(hh, m, day);
  });
  const appts = hh.members.map((_, m) => (sick[m] ? null : appointmentOf(hh, m, day)));

  // Nounou de la sortie d'école : une seule période de plus de 6 h ⇒ pause pendant qu'un parent est rentré à la coupure.
  const pickup = run?.pickup;
  let nannyPause: [number, number] | null = null;
  if (pickup?.by === 'nanny') {
    if (pickup.until - SCHOOL.pickup > LAW.noBreakMax) {
      const splitters = hh.members.map((_, m) => m).filter((m) => workOf(duties[m])?.split);
      const p = splitters.find((m) => workOf(duties[m])!.homeAtBreak) ?? splitters[0];
      if (p !== undefined) {
        const w = workOf(duties[p])!;
        duties[p] = { kind: 'work', w: { ...w, homeAtBreak: true } };
        const leaveAgain = w.shifts[1]![0] - w.commute;
        nannyPause = [leaveAgain - DAY.nannyBreak, leaveAgain];
      }
    }
    nanny.visits.push({ arrive: SCHOOL.nannyHome, leave: pickup.until, reason: 'sortie' });
    nanny.shifts.push(...(nannyPause ? [[SCHOOL.pickup, nannyPause[0]], [nannyPause[1], pickup.until]] as Shift[] : [[SCHOOL.pickup, pickup.until] as Shift]));
  }

  const blocks = empty();
  const ob: (Ob | null)[] = hh.members.map(() => null);
  const add = (m: number, a: number, b: number, k: Block['k'], label: string): void => { if (b > a) blocks[m]!.push({ a, b, k, label }); };
  const first = (m: number): string => hh.members[m]!.who.first;

  // Petits (crèche, école, centre) : départ commun avec qui dépose, ou avec le dernier parent qui part (accueil du matin).
  const little = hh.members.map((_, m) => m).filter((m) => schools[m] && !schools[m]!.autonomous);
  let kidDep = 0, dropEnd = 0;
  const morning = run?.morning;
  if (run && little.length) {
    const firstStart = Math.min(...little.map((m) => schools[m]!.start));
    dropEnd = Math.max(...little.map((m) => schools[m]!.start));
    kidDep = morning ? morning.dep : firstStart - SCHOOL.walk;
  }
  if (morning?.by === 'nanny') {
    nanny.visits.unshift({ arrive: morning.arrive, leave: morning.dep, reason: 'matin' });
    nanny.shifts.unshift([morning.arrive, morning.dep + SCHOOL.walk]);
  }
  const homeAt = (): number => (pickup && (pickup.by === 'garderie' || (pickup.by === 'parent' && pickup.at !== undefined)) ? pickup.at! : SCHOOL.nannyHome);
  const escortName = run?.drop !== null && run?.drop !== undefined ? first(run.drop) : null;
  const morningLabel = !morning ? '' : morning.by === 'nanny' ? `accueil du matin avec ${hh.nanny!.who.first}`
    : morning.by === 'accueil' ? `accueil du matin avec ${first(morning.m)}` : `chez les grands-parents, avec ${first(morning.m)}`;

  hh.members.forEach((x, m) => {
    const t = traitsOf(hh, m);
    const s = schools[m];
    if (x.who.status === 'enfant') {
      if (!s) return;
      if (s.autonomous) {
        const dep = s.start - DAY.collegeWalk;
        ob[m] = { lever: dep - DAY.kidPrep, dep, strict: true, why: `collège ${hm(s.start)} − ${DAY.collegeWalk} min à pied, seul, − ${DAY.kidPrep} min = ${hm(dep - DAY.kidPrep)}` };
        add(m, dep, s.start, 'commute', 'à pied');
        add(m, s.start, s.end, 'school', 'collège');
        add(m, s.end, s.end + DAY.collegeWalk, 'commute', 'à pied');
        return;
      }
      const place = s.kind === 'creche' ? 'crèche' : centre ? 'centre de loisirs' : 'école';
      const by = escortName ?? morningLabel;
      ob[m] = { lever: kidDep - DAY.kidPrep, dep: kidDep, strict: true, why: `${place} ${hm(s.start)} − ${hm(s.start - kidDep)} − ${DAY.kidPrep} min = ${hm(kidDep - DAY.kidPrep)} (${by})` };
      // Fin de l'accompagnement : à l'école (dépose, grands-parents qui l'y conduisent) ou à l'accueil du matin.
      const escEnd = run!.drop !== null || morning?.by === 'grands-parents' ? s.start : kidDep + SCHOOL.walk;
      add(m, kidDep, escEnd, 'escort', escortName ? `avec ${escortName}` : by);
      const home = homeAt();
      const end = home - SCHOOL.walk;
      if (s.wednesday && !centre) { add(m, escEnd, DAY.wednesdayNoon, 'school', 'école'); add(m, DAY.wednesdayNoon, Math.min(end, SCHOOL.pickup), 'school', 'centre de loisirs'); }
      else add(m, escEnd, Math.min(end, SCHOOL.pickup), 'school', place);
      add(m, SCHOOL.pickup, end, 'school', s.kind === 'creche' ? 'crèche' : 'garderie');
      const fetcher = pickup!.by === 'nanny' ? hh.nanny!.who.first : first(pickup!.m);
      add(m, end, home, 'escort', `avec ${fetcher}`);
      return;
    }
    const w = workOf(duties[m]);
    const dropper = run?.drop === m;
    const fetches = pickup && pickup.by !== 'nanny' && pickup.m === m;
    let escortEnd = 0;
    if (dropper) {
      const goesBack = !w || w.start - w.commute - dropEnd >= DAY.homeDetour;
      escortEnd = goesBack ? dropEnd + SCHOOL.walk : dropEnd;
      add(m, kidDep, escortEnd, 'escort', 'école');
      const prep = w ? w.prep : t.prep;
      ob[m] = {
        lever: kidDep - prep, dep: kidDep, strict: true,
        why: `dépose à l'école ${hm(kidDep + SCHOOL.walk)} − ${SCHOOL.walk} min − ${prep} min préparation = ${hm(kidDep - prep)}` + (w ? ` (puis travail ${hm(w.start)})` : ''),
      };
      if (w) {
        if (goesBack) add(m, w.start - w.commute, w.start, 'commute', t.walk ? 'à pied' : 'transports');
        else add(m, dropEnd, w.start, 'commute', t.walk ? 'à pied' : 'transports');
      }
    } else if (w) {
      const dep = w.start - w.commute;
      ob[m] = { lever: dep - w.prep, dep, strict: true, why: `travail ${hm(w.start)} − ${w.commute} min trajet − ${w.prep} min préparation = ${hm(dep - w.prep)}` };
      add(m, dep, w.start, 'commute', t.walk ? 'à pied' : 'transports');
    }
    if (w) {
      w.shifts.forEach(([a, b], i) => {
        add(m, a, b, 'work', w.split ? 'service' : 'travail');
        const nx = w.shifts[i + 1];
        if (!nx) return;
        if (!w.split) add(m, b, nx[0], 'pause', 'pause déjeuner');
        else if (w.homeAtBreak) { add(m, b, b + w.commute, 'commute', 'retour pour la coupure'); add(m, nx[0] - w.commute, nx[0], 'commute', 'vers le service'); }
        else add(m, b, nx[0], 'pause', 'coupure en ville');
      });
      const at = fetches && (pickup.by === 'garderie' || pickup.at !== undefined) ? pickup.at! : null;
      if (at !== null) {
        add(m, w.end, at - SCHOOL.walk, 'commute', t.walk ? 'à pied' : 'transports');
        add(m, Math.max(w.end, at - SCHOOL.walk), at, 'escort', pickup!.by === 'garderie' ? 'garderie' : 'crèche');
      } else add(m, w.end, w.end + w.commute, 'commute', t.walk ? 'à pied' : 'transports');
    }
    if (fetches && pickup.by === 'parent' && pickup.at === undefined) add(m, SCHOOL.pickup - SCHOOL.walk, SCHOOL.pickup + SCHOOL.walk, 'escort', 'sortie d’école');
    if (w) return;
    if (s) {
      const dep = s.start - t.commute;
      if (!ob[m]) ob[m] = { lever: dep - t.prep, dep, strict: false, why: `cours ${hm(s.start)} − ${t.commute} min trajet − ${t.prep} min préparation = ${hm(dep - t.prep)}` };
      add(m, dep, s.start, 'commute', t.walk ? 'à pied' : 'transports');
      add(m, s.start, s.end, 'class', 'cours');
      add(m, s.end, s.end + t.commute, 'commute', t.walk ? 'à pied' : 'transports');
    }
    const v = appts[m];
    if (v) {
      const dep = Math.max(v.at - v.commute, escortEnd);
      if (!ob[m]) ob[m] = { lever: v.at - v.commute - t.prep, dep: v.at - v.commute, strict: false, why: `RDV ${v.label} ${hm(v.at)} − ${v.commute} min trajet − ${t.prep} min préparation = ${hm(v.at - v.commute - t.prep)}` };
      add(m, dep, v.at, 'commute', '');
      add(m, v.at, v.at + v.dur, 'rdv', `RDV ${v.label}`);
      add(m, v.at + v.dur, v.at + v.dur + v.commute, 'commute', '');
    }
  });
  for (const list of blocks) list.sort((p, q) => p.a - q.a);
  return { day, away, gone: false, duties, schools, appts, sick, run, ob, blocks, nanny };
}

// Fin des sorties d'obligation (de la porte au retour) commencées avant 19 h 30 : le service du soir et son trajet de retour
// comptent en entier. La sortie du soir part au plus tôt 30 min après.
const obligationsEnd = (list: readonly Block[]): number =>
  Math.max(-Infinity, ...outOf(list).filter(([a]) => a < DAY.outingObligationsBefore).map(([, b]) => b));

type Evening = { outing: (Outing | null)[]; nanny: NannyVisit | null };

/** Sorties du soir du jour, décidées d'après le lendemain ; jamais d'après le lever ni les sorties de jour. */
function eveningOf(d: Dwelling, plan: Plan, next: Plan, seed: number): Evening {
  const { hh } = d;
  const outing: (Outing | null)[] = hh.members.map(() => null);
  let nanny: NannyVisit | null = null;
  if (plan.gone) return { outing, nanny };
  const young = hh.members.some((_, m) => isYoung(hh, m));
  for (const g of outingGroups(hh)) {
    if (g.some((m) => plan.sick[m])) continue;
    const nextFree = g.every((m) => { const o = next.ob[m]; return !o || o.lever >= DAY.nextFreeFrom; });
    const o = eveningOuting(hh, g, plan.day, nextFree);
    if (!o) continue;
    const dep = Math.max(o.dep, ...g.map((m) => obligationsEnd(plan.blocks[m]!) + DAY.outingAfter));
    if (o.ret - dep < DAY.outingMin) continue;
    // Jeunes enfants : un adulte reste, sinon la nounou vient (si elle peut), sinon pas de sortie.
    const stays = hh.members.some((x, m) => x.who.status !== 'enfant' && !g.includes(m));
    if (young && !stays) {
      // Garde du soir : le samedi seulement (un soir de semaine couperait son repos de 11 h avant une garde du matin).
      if (plan.day.weekday !== 6 || nanny || plan.nanny.visits.length || !nannyAvailable(hh, plan.day)) continue;
      // Et seulement si elle n'a pas travaillé le vendredi (sortie d'école, garde du matin, ni garde du soir si un jour on en
      // permet en semaine) : sinon son repos hebdomadaire de 35 h d'affilée dans la semaine serait coupé.
      const friday = planOf(d, near(plan.day, -1), seed);
      if (friday.nanny.shifts.length || eveningOf(d, friday, plan, seed).nanny) continue;
      const r = dayRng(hh.seed, hh.members.length, plan.day.iso, 'nounou');
      const [lo, hi] = DAY.nannyLeave;
      nanny = { arrive: dep - 10, leave: o.ret + lo + Math.floor(r() * (hi - lo + 1)), reason: 'soir' };
    }
    for (const m of g) outing[m] = { ...o, dep };
  }
  return { outing, nanny };
}

/** Coucher du membre `m` le jour du plan (minutes du jour, peut dépasser 1440). */
function bedOf(hh: Household, m: number, plan: Plan, next: Plan, outing: Outing | null): number {
  const t = traitsOf(hh, m);
  const r = dayRng(hh.seed, m, plan.day.iso, 'coucher');
  const ob2 = next.ob[m];
  const list = plan.blocks[m]!;
  const dayEnd = plan.gone || !list.length ? -Infinity : Math.max(...list.map((b) => b.b));
  if (isKid(hh, m)) {
    const eve = !!ob2?.strict;
    const anchor = 1440 + (eve ? ob2!.lever : DAY.bed.kidAnchor) - t.sleep;
    let bed = Math.max(anchor + int5(r, -DAY.bed.kidNoise, DAY.bed.kidNoise) + (eve ? 0 : DAY.bed.kidFree), dayEnd + DAY.bed.kidAfterDay);
    // Jamais couché avant qu'un adulte soit rentré (obligations seules : deux parents en service le samedi soir…) ; il
    // revient alors avec le premier adulte rentré.
    if (!plan.gone && isYoung(hh, m)) {
      const adults = hh.members.map((_, a) => a).filter((a) => !isKid(hh, a));
      const allOut = subtract(adults.reduce<Span[]>((acc, a) => intersect(acc, outOf(plan.blocks[a]!)), [[-Infinity, Infinity]]),
        plan.nanny.visits.map((v): Span => [v.arrive, v.leave]));
      const span = allOut.find(([a, b]) => a <= bed && b > bed);
      if (span) bed = span[1] + DAY.bed.kidAfterDay;
    }
    return bed;
  }
  if (outing) return outing.ret + int5(r, DAY.bed.outing[0], DAY.bed.outing[1]);
  const habit = t.bedtime + int5(r, -DAY.bed.noise, DAY.bed.noise) + (!ob2 ? DAY.bed.free : 0);
  const respect = r() < DAY.bed.respect;
  const bed = ob2 && respect ? Math.min(habit, 1440 + ob2.lever - t.sleep + int5(r, -20, 0)) : habit;
  return Math.max(bed, dayEnd + DAY.bed.afterDay);
}

/** Lever libre du jour (tirage du jour, puis rattrapage après une nuit courte), sans obligation. `prevBed` : relatif à 0 h. */
export function freeWake(hh: Household, m: number, day: DayContext, prevBed: number): { wake: number; why: string } {
  const who = hh.members[m]!.who;
  const t = traitsOf(hh, m);
  const r = dayRng(hh.seed, m, day.iso, 'lever');
  const F = DAY.free;
  let wake: number, why: string;
  if (who.status === 'retraite') {
    const early = r() < t.earlyP;
    wake = range5(r, early ? F.retiredEarly : F.retired);
    why = early ? 'jour libre — tirage du jour : lève-tôt aujourd’hui' : 'jour libre — tirage du jour';
  } else if (who.status === 'chomeur') { wake = range5(r, F.unemployed); why = 'jour libre — tirage du jour'; }
  else if (who.status === 'enfant') { wake = range5(r, who.age < DAY.kidAge ? F.kid : F.bigKid); why = 'pas d’école — tirage du jour'; }
  else if (who.status === 'etudiant') { wake = range5(r, F.student); why = 'pas de cours — tirage du jour'; }
  else {
    wake = range5(r, F.active);
    const duty = dutyOf(hh, m, day);
    why = duty?.kind === 'leave' ? (duty.leave === 'RTT' ? 'jour de RTT — tirage du jour' : 'en congé — tirage du jour') : 'jour libre — tirage du jour';
  }
  if (who.status === 'enfant') return { wake, why };
  const rr = dayRng(hh.seed, m, day.iso, 'rattrapage');
  const need = prevBed + t.sleep + int5(rr, -DAY.catchUp.minus, DAY.catchUp.plus);
  if (need > wake) {
    const late = Math.min(need, DAY.catchUp.max);
    return { wake: late, why: `couché ${hm(prevBed)} + ${t.sleep} min de sommeil ≈ ${hm(late)} (rattrapage)` };
  }
  return { wake, why };
}

// Intervalles [a, b) : fusion (moins d'1 min d'écart), intersection, différence.
type Span = [number, number];
function merge(list: readonly Span[]): Span[] {
  const s = list.filter(([a, b]) => b > a).map(([a, b]): Span => [a, b]).sort((p, q) => p[0] - q[0]);
  const out: Span[] = [];
  for (const x of s) {
    const last = out[out.length - 1];
    if (last && x[0] - last[1] < 1) last[1] = Math.max(last[1], x[1]);
    else out.push(x);
  }
  return out;
}
function intersect(A: readonly Span[], B: readonly Span[]): Span[] {
  const out: Span[] = [];
  for (const [a, b] of A) for (const [c, e] of B) { const lo = Math.max(a, c), hi = Math.min(b, e); if (hi > lo) out.push([lo, hi]); }
  return merge(out);
}
function subtract(A: readonly Span[], B: readonly Span[]): Span[] {
  let cur = A.map(([a, b]): Span => [a, b]);
  for (const [c, e] of B) cur = cur.flatMap(([a, b]): Span[] => (e <= a || c >= b ? [[a, b]] : [...(c > a ? [[a, c] as Span] : []), ...(e < b ? [[e, b] as Span] : [])]));
  return cur;
}
const outOf = (blocks: readonly Block[]): Span[] => merge(blocks.map((b): Span => [b.a, b.b]));
// Blocs qu'un enfant ne peut pas suivre : travail, cours, pause du travail (une sortie qui en contient un ne se suit pas).
const NO_FOLLOW: ReadonlySet<Block['k']> = new Set(['work', 'class', 'pause', 'school']);

/** Journées du foyer pour un jour : chaque habitant, logistique de l'école, nounou. */
export function householdDays(d: Dwelling, day: DayContext, seed: number): HouseholdDays {
  const { hh } = d;
  const periods = day.periods ?? [];
  const around = (k: number): DayContext => ({ ...dayContext(addDays(day.date, k), [...periods]), periods });
  const prev = planOf(d, around(-1), seed);
  const plan = planOf(d, day, seed);
  const next = planOf(d, around(1), seed);
  const evePrev = eveningOf(d, prev, plan, seed);
  const eve = eveningOf(d, plan, next, seed);
  const n = hh.members.length;
  const prevBed = hh.members.map((_, m) => bedOf(hh, m, prev, plan, evePrev.outing[m]!) - 1440);
  const bed = hh.members.map((_, m) => bedOf(hh, m, plan, next, eve.outing[m]!));
  const home = plan.away.state === 'home';

  // 1. Lever : obligation stricte, sinon la plus tôt de l'obligation et du lever libre (rattrapage compris).
  const wake: number[] = [], why: string[] = [], prepEnd: (number | null)[] = [];
  for (let m = 0; m < n; m++) {
    const free = freeWake(hh, m, day, prevBed[m]!);
    const ob = plan.ob[m];
    if (ob && (ob.strict || ob.lever < free.wake)) { wake[m] = ob.lever; why[m] = ob.why; prepEnd[m] = ob.dep; }
    else { wake[m] = free.wake; why[m] = free.why; prepEnd[m] = null; }
  }
  // Parent un jour sans école des petits : l'un d'eux se lève avec eux (pas de rattrapage pour lui).
  const young = hh.members.map((_, m) => m).filter((m) => isYoung(hh, m));
  if (home && young.length && !young.some((k) => plan.schools[k])) {
    const pars = hh.members.map((_, m) => m).filter((m) => !isKid(hh, m) && !workOf(plan.duties[m]) && !plan.ob[m]?.strict);
    if (pars.length) {
      // Celui qui a le moins de sommeil à rattraper (coucher de la veille + besoin le plus tôt) ; à égalité, tirage.
      const r = dayRng(hh.seed, 0, day.iso, 'garde');
      const need = (m: number): number => prevBed[m]! + traitsOf(hh, m).sleep;
      const best = Math.min(...pars.map(need));
      const tied = pars.filter((m) => need(m) - best < 30);
      const g = tied[Math.floor(r() * tied.length)]!;
      const kw = Math.min(...young.map((k) => wake[k]!));
      const L = kw + int5(r, 0, 10);
      if (L < wake[g]!) {
        wake[g] = L; prepEnd[g] = null;
        why[g] = `${young.map((k) => hh.members[k]!.who.first).join(' et ')} debout à ${hm(kw)} : ${hh.members[g]!.who.first} se lève avec ${young.length > 1 ? 'eux' : hh.members[young[0]!]!.who.sex === 'f' ? 'elle' : 'lui'}`;
      }
    }
  }
  // Jour d'école : un adulte au logement est debout au plus tard au réveil des petits (il les réveille). D'abord qui les
  // dépose, puis un adulte sans travail, puis le plus tôt levé ; il garde son départ (préparation plus longue).
  const pupilsUp = young.filter((k) => plan.ob[k]?.strict);
  if (home && pupilsUp.length) {
    const kw = Math.min(...pupilsUp.map((k) => wake[k]!));
    const atHome = hh.members.map((_, m) => m).filter((m) => !isKid(hh, m) && !outOf(plan.blocks[m]!).some(([a, b]) => kw >= a && kw < b));
    if (atHome.length && !atHome.some((m) => wake[m]! <= kw)) {
      const order = (m: number): number => (plan.run?.drop === m ? 0 : !workOf(plan.duties[m]) ? 1 : 2);
      const g = atHome.slice().sort((a, b) => order(a) - order(b) || wake[a]! - wake[b]!)[0]!;
      wake[g] = kw - int5(dayRng(hh.seed, g, day.iso, 'reveil'), 0, 10);
      why[g] = `réveille ${pupilsUp.map((k) => hh.members[k]!.who.first).join(' et ')} à ${hm(kw)} — ${why[g]}`;
    }
  }

  // 2. Blocs hors du logement : obligations, sorties de la famille, sorties de jour, sortie du soir.
  const blocks = plan.blocks.map((list) => list.map((b) => ({ ...b })));
  // Retour de nuit : la sortie de la veille qui finit après minuit occupe le début du jour.
  hh.members.forEach((_, m) => {
    const o = evePrev.outing[m];
    if (o && o.ret > 1440) blocks[m]!.unshift({ a: 0, b: o.ret - 1440, k: 'outing', label: o.kind });
  });
  if (home) {
    const fam = familyErrands(hh, day);
    const fine = (m: number): boolean => isKid(hh, m) || !plan.sick[m];
    if (fam.all) {
      // Parc tous ensemble (sauf un adulte malade) : au plus tôt 40 min après le dernier levé (rattrapage compris).
      const goers = hh.members.map((_, m) => m).filter(fine);
      const a = Math.max(fam.all.a, ...goers.map((m) => wake[m]! + 40));
      for (const m of goers) blocks[m]!.push({ ...fam.all, a, b: a + fam.all.b - fam.all.a });
    }
    if (fam.one && fine(fam.one.m)) {
      // Courses d'un adulte : jamais avant 40 min après son lever (durée gardée), ni sur sa sortie du soir.
      const { m, b } = fam.one;
      const a = Math.max(b.a, wake[m]! + 40);
      const o = eve.outing[m];
      if (!o || a + b.b - b.a + DAY.outingAfter <= o.dep) blocks[m]!.push({ ...b, a, b: a + b.b - b.a });
    }
    const pickup = plan.run?.pickup;
    hh.members.forEach((x, m) => {
      if (x.who.status === 'enfant' || plan.sick[m]) return;
      const mustPick = pickup?.by === 'parent' && pickup.m === m && pickup.at === undefined ? SCHOOL.pickup : null;
      const errands = dayErrands(hh, m, day, wake[m]!, blocks[m]!, mustPick);
      const o = eve.outing[m];
      blocks[m]!.push(...errands.filter((b) => !o || b.b + DAY.outingAfter <= o.dep));
    });
  }
  hh.members.forEach((_, m) => { const o = eve.outing[m]; if (o) blocks[m]!.push({ a: o.dep, b: o.ret, k: 'outing', label: o.kind }); });

  // 3. Jeunes enfants jamais seuls : ils suivent l'adulte qui sort (sorties, rendez-vous), sinon rien ne bouge.
  const nannyVisits = [...plan.nanny.visits, ...(eve.nanny ? [eve.nanny] : [])];
  if (home && young.length) {
    const adults = hh.members.map((_, m) => m).filter((m) => !isKid(hh, m));
    const nannySpans = nannyVisits.map((v): Span => [v.arrive, v.leave]);
    for (const k of young) {
      for (let tries = 0; tries < 8; tries++) {
        const allOut = adults.reduce<Span[]>((acc, a) => intersect(acc, outOf(blocks[a]!)), [[-Infinity, Infinity]]);
        const alone = subtract(intersect(subtract([[wake[k]!, bed[k]!]], outOf(blocks[k]!)), allOut), nannySpans);
        if (!alone.length) break;
        const t0 = alone[0]![0];
        // L'adulte qui part exactement à t0 (sortie sans travail ni cours) emmène l'enfant jusqu'à son retour.
        const leaving = adults.flatMap((a) => outOf(blocks[a]!).filter(([x]) => x === t0).map((span) => ({ a, span })));
        const cands = leaving.filter(({ a, span: [x, y] }) => !blocks[a]!.some((b) => NO_FOLLOW.has(b.k) && b.b > x && b.a < y));
        if (cands.length) {
          const { a, span } = cands.sort((p, q) => p.span[1] - q.span[1])[0]!;
          blocks[k]!.push({ a: t0, b: span[1], k: 'out', label: `avec ${hh.members[a]!.who.first}` });
          continue;
        }
        // Sinon chez les grands-parents : emmené par l'adulte qui part à t0, ramené par le premier adulte rentré (fin de
        // l'absence de tous, sans la borner au coucher : jamais couché seul).
        const all = subtract(intersect(subtract([[t0, Infinity]], outOf(blocks[k]!)), allOut), nannySpans);
        const t1 = Math.min(all[0]?.[1] ?? alone[0]![1], 1800);
        const by = leaving[0] ? `, avec ${hh.members[leaving[0].a]!.who.first}` : '';
        blocks[k]!.push({ a: t0, b: t1, k: 'out', label: `chez les grands-parents${by}` });
      }
    }
  }

  // 4. Habillage, coucher ; 5. nounou.
  const people: PersonDay[] = hh.members.map((_, m) => {
    const list = blocks[m]!.sort((p, q) => p.a - q.a);
    const out = outOf(list);
    const r = dayRng(hh.seed, m, day.iso, 'habits');
    const pe = prepEnd[m]!;
    let dressAt = pe !== null ? pe - DAY.dressBefore : wake[m]! + int5(r, DAY.dress[0], DAY.dress[1]);
    const firstDep = list.find((b) => b.a > 0)?.a;
    if (firstDep !== undefined && plan.away.state !== 'returns') dressAt = Math.min(dressAt, firstDep - DAY.dressBefore);
    const o = eve.outing[m]!;
    return {
      m, wake: wake[m]!, bed: bed[m]!, prevBed: prevBed[m]!, why: why[m]!, prepEnd: pe, dressAt,
      undressAt: bed[m]! - (o ? DAY.undressNight : DAY.undress),
      duty: plan.duties[m] ?? null, school: plan.schools[m] ?? null, outing: o, appointment: plan.appts[m] ?? null,
      sick: plan.sick[m]!, blocks: list, out,
    };
  });
  const shifts: Shift[] = [...plan.nanny.shifts, ...(eve.nanny ? [[eve.nanny.arrive, eve.nanny.leave] as Shift] : [])];
  const nanny = hh.nanny && nannyVisits.length ? { visitor: hh.nanny, visits: nannyVisits, shifts } : null;
  return { iso: day.iso, away: plan.away, people, run: plan.run, nanny };
}
