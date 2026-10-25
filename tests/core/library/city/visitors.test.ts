import { describe, expect, it } from 'vitest';
import { addDays, dayContext, type DayContext, type YMD } from '../../../../src/core/library/city/calendar';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { cityDwellings } from '../../../../src/core/library/city/households';
import { householdMeals } from '../../../../src/core/library/city/home-rooms';
import { dayRng } from '../../../../src/core/library/city/person-traits';
import { householdDays, type HouseholdDays } from '../../../../src/core/library/city/person-day';
import { approximatePeriods } from '../../../../src/core/library/city/school-calendar';
import { sceneDay, type SceneDay } from '../../../../src/core/library/city/scene-day';
import { cityCallers, dayVisits, visitorPool, type Visit } from '../../../../src/core/library/city/visitors';

// Visiteurs à identité stable (tâche 9) : villes de 1440 px, 3 graines, 60 jours (novembre-décembre 2026).
const PERIODS = approximatePeriods(2026);
const ctx = (date: YMD): DayContext => ({ ...dayContext(date, PERIODS), periods: PERIODS });
const START: YMD = { y: 2026, m: 11, d: 1 };
const DAYS = Array.from({ length: 60 }, (_, i) => ctx(addDays(START, i)));
const DRY = { precip: 0, snow: false, storm: false };
const TOWNS = [1, 2, 3].map((seed) => ({ seed, dwellings: cityDwellings(cityFacades(1440, 340, seed), seed) }));
type Row = { seed: number; d: (typeof TOWNS)[number]['dwellings'][number]; day: SceneDay; hd: HouseholdDays; visits: Visit[]; guests: boolean };
const ROWS: Row[] = TOWNS.flatMap(({ seed, dwellings }) =>
  dwellings.flatMap((d) => DAYS.map((c, i) => {
    const day = sceneDay(c, DRY, seed);
    const hd = householdDays(d, c, seed);
    const meals = householdMeals(d, hd, dayRng(d.hh.seed, 0, c.iso, 'repas'));
    const guests = i % 2 === 0;
    return { seed, d, day, hd, guests, visits: dayVisits(d, hd, meals, day, seed, guests) };
  })));

// Le membre est éveillé et au logement pendant [a, b] (sorties du jour exclues).
function present(row: Row, m: number, a: number, b: number): boolean {
  const p = row.hd.people[m]!;
  if (row.hd.away.state !== 'home') return false;
  const end = p.outing && p.outing.ret > 1440 ? 1440 : p.bed;
  if (a < p.wake || b > end) return false;
  return !p.out.some(([x, y]) => a < y && b > x);
}

describe('visiteurs à identité stable', () => {
  it('même foyer → mêmes amis chaque jour (id, prénom, âge, quartier)', () => {
    const seen = new Map<string, string>();
    let n = 0;
    for (const r of ROWS) for (const v of r.visits) {
      if (v.kind !== 'ami' && v.kind !== 'famille' && v.kind !== 'diner') continue;
      const sig = JSON.stringify([v.visitor.who.first, v.visitor.who.age, v.visitor.quarter, v.visitor.job]);
      const prev = seen.get(v.visitor.id);
      if (prev) expect(sig).toBe(prev);
      seen.set(v.visitor.id, sig);
      n++;
    }
    expect(n).toBeGreaterThan(100);
    for (const { dwellings } of TOWNS) for (const d of dwellings) {
      const a = visitorPool(d.hh), b = visitorPool(d.hh);
      expect(a).toEqual(b);
      expect(a).toHaveLength(3);
      expect(a.map((v) => v.id)).toEqual([0, 1, 2].map((k) => `friend:${d.hh.seed}:${k}`));
    }
  });

  it('hôte présent et éveillé pendant toute la visite', () => {
    const bad: string[] = [];
    let n = 0;
    for (const r of ROWS) for (const v of r.visits) {
      if (v.kind === 'nounou') continue;
      n++;
      if (!present(r, v.host, v.arrive, v.leave + r.d.climb)) bad.push(`${r.d.id} ${r.day.iso} ${v.kind} ${v.arrive}-${v.leave}`);
      expect(v.leave).toBeGreaterThan(v.arrive);
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(n).toBeGreaterThan(200);
  });

  it('aucune visite un jour away', () => {
    let aways = 0;
    for (const r of ROWS) if (r.hd.away.state !== 'home') { aways++; expect(r.visits).toEqual([]); }
    expect(aways).toBeGreaterThan(0);
  });

  it('livreurs seulement les jours ouvrés entre 9 h et 19 h', () => {
    let n = 0;
    const callers = new Set(Object.values(cityCallers(1)).flat().map((v) => v.id));
    for (const r of ROWS) for (const v of r.visits) {
      if (v.kind !== 'livreur') continue;
      n++;
      expect(r.day.weekday >= 1 && r.day.weekday <= 5 && r.day.kind !== 'public-holiday').toBe(true);
      expect(v.arrive).toBeGreaterThanOrEqual(540);
      expect(v.leave).toBeLessThanOrEqual(1140);
      expect(v.inside).toBe(false);
      if (r.seed === 1) expect(callers.has(v.visitor.id)).toBe(true);
    }
    expect(n).toBeGreaterThan(20);
  });

  it('livreurs, vendeurs, commerciaux : 4, 2 et 2 identités stables', () => {
    const c = cityCallers(7);
    expect([c.livreur.length, c.vendeur.length, c.commercial.length]).toEqual([4, 2, 2]);
    expect(cityCallers(7)).toEqual(c);
    expect(c.livreur[1]!.id).toBe('livreur:7:1');
    expect(c.commercial[0]!.id).toBe('commercial:7:0');
    const kinds = new Set(ROWS.flatMap((r) => r.visits.map((v) => v.kind)));
    for (const k of ['ami', 'famille', 'livreur', 'diner', 'nounou']) expect(kinds.has(k as Visit['kind'])).toBe(true);
  });

  it('nounou : visites identiques à NannyDay.visits', () => {
    let n = 0;
    for (const r of ROWS) {
      const mine = r.visits.filter((v) => v.kind === 'nounou');
      const nd = r.hd.nanny;
      expect(mine.map((v) => [v.arrive, v.leave])).toEqual(nd ? nd.visits.map((v) => [v.arrive, v.leave]) : []);
      for (const v of mine) { expect(v.visitor).toBe(nd!.visitor); expect(v.inside).toBe(true); n++; }
      if (mine.length) expect(r.visits[0]!.kind).toBe('nounou');
    }
    expect(n).toBeGreaterThan(20);
  });

  it('dîner : 1-2 invités seulement si guests', () => {
    let withGuests = 0;
    for (const r of ROWS) {
      const dinners = r.visits.filter((v) => v.kind === 'diner');
      if (!r.guests) expect(dinners).toEqual([]);
      else { expect(dinners.length).toBeLessThanOrEqual(2); withGuests += dinners.length ? 1 : 0; }
      expect(new Set(dinners.map((v) => v.visitor.id)).size).toBe(dinners.length);
      for (const v of dinners) expect(v.inside).toBe(true);
    }
    expect(withGuests).toBeGreaterThan(50);
  });

  it('déterministe', () => {
    const r = ROWS[500]!;
    const meals = householdMeals(r.d, r.hd, dayRng(r.d.hh.seed, 0, r.day.iso, 'repas'));
    expect(dayVisits(r.d, r.hd, meals, r.day, r.seed, r.guests)).toEqual(r.visits);
  });
});
