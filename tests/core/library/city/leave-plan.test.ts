import { describe, expect, it } from 'vitest';
import { addDays, isoDate, publicHolidays, weekdayOf, type YMD } from '../../../../src/core/library/city/calendar';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { cityDwellings, type Dwelling } from '../../../../src/core/library/city/households';
import { checkPaidLeave } from '../../../../src/core/library/city/labour-law';
import { awayState, leaveOn, leavePlanOf, nannyLeavePlan, SCHOOL_WEEKS, type AwayState } from '../../../../src/core/library/city/leave-plan';
import { traitsOf } from '../../../../src/core/library/city/person-traits';
import { isoWeek } from '../../../../src/core/library/city/scene-day';

const SEEDS = [1, 2, 3];
const cities = SEEDS.map((seed) => ({ seed, dwellings: cityDwellings(cityFacades(1440, 340, seed), seed) }));
const actives = cities.flatMap((c) => c.dwellings.flatMap((d) => d.hh.members.flatMap((_, m) => (traitsOf(d.hh, m).work ? [{ d, m }] : []))));
const weekOf = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const date = { y, m, d };
  return isoWeek(date, weekdayOf(date)).week % 100;
};
const ymdOf = (iso: string): YMD => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return { y, m, d };
};
const isHoliday = (iso: string) => publicHolidays(+iso.slice(0, 4))[iso] !== undefined;
const cpWeeks = (plan: ReadonlyMap<string, 'CP' | 'RTT'>): number[] => {
  // Semaine de CP : au moins 4 CP dans la semaine (un férié peut en ôter un).
  const n = new Map<number, number>();
  for (const [iso, v] of plan) if (v === 'CP') n.set(weekOf(iso), (n.get(weekOf(iso)) ?? 0) + 1);
  return [...n].filter(([, k]) => k >= 4).map(([w]) => w).sort((a, b) => a - b);
};

describe('plan de congés', () => {
  it('25 CP et les RTT du contrat pour chaque actif de 3 graines, sur 2026 et 2027', () => {
    expect(actives.length).toBeGreaterThan(30);
    for (const { d, m } of actives) {
      for (const year of [2026, 2027]) {
        const plan = leavePlanOf(d.hh, m, year);
        expect(checkPaidLeave(plan, traitsOf(d.hh, m).work!.rttPerYear, `${d.id}/${m}`)).toEqual([]);
      }
    }
    // Non-actifs : plan vide.
    for (const c of cities) for (const d of c.dwellings) d.hh.members.forEach((_, m) => {
      if (!traitsOf(d.hh, m).work) expect(leavePlanOf(d.hh, m, 2026).size).toBe(0);
    });
  });

  it('exactement 25 CP par actif sur une année sans semaine 53 (2027)', () => {
    for (const { d, m } of actives) {
      const cp = [...leavePlanOf(d.hh, m, 2027).values()].filter((v) => v === 'CP').length;
      expect(cp, `${d.id}/${m}`).toBe(25);
    }
  });

  it('aucun CP un samedi, un dimanche ni un jour férié (HCR : aucun le lundi ni le dimanche)', () => {
    let hcr = 0;
    for (const { d, m } of actives) {
      const split = traitsOf(d.hh, m).work!.split;
      if (split) hcr++;
      for (const year of [2026, 2027]) {
        for (const iso of leavePlanOf(d.hh, m, year).keys()) {
          const wd = weekdayOf(ymdOf(iso));
          expect(isHoliday(iso)).toBe(false);
          if (split) expect(wd === 0 || wd === 1).toBe(false);
          else expect(wd === 0 || wd === 6).toBe(false);
        }
      }
    }
    expect(hcr).toBeGreaterThan(0);
  });

  it('parents : 3 semaines d’été consécutives dans 28–35 et la semaine 52', () => {
    let parents = 0;
    for (const { d, m } of actives) {
      if (!d.hh.members.some((x) => x.who.status === 'enfant')) continue;
      parents++;
      const weeks = cpWeeks(leavePlanOf(d.hh, m, 2026));
      const summer = weeks.filter((w) => w >= 28 && w <= 35);
      expect(summer.length).toBe(3);
      expect(summer[2]! - summer[0]!).toBe(2);
      expect(weeks).toContain(52);
      const small = [...SCHOOL_WEEKS.hiver, ...SCHOOL_WEEKS.printemps, ...SCHOOL_WEEKS.toussaint] as number[];
      expect(weeks.filter((w) => small.includes(w)).length).toBe(1);
    }
    expect(parents).toBeGreaterThan(3);
  });

  it('RTT : ≥ 50 % des jours isolés un vendredi sur l’ensemble des actifs', () => {
    let rtt = 0;
    let friday = 0;
    for (const { d, m } of actives) {
      for (const [iso, v] of leavePlanOf(d.hh, m, 2026)) {
        if (v !== 'RTT') continue;
        rtt++;
        if (weekdayOf(ymdOf(iso)) === 5) friday++;
      }
    }
    expect(rtt).toBeGreaterThan(50);
    expect(friday / rtt).toBeGreaterThanOrEqual(0.5);
  });

  it('conjoints : mêmes semaines de CP', () => {
    let couples = 0;
    for (const c of cities) {
      for (const d of c.dwellings) {
        const [a, b] = d.hh.members;
        if (!a || !b || a.who.partner !== 1 || !traitsOf(d.hh, 0).work || !traitsOf(d.hh, 1).work) continue;
        couples++;
        expect(cpWeeks(leavePlanOf(d.hh, 0, 2026))).toEqual(cpWeeks(leavePlanOf(d.hh, 1, 2026)));
      }
    }
    expect(couples).toBeGreaterThan(3);
  });

  it('nounou : 25 CP, semaines calées sur celles du couple', () => {
    let nannies = 0;
    for (const c of cities) {
      for (const d of c.dwellings) {
        if (!d.hh.nanny) { expect(nannyLeavePlan(d.hh, 2026).size).toBe(0); continue; }
        nannies++;
        const plan = nannyLeavePlan(d.hh, 2026);
        expect(checkPaidLeave(plan, 0, d.id)).toEqual([]);
        const parentWeeks = cpWeeks(leavePlanOf(d.hh, traitsOf(d.hh, 0).work ? 0 : 1, 2026));
        for (const w of cpWeeks(plan)) if (parentWeeks.length) expect(parentWeeks).toContain(w);
      }
    }
    expect(nannies).toBeGreaterThan(0);
  });

  it('31 décembre et 1er janvier lus sur le plan de l’année ISO', () => {
    // 31 décembre 2025 : semaine 1 de 2026 ; 31 décembre 2026 et 1er janvier 2027 : semaine 53 de 2026.
    expect(isoWeek({ y: 2025, m: 12, d: 31 }, 3).week).toBe(202601);
    expect(isoWeek({ y: 2027, m: 1, d: 1 }, 5).week).toBe(202653);
    let found = 0;
    for (const { d, m } of actives) {
      const plan = leavePlanOf(d.hh, m, 2026);
      if (plan.get('2025-12-31') !== 'CP') continue;
      found++;
      expect(leavePlanOf(d.hh, m, 2025).has('2025-12-31')).toBe(false);
      expect(leaveOn(d.hh, m, { y: 2025, m: 12, d: 31 })).toBe('CP');
    }
    expect(found).toBeGreaterThan(0);
    // Semaine 53 de 2026 : suite de Noël pour qui prend la semaine 52 (le 1er janvier, férié, n'est jamais un CP).
    let christmas = 0;
    for (const { d, m } of actives) {
      expect(leaveOn(d.hh, m, { y: 2027, m: 1, d: 1 })).toBeNull();
      if (leaveOn(d.hh, m, { y: 2026, m: 12, d: 22 }) !== 'CP' || leaveOn(d.hh, m, { y: 2026, m: 12, d: 23 }) !== 'CP') continue;
      christmas++;
      expect(leaveOn(d.hh, m, { y: 2026, m: 12, d: 31 })).toBe('CP');
      expect(leavePlanOf(d.hh, m, 2026).get('2026-12-31')).toBe('CP');
    }
    expect(christmas).toBeGreaterThan(3);
  });
});

