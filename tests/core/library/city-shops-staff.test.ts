import { describe, expect, it } from 'vitest';
import { addDays, type YMD } from '../../../src/core/library/city/calendar';
import { SHOP_DEFS, SHOP_TYPE_IDS } from '../../../src/core/library/city/shops/catalog';
import { isOpenAt } from '../../../src/core/library/city/shops/hours';
import { isRelay, shutterAt, staffAt, staffPlan, staffShiftsAt } from '../../../src/core/library/city/shops/staff';

const MONDAY: YMD = { y: 2026, m: 10, d: 5 };
const WEEK = Array.from({ length: 7 }, (_, i) => addDays(MONDAY, i));
const HOLIDAY: YMD = { y: 2026, m: 11, d: 11 }; // mercredi férié
const DATES = [...WEEK, HOLIDAY, addDays(HOLIDAY, 1)];
const SEEDS = [3, 77, 4242];
const present = (s: { where: string; onBreak: boolean }): boolean => (s.where === 'inside' || s.where === 'opening' || s.where === 'closing') && !s.onBreak;

describe('personnel : catalogue', () => {
  it('donne une équipe de 1 à 3 personnes à chaque type', () => {
    for (const id of SHOP_TYPE_IDS) {
      const { min, max } = SHOP_DEFS[id].staff;
      expect(min).toBeGreaterThanOrEqual(1);
      expect(max).toBeGreaterThanOrEqual(min);
      expect(max).toBeLessThanOrEqual(3);
    }
    for (const id of ['minimarket', 'bar', 'cafe', 'restaurant', 'pizzeria', 'nightclub', 'laundry', 'arcade'] as const) expect(SHOP_DEFS[id].staff).toEqual({ min: 2, max: 3 });
  });
});

describe('personnel : invariant', () => {
  it('quelqu’un est à l’intérieur à chaque minute d’ouverture (32 types, 9 jours, 3 graines)', () => {
    for (const id of SHOP_TYPE_IDS) {
      const def = SHOP_DEFS[id];
      for (const seed of SEEDS) {
        for (const date of DATES) {
          const shifts = staffShiftsAt(def, seed, 'slot-1', date);
          for (let m = 0; m < 1440; m++) {
            if (!isOpenAt(def, date, m)) continue;
            if (!staffAt(shifts, m).some(present)) throw new Error(`${id} seed ${seed} ${date.m}/${date.d} minute ${m} : personne`);
          }
        }
      }
    }
  }, 120_000);
  it('le rideau n’est jamais levé sans personne à l’intérieur', () => {
    for (const id of SHOP_TYPE_IDS) {
      const def = SHOP_DEFS[id];
      for (const date of DATES) {
        const shifts = staffShiftsAt(def, 5, 'slot-2', date);
        for (let m = 0; m < 1440; m += 1) {
          if (shutterAt(shifts, def, date, m) === 'up' && !staffAt(shifts, m).some((s) => s.where === 'inside')) throw new Error(`${id} ${m}`);
        }
      }
    }
  }, 60_000);
});

describe('personnel : plan du jour', () => {
  it('est vide quand le commerce est fermé (dimanche, férié, lundi)', () => {
    expect(staffPlan(SHOP_DEFS.bookshop, 1, 's', WEEK[6]!)).toEqual([]);
    expect(staffPlan(SHOP_DEFS.bookshop, 1, 's', WEEK[0]!)).toEqual([]);
    expect(staffPlan(SHOP_DEFS.bakery, 1, 's', HOLIDAY)).toEqual([]);
    expect(staffPlan(SHOP_DEFS.minimarket, 1, 's', HOLIDAY).length).toBeGreaterThan(0);
  });
  it('est déterministe et change avec la graine', () => {
    const a = staffPlan(SHOP_DEFS.cafe, 9, 's', WEEK[2]!);
    expect(staffPlan(SHOP_DEFS.cafe, 9, 's', WEEK[2]!)).toEqual(a);
    expect(JSON.stringify(staffPlan(SHOP_DEFS.cafe, 10, 's', WEEK[2]!))).not.toBe(JSON.stringify(a));
  });
  it('fait franchir la porte à l’ouvreur 13 à 20 min avant l’ouverture (2/3 de son avance de 20 à 30 min)', () => {
    const plan = staffPlan(SHOP_DEFS.bookshop, 4, 's', WEEK[2]!);
    const opener = plan.find((s) => s.role === 'opener')!;
    const before = 600 - opener.arriveAt;
    expect(before).toBeGreaterThanOrEqual(13);
    expect(before).toBeLessThanOrEqual(20);
    expect(opener.shutterUp).toBe(600);
  });
  it('relais : deux équipes se chevauchent au moins 5 min dans les plages de plus de 9 h', () => {
    for (const id of SHOP_TYPE_IDS) {
      const def = SHOP_DEFS[id];
      if (!isRelay(def)) continue;
      for (const seed of SEEDS) {
        const plan = staffPlan(def, seed, 's', WEEK[3]!);
        const first = plan.filter((s) => s.id.includes('-t0-'));
        const second = plan.filter((s) => s.id.includes('-t1-'));
        expect(first.length, id).toBeGreaterThan(0);
        expect(second.length, id).toBeGreaterThan(0);
        const inB = Math.max(...second.map((s) => s.arriveAt));
        const outA = Math.min(...first.map((s) => s.leaveAt));
        expect(outA - inB, id).toBeGreaterThanOrEqual(5);
      }
    }
  });
  it('désigne les types attendus comme relayés', () => {
    for (const id of ['minimarket', 'laundry', 'cafe', 'arcade'] as const) expect(isRelay(SHOP_DEFS[id]), id).toBe(true);
    for (const id of ['restaurant', 'pizzeria', 'bar', 'nightclub'] as const) expect(isRelay(SHOP_DEFS[id]), id).toBe(false);
  });
  it('ne met en pause que si un autre est à l’intérieur, jamais un membre isolé', () => {
    let withBreaks = 0;
    for (const id of SHOP_TYPE_IDS) {
      const def = SHOP_DEFS[id];
      for (const seed of SEEDS) {
        for (const date of WEEK) {
          const shifts = staffShiftsAt(def, seed, 's', date);
          for (const s of shifts) {
            if (s.breaks.length === 0) continue;
            withBreaks++;
            for (const [a, b] of s.breaks) {
              expect(b).toBeGreaterThan(a);
              for (let m = Math.ceil(a); m < b; m++) {
                const states = staffAt(shifts, m);
                expect(states.find((x) => x.id === s.id)!.onBreak).toBe(true);
                expect(states.some((x) => x.id !== s.id && present(x)), `${id} ${m}`).toBe(true);
              }
            }
          }
        }
      }
    }
    expect(withBreaks).toBeGreaterThan(0);
  });
  it('une équipe d’un seul membre n’a pas de pause', () => {
    let solos = 0;
    for (const id of SHOP_TYPE_IDS) for (const date of WEEK) for (const seed of SEEDS) {
      const teams = new Map<string, ReturnType<typeof staffPlan>>();
      for (const s of staffPlan(SHOP_DEFS[id], seed, 's', date)) {
        const key = s.id.replace(/-m[0-9]+$/, '');
        teams.set(key, [...(teams.get(key) ?? []), s]);
      }
      for (const team of teams.values()) if (team.length === 1) { solos++; expect(team[0]!.breaks).toEqual([]); }
    }
    expect(solos).toBeGreaterThan(0);
  });
});

