import { describe, expect, it } from 'vitest';
import { addDays, dayContext, type DayContext, type YMD } from '../../../../src/core/library/city/calendar';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { cityDwellings } from '../../../../src/core/library/city/households';
import { checkLabourLaw } from '../../../../src/core/library/city/labour-law';
import { leaveOn } from '../../../../src/core/library/city/leave-plan';
import { traitsOf } from '../../../../src/core/library/city/person-traits';
import { continuousDay, dutyOf, sickOn, withDrop, type WorkDay } from '../../../../src/core/library/city/work-day';

const SEEDS = [1, 2, 3];
const cities = SEEDS.map((seed) => ({ seed, dwellings: cityDwellings(cityFacades(1440, 340, seed), seed) }));
const members = cities.flatMap((c) => c.dwellings.flatMap((d) => d.hh.members.map((x, m) => ({ d, m, who: x.who }))));
const actives = members.filter(({ d, m }) => traitsOf(d.hh, m).work);
const START: YMD = { y: 2026, m: 1, d: 5 }; // lundi
// 2026 entière, du lundi 5 janvier au dimanche 3 janvier 2027 (semaines ISO complètes).
const YEAR: DayContext[] = Array.from({ length: 52 * 7 }, (_, i) => dayContext(addDays(START, i), []));
const WEEKS = YEAR.slice(0, 8 * 7); // 8 semaines pour les tests plus lourds

const worked = (d: (typeof actives)[number], days: readonly DayContext[]) =>
  days.map((day) => { const duty = dutyOf(d.d.hh, d.m, day); return { day, duty, w: duty?.kind === 'work' ? duty.w : null }; });

