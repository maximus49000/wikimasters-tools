import type { DayContext } from './calendar';
import type { Household } from './households';
import { dayRng } from './person-traits';
import { schoolDayOf } from './school-run';
import { dutyOf } from './work-day';

// Sorties du soir, sorties de jour et rendez-vous (port de `profil`, `rdvDuJour`, des « sorties de jour » et des « sorties du
// soir » de la maquette « lever des habitants », notes § Sorties, § Rendez-vous). Tout est tiré sur un flux nommé du jour
// (`dayRng`), sans état d'un jour à l'autre.
// - Jeunes (moins de 35 ans, sans enfant) : bar ou boîte surtout avant un jour sans travail. Adultes : resto, bar, amis.
// - Seniors : petites sorties (resto, théâtre, amis), de retour à 23 h au plus tard. Familles : le samedi, avec la nounou.
// - Rendez-vous (chômeur, retraité) : jours ouvrés, le matin. Sorties de jour : courses, marché, promenade, parc en famille.

export type LifeProfile = 'jeune' | 'adulte' | 'senior' | 'famille' | 'enfant';
export type Outing = { kind: 'bar' | 'boite' | 'resto' | 'theatre' | 'amis'; dep: number; ret: number };
export type Appointment = { at: number; dur: number; commute: number; label: string };
// Bloc hors du logement, en minutes du jour (la fin peut dépasser 1440).
export type Block = {
  a: number; b: number;
  k: 'commute' | 'work' | 'pause' | 'escort' | 'school' | 'class' | 'rdv' | 'out' | 'outing' | 'nanny' | 'trip';
  label: string;
};

const SENIOR_AGE = 65;
const YOUNG_AGE = 35;
const KID_AUTONOMOUS_AGE = 11;
// Foyers qui sortent ensemble le soir ; coloc, solo (et le reste) : chacun de son côté.
const TOGETHER: readonly string[] = ['couple', 'famille', 'retraite'];

type Rng = () => number;
const int5 = (r: Rng, lo: number, hi: number): number => Math.round((lo + r() * (hi - lo)) / 5) * 5;
const pick = <T>(r: Rng, list: readonly T[]): T => list[Math.floor(r() * list.length)]!;
const isChild = (hh: Household, m: number): boolean => hh.members[m]?.who.status === 'enfant';
const adultsOf = (hh: Household): number[] => hh.members.flatMap((x, m) => (x.who.status === 'enfant' ? [] : [m]));
const workingDay = (day: DayContext): boolean => day.weekday >= 1 && day.weekday <= 5 && !day.publicHoliday;

/** Profil de vie du membre `m` : enfant, senior (retraité ou 65 ans et plus), famille (adulte d'un foyer avec enfants), jeune, adulte. */
export function lifeProfileOf(hh: Household, m: number): LifeProfile {
  const who = hh.members[m]!.who;
  if (who.status === 'enfant') return 'enfant';
  if (who.status === 'retraite' || who.age >= SENIOR_AGE) return 'senior';
  if (hh.members.some((x) => x.who.status === 'enfant')) return 'famille';
  return who.age < YOUNG_AGE ? 'jeune' : 'adulte';
}

/** Groupes de sortie du soir (membres adultes) : couple, famille et retraités ensemble ; coloc et solo chacun. */
export function outingGroups(hh: Household): number[][] {
  const adults = adultsOf(hh);
  if (!adults.length) return [];
  return TOGETHER.includes(hh.type) ? [adults] : adults.map((m) => [m]);
}

/** Sortie du soir du groupe (flux `soir` du premier membre) ; `nextFree` : le lendemain n'est pas travaillé. */
export function eveningOuting(hh: Household, group: readonly number[], day: DayContext, nextFree: boolean): Outing | null {
  if (!group.length) return null;
  const profile = lifeProfileOf(hh, group[0]!);
  const r = dayRng(hh.seed, group[0]!, day.iso, 'soir');
  const x = r();
  if (profile === 'jeune') {
    if (nextFree && x < 0.45) {
      return r() < 0.35
        ? { kind: 'boite', dep: int5(r, 1350, 1410), ret: int5(r, 1650, 1740) }
        : { kind: 'bar', dep: int5(r, 1170, 1260), ret: int5(r, 1470, 1560) };
    }
    if (!nextFree && x < 0.12) return { kind: 'bar', dep: int5(r, 1170, 1230), ret: int5(r, 1365, 1440) };
    if (!nextFree && day.weekday === 4 && x < 0.22) return { kind: 'boite', dep: int5(r, 1350, 1395), ret: int5(r, 1605, 1665) };
    return null;
  }
  if (profile === 'adulte') {
    if (nextFree && x < 0.25) return { kind: pick(r, ['resto', 'bar', 'amis'] as const), dep: int5(r, 1185, 1215), ret: int5(r, 1380, 1455) };
    if (!nextFree && x < 0.06) return { kind: 'resto', dep: int5(r, 1185, 1215), ret: int5(r, 1350, 1410) };
    return null;
  }
  if (profile === 'senior') {
    const p = day.weekday === 6 ? 0.3 : day.weekday === 5 ? 0.15 : 0.06;
    if (x >= p) return null;
    return { kind: pick(r, ['resto', 'resto', 'theatre', 'amis'] as const), dep: int5(r, 1155, 1185), ret: Math.min(1380, int5(r, 1320, 1380)) };
  }
  // Famille : le samedi seulement, et jamais sans nounou pour garder les enfants.
  if (profile === 'famille' && hh.nanny && day.weekday === 6 && x < 0.15) return { kind: 'resto', dep: int5(r, 1185, 1215), ret: int5(r, 1380, 1440) };
  return null;
}