describe('départs en vacances', () => {
  const NEXT: Record<AwayState, AwayState[]> = { home: ['home', 'leaves'], leaves: ['away'], away: ['away', 'returns'], returns: ['home', 'leaves'] };

  it('away : jamais sans que tous les actifs soient en CP toute la semaine ; samedi leaves → away → dimanche returns, sans trou', () => {
    let aways = 0;
    for (const c of cities) {
      for (const d of c.dwellings) {
        const act = d.hh.members.map((_, m) => m).filter((m) => traitsOf(d.hh, m).work);
        let prev: AwayState | null = null;
        for (let date: YMD = { y: 2026, m: 1, d: 5 }; date.y === 2026; date = addDays(date, 1)) {
          const { state, at } = awayState(d, c.seed, date);
          const iso = isoDate(date);
          const wd = weekdayOf(date);
          if (prev) expect(NEXT[prev], `${d.id} ${iso} ${prev}→${state}`).toContain(state);
          if (state === 'leaves') { expect(wd).toBe(6); expect(at).toBeGreaterThanOrEqual(600); expect(at).toBeLessThanOrEqual(690); }
          if (state === 'returns') { expect(wd).toBe(0); expect(at).toBeGreaterThanOrEqual(960); expect(at).toBeLessThanOrEqual(1140); }
          if (state === 'away') {
            aways++;
            // Enfants : seulement pendant les semaines de vacances scolaires fixes (53 : suite de Noël).
            if (d.hh.members.some((x) => x.who.status === 'enfant')) expect([...Object.values(SCHOOL_WEEKS).flat(), 53]).toContain(weekOf(isoDate(wd === 0 ? addDays(date, 1) : date)));
            for (const m of act) {
              const days = traitsOf(d.hh, m).work!.split?.days ?? [1, 2, 3, 4, 5];
              if (days.includes(wd) && !isHoliday(iso)) expect(leaveOn(d.hh, m, date), `${d.id}/${m} ${iso}`).toBe('CP');
            }
          }
          prev = state;
        }
      }
    }
    expect(aways).toBeGreaterThan(50);
  });

  it('famille avec actifs : jamais partie hors des semaines de vacances scolaires (40 graines, 2026 et 2027)', () => {
    const holidays = new Set<number>([...Object.values(SCHOOL_WEEKS).flat(), 53]);
    let families = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const d of cityDwellings(cityFacades(1440, 340, seed), seed)) {
        if (!d.hh.members.some((x) => x.who.status === 'enfant')) continue;
        if (!d.hh.members.some((_, m) => traitsOf(d.hh, m).work)) continue;
        families++;
        for (const year of [2026, 2027]) {
          for (let monday: YMD = { y: year, m: 1, d: 5 }; monday.y === year; monday = addDays(monday, 7)) {
            if (awayState(d, seed, monday).state === 'away') expect(holidays, `${d.id} ${isoDate(monday)}`).toContain(weekOf(isoDate(monday)));
          }
        }
      }
    }
    expect(families).toBeGreaterThan(20);
  });

  it('est déterministe', () => {
    const c = cities[0]!;
    const d: Dwelling = c.dwellings[0]!;
    const date = { y: 2026, m: 8, d: 1 };
    expect(awayState(d, c.seed, date)).toEqual(awayState(d, c.seed, date));
  });
});
