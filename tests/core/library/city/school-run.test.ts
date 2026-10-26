import { describe, expect, it, vi } from 'vitest';
import { addDays, dayContext, type DayContext, type HolidayPeriod, type YMD } from '../../../../src/core/library/city/calendar';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { cityDwellings, type Household } from '../../../../src/core/library/city/households';
import { checkLabourLaw } from '../../../../src/core/library/city/labour-law';
import { nannyLeavePlan } from '../../../../src/core/library/city/leave-plan';
import { traitsOf } from '../../../../src/core/library/city/person-traits';
import { isoWeek } from '../../../../src/core/library/city/scene-day';
import { SCHOOL, schoolDayOf, schoolRunOf } from '../../../../src/core/library/city/school-run';
import { dutyOf, type Duty, type WorkDay } from '../../../../src/core/library/city/work-day';

// Jours de congé de la nounou posés par un test (ses vrais congés tombent sur les semaines du couple, parents libres).
const forcedNannyLeave = vi.hoisted(() => new Set<string>());
vi.mock('../../../../src/core/library/city/leave-plan', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../../src/core/library/city/leave-plan')>();
  return {
    ...mod,
    nannyLeavePlan: (hh: Household, year: number) => {
      const plan = mod.nannyLeavePlan(hh, year);
      if (!forcedNannyLeave.size) return plan;
      const out = new Map(plan);
      for (const iso of forcedNannyLeave) out.set(iso, 'CP' as const);
      return out;
    },
  };
});

// Vacances scolaires 2026 (zone C), pour que `dayContext` donne des jours `holiday`.
const PERIODS: HolidayPeriod[] = [
  { name: 'hiver', start: '2026-02-21', end: '2026-03-09' },
  { name: 'printemps', start: '2026-04-18', end: '2026-05-04' },
  { name: 'ete', start: '2026-07-04', end: '2026-09-01' },
  { name: 'toussaint', start: '2026-10-17', end: '2026-11-02' },
  { name: 'noel', start: '2026-12-19', end: '2027-01-04' },
];
const START: YMD = { y: 2026, m: 1, d: 5 }; // lundi
const YEAR: DayContext[] = Array.from({ length: 52 * 7 }, (_, i) => dayContext(addDays(START, i), PERIODS));
const SEEDS = [1, 2, 3, 4, 5, 6];
const families = SEEDS.flatMap((seed) => cityDwellings(cityFacades(1440, 340, seed), seed)).map((d) => d.hh)
  .filter((hh) => hh.members.some((x) => x.who.status === 'enfant'));
const little = (hh: Household) => hh.members.some((x) => x.who.status === 'enfant' && x.who.age < SCHOOL.autonomousAge);
const parentsOf = (hh: Household): number[] => [...new Set(hh.members.flatMap((x) => x.who.parents))];
const dutiesOf = (hh: Household, day: DayContext) => hh.members.map((_, m) => dutyOf(hh, m, day));
const workOf = (d: Duty | null): WorkDay | null => (d?.kind === 'work' ? d.w : null);
const back = (d: Duty | null): number => { const w = workOf(d); return w ? w.end + w.commute : -1; };
const isoYear = (day: DayContext) => Math.floor(isoWeek(day.date, day.weekday).week / 100);
const nannyOff = (hh: Household, day: DayContext) => nannyLeavePlan(hh, isoYear(day)).get(day.iso) === 'CP';
const schoolDays = YEAR.filter((day) => day.schoolOn);

// Tous les jours d'école des familles avec un enfant de moins de 11 ans : (foyer, jour, devoirs du jour, logistique).
const runs = families.filter(little).flatMap((hh) => schoolDays.slice(0, 120).map((day) => ({ hh, day, ...schoolRunOf(hh, day, dutiesOf(hh, day)) })));