/** Rendez-vous du matin (jours ouvrés) : chômeur 20 % (France Travail…), retraité 10 % (médecin…) ; null sinon. */
export function appointmentOf(hh: Household, m: number, day: DayContext): Appointment | null {
  if (!workingDay(day)) return null;
  const status = hh.members[m]?.who.status;
  const r = dayRng(hh.seed, m, day.iso, 'rdv');
  if (status === 'chomeur' && r() < 0.2) {
    const at = int5(r, 525, 600);
    return { at, dur: 60, commute: int5(r, 15, 35), label: pick(r, ['France Travail', 'entretien', 'formation']) };
  }
  if (status === 'retraite' && r() < 0.1) {
    const at = int5(r, 510, 630);
    return { at, dur: 45, commute: int5(r, 10, 25), label: pick(r, ['médecin', 'kiné', 'banque']) };
  }
  return null;
}

// Famille « libre » : des enfants de moins de 11 ans, aucun à l'école ce jour-là, aucun adulte au travail (ni malade).
function freeFamilyDay(hh: Household, day: DayContext): boolean {
  const kids = hh.members.flatMap((x, m) => (x.who.status === 'enfant' && x.who.age < KID_AUTONOMOUS_AGE ? [m] : []));
  if (!kids.length || kids.some((m) => schoolDayOf(hh, m, day))) return false;
  return adultsOf(hh).every((m) => { const k = dutyOf(hh, m, day)?.kind; return k !== 'work' && k !== 'sick'; });
}

/** Sorties de la famille un jour libre : parc tous ensemble (70 %) et courses d'un adulte (60 %) ; sinon rien. */
export function familyErrands(hh: Household, day: DayContext): { all: Block | null; one: { m: number; b: Block } | null } {
  const none = { all: null, one: null };
  if (!freeFamilyDay(hh, day)) return none;
  const adults = adultsOf(hh);
  const r = dayRng(hh.seed, 0, day.iso, 'parc');
  let all: Block | null = null;
  if (r() < 0.7) {
    const a = int5(r, 900, 930);
    all = { a, b: a + int5(r, 90, 120), k: 'out', label: pick(r, ['parc', 'balade', 'square']) };
  }
  let one: { m: number; b: Block } | null = null;
  if (r() < 0.6) {
    const m = pick(r, adults);
    const a = int5(r, 630, 675);
    one = { m, b: { a, b: a + int5(r, 45, 75), k: 'out', label: 'courses' } };
  }
  return { all, one };
}

const overlaps = (a: number, b: number, list: readonly Block[], margin = 0): boolean => list.some((x) => x.b > a - margin && x.a < b + margin);

/**
 * Sorties de jour d'un adulte libre (courses, marché, promenade) : matin puis après-midi, jamais par-dessus `busy`, finies 20 min
 * avant `mustPickAt` (sortie d'école qu'il doit aller chercher). Rien un jour travaillé, malade, ni pour un enfant ou une famille
 * libre (parc et courses : `familyErrands`).
 */
export function dayErrands(hh: Household, m: number, day: DayContext, wake: number, busy: readonly Block[], mustPickAt: number | null): Block[] {
  if (isChild(hh, m)) return [];
  const duty = dutyOf(hh, m, day);
  if (duty?.kind === 'work' || duty?.kind === 'sick') return [];
  if (freeFamilyDay(hh, day)) return [];
  const status = hh.members[m]!.who.status;
  const retired = status === 'retraite';
  const off = day.weekday === 0 || day.weekday === 6 || !!day.publicHoliday || duty?.kind === 'leave';
  const limit = mustPickAt === null ? Infinity : mustPickAt - 20;
  const r = dayRng(hh.seed, m, day.iso, 'dehors');
  const out: Block[] = [];

  const pMorning = retired ? 0.65 : off ? 0.55 : status === 'chomeur' ? 0.35 : 0.2;
  const rm = r(), am = int5(r, Math.max(570, wake + 50), Math.max(660, wake + 60)), dm = int5(r, 45, 90);
  const freeMorning = !busy.some((x) => x.a < 750);
  if (freeMorning && rm < pMorning && am + dm < 780 && am + dm <= limit && !overlaps(am, am + dm, busy)) {
    out.push({ a: am, b: am + dm, k: 'out', label: pick(r, retired ? ['marché', 'courses', 'café', 'boulangerie'] : ['courses', 'sport', 'marché']) });
  }

  const pAfternoon = retired ? 0.5 : status === 'chomeur' ? 0.4 : off ? 0.5 : 0.25;
  const ra = r(), aa = int5(r, 870, 960), da = int5(r, 60, 150);
  const end = Math.min(aa + da, limit);
  if (ra < pAfternoon && aa > wake + 60 && end - aa >= 30 && !overlaps(aa, aa + da, [...busy, ...out], 10) && !overlaps(aa, end, busy)) {
    out.push({ a: aa, b: end, k: 'out', label: pick(r, retired ? ['promenade', 'club', 'bibliothèque', 'visite'] : ['balade', 'ciné', 'amis', 'expo']) });
  }
  return out;
}