describe('personnel : plages passant minuit', () => {
  it('garde le personnel de la veille jusqu’à fermeture + 15 min, sans doubler les postes', () => {
    const cases = [['bar', 26 * 60], ['arcade', 25 * 60], ['nightclub', 29 * 60]] as const;
    for (const [id, end] of cases) {
      const def = SHOP_DEFS[id];
      const date = id === 'nightclub' ? WEEK[4]! : WEEK[2]!;
      const next = addDays(date, 1);
      const today = staffPlan(def, 6, 's', date);
      const tomorrow = staffPlan(def, 6, 's', next);
      const carried = today.filter((s) => s.leaveAt > 1440);
      expect(carried.length, id).toBeGreaterThan(0);
      expect(Math.max(...carried.map((s) => s.leaveAt))).toBe(end + 15);
      const merged = staffShiftsAt(def, 6, 's', next);
      const ids = merged.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const s of tomorrow) expect(carried.some((c) => c.id === s.id)).toBe(false);
      expect(staffAt(merged, end - 1440 + 14).some((x) => x.where === 'inside'), id).toBe(true);
      expect(staffAt(merged, end - 1440 + 15 + 4).every((x) => x.where === 'absent' || x.where === 'walking-in'), id).toBe(true);
    }
  });
});

describe('personnel : plages doubles et rideau', () => {
  it('rideau baissé et personne à l’intérieur entre les deux services', () => {
    for (const id of ['restaurant', 'pizzeria'] as const) {
      const def = SHOP_DEFS[id];
      const date = WEEK[3]!;
      const shifts = staffShiftsAt(def, 8, 's', date);
      const end1 = def.hours[0]![1];
      const start2 = def.hours[1]![0];
      for (let m = end1 + 20; m < start2 - 31; m++) {
        expect(shutterAt(shifts, def, date, m), `${id} ${m}`).toBe('down');
        expect(staffAt(shifts, m).every((s) => s.where === 'absent' || s.where === 'walking-in' || s.where === 'walking-out'), `${id} ${m}`).toBe(true);
      }
    }
  });
  it('rideau qui se lève à l’ouverture et qui tombe à la fermeture', () => {
    const def = SHOP_DEFS.bookshop;
    const date = WEEK[2]!;
    const shifts = staffShiftsAt(def, 2, 's', date);
    expect(shutterAt(shifts, def, date, 599)).toBe('down');
    expect(staffAt(shifts, 600.05).some((s) => s.where === 'opening')).toBe(true);
    expect(shutterAt(shifts, def, date, 600.05)).toBe('rising');
    expect(shutterAt(shifts, def, date, 601)).toBe('up');
    expect(staffAt(shifts, 19 * 60 + 0.05).some((s) => s.where === 'closing')).toBe(true);
    expect(shutterAt(shifts, def, date, 19 * 60 + 0.05)).toBe('falling');
    expect(shutterAt(shifts, def, date, 19 * 60 + 5)).toBe('down');
  });
  it('fait marcher le personnel 3 min avant l’entrée, côté tiré, avec avancement', () => {
    const shifts = staffPlan(SHOP_DEFS.bookshop, 2, 's', WEEK[2]!);
    const s = shifts[0]!;
    const st = staffAt(shifts, s.arriveAt - 1.5).find((x) => x.id === s.id)!;
    expect(st.where).toBe('walking-in');
    expect(st.progress).toBeCloseTo(0.5, 5);
    expect([1, -1]).toContain(st.side);
    expect(staffAt(shifts, s.arriveAt - 10).find((x) => x.id === s.id)!.where).toBe('absent');
    expect(staffAt(shifts, s.leaveAt + 1).find((x) => x.id === s.id)!.where).toBe('walking-out');
  });
});