describe('journée de travail', () => {
  it('jamais de travail le week-end ni un jour férié, sauf HCR le samedi', () => {
    expect(actives.length).toBeGreaterThan(30);
    let hcrSaturdays = 0;
    for (const a of actives) {
      const split = !!traitsOf(a.d.hh, a.m).work!.split;
      for (const { day, duty, w } of worked(a, YEAR)) {
        expect(duty).not.toBeNull();
        if (day.publicHoliday || day.weekday === 0) expect(duty!.kind).toBe('off');
        if (!split && day.weekday === 6) expect(duty!.kind).toBe('off');
        if (split && day.weekday === 1) expect(duty!.kind).toBe('off');
        if (w && day.weekday === 6) { expect(split).toBe(true); hcrSaturdays++; }
      }
    }
    expect(hcrSaturdays).toBeGreaterThan(0);
    // Pas actif : null.
    for (const { d, m } of members) if (!traitsOf(d.hh, m).work) expect(dutyOf(d.hh, m, YEAR[0]!)).toBeNull();
  });

  it('CP / RTT du plan → Duty leave', () => {
    let n = 0;
    for (const a of actives.slice(0, 20)) {
      for (const day of YEAR) {
        const leave = leaveOn(a.d.hh, a.m, day.date);
        const duty = dutyOf(a.d.hh, a.m, day)!;
        if (leave) { expect(duty).toEqual({ kind: 'leave', leave }); n++; }
        else expect(duty.kind).not.toBe('leave');
      }
    }
    expect(n).toBeGreaterThan(200);
  });

  it('cadre : fin ≤ 19 h 30, déjeuner entre 12 h et 13 h', () => {
    const cadres = actives.filter((a) => a.who.status === 'cadre');
    expect(cadres.length).toBeGreaterThan(5);
    let long = 0, total = 0;
    for (const a of cadres) for (const { w } of worked(a, YEAR)) {
      if (!w) continue;
      total++;
      if (w.long) long++;
      expect(Math.abs(w.start - traitsOf(a.d.hh, a.m).work!.start)).toBeLessThanOrEqual(15);
      expect(w.start % 5).toBe(0);
      expect(w.end).toBeLessThanOrEqual(1170);
      expect(w.shifts).toHaveLength(2);
      const lunch = w.shifts[0]![1];
      expect(lunch).toBeGreaterThanOrEqual(720);
      expect(lunch).toBeLessThanOrEqual(780);
      const pause = w.shifts[1]![0] - lunch;
      expect(pause).toBeGreaterThanOrEqual(45);
      expect(pause).toBeLessThanOrEqual(90);
      expect(w.split).toBe(false);
    }
    // Journée longue : 12 % des jours.
    expect(long / total).toBeGreaterThan(0.08);
    expect(long / total).toBeLessThan(0.16);
  });

  it('non-cadre : début fixe d\'un jour à l\'autre', () => {
    const others = actives.filter((a) => a.who.status === 'non-cadre' && !traitsOf(a.d.hh, a.m).work!.split);
    expect(others.length).toBeGreaterThan(3);
    for (const a of others) {
      const starts = new Set(worked(a, WEEKS).flatMap(({ w }) => (w ? [w.start] : [])));
      expect(starts.size).toBe(1);
      const [start] = [...starts];
      expect(start).toBe(traitsOf(a.d.hh, a.m).work!.start);
      for (const { w } of worked(a, WEEKS)) if (w) {
        expect(w.shifts[1]![0] - w.shifts[0]![1]).toBe(30);
        expect(w.shifts[0]![1] - w.start).toBeGreaterThanOrEqual(210);
        expect(w.shifts[0]![1] - w.start).toBeLessThanOrEqual(270);
        expect(w.long).toBe(false);
      }
    }
  });

  it('HCR : deux services, homeAtBreak tiré', () => {
    const hcr = actives.filter((a) => traitsOf(a.d.hh, a.m).work!.split);
    expect(hcr.length).toBeGreaterThan(0);
    let home = 0, n = 0;
    for (const a of hcr) for (const { w } of worked(a, YEAR)) {
      if (!w) continue;
      n++;
      if (w.homeAtBreak) home++;
      expect(w.split).toBe(true);
      expect(w.shifts).toEqual([[660, 870], [1110, 1350]]);
      expect(w.start).toBe(660);
      expect(w.end).toBe(1350);
      expect(w.effective).toBe(450);
    }
    expect(home / n).toBeGreaterThan(0.65);
    expect(home / n).toBeLessThan(0.85);
  });

  it('préparation ± 5 autour du trait, trajet du trait, même journée pour la même date', () => {
    for (const a of actives.slice(0, 15)) {
      const t = traitsOf(a.d.hh, a.m);
      for (const { day, w } of worked(a, WEEKS)) if (w) {
        expect(Math.abs(w.prep - t.prep)).toBeLessThanOrEqual(5);
        expect(w.commute).toBe(t.commute);
        expect(w.walk).toBe(t.walk);
        expect(w.drop).toBe(false);
        expect(dutyOf(a.d.hh, a.m, day)).toEqual({ kind: 'work', w });
      }
    }
  });

  it('droit du travail sur un an pour chaque actif de 3 graines', () => {
    for (const a of actives) {
      const days = worked(a, YEAR).map(({ day, w }) => ({ iso: day.iso, shifts: w?.shifts ?? [] }));
      const split = !!traitsOf(a.d.hh, a.m).work!.split;
      expect(checkLabourLaw(days, split, `${a.d.id}/${a.m}`)).toEqual([]);
    }
  });

  it('withDrop : début ≥ 8 h 20 + trajet et checkLabourLaw vide sur la journée', () => {
    let moved = 0;
    for (const a of actives) {
      const cadre = a.who.status === 'cadre';
      const split = !!traitsOf(a.d.hh, a.m).work!.split;
      const days: { iso: string; shifts: WorkDay['shifts'] }[] = [];
      for (const { day, w } of worked(a, WEEKS)) {
        if (!w) { days.push({ iso: day.iso, shifts: [] }); continue; }
        const dw = withDrop(w, cadre);
        expect(dw.drop).toBe(true);
        expect(dw.start).toBeGreaterThanOrEqual(500 + w.commute);
        if (dw.start > w.start) moved++;
        if (cadre) {
          expect(dw.end).toBeLessThanOrEqual(1170);
          expect(dw.shifts[0]![1]).toBeGreaterThanOrEqual(720);
          expect(dw.shifts[0]![1]).toBeLessThanOrEqual(780);
        }
        expect(checkLabourLaw([{ iso: day.iso, shifts: dw.shifts }], split, a.d.id)).toEqual([]);
        days.push({ iso: day.iso, shifts: dw.shifts });
      }
      expect(checkLabourLaw(days, split, `${a.d.id}/${a.m}`)).toEqual([]);
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('continuousDay : matin borné [120, 360], effectif ≤ min(600, matin + 360)', () => {
    const base = { start: 480, pause: 30, commute: 20, prep: 40, walk: false, cadre: false, long: false };
    const short = continuousDay({ ...base, effective: 420, morning: 60 });
    expect(short.shifts[0]![1] - short.shifts[0]![0]).toBe(120);
    expect(short.effective).toBe(420);
    const longMorning = continuousDay({ ...base, effective: 700, morning: 400 });
    expect(longMorning.shifts[0]![1] - longMorning.shifts[0]![0]).toBe(360);
    expect(longMorning.effective).toBe(600);
    const capped = continuousDay({ ...base, effective: 560, morning: 150 });
    expect(capped.effective).toBe(510);
    const cadre = continuousDay({ ...base, start: 600, pause: 90, effective: 570, morning: 150, cadre: true, long: true });
    expect(cadre.end).toBeLessThanOrEqual(1170);
    expect(cadre.long).toBe(true);
    expect(cadre.split).toBe(false);
    for (const w of [short, longMorning, capped, cadre]) expect(checkLabourLaw([{ iso: '2026-03-03', shifts: w.shifts }], false, 'x')).toEqual([]);
  });

  it('sickOn : jamais un enfant, ≈ 1,5 % des jours adultes sur 3 graines × 1 an (± 0,5 point)', () => {
    let sick = 0, n = 0;
    for (const { d, m, who } of members) {
      for (const day of YEAR) {
        const s = sickOn(d.hh, m, day.iso);
        if (who.status === 'enfant') expect(s).toBe(false);
        else { n++; if (s) sick++; }
      }
    }
    expect(n).toBeGreaterThan(10000);
    expect(sick / n).toBeGreaterThan(0.01);
    expect(sick / n).toBeLessThan(0.02);
  });

  it('malade un jour travaillé → Duty sick', () => {
    let n = 0;
    for (const a of actives) for (const day of YEAR) {
      const duty = dutyOf(a.d.hh, a.m, day)!;
      if (sickOn(a.d.hh, a.m, day.iso) && duty.kind !== 'off' && duty.kind !== 'leave') { expect(duty.kind).toBe('sick'); n++; }
      if (duty.kind === 'sick') expect(sickOn(a.d.hh, a.m, day.iso)).toBe(true);
    }
    expect(n).toBeGreaterThan(0);
  });
});