describe('jour d’école', () => {
  it('crèche ouverte pendant les vacances scolaires, fermée un jour férié', () => {
    const creche = families.flatMap((hh) => hh.members.map((x, m) => ({ hh, m, x }))).filter(({ hh, m }) => traitsOf(hh, m).school?.kind === 'creche');
    const ecole = families.flatMap((hh) => hh.members.map((x, m) => ({ hh, m, x }))).filter(({ hh, m }) => traitsOf(hh, m).school?.kind === 'ecole');
    expect(creche.length).toBeGreaterThan(0);
    expect(ecole.length).toBeGreaterThan(0);
    const holiday = YEAR.find((d) => d.kind === 'holiday' && d.weekday === 2)!;
    const ferie = YEAR.find((d) => d.publicHoliday && d.weekday >= 1 && d.weekday <= 5)!;
    const weekend = YEAR.find((d) => d.weekday === 6)!;
    for (const { hh, m } of creche) {
      expect(schoolDayOf(hh, m, holiday)).toMatchObject({ kind: 'creche', start: SCHOOL.crecheStart, end: SCHOOL.crecheEnd, autonomous: false });
      expect(schoolDayOf(hh, m, ferie)).toBeNull();
      expect(schoolDayOf(hh, m, weekend)).toBeNull();
    }
    for (const { hh, m } of ecole) {
      expect(schoolDayOf(hh, m, holiday)).toBeNull();
      expect(schoolDayOf(hh, m, ferie)).toBeNull();
    }
  });

  it('mercredi : sortie à 16 h 30 (centre de loisirs)', () => {
    const wed = schoolDays.find((d) => d.weekday === 3)!;
    let n = 0;
    for (const hh of families) hh.members.forEach((_, m) => {
      if (traitsOf(hh, m).school?.kind !== 'ecole') return;
      n++;
      expect(schoolDayOf(hh, m, wed)).toEqual({ kind: 'ecole', start: SCHOOL.drop, end: SCHOOL.pickup, autonomous: false, wednesday: true });
    });
    expect(n).toBeGreaterThan(0);
  });

  it('collégien : autonome, aucun accompagnement', () => {
    let n = 0;
    for (const hh of families) {
      const kids = hh.members.map((x, m) => ({ x, m })).filter(({ x }) => x.who.status === 'enfant');
      for (const { m } of kids) {
        if (traitsOf(hh, m).school?.kind !== 'college') continue;
        const day = schoolDays[0]!;
        const s = schoolDayOf(hh, m, day)!;
        expect(s.autonomous).toBe(true);
        expect(s.kind).toBe('college');
      }
      if (little(hh)) continue;
      n++;
      for (const day of schoolDays.slice(0, 20)) {
        const duties = dutiesOf(hh, day);
        const out = schoolRunOf(hh, day, duties);
        expect(out.run).toBeNull();
        expect(out.duties).toEqual(duties);
      }
    }
    expect(n).toBeGreaterThan(0);
  });

  it('étudiant : cours les jours ouvrés seulement (vacances scolaires comprises)', () => {
    const students = SEEDS.flatMap((seed) => cityDwellings(cityFacades(1440, 340, seed), seed)).flatMap((d) => d.hh.members.map((x, m) => ({ hh: d.hh, m, x })))
      .filter(({ x }) => x.who.status === 'etudiant');
    expect(students.length).toBeGreaterThan(0);
    let holidayCourses = 0;
    for (const { hh, m } of students) for (const day of YEAR.slice(0, 120)) {
      const s = schoolDayOf(hh, m, day);
      if (day.weekday === 0 || day.weekday === 6 || day.publicHoliday) expect(s).toBeNull();
      if (!s) continue;
      expect(s.kind).toBe('fac');
      expect(s.autonomous).toBe(true);
      expect(s.end).toBeGreaterThan(s.start);
      if (day.kind === 'holiday') holidayCourses++;
    }
    expect(holidayCourses).toBeGreaterThan(0);
  });
});

describe('dépose et sortie d’école', () => {
  it('un seul parent à la dépose et un seul à la sortie', () => {
    expect(runs.length).toBeGreaterThan(500);
    for (const { hh, run, duties, day } of runs) {
      expect(run, `${hh.seed} ${day.iso}`).not.toBeNull();
      const parents = parentsOf(hh);
      if (run!.drop !== null) expect(parents).toContain(run!.drop);
      const p = run!.pickup;
      if (p.by === 'parent') expect(parents).toContain(p.m);
      if (p.by === 'garderie') expect(parents).toContain(p.m);
      if (p.by === 'nanny') expect(parents).toContain(p.relay);
      // Un seul parent marqué « dépose » ; seul le parent qui dépose (ou qui passe à la garderie) voit sa journée changer.
      expect(duties.filter((d) => workOf(d)?.drop).length).toBeLessThanOrEqual(1);
    }
    const drops = runs.filter((r) => r.run!.drop !== null).length;
    expect(drops / runs.length).toBeGreaterThan(0.8);
  });

  it('parent cadre qui dépose : début ≥ 500 + trajet, checkLabourLaw vide', () => {
    let cadres = 0;
    for (const { hh, run, duties } of runs) {
      const m = run!.drop;
      if (m === null) continue;
      const w = workOf(duties[m]!);
      if (!w) continue;
      expect(w.drop).toBe(true);
      expect(w.start).toBeGreaterThanOrEqual(SCHOOL.drop + w.commute);
      if (hh.members[m]!.who.status === 'cadre') cadres++;
    }
    expect(cadres).toBeGreaterThan(20);
    // Droit du travail sur 4 semaines entières, devoirs modifiés par la logistique compris.
    for (const hh of families.filter(little)) {
      const days = YEAR.slice(0, 28).map((day) => ({ day, duties: schoolRunOf(hh, day, dutiesOf(hh, day)).duties }));
      for (const m of parentsOf(hh)) {
        if (!traitsOf(hh, m).work) continue;
        const split = !!traitsOf(hh, m).work!.split;
        const list = days.map(({ day, duties }) => ({ iso: day.iso, shifts: workOf(duties[m]!)?.shifts ?? [] }));
        expect(checkLabourLaw(list, split, `${hh.seed}/${m}`)).toEqual([]);
      }
    }
  });

  it('deux parents rentrés après 16 h 20 et nounou → nounou, jusqu’au retour du premier', () => {
    let n = 0;
    for (const { hh, run, duties, day } of runs) {
      if (!hh.nanny || nannyOff(hh, day)) continue;
      // Crèche seule : le premier parent rentré (test plus bas).
      if (hh.members.every((_, m) => { const k = schoolDayOf(hh, m, day); return !k || k.autonomous || k.kind === 'creche'; })) continue;
      const parents = parentsOf(hh);
      const late = parents.every((m) => workOf(duties[m]!) && back(duties[m]!) > SCHOOL.pickup - SCHOOL.walk);
      if (!late) { expect(run!.pickup.by).toBe('parent'); continue; }
      n++;
      const p = run!.pickup;
      expect(p.by).toBe('nanny');
      if (p.by !== 'nanny') continue;
      const first = Math.min(...parents.map((m) => back(duties[m]!)));
      expect(back(duties[p.relay]!)).toBe(first);
      expect(p.until - first).toBeGreaterThanOrEqual(SCHOOL.nannyLeave[0]);
      expect(p.until - first).toBeLessThanOrEqual(SCHOOL.nannyLeave[1]);
    }
    expect(n).toBeGreaterThan(10);
  });

  it('sans nounou → garderie, heure ≤ 18 h 30', () => {
    let n = 0;
    for (const { hh, run, duties } of runs) {
      if (hh.nanny) continue;
      const p = run!.pickup;
      if (p.by !== 'garderie') continue;
      n++;
      expect(p.at).toBeLessThanOrEqual(SCHOOL.garderieMax);
      expect(p.at).toBeGreaterThanOrEqual(SCHOOL.pickup);
      // Le parent qui passe à la garderie est rentré à l'heure dite (sa journée est écourtée s'il le faut).
      expect(back(duties[p.m]!)).toBeLessThanOrEqual(p.at);
      for (const m of parentsOf(hh)) {
        const w = workOf(duties[m]!);
        expect(w && back(duties[m]!) > SCHOOL.pickup - SCHOOL.walk || m === p.m).toBe(true);
      }
    }
    expect(n).toBeGreaterThan(10);
  });

  it('nounou en congé → garderie', () => {
    // Ses congés tombent sur les semaines du couple (parents libres) : on pose un jour de congé là où elle serait venue.
    let n = 0;
    for (const { hh, run, day } of runs) {
      if (run!.pickup.by !== 'nanny') continue;
      n++;
      forcedNannyLeave.add(day.iso);
      try {
        const out = schoolRunOf(hh, day, dutiesOf(hh, day));
        expect(out.run!.pickup.by, `${hh.seed} ${day.iso}`).toBe('garderie');
      } finally { forcedNannyLeave.clear(); }
    }
    expect(n).toBeGreaterThan(10);
  });

  it('parent en RTT → il dépose et va chercher', () => {
    let n = 0;
    for (const { hh, run, day } of runs) {
      const raw = dutiesOf(hh, day);
      const parents = parentsOf(hh);
      const off = parents.filter((m) => raw[m]?.kind === 'leave' && (raw[m] as { leave: string }).leave === 'RTT');
      const busy = parents.filter((m) => workOf(raw[m]!) && back(raw[m]!) > SCHOOL.pickup - SCHOOL.walk);
      if (off.length !== 1 || busy.length !== parents.length - 1) continue;
      n++;
      expect(run!.drop).toBe(off[0]);
      expect(run!.pickup).toEqual({ by: 'parent', m: off[0] });
    }
    expect(n).toBeGreaterThan(0);
  });

  it('crèche seule, deux parents rentrés après 16 h 20 → le premier rentré, ≤ 18 h 30, ni nounou ni journée écourtée', () => {
    let n = 0;
    for (const hh of families) {
      if (!hh.members.some((_, m) => traitsOf(hh, m).school?.kind === 'creche')) continue;
      const parents = parentsOf(hh);
      for (const day of YEAR) {
        const kids = hh.members.map((_, m) => schoolDayOf(hh, m, day)).filter((s) => s && !s.autonomous);
        if (!kids.length || kids.some((s) => s!.kind !== 'creche')) continue;
        const raw = dutiesOf(hh, day);
        const { run, duties } = schoolRunOf(hh, day, raw);
        const late = parents.every((m) => workOf(duties[m]!) && back(duties[m]!) > SCHOOL.pickup - SCHOOL.walk);
        if (!late) continue;
        const p = run!.pickup;
        expect(p.by, `${hh.seed} ${day.iso}`).toBe('parent');
        if (p.by !== 'parent') continue;
        const first = Math.min(...parents.map((m) => back(duties[m]!)));
        expect(back(duties[p.m]!)).toBe(first);
        expect(p.at).toBe(Math.max(first, SCHOOL.pickup));
        if (back(raw[p.m]!) > SCHOOL.crecheEnd) continue;
        n++;
        expect(p.at).toBeLessThanOrEqual(SCHOOL.crecheEnd);
        // Journée du parent qui va chercher : celle d'après la dépose, non écourtée.
        for (const m of parents) if (m !== run!.drop) expect(duties[m]).toEqual(raw[m]);
        if (p.m !== run!.drop) expect(workOf(duties[p.m]!)!.end).toBe(workOf(raw[p.m]!)!.end);
      }
    }
    expect(n).toBeGreaterThan(10);
  });

  it('garderie : parent sans service avant la fermeture → heure réelle de son retour, journée intacte', () => {
    const hh = families.filter(little).find((x) => !x.nanny && parentsOf(x).every((m) => traitsOf(x, m).work))!;
    expect(hh).toBeDefined();
    const day = schoolDays.find((d) => d.weekday === 2)!;
    const raw = dutiesOf(hh, day);
    // Deux parents qui ne commencent qu'à 18 h 20 (services fabriqués), 30 min de trajet.
    const late = (m: number): Duty => {
      const w = workOf(raw[m]!) ?? workOf(dutiesOf(hh, schoolDays.find((d) => workOf(dutyOf(hh, m, d)))!)[m]!)!;
      return { kind: 'work', w: { ...w, shifts: [[1100, 1300]], start: 1100, end: 1300, effective: 200, commute: 30, split: false } };
    };
    const duties = raw.map((d, m) => (parentsOf(hh).includes(m) ? late(m) : d));
    const { run, duties: out } = schoolRunOf(hh, day, duties);
    const p = run!.pickup;
    expect(p.by).toBe('garderie');
    if (p.by !== 'garderie') return;
    expect(workOf(out[p.m]!)!.shifts).toEqual([[1100, 1300]]);
    expect(p.at).toBe(back(out[p.m]!));
  });

  it('est déterministe', () => {
    const { hh, day } = runs[0]!;
    expect(schoolRunOf(hh, day, dutiesOf(hh, day))).toEqual(schoolRunOf(hh, day, dutiesOf(hh, day)));
  });
});
